import { getDb, ensureStock } from "../db";
import { recordSourceResult } from "../health/monitor";
import { isKacholiaEntity } from "../entities";

// BSE publishes daily bulk + block deal CSVs — much more reliable than HTML scraping
// These are official exchange files, available from ~6 PM on trading days
const BSE_BULK_CSV_URL = "https://www.bseindia.com/markets/equity/EQReports/BulkandBlockDeals.aspx";
const BSE_BULK_CSV_DOWNLOAD = "https://www.bseindia.com/markets/MarketInfo/BulkDeals.aspx";

const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
  Referer: "https://www.bseindia.com/",
};

function parseNumber(text: string): number {
  return parseFloat(text.replace(/,/g, "").replace(/[^\d.\-]/g, "")) || 0;
}

function formatDateForBse(date: Date): string {
  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const yyyy = date.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

// BSE provides JSON for bulk deals — much cleaner than HTML
export async function scrapeBseBulkDealsCsv(daysBack = 7): Promise<number> {
  console.log(`[BSE-CSV] Scraping bulk deals for last ${daysBack} days...`);
  const start = Date.now();

  try {
    const db = getDb();
    let newDeals = 0;

    // Try multiple date ranges
    for (let day = 0; day < daysBack; day++) {
      const date = new Date();
      date.setDate(date.getDate() - day);
      // Skip weekends
      if (date.getDay() === 0 || date.getDay() === 6) continue;

      const dateStr = formatDateForBse(date);

      // BSE bulk deals JSON API
      const url = `https://api.bseindia.com/BseIndiaAPI/api/BulkDeals/w?strdate=${dateStr}&enddate=${dateStr}`;

      const res = await fetch(url, {
        headers: {
          ...HEADERS,
          Accept: "application/json",
          Origin: "https://www.bseindia.com",
        },
      });

      if (!res.ok) continue;

      let deals: Array<Record<string, string>>;
      try {
        const json = await res.json();
        deals = json?.Table || json?.data || json || [];
        if (!Array.isArray(deals)) continue;
      } catch {
        continue;
      }

      for (const deal of deals) {
        // BSE API field names vary — try all known variants
        const clientName = (deal.CLIENT_NAME || deal.ClientName || deal.client_name || "").trim();
        if (!isKacholiaEntity(clientName)) continue;

        const symbol = (deal.SC_CODE || deal.SCRIP_CD || deal.symbol || "").trim();
        const name = (deal.SC_NAME || deal.SCRIP_NAME || deal.company || symbol).trim();
        const actionRaw = (deal.BUY_SELL || deal.buysell || deal.action || "").toLowerCase();
        const action = actionRaw.includes("b") ? "Buy" : "Sell";
        const quantity = parseNumber(deal.DEAL_QTY || deal.Qty || deal.quantity || "0");
        const avgPrice = parseNumber(deal.DEAL_PRICE || deal.Price || deal.avg_price || "0");

        if (!symbol || !quantity) continue;

        // BSE uses numeric scrip codes — we need to map to NSE symbol
        // Store the BSE code in symbol for now, and try to map later
        const resolvedSymbol = /^\d+$/.test(symbol) ? `BSE:${symbol}` : symbol;

        const stockId = await ensureStock(resolvedSymbol, name);

        const { data } = await db.from("deals").upsert(
          {
            stock_id: stockId,
            deal_date: dateStr,
            exchange: "BSE",
            deal_type: "Bulk",
            action,
            quantity,
            avg_price: avgPrice,
            pct_traded: null,
          },
          { onConflict: "stock_id,deal_date,exchange,deal_type,action,quantity", ignoreDuplicates: true }
        ).select("id");

        if (data && data.length > 0) newDeals++;
      }

      await new Promise((r) => setTimeout(r, 500));
    }

    const latency = Date.now() - start;
    recordSourceResult("bse-csv", true, latency);
    console.log(`[BSE-CSV] Found ${newDeals} new Kacholia deals`);
    return newDeals;
  } catch (error) {
    const latency = Date.now() - start;
    recordSourceResult("bse-csv", false, latency, String(error));
    console.error("[BSE-CSV] Scrape failed:", error);
    return 0;
  }
}

// BSE block deals
export async function scrapeBseBlockDealsCsv(daysBack = 7): Promise<number> {
  console.log(`[BSE-CSV] Scraping block deals for last ${daysBack} days...`);
  const start = Date.now();

  try {
    const db = getDb();
    let newDeals = 0;

    for (let day = 0; day < daysBack; day++) {
      const date = new Date();
      date.setDate(date.getDate() - day);
      if (date.getDay() === 0 || date.getDay() === 6) continue;

      const dateStr = formatDateForBse(date);
      const url = `https://api.bseindia.com/BseIndiaAPI/api/BlockDeals/w?strdate=${dateStr}&enddate=${dateStr}`;

      const res = await fetch(url, {
        headers: {
          ...HEADERS,
          Accept: "application/json",
          Origin: "https://www.bseindia.com",
        },
      });

      if (!res.ok) continue;

      let deals: Array<Record<string, string>>;
      try {
        const json = await res.json();
        deals = json?.Table || json?.data || json || [];
        if (!Array.isArray(deals)) continue;
      } catch {
        continue;
      }

      for (const deal of deals) {
        const clientName = (deal.CLIENT_NAME || deal.ClientName || deal.client_name || "").trim();
        if (!isKacholiaEntity(clientName)) continue;

        const symbol = (deal.SC_CODE || deal.SCRIP_CD || deal.symbol || "").trim();
        const name = (deal.SC_NAME || deal.SCRIP_NAME || deal.company || symbol).trim();
        const actionRaw = (deal.BUY_SELL || deal.buysell || deal.action || "").toLowerCase();
        const action = actionRaw.includes("b") ? "Buy" : "Sell";
        const quantity = parseNumber(deal.DEAL_QTY || deal.Qty || deal.quantity || "0");
        const avgPrice = parseNumber(deal.DEAL_PRICE || deal.Price || deal.avg_price || "0");

        if (!symbol || !quantity) continue;

        const resolvedSymbol = /^\d+$/.test(symbol) ? `BSE:${symbol}` : symbol;
        const stockId = await ensureStock(resolvedSymbol, name);

        const { data } = await db.from("deals").upsert(
          {
            stock_id: stockId,
            deal_date: dateStr,
            exchange: "BSE",
            deal_type: "Block",
            action,
            quantity,
            avg_price: avgPrice,
            pct_traded: null,
          },
          { onConflict: "stock_id,deal_date,exchange,deal_type,action,quantity", ignoreDuplicates: true }
        ).select("id");

        if (data && data.length > 0) newDeals++;
      }

      await new Promise((r) => setTimeout(r, 500));
    }

    const latency = Date.now() - start;
    recordSourceResult("bse-block", true, latency);
    console.log(`[BSE-CSV] Found ${newDeals} new block deals`);
    return newDeals;
  } catch (error) {
    const latency = Date.now() - start;
    recordSourceResult("bse-block", false, latency, String(error));
    console.error("[BSE-CSV] Block deals scrape failed:", error);
    return 0;
  }
}
