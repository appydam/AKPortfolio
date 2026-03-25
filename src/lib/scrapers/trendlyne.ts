import * as cheerio from "cheerio";
import { getDb, ensureStock } from "../db";
import { recordSourceResult } from "../health/monitor";
import { isKacholiaEntity } from "../entities";

const TRENDLYNE_DEALS_URL =
  "https://trendlyne.com/portfolio/bulk-block-deals/53746/ashish-kacholia-portfolio/";
const TRENDLYNE_HOLDINGS_URL =
  "https://trendlyne.com/portfolio/superstar-shareholders/53746/latest/ashish-kacholia-portfolio/";

const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
};

function cleanText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function parseNumber(text: string): number {
  const cleaned = text.replace(/,/g, "").replace(/[^\d.\-]/g, "");
  return parseFloat(cleaned) || 0;
}

export async function scrapeTrendlyneHoldings(): Promise<number> {
  console.log("[Trendlyne] Scraping holdings...");
  const start = Date.now();

  try {
    const response = await fetch(TRENDLYNE_HOLDINGS_URL, { headers: HEADERS });
    if (!response.ok) {
      throw new Error(`Trendlyne holdings fetch failed: ${response.status}`);
    }

    const html = await response.text();
    const db = getDb();
    let count = 0;

    const now = new Date();
    const q = Math.ceil((now.getMonth() + 1) / 3);
    const quarter = `${now.getFullYear()}-Q${q}`;

    // Regex-based extraction — more robust than cheerio for this complex table
    // Each stock row has an <a> link: /equity/share-holding/ID/SYMBOL/latest/slug/
    // Followed by: <td data-order=VALUE> X.X Cr </td> (holding value)
    //              <td> QTY </td> (comma-formatted shares)
    //              <td data-order=PCT> PCT% </td> (holding %)
    const stockLinkRegex = /<a[^>]*href="[^"]*?\/equity\/share-holding\/\d+\/([A-Z][A-Z0-9]+)\/latest\/[^"]*"[^>]*>([^<]+)<\/a>/g;

    const seen = new Set<string>();
    let match;

    while ((match = stockLinkRegex.exec(html)) !== null) {
      const symbol = match[1];
      if (seen.has(symbol) || /^\d+$/.test(symbol)) continue;
      seen.add(symbol);

      const name = match[2].trim();
      const pos = match.index + match[0].length;

      // Look at the next ~2000 chars for row data
      const rowAfter = html.substring(pos, pos + 2000);

      // Extract holding value in Cr from data-order attribute
      const valMatch = rowAfter.match(/data-order\s*=\s*"?([\d.]+)"?\s*>\s*([\d.]+)\s*Cr/);
      const holdingValueCr = valMatch ? parseFloat(valMatch[2]) : 0;

      // Extract quantity: <td...> comma-formatted number </td>
      const qtyMatch = rowAfter.match(/<td[^>]*>\s*([\d,]+)\s*<\/td>/);
      const sharesHeld = qtyMatch ? parseInt(qtyMatch[1].replace(/,/g, "")) : 0;

      // Extract holding %: data-order=X.X> X.X%
      const pctMatches = rowAfter.match(/data-order=([\d.]+)>\s*[\d.]+%/);
      const holdingPct = pctMatches ? parseFloat(pctMatches[1]) : 0;

      // Skip if no meaningful data
      if (!sharesHeld && !holdingPct) continue;

      const stockId = await ensureStock(symbol, name);

      // If we have shares, use them directly
      // If shares = 0 but we have value in Cr, store value as a marker
      // (the price fetcher will handle the rest)
      let finalShares = 0;
      let finalPct = holdingPct;

      if (sharesHeld > 0) {
        finalShares = sharesHeld;
      } else if (holdingValueCr > 0) {
        // Store holding value in rupees as shares_held temporarily
        // Will be corrected when we get prices
        finalShares = holdingValueCr * 10000000;
      } else if (holdingPct > 0) {
        // Just has %, store with 1 share as placeholder
        finalShares = 1;
      }

      await db.from("holdings").upsert(
        {
          stock_id: stockId,
          quarter,
          shares_held: finalShares,
          pct_holding: finalPct,
        },
        { onConflict: "stock_id,quarter" }
      );

      count++;
    }

    const latency = Date.now() - start;
    recordSourceResult("trendlyne", true, latency);
    console.log(`[Trendlyne] Updated ${count} holdings for ${quarter}`);
    return count;
  } catch (error) {
    const latency = Date.now() - start;
    recordSourceResult("trendlyne", false, latency, String(error));
    console.error("[Trendlyne] Holdings scrape failed:", error);
    return 0;
  }
}

export async function scrapeTrendlyneDeals(): Promise<number> {
  console.log("[Trendlyne] Scraping deals...");
  const start = Date.now();

  try {
    const db = getDb();
    const stockMap = new Map<string, string>();
    const { data: stocks } = await db.from("stocks").select("name, symbol");
    for (const s of stocks || []) {
      stockMap.set(s.name.toLowerCase(), s.symbol);
    }

    const response = await fetch(TRENDLYNE_DEALS_URL, { headers: HEADERS });
    if (!response.ok) {
      throw new Error(`Trendlyne deals fetch failed: ${response.status}`);
    }

    const html = await response.text();
    const $ = cheerio.load(html);
    let newDeals = 0;

    const rows = $("table tbody tr");

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const tds = $(row).find("td");
      if (tds.length < 8) continue;

      const rawStockName = cleanText($(tds[0]).text());
      const clientName = cleanText($(tds[1]).text());
      const exchange = cleanText($(tds[2]).text());
      const dealType = cleanText($(tds[3]).text());
      const action = cleanText($(tds[4]).text());
      const dealDate = cleanText($(tds[5]).text());
      const avgPrice = parseNumber($(tds[6]).text());
      const quantity = parseNumber($(tds[7]).text());
      const pctTraded = tds.length > 8 ? parseNumber($(tds[8]).text()) : null;

      if (!isKacholiaEntity(clientName)) continue;
      if (!quantity || !dealDate) continue;

      const stockName = rawStockName
        .replace(/\/\d+.*$/i, "")
        .replace(/\d+\s*week\s*(low|high)/gi, "")
        .replace(/Target.*$/i, "")
        .replace(/Valuation.*$/i, "")
        .replace(/Momentum.*$/i, "")
        .replace(/\s+/g, " ")
        .trim();

      const link = $(tds[0]).find("a").attr("href") || "";
      const linkMatch = link.match(/\/equity\/[^/]+\/\d+\/([A-Z][A-Z0-9]+)\//);
      let symbol = linkMatch?.[1];

      if (!symbol || /^\d+$/.test(symbol)) {
        const lower = stockName.toLowerCase();
        symbol = stockMap.get(lower);
        if (!symbol) {
          for (const [name, sym] of stockMap.entries()) {
            if (lower.includes(name) || name.includes(lower)) {
              symbol = sym;
              break;
            }
          }
        }
      }

      if (!symbol || /^\d+$/.test(symbol)) continue;

      const normalizedAction =
        action.toLowerCase().includes("purchase") || action.toLowerCase().includes("buy")
          ? "Buy"
          : "Sell";

      const stockId = await ensureStock(symbol, stockName);

      const { data } = await db.from("deals").upsert(
        {
          stock_id: stockId,
          deal_date: dealDate,
          exchange,
          deal_type: dealType,
          action: normalizedAction,
          quantity,
          avg_price: avgPrice,
          pct_traded: pctTraded,
        },
        { onConflict: "stock_id,deal_date,exchange,deal_type,action,quantity", ignoreDuplicates: true }
      ).select("id");

      if (data && data.length > 0) newDeals++;
    }

    const latency = Date.now() - start;
    recordSourceResult("trendlyne", true, latency);
    console.log(`[Trendlyne] Found ${newDeals} new Kacholia deals`);
    return newDeals;
  } catch (error) {
    const latency = Date.now() - start;
    recordSourceResult("trendlyne", false, latency, String(error));
    console.error("[Trendlyne] Deals scrape failed:", error);
    return 0;
  }
}

export async function scrapeTrendlyne(): Promise<{ deals: number; holdings: number }> {
  const holdings = await scrapeTrendlyneHoldings();
  await new Promise((r) => setTimeout(r, 2000));
  const deals = await scrapeTrendlyneDeals();
  return { deals, holdings };
}
