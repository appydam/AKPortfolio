// Insider Trading Disclosure Scraper (SEBI PIT Regulations)
//
// SEBI requires insiders (promoters, KMP, directors, designated persons) to
// disclose trades within 2 BUSINESS DAYS of the transaction.
// This is 10-19 days FASTER than waiting for quarterly SHP filings.
//
// Sources:
// - NSE: /api/corporates-pit (Prohibition of Insider Trading disclosures)
// - BSE: /corporates/Insider_Trading_new.aspx (insider trading reports)
//
// We scan ALL stocks in AK's portfolio for any insider trading by Kacholia entities,
// AND also scan for insider trades by promoters/KMP of those companies (signal value).

import { getDb } from "../db";
import { recordSourceResult } from "../health/monitor";
import { isKacholiaEntity, classifyEntity, normalizeEntityName } from "../entities";
import { nseFetch } from "../nse-session";
import { queueNotification } from "../notifications/telegram";

const BSE_INSIDER_API = "https://api.bseindia.com/BseIndiaAPI/api/Insider/w";

const BSE_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept: "application/json",
  Referer: "https://www.bseindia.com/",
  Origin: "https://www.bseindia.com",
};

interface InsiderTrade {
  symbol: string;
  entityName: string;
  entityType: string;
  category: string;
  tradeType: "Buy" | "Sell";
  quantity: number;
  avgPrice: number;
  tradeDate: string;
  disclosureDate: string;
  exchange: string;
  modeOfAcq: string;
  preHoldingPct: number | null;
  postHoldingPct: number | null;
}

function parseNumber(text: string): number {
  return parseFloat(String(text).replace(/,/g, "").replace(/[^\d.\-]/g, "")) || 0;
}

function formatDate(date: Date): string {
  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  return `${dd}-${mm}-${date.getFullYear()}`;
}

// Fetch insider trading disclosures from NSE for a specific stock
async function fetchNseInsiderTrades(symbol: string): Promise<InsiderTrade[]> {
  try {
    const url = `https://www.nseindia.com/api/corporates-pit?index=equities&symbol=${encodeURIComponent(symbol)}`;
    const res = await nseFetch(url);
    if (!res.ok) return [];

    const data = await res.json();
    const records = data?.data || data || [];
    if (!Array.isArray(records)) return [];

    const trades: InsiderTrade[] = [];
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    for (const r of records) {
      const acqName = (r.acqName || r.acquirerName || "").trim();
      const tradeDate = r.intimDate || r.date || r.tdpDerivExpiryDate || "";
      const category = (r.personCategory || r.category || "").trim();
      const secAcq = parseNumber(String(r.secAcq || r.securitiesAcquired || 0));
      const secSold = parseNumber(String(r.secDisp || r.securitiesDisposed || 0));

      // Only include recent trades
      if (tradeDate) {
        const tradeDateObj = new Date(tradeDate);
        if (tradeDateObj < thirtyDaysAgo) continue;
      }

      // Skip if no quantity
      if (!secAcq && !secSold) continue;

      const isBuy = secAcq > 0;
      const quantity = isBuy ? secAcq : secSold;

      const trade: InsiderTrade = {
        symbol,
        entityName: acqName,
        entityType: isKacholiaEntity(acqName) ? classifyEntity(acqName) : "other",
        category,
        tradeType: isBuy ? "Buy" : "Sell",
        quantity,
        avgPrice: parseNumber(String(r.befAcqSharesNo || r.tdpDerivTrdPrice || 0)),
        tradeDate,
        disclosureDate: r.intimDate || r.date || "",
        exchange: "NSE",
        modeOfAcq: (r.acqMode || r.modeOfAcquisition || "Market Purchase").trim(),
        preHoldingPct: r.befAcqSharesPer ? parseNumber(String(r.befAcqSharesPer)) : null,
        postHoldingPct: r.aftAcqSharesPer ? parseNumber(String(r.aftAcqSharesPer)) : null,
      };

      trades.push(trade);
    }

    return trades;
  } catch (err) {
    console.error(`[InsiderTrades] NSE fetch failed for ${symbol}:`, err);
    return [];
  }
}

// Fetch insider trading from BSE for a specific scrip code
async function fetchBseInsiderTrades(bseCode: string, symbol: string): Promise<InsiderTrade[]> {
  try {
    const today = new Date();
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(today.getDate() - 30);

    const fromDate = formatDate(thirtyDaysAgo);
    const toDate = formatDate(today);

    const url = `${BSE_INSIDER_API}?scripcode=${bseCode}&fromdate=${fromDate}&todate=${toDate}`;
    const res = await fetch(url, { headers: BSE_HEADERS });
    if (!res.ok) return [];

    const data = await res.json();
    const records = data?.Table || data || [];
    if (!Array.isArray(records)) return [];

    const trades: InsiderTrade[] = [];

    for (const r of records) {
      const acqName = (r.PERSONNAME || r.AcqName || "").trim();
      const category = (r.CATEGORY || r.PersonCategory || "").trim();
      const secAcq = parseNumber(String(r.SECACQ || r.NoOfSecAcq || 0));
      const secSold = parseNumber(String(r.SECDIS || r.NoOfSecDisp || 0));

      if (!secAcq && !secSold) continue;

      const isBuy = secAcq > 0;
      trades.push({
        symbol,
        entityName: acqName,
        entityType: isKacholiaEntity(acqName) ? classifyEntity(acqName) : "other",
        category,
        tradeType: isBuy ? "Buy" : "Sell",
        quantity: isBuy ? secAcq : secSold,
        avgPrice: parseNumber(String(r.AVGPRICE || r.TDPDerivTrdPrice || 0)),
        tradeDate: r.INTIMDT || r.DateOfAllotAdvice || "",
        disclosureDate: r.INTIMDT || "",
        exchange: "BSE",
        modeOfAcq: (r.ACQMODE || "Market").trim(),
        preHoldingPct: r.BEFACQSHARESPER ? parseNumber(String(r.BEFACQSHARESPER)) : null,
        postHoldingPct: r.AFTACQSHARESPER ? parseNumber(String(r.AFTACQSHARESPER)) : null,
      });
    }

    return trades;
  } catch (err) {
    console.error(`[InsiderTrades] BSE fetch failed for ${symbol}:`, err);
    return [];
  }
}

/**
 * Main: Scan all portfolio stocks for insider trading disclosures.
 * Returns count of new insider trades found.
 */
export async function scrapeInsiderTrades(): Promise<number> {
  console.log("[InsiderTrades] Scanning portfolio stocks for insider trading disclosures...");
  const start = Date.now();

  try {
    const db = getDb();

    // Get all stocks in portfolio
    const { data: stocks } = await db.from("stocks").select("id, symbol, bse_code, name");
    if (!stocks || stocks.length === 0) return 0;

    let newTrades = 0;

    for (const stock of stocks) {
      if (stock.symbol.startsWith("BSE:")) continue;

      // NSE insider trades
      const nseTrades = await fetchNseInsiderTrades(stock.symbol);
      await new Promise((r) => setTimeout(r, 300));

      // BSE insider trades (if we have the code)
      let bseTrades: InsiderTrade[] = [];
      if (stock.bse_code) {
        bseTrades = await fetchBseInsiderTrades(stock.bse_code, stock.symbol);
        await new Promise((r) => setTimeout(r, 300));
      }

      const allTrades = [...nseTrades, ...bseTrades];

      for (const trade of allTrades) {
        const isAk = isKacholiaEntity(trade.entityName);

        const { data } = await db.from("insider_trades").upsert(
          {
            stock_id: stock.id,
            entity_name: isAk ? normalizeEntityName(trade.entityName) : trade.entityName,
            entity_type: trade.entityType,
            category: trade.category,
            trade_type: trade.tradeType,
            quantity: trade.quantity,
            avg_price: trade.avgPrice,
            trade_date: trade.tradeDate,
            disclosure_date: trade.disclosureDate,
            exchange: trade.exchange,
            mode_of_acq: trade.modeOfAcq,
            pre_holding_pct: trade.preHoldingPct,
            post_holding_pct: trade.postHoldingPct,
            source: trade.exchange.toLowerCase(),
          },
          { onConflict: "stock_id,entity_name,trade_date,trade_type,quantity", ignoreDuplicates: true }
        ).select("id");

        if (data && data.length > 0) {
          newTrades++;

          // Urgent alert if it's a Kacholia entity trade
          if (isAk) {
            const emoji = trade.tradeType === "Buy" ? "🟢" : "🔴";
            await queueNotification(
              "telegram",
              "urgent",
              `${emoji} INSIDER TRADE: ${stock.name} (${stock.symbol})`,
              [
                `<b>Entity:</b> ${normalizeEntityName(trade.entityName)}`,
                `<b>Action:</b> ${trade.tradeType}`,
                `<b>Quantity:</b> ${trade.quantity.toLocaleString("en-IN")} shares`,
                trade.avgPrice ? `<b>Price:</b> ₹${trade.avgPrice.toLocaleString("en-IN")}` : "",
                `<b>Mode:</b> ${trade.modeOfAcq}`,
                trade.postHoldingPct != null ? `<b>Post-trade holding:</b> ${trade.postHoldingPct}%` : "",
                `<b>Disclosed:</b> ${trade.disclosureDate}`,
                `\n⚡ Insider trading disclosure — 2-day signal, much faster than quarterly SHP!`,
              ].filter(Boolean).join("\n"),
              { symbol: stock.symbol, isKacholia: true }
            );
          }
        }
      }
    }

    const latency = Date.now() - start;
    recordSourceResult("insider-trades", true, latency);
    console.log(`[InsiderTrades] Found ${newTrades} new insider trades`);
    return newTrades;
  } catch (error) {
    const latency = Date.now() - start;
    recordSourceResult("insider-trades", false, latency, String(error));
    console.error("[InsiderTrades] Scrape failed:", error);
    return 0;
  }
}
