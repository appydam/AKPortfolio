// FII/DII Activity Tracker for AK's Portfolio Stocks
//
// Tracks Foreign Institutional Investor (FII) and Domestic Institutional
// Investor (DII) buying/selling activity on stocks AK holds.
//
// If FII is accumulating the same stock AK holds → institutional validation.
// If FII is dumping while AK holds → potential risk or AK sees something they don't.
//
// Source: NSE API (market depth / participant-wise volume data)

import { getDb } from "../db";
import { recordSourceResult } from "../health/monitor";
import { nseFetch } from "../nse-session";
import { queueNotification } from "../notifications/telegram";

function parseNumber(text: string): number {
  return parseFloat(String(text).replace(/,/g, "").replace(/[^\d.\-]/g, "")) || 0;
}

interface FiiDiiData {
  symbol: string;
  date: string;
  fiiBuyQty: number;
  fiiSellQty: number;
  fiiNetQty: number;
  fiiNetValue: number;
  diiBuyQty: number;
  diiSellQty: number;
  diiNetQty: number;
  diiNetValue: number;
}

// Fetch participant-wise trading data from NSE for a stock
async function fetchNseParticipantData(symbol: string): Promise<FiiDiiData | null> {
  try {
    // NSE trade info includes client-wise category data
    const url = `https://www.nseindia.com/api/quote-equity?symbol=${encodeURIComponent(symbol)}&section=trade_info`;
    const res = await nseFetch(url);
    if (!res.ok) return null;

    const data = await res.json();

    // NSE provides securityWiseDP (delivery percentage) and marketDeptOrderBook
    const dp = data?.securityWiseDP;
    const tradeInfo = data?.marketDeptOrderBook?.tradeInfo;

    if (!dp && !tradeInfo) return null;

    const today = new Date().toISOString().split("T")[0];

    // Extract FII/DII from category-wise data if available
    const catData = data?.marketDeptOrderBook?.categoryWiseData;
    if (catData) {
      let fiiBuy = 0, fiiSell = 0, diiBuy = 0, diiSell = 0;

      for (const cat of catData) {
        const category = (cat.category || "").toLowerCase();
        const buyQty = parseNumber(String(cat.buyQuantity || 0));
        const sellQty = parseNumber(String(cat.sellQuantity || 0));

        if (category.includes("fpi") || category.includes("fii") || category.includes("foreign")) {
          fiiBuy += buyQty;
          fiiSell += sellQty;
        }
        if (category.includes("dii") || category.includes("mutual") || category.includes("insurance") || category.includes("domestic")) {
          diiBuy += buyQty;
          diiSell += sellQty;
        }
      }

      return {
        symbol,
        date: today,
        fiiBuyQty: fiiBuy,
        fiiSellQty: fiiSell,
        fiiNetQty: fiiBuy - fiiSell,
        fiiNetValue: 0, // not always available per-stock
        diiBuyQty: diiBuy,
        diiSellQty: diiSell,
        diiNetQty: diiBuy - diiSell,
        diiNetValue: 0,
      };
    }

    // Fallback: use delivery data as proxy (high delivery % = institutional buying)
    if (dp) {
      const totalTraded = parseNumber(String(dp.quantityTraded || 0));
      const deliveryQty = parseNumber(String(dp.deliveryQuantity || 0));
      const deliveryPct = parseNumber(String(dp.deliveryToTradedQuantity || 0));

      // High delivery % (>50%) often indicates institutional activity
      // This is a proxy — not exact FII/DII data but useful signal
      if (deliveryPct > 0) {
        return {
          symbol,
          date: today,
          fiiBuyQty: 0,
          fiiSellQty: 0,
          fiiNetQty: 0,
          fiiNetValue: 0,
          diiBuyQty: deliveryQty, // approximate
          diiSellQty: totalTraded - deliveryQty,
          diiNetQty: deliveryQty - (totalTraded - deliveryQty),
          diiNetValue: deliveryPct, // store delivery % as proxy
        };
      }
    }

    return null;
  } catch (err) {
    console.error(`[FII-DII] NSE fetch failed for ${symbol}:`, err);
    return null;
  }
}

/**
 * Main: Scan all portfolio stocks for FII/DII activity.
 */
export async function scrapeFiiDiiActivity(): Promise<number> {
  console.log("[FII-DII] Scanning portfolio for institutional activity...");
  const start = Date.now();

  try {
    const db = getDb();

    const { data: latestQ } = await db
      .from("holdings")
      .select("quarter")
      .order("quarter", { ascending: false })
      .limit(1)
      .single();

    if (!latestQ) return 0;

    const { data: holdings } = await db
      .from("holdings")
      .select("stock_id, stocks(id, symbol, name)")
      .eq("quarter", latestQ.quarter);

    if (!holdings || holdings.length === 0) return 0;

    let updated = 0;

    for (const h of holdings) {
      const stock = h.stocks as unknown as Record<string, unknown> | null;
      const symbol = (stock?.symbol as string) || "";
      const stockId = (stock?.id as number) || h.stock_id;
      const name = (stock?.name as string) || symbol;
      if (!symbol || symbol.startsWith("BSE:")) continue;

      const data = await fetchNseParticipantData(symbol);
      await new Promise((r) => setTimeout(r, 300));

      if (!data) continue;

      const { data: inserted } = await db.from("fii_dii_activity").upsert(
        {
          stock_id: stockId,
          date: data.date,
          fii_buy_qty: data.fiiBuyQty,
          fii_sell_qty: data.fiiSellQty,
          fii_net_qty: data.fiiNetQty,
          fii_net_value: data.fiiNetValue,
          dii_buy_qty: data.diiBuyQty,
          dii_sell_qty: data.diiSellQty,
          dii_net_qty: data.diiNetQty,
          dii_net_value: data.diiNetValue,
          source: "nse",
        },
        { onConflict: "stock_id,date" }
      ).select("id");

      if (inserted && inserted.length > 0) updated++;

      // Alert on significant FII activity (net buy/sell > 1M shares)
      if (Math.abs(data.fiiNetQty) > 1_000_000) {
        const direction = data.fiiNetQty > 0 ? "🟢 FII BUYING" : "🔴 FII SELLING";
        await queueNotification(
          "telegram",
          "normal",
          `${direction}: ${name} (${symbol})`,
          [
            `<b>FII Net:</b> ${data.fiiNetQty > 0 ? "+" : ""}${(data.fiiNetQty / 1e6).toFixed(2)}M shares`,
            `<b>FII Buy:</b> ${(data.fiiBuyQty / 1e6).toFixed(2)}M`,
            `<b>FII Sell:</b> ${(data.fiiSellQty / 1e6).toFixed(2)}M`,
            `\nInstitutional activity on AK portfolio stock`,
          ].join("\n")
        );
      }
    }

    const latency = Date.now() - start;
    recordSourceResult("fii-dii-activity", true, latency);
    console.log(`[FII-DII] Updated ${updated} stocks with institutional data`);
    return updated;
  } catch (error) {
    const latency = Date.now() - start;
    recordSourceResult("fii-dii-activity", false, latency, String(error));
    console.error("[FII-DII] Scrape failed:", error);
    return 0;
  }
}
