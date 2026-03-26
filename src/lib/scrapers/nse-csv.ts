import { getDb, ensureStock } from "../db";
import { recordSourceResult } from "../health/monitor";
import { isKacholiaEntity } from "../entities";
import { nseFetch } from "../nse-session";

const NSE_BULK_DEALS_URL = "https://www.nseindia.com/api/historical/bulk-deals";

function formatDate(date: Date): string {
  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const yyyy = date.getFullYear();
  return `${dd}-${mm}-${yyyy}`;
}

export async function scrapeNseBulkDeals(daysBack: number = 7): Promise<number> {
  console.log(`[NSE-CSV] Scraping bulk deals for last ${daysBack} days...`);
  const start = Date.now();

  try {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - daysBack);

    const url = `${NSE_BULK_DEALS_URL}?from=${formatDate(startDate)}&to=${formatDate(endDate)}`;
    const res = await nseFetch(url);

    if (!res.ok) {
      throw new Error(`NSE bulk deals API failed: ${res.status}`);
    }

    const data = await res.json();
    const deals: Array<{
      BD_DT_DATE: string;
      BD_SYMBOL: string;
      BD_SCRIP_NAME: string;
      BD_CLIENT_NAME: string;
      BD_BUY_SELL: string;
      BD_QTY_TRD: number;
      BD_TP_WATP: number;
      BD_REMARKS?: string;
    }> = data?.data || data || [];

    const db = getDb();
    let newDeals = 0;

    for (const deal of deals) {
      if (!isKacholiaEntity(deal.BD_CLIENT_NAME || "")) continue;

      const symbol = deal.BD_SYMBOL;
      const name = deal.BD_SCRIP_NAME || symbol;
      const action =
        (deal.BD_BUY_SELL || "").toLowerCase() === "buy" ? "Buy" : "Sell";
      const quantity = deal.BD_QTY_TRD || 0;
      const avgPrice = deal.BD_TP_WATP || 0;

      if (!symbol || !quantity) continue;

      const stockId = await ensureStock(symbol, name);

      const { data: insertedData } = await db.from("deals").upsert(
        {
          stock_id: stockId,
          deal_date: deal.BD_DT_DATE || formatDate(new Date()),
          exchange: "NSE",
          deal_type: "Bulk",
          action,
          quantity,
          avg_price: avgPrice,
          pct_traded: null,
        },
        { onConflict: "stock_id,deal_date,exchange,deal_type,action,quantity", ignoreDuplicates: true }
      ).select("id");

      if (insertedData && insertedData.length > 0) newDeals++;
    }

    const latency = Date.now() - start;
    recordSourceResult("nse-csv", true, latency);
    console.log(`[NSE-CSV] Found ${newDeals} new Ashish Kacholia deals`);
    return newDeals;
  } catch (error) {
    const latency = Date.now() - start;
    recordSourceResult("nse-csv", false, latency, String(error));
    console.error("[NSE-CSV] Scrape failed:", error);
    return 0;
  }
}

// Also fetch block deals from NSE
export async function scrapeNseBlockDeals(daysBack: number = 7): Promise<number> {
  console.log(`[NSE-CSV] Scraping block deals for last ${daysBack} days...`);
  const start = Date.now();

  try {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - daysBack);

    const url = `https://www.nseindia.com/api/historical/block-deals?from=${formatDate(startDate)}&to=${formatDate(endDate)}`;
    const res = await nseFetch(url);

    if (!res.ok) throw new Error(`NSE block deals API failed: ${res.status}`);

    const data = await res.json();
    const deals = data?.data || data || [];

    const db = getDb();
    let newDeals = 0;

    for (const deal of deals) {
      if (!isKacholiaEntity(deal.BD_CLIENT_NAME || "")) continue;

      const symbol = deal.BD_SYMBOL;
      const name = deal.BD_SCRIP_NAME || symbol;
      const action =
        (deal.BD_BUY_SELL || "").toLowerCase() === "buy" ? "Buy" : "Sell";

      const stockId = await ensureStock(symbol, name);

      const { data: insertedData } = await db.from("deals").upsert(
        {
          stock_id: stockId,
          deal_date: deal.BD_DT_DATE || formatDate(new Date()),
          exchange: "NSE",
          deal_type: "Block",
          action,
          quantity: deal.BD_QTY_TRD || 0,
          avg_price: deal.BD_TP_WATP || 0,
          pct_traded: null,
        },
        { onConflict: "stock_id,deal_date,exchange,deal_type,action,quantity", ignoreDuplicates: true }
      ).select("id");

      if (insertedData && insertedData.length > 0) newDeals++;
    }

    const latency = Date.now() - start;
    recordSourceResult("nse-block", true, latency);
    console.log(`[NSE-CSV] Found ${newDeals} new block deals`);
    return newDeals;
  } catch (error) {
    const latency = Date.now() - start;
    recordSourceResult("nse-block", false, latency, String(error));
    console.error("[NSE-CSV] Block deals scrape failed:", error);
    return 0;
  }
}
