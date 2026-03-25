import * as cheerio from "cheerio";
import { getDb, ensureStock } from "../db";
import { recordSourceResult } from "../health/monitor";
import { isKacholiaEntity } from "../entities";

// MoneyControl superstar investor tracking
const MC_PORTFOLIO_URL =
  "https://www.moneycontrol.com/stocks/marketinfo/bulk_deals/";
const MC_SEARCH_URL =
  "https://www.moneycontrol.com/stocks/cptmarket/comdetail.php";

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

export async function scrapeMoneyControlBulkDeals(): Promise<number> {
  console.log("[MoneyControl] Scraping bulk deals...");
  const start = Date.now();

  try {
    // MC bulk deals page — NSE deals
    const nseUrl = `${MC_PORTFOLIO_URL}?sel_exchange=NSE`;
    const bseUrl = `${MC_PORTFOLIO_URL}?sel_exchange=BSE`;

    let totalNew = 0;

    for (const url of [nseUrl, bseUrl]) {
      const exchange = url.includes("NSE") ? "NSE" : "BSE";

      const response = await fetch(url, { headers: HEADERS });
      if (!response.ok) continue;

      const html = await response.text();
      const $ = cheerio.load(html);
      const db = getDb();

      // Collect rows from HTML first (synchronous cheerio parsing)
      const parsedRows: Array<{
        dealDate: string;
        stockName: string;
        symbol: string;
        action: string;
        quantity: number;
        avgPrice: number;
      }> = [];

      // MoneyControl bulk deals table
      $("table.tbldata tbody tr, table.mctable1 tbody tr, #bulkDeals table tr").each(
        (i, row) => {
          if (i === 0) return; // Skip header

          const cells = $(row).find("td");
          if (cells.length < 6) return;

          const dealDate = cleanText($(cells[0]).text());
          const stockName = cleanText($(cells[1]).text());
          const clientName = cleanText($(cells[2]).text());
          const dealTypeRaw = cleanText($(cells[3]).text());
          const quantity = parseNumber($(cells[4]).text());
          const avgPrice = parseNumber($(cells[5]).text());

          // Filter for Ashish Kacholia
          if (!isKacholiaEntity(clientName)) return;

          const action =
            dealTypeRaw.toLowerCase().includes("buy") ||
            dealTypeRaw.toLowerCase().includes("purchase")
              ? "Buy"
              : "Sell";

          // Try to extract symbol from link
          const link = $(cells[1]).find("a").attr("href") || "";
          const symbolMatch = link.match(/\/([A-Z0-9]+)(?:\/|$)/);
          const symbol =
            symbolMatch?.[1] ||
            stockName.replace(/[^A-Za-z0-9]/g, "").toUpperCase().substring(0, 20);

          parsedRows.push({ dealDate, stockName, symbol, action, quantity, avgPrice });
        }
      );

      // Now process rows with async DB calls
      for (const r of parsedRows) {
        const stockId = await ensureStock(r.symbol, r.stockName);

        const { data } = await db.from("deals").upsert(
          {
            stock_id: stockId,
            deal_date: r.dealDate,
            exchange,
            deal_type: "Bulk",
            action: r.action,
            quantity: r.quantity,
            avg_price: r.avgPrice,
            pct_traded: null,
          },
          { onConflict: "stock_id,deal_date,exchange,deal_type,action,quantity", ignoreDuplicates: true }
        ).select("id");

        if (data && data.length > 0) totalNew++;
      }

      // Delay between exchanges
      await new Promise((r) => setTimeout(r, 1500));
    }

    const latency = Date.now() - start;
    recordSourceResult("moneycontrol", true, latency);
    console.log(`[MoneyControl] Found ${totalNew} new deals`);
    return totalNew;
  } catch (error) {
    const latency = Date.now() - start;
    recordSourceResult("moneycontrol", false, latency, String(error));
    console.error("[MoneyControl] Scrape failed:", error);
    return 0;
  }
}

// Scrape shareholding changes from MoneyControl
export async function scrapeMoneyControlShareholding(symbol: string): Promise<{
  promoter: number | null;
  fii: number | null;
  dii: number | null;
  public_holding: number | null;
} | null> {
  try {
    const url = `https://www.moneycontrol.com/company-facts/${symbol.toLowerCase()}/shareholding-pattern/`;
    const response = await fetch(url, { headers: HEADERS });
    if (!response.ok) return null;

    const html = await response.text();
    const $ = cheerio.load(html);

    const result: Record<string, number | null> = {
      promoter: null,
      fii: null,
      dii: null,
      public_holding: null,
    };

    $("table.mctable1 tr, .shareholding_table tr").each((_, row) => {
      const label = $(row).find("td:first-child").text().toLowerCase().trim();
      const value = parseNumber($(row).find("td:last-child").text());

      if (label.includes("promoter")) result.promoter = value;
      if (label.includes("fii") || label.includes("foreign")) result.fii = value;
      if (label.includes("dii") || label.includes("mutual")) result.dii = value;
      if (label.includes("public")) result.public_holding = value;
    });

    return result as {
      promoter: number | null;
      fii: number | null;
      dii: number | null;
      public_holding: number | null;
    };
  } catch (error) {
    console.error(`[MoneyControl] Shareholding scrape failed for ${symbol}:`, error);
    return null;
  }
}
