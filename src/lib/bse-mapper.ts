// Auto-fetch BSE scrip code ↔ NSE symbol mappings
// Replaces the hardcoded 20-stock NSE_TO_BSE_MAP in sebi-shp.ts
// Uses BSE's official API to resolve scrip codes dynamically.

import { getDb } from "./db";

const BSE_SEARCH_API = "https://api.bseindia.com/BseIndiaAPI/api/ListofScripData/w";
const BSE_QUOTE_API = "https://api.bseindia.com/BseIndiaAPI/api/getScripHeaderData/w";

const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept: "application/json",
  Referer: "https://www.bseindia.com/",
  Origin: "https://www.bseindia.com",
};

// In-memory cache of resolved mappings (survives within a single serverless invocation)
const resolvedCache = new Map<string, string>();

/**
 * Resolve NSE symbol → BSE scrip code via BSE search API.
 * Caches results in both memory and the stocks.bse_code DB column.
 */
export async function resolveBseCode(nseSymbol: string): Promise<string | null> {
  if (nseSymbol.startsWith("BSE:")) return nseSymbol.replace("BSE:", "");

  // Check memory cache
  if (resolvedCache.has(nseSymbol)) return resolvedCache.get(nseSymbol)!;

  // Check DB first
  const db = getDb();
  const { data: stock } = await db
    .from("stocks")
    .select("bse_code")
    .eq("symbol", nseSymbol)
    .single();

  if (stock?.bse_code) {
    resolvedCache.set(nseSymbol, stock.bse_code);
    return stock.bse_code;
  }

  // Query BSE search API
  try {
    const url = `${BSE_SEARCH_API}?Group=&Atea=&scripcode=&flag=&Search=${encodeURIComponent(nseSymbol)}`;
    const res = await fetch(url, { headers: HEADERS });
    if (!res.ok) return null;

    const data = await res.json();
    // BSE returns array of matches — find the one matching our NSE symbol
    if (Array.isArray(data) && data.length > 0) {
      // Each result has SCRIP_CD (code) and scrip_nm (name) and nse_flag/nse_cd
      for (const item of data) {
        const bseCode = String(item.SCRIP_CD || item.scripcode || "").trim();
        const scripName = (item.scrip_nm || item.SCRIP_NAME || "").toUpperCase();
        const nseCd = (item.nse_cd || "").toUpperCase();

        // Match by NSE code if available, or by name similarity
        if (nseCd === nseSymbol || scripName.includes(nseSymbol)) {
          if (bseCode) {
            resolvedCache.set(nseSymbol, bseCode);
            // Persist to DB
            await db
              .from("stocks")
              .update({ bse_code: bseCode })
              .eq("symbol", nseSymbol);
            return bseCode;
          }
        }
      }

      // If no exact match, take the first result as best guess
      const firstCode = String(data[0].SCRIP_CD || data[0].scripcode || "").trim();
      if (firstCode) {
        resolvedCache.set(nseSymbol, firstCode);
        await db
          .from("stocks")
          .update({ bse_code: firstCode })
          .eq("symbol", nseSymbol);
        return firstCode;
      }
    }
  } catch (err) {
    console.error(`[BSE-Mapper] Failed to resolve ${nseSymbol}:`, err);
  }

  return null;
}

/**
 * Resolve a BSE scrip code → NSE symbol.
 * Useful when BSE deals come in with numeric codes.
 */
export async function resolveNseSymbol(bseCode: string): Promise<string | null> {
  const db = getDb();

  // Check DB — stocks.bse_code column
  const { data: stock } = await db
    .from("stocks")
    .select("symbol")
    .eq("bse_code", bseCode)
    .single();

  if (stock?.symbol) return stock.symbol;

  // Query BSE quote API for the scrip
  try {
    const url = `${BSE_QUOTE_API}?Ession=&scripcode=${bseCode}`;
    const res = await fetch(url, { headers: HEADERS });
    if (!res.ok) return null;

    const data = await res.json();
    const header = data?.Header;
    if (!header) return null;

    // BSE quote API returns NSE_SYMBOL or ISIN
    const nseSymbol = (header.NSE_SYMBOL || header.nse_cd || "").trim();
    if (nseSymbol && !/^\d+$/.test(nseSymbol)) {
      // Update our DB with the mapping
      await db
        .from("stocks")
        .update({ bse_code: bseCode })
        .eq("symbol", nseSymbol);
      resolvedCache.set(nseSymbol, bseCode);
      return nseSymbol;
    }
  } catch (err) {
    console.error(`[BSE-Mapper] Failed to resolve BSE:${bseCode}:`, err);
  }

  return null;
}

/**
 * Batch-resolve all stocks that have missing bse_code in DB.
 * Called periodically to fill in gaps.
 */
export async function resolveAllMissingBseCodes(): Promise<number> {
  console.log("[BSE-Mapper] Resolving missing BSE codes...");
  const db = getDb();

  const { data: stocks } = await db
    .from("stocks")
    .select("symbol")
    .is("bse_code", null)
    .not("symbol", "like", "BSE:%");

  if (!stocks || stocks.length === 0) return 0;

  let resolved = 0;
  for (const stock of stocks) {
    const code = await resolveBseCode(stock.symbol);
    if (code) resolved++;
    // Rate limit
    await new Promise((r) => setTimeout(r, 300));
  }

  console.log(`[BSE-Mapper] Resolved ${resolved}/${stocks.length} BSE codes`);
  return resolved;
}

/**
 * Attempt to merge orphaned BSE:XXXXX stocks into their NSE equivalents.
 * Finds stocks with "BSE:" prefix, resolves them, and migrates deals/holdings.
 */
export async function mergeOrphanedBseStocks(): Promise<number> {
  console.log("[BSE-Mapper] Merging orphaned BSE stocks...");
  const db = getDb();

  const { data: orphans } = await db
    .from("stocks")
    .select("id, symbol, name")
    .like("symbol", "BSE:%");

  if (!orphans || orphans.length === 0) return 0;

  let merged = 0;
  for (const orphan of orphans) {
    const bseCode = orphan.symbol.replace("BSE:", "");
    const nseSymbol = await resolveNseSymbol(bseCode);
    if (!nseSymbol) continue;

    // Find the NSE stock entry
    const { data: nseStock } = await db
      .from("stocks")
      .select("id")
      .eq("symbol", nseSymbol)
      .single();

    if (!nseStock) continue;

    // Migrate deals from orphan → NSE stock
    await db
      .from("deals")
      .update({ stock_id: nseStock.id })
      .eq("stock_id", orphan.id);

    // Migrate holdings from orphan → NSE stock (if any)
    await db
      .from("holdings")
      .update({ stock_id: nseStock.id })
      .eq("stock_id", orphan.id);

    // Delete orphan stock entry
    await db.from("stocks").delete().eq("id", orphan.id);

    console.log(`[BSE-Mapper] Merged BSE:${bseCode} → ${nseSymbol}`);
    merged++;

    await new Promise((r) => setTimeout(r, 200));
  }

  console.log(`[BSE-Mapper] Merged ${merged} orphaned BSE stocks`);
  return merged;
}
