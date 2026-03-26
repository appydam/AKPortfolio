import * as cheerio from "cheerio";
import { getDb, ensureStock } from "../db";
import { recordSourceResult } from "../health/monitor";
import { isKacholiaEntity } from "../entities";
import { nseFetch, NSE_HEADERS } from "../nse-session";

// SEBI SCORES + BSE/NSE filings — Shareholding Pattern (SHP) XML/HTML
// Companies must file SHP within 21 days of quarter end
// We monitor all companies in Kacholia's known portfolio for SHP changes

const BSE_SHP_API = "https://api.bseindia.com/BseIndiaAPI/api/ShareHoldingPatterns/w";
const NSE_SHP_API = "https://www.nseindia.com/api/corporate-share-holding-pattern";

const HEADERS = NSE_HEADERS;

function parseNumber(text: string): number {
  return parseFloat(String(text).replace(/,/g, "").replace(/[^\d.\-]/g, "")) || 0;
}

// Get current quarter string e.g. "31-12-2024" for Q3FY25
function getCurrentQuarterEndDate(): string {
  const now = new Date();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();
  // Quarter end dates: Mar 31, Jun 30, Sep 30, Dec 31
  if (month <= 3) return `31-03-${year}`;
  if (month <= 6) return `30-06-${year}`;
  if (month <= 9) return `30-09-${year}`;
  return `31-12-${year}`;
}

// Fetch shareholding pattern for a specific company from NSE
export async function fetchNseShp(symbol: string): Promise<{ kacholiaShares: number; kacholiaPct: number } | null> {
  try {
    const url = `${NSE_SHP_API}?symbol=${symbol}&shareHolderType=Promoter_and_Shareholding_Pattern`;
    const res = await nseFetch(url);

    if (!res.ok) return null;

    const data = await res.json();
    const shpData = data?.data || data?.shareholding || [];

    let kacholiaShares = 0;
    let kacholiaPct = 0;

    for (const holder of shpData) {
      const name = (holder.name || holder.holderName || "").trim();
      if (!isKacholiaEntity(name)) continue;
      kacholiaShares += parseNumber(String(holder.shares || holder.noOfShares || 0));
      kacholiaPct += parseNumber(String(holder.pct || holder.percentage || 0));
    }

    return kacholiaShares > 0 || kacholiaPct > 0 ? { kacholiaShares, kacholiaPct } : null;
  } catch {
    return null;
  }
}

// Fetch shareholding pattern for a BSE scrip code
export async function fetchBseShp(scripCode: string, symbol: string): Promise<{ kacholiaShares: number; kacholiaPct: number } | null> {
  try {
    const quarterEnd = getCurrentQuarterEndDate();
    const url = `${BSE_SHP_API}?scripcode=${scripCode}&type=Indiv&Ason=${quarterEnd}`;

    const res = await fetch(url, {
      headers: {
        ...HEADERS,
        Accept: "application/json",
        Referer: "https://www.bseindia.com/",
        Origin: "https://www.bseindia.com",
      },
    });

    if (!res.ok) return null;

    const data = await res.json();
    const holders = data?.Table || data?.data || [];

    let kacholiaShares = 0;
    let kacholiaPct = 0;

    for (const holder of holders) {
      const name = (holder.CATEGORY || holder.Name || holder.name || "").trim();
      if (!isKacholiaEntity(name)) continue;
      kacholiaShares += parseNumber(String(holder.SHARES || holder.NoOfShares || 0));
      kacholiaPct += parseNumber(String(holder.PCT || holder.Percentage || 0));
    }

    return kacholiaShares > 0 || kacholiaPct > 0 ? { kacholiaShares, kacholiaPct } : null;
  } catch {
    return null;
  }
}

// BSE scrip code map for known Kacholia holdings (scraped from BSE)
// NSE symbol → BSE scrip code mapping for his known holdings
const NSE_TO_BSE_MAP: Record<string, string> = {
  "SAFARI": "523642",
  "FINEORG": "533339",
  "CARYSIL": "526227",
  "MONARCH": "531978",
  "HITECH": "500189",
  "GARWARE": "509557",
  "LXCHEM": "543218",
  "VAIBHAVGBL": "532156",
  "WINDMACHIN": "505283",
  "BCG": "540154",
  "EMKAY": "532737",
  "MAITHANALL": "590021",
  "GOKUL": "531980",
  "LAOPALA": "526947",
  "KAYA": "539925",
  "NEULANDLAB": "524558",
  "KRITI": "526433",
  "KILITCH": "524500",
  "FCL": "523457",
  "JTLIND": "540743",
};

// Main function: scan ALL known holdings for SHP changes
export async function scrapeSebiShp(): Promise<number> {
  console.log("[SEBI-SHP] Scanning shareholding patterns for all holdings...");
  const start = Date.now();

  try {
    const db = getDb();

    // Get all stocks in our DB
    const { data: stocks } = await db.from("stocks").select("id, symbol, name");
    if (!stocks || stocks.length === 0) return 0;

    const now = new Date();
    const q = Math.ceil((now.getMonth() + 1) / 3);
    const quarter = `${now.getFullYear()}-Q${q}`;

    let updated = 0;

    for (const stock of stocks) {
      // Skip BSE-code only stocks
      if (stock.symbol.startsWith("BSE:")) continue;

      // Try NSE SHP
      const nseResult = await fetchNseShp(stock.symbol);
      if (nseResult && nseResult.kacholiaShares > 0) {
        await db.from("holdings").upsert(
          {
            stock_id: stock.id,
            quarter,
            shares_held: nseResult.kacholiaShares,
            pct_holding: nseResult.kacholiaPct,
          },
          { onConflict: "stock_id,quarter" }
        );
        updated++;
        console.log(`[SEBI-SHP] Updated ${stock.symbol}: ${nseResult.kacholiaShares} shares (${nseResult.kacholiaPct}%)`);
      }

      // Rate limit
      await new Promise((r) => setTimeout(r, 300));

      // Try BSE SHP if we have a code
      const bseCode = NSE_TO_BSE_MAP[stock.symbol];
      if (bseCode) {
        const bseResult = await fetchBseShp(bseCode, stock.symbol);
        if (bseResult && bseResult.kacholiaShares > 0 && !nseResult) {
          await db.from("holdings").upsert(
            {
              stock_id: stock.id,
              quarter,
              shares_held: bseResult.kacholiaShares,
              pct_holding: bseResult.kacholiaPct,
            },
            { onConflict: "stock_id,quarter" }
          );
          updated++;
        }
        await new Promise((r) => setTimeout(r, 300));
      }
    }

    const latency = Date.now() - start;
    recordSourceResult("sebi-shp", true, latency);
    console.log(`[SEBI-SHP] Updated ${updated} holdings from SHP filings`);
    return updated;
  } catch (error) {
    const latency = Date.now() - start;
    recordSourceResult("sebi-shp", false, latency, String(error));
    console.error("[SEBI-SHP] Scrape failed:", error);
    return 0;
  }
}

// Scan BSE corporate filings RSS for fresh SHP filings from Kacholia holdings
export async function scanBseFilingsRss(): Promise<number> {
  console.log("[SEBI-SHP] Scanning BSE filings RSS...");

  try {
    const db = getDb();
    const { data: stocks } = await db.from("stocks").select("symbol, name");
    const stockNames = new Set((stocks || []).map((s) => s.name.toLowerCase().replace(/\s+/g, "")));

    // BSE filings RSS
    const res = await fetch("https://www.bseindia.com/xml-data/corpfiling/AttachLive/CorpFiling.xml", {
      headers: { ...HEADERS, Accept: "application/xml, text/xml" },
    });

    if (!res.ok) return 0;

    const xml = await res.text();
    const $ = cheerio.load(xml, { xmlMode: true });
    let relevant = 0;

    $("item, Row").each((_, item) => {
      const title = $(item).find("NEWSSUB, title, CATEGORY").text().toLowerCase();
      const company = $(item).find("SLONGNAME, company, COMPANYNAME").text().toLowerCase().replace(/\s+/g, "");
      const headline = $(item).find("HEADLINE, description").text().toLowerCase();

      const isShp = title.includes("shareholding") || headline.includes("shareholding") || title.includes("shp");
      const isKnownCompany = stockNames.has(company) || [...stockNames].some(n => company.includes(n.substring(0, 6)));

      if (isShp && isKnownCompany) {
        relevant++;
        console.log(`[SEBI-SHP] New SHP filing detected: ${$(item).find("SLONGNAME, company").text()}`);
      }
    });

    return relevant;
  } catch (error) {
    console.error("[SEBI-SHP] BSE filings RSS scan failed:", error);
    return 0;
  }
}
