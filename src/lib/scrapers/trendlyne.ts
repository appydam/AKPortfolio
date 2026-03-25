import * as cheerio from "cheerio";
import { getDb } from "../db";
import { recordSourceResult } from "../health/monitor";

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

const KACHOLIA_NAMES = ["kacholia ashish", "ashish kacholia", "ashish ramesh kacholia", "ashish rameshchandra kacholia"];

function cleanText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function parseNumber(text: string): number {
  const cleaned = text.replace(/,/g, "").replace(/[^\d.\-]/g, "");
  return parseFloat(cleaned) || 0;
}

function isKacholia(clientName: string): boolean {
  const lower = clientName.toLowerCase();
  return KACHOLIA_NAMES.some((n) => lower.includes(n));
}

function ensureStock(symbol: string, name: string): number {
  const db = getDb();
  const existing = db
    .prepare("SELECT id FROM stocks WHERE symbol = ?")
    .get(symbol) as { id: number } | undefined;

  if (existing) return existing.id;

  const result = db
    .prepare("INSERT INTO stocks (symbol, name) VALUES (?, ?)")
    .run(symbol, name);
  return result.lastInsertRowid as number;
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
    const $ = cheerio.load(html);
    const db = getDb();
    let count = 0;

    const now = new Date();
    const q = Math.ceil((now.getMonth() + 1) / 3);
    const quarter = `${now.getFullYear()}-Q${q}`;

    const upsertHolding = db.prepare(`
      INSERT INTO holdings (stock_id, quarter, shares_held, pct_holding)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(stock_id, quarter) DO UPDATE SET
        shares_held = excluded.shares_held,
        pct_holding = excluded.pct_holding
    `);

    // Each stock row in the superstar-shareholding table has:
    // td.stockName with <a href="/equity/share-holding/ID/SYMBOL/latest/...">Name</a>
    // td[data-order=VALUE] = holding value in rupees
    // td = quantity (text like "900,000")
    // td[data-order] = change
    // td[data-order=PCT] = latest quarter holding %

    const rows = $("table.superstar-shareholding tbody tr");

    rows.each((_, row) => {
      const $row = $(row);

      // Extract symbol from the stock link
      const stockLink = $row.find('a.stockrow[href*="/equity/share-holding/"]').first();
      if (!stockLink.length) return;

      const href = stockLink.attr("href") || "";
      const symbolMatch = href.match(/\/equity\/share-holding\/\d+\/([A-Z0-9]+)\//);
      if (!symbolMatch) return;

      const symbol = symbolMatch[1];
      if (/^\d+$/.test(symbol)) return; // Skip numeric IDs

      const stockName = cleanText(stockLink.text());
      if (!stockName) return;

      // Get all TDs in this row
      const tds = $row.find("> td");

      // Find quantity: the TD after the holding value TD
      // Holding value TD has data-order with a large number (value in rupees)
      // Qty TD is the next one, containing comma-separated number like "900,000"
      let sharesHeld = 0;
      let holdingPct = 0;

      tds.each((i, td) => {
        const $td = $(td);
        const dataOrder = $td.attr("data-order");
        const text = cleanText($td.text());

        // The quantity cell: contains a large comma-formatted number, no % sign, no "Cr"
        if (!sharesHeld && !text.includes("Cr") && !text.includes("%") && i > 0) {
          const num = parseNumber(text);
          if (num >= 1000) {
            sharesHeld = num;
          }
        }

        // The holding % cell: has data-order with small number (< 100) and contains %
        if (!holdingPct && dataOrder && text.includes("%")) {
          const pct = parseFloat(dataOrder);
          if (pct > 0 && pct < 100) {
            holdingPct = pct;
          }
        }
      });

      if (!sharesHeld) return;

      const stockId = ensureStock(symbol, stockName);
      upsertHolding.run(stockId, quarter, sharesHeld, holdingPct);
      count++;
    });

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
    // Build symbol map from holdings (already in DB from scrapeTrendlyneHoldings)
    const db = getDb();
    const stockMap = new Map<string, string>();
    const stocks = db.prepare("SELECT name, symbol FROM stocks").all() as { name: string; symbol: string }[];
    for (const s of stocks) {
      stockMap.set(s.name.toLowerCase(), s.symbol);
    }

    const response = await fetch(TRENDLYNE_DEALS_URL, { headers: HEADERS });
    if (!response.ok) {
      throw new Error(`Trendlyne deals fetch failed: ${response.status}`);
    }

    const html = await response.text();
    const $ = cheerio.load(html);
    let newDeals = 0;

    const insertDeal = db.prepare(`
      INSERT OR IGNORE INTO deals (stock_id, deal_date, exchange, deal_type, action, quantity, avg_price, pct_traded)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    // Deals table structure: each row has TDs for
    // Stock Name | Client Name | Exchange | Deal Type | Action | Date | Price | Qty | % Traded
    const rows = $("table tbody tr");

    rows.each((_, row) => {
      const tds = $(row).find("td");
      if (tds.length < 8) return;

      const rawStockName = cleanText($(tds[0]).text());
      const clientName = cleanText($(tds[1]).text());
      const exchange = cleanText($(tds[2]).text());
      const dealType = cleanText($(tds[3]).text());
      const action = cleanText($(tds[4]).text());
      const dealDate = cleanText($(tds[5]).text());
      const avgPrice = parseNumber($(tds[6]).text());
      const quantity = parseNumber($(tds[7]).text());
      const pctTraded = tds.length > 8 ? parseNumber($(tds[8]).text()) : null;

      // Only Kacholia's deals
      if (!isKacholia(clientName)) return;
      if (!quantity || !dealDate) return;

      // Clean stock name
      const stockName = rawStockName
        .replace(/\/\d+.*$/i, "")
        .replace(/\d+\s*week\s*(low|high)/gi, "")
        .replace(/Target.*$/i, "")
        .replace(/Valuation.*$/i, "")
        .replace(/Momentum.*$/i, "")
        .replace(/\s+/g, " ")
        .trim();

      // Get symbol from stock link
      const link = $(tds[0]).find("a").attr("href") || "";
      const linkMatch = link.match(/\/equity\/[^/]+\/\d+\/([A-Z][A-Z0-9]+)\//);
      let symbol = linkMatch?.[1];

      // Fallback: match by name from our DB
      if (!symbol || /^\d+$/.test(symbol)) {
        const lower = stockName.toLowerCase();
        symbol = stockMap.get(lower);

        // Partial match
        if (!symbol) {
          for (const [name, sym] of stockMap.entries()) {
            if (lower.includes(name) || name.includes(lower)) {
              symbol = sym;
              break;
            }
          }
        }
      }

      if (!symbol || /^\d+$/.test(symbol)) return;

      const normalizedAction =
        action.toLowerCase().includes("purchase") || action.toLowerCase().includes("buy")
          ? "Buy"
          : "Sell";

      const stockId = ensureStock(symbol, stockName);

      const result = insertDeal.run(
        stockId,
        dealDate,
        exchange,
        dealType,
        normalizedAction,
        quantity,
        avgPrice,
        pctTraded
      );

      if (result.changes > 0) newDeals++;
    });

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
