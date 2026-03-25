import * as cheerio from "cheerio";
import { getDb } from "../db";
import { recordSourceResult } from "../health/monitor";

const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
};

function parseNumber(text: string): number | null {
  const cleaned = text.replace(/,/g, "").replace(/[^\d.\-]/g, "");
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

export async function scrapeScreenerFundamentals(symbol: string): Promise<boolean> {
  const url = `https://www.screener.in/company/${symbol}/consolidated/`;

  try {
    const response = await fetch(url, { headers: HEADERS });
    if (!response.ok) {
      // Try standalone if consolidated fails
      const standaloneResponse = await fetch(
        `https://www.screener.in/company/${symbol}/`,
        { headers: HEADERS }
      );
      if (!standaloneResponse.ok) return false;
      return await parseScreenerPage(await standaloneResponse.text(), symbol);
    }
    return await parseScreenerPage(await response.text(), symbol);
  } catch (error) {
    console.error(`[Screener] Failed to fetch ${symbol}:`, error);
    return false;
  }
}

async function parseScreenerPage(html: string, symbol: string): Promise<boolean> {
  const $ = cheerio.load(html);
  const db = getDb();

  // Screener shows key ratios in a list with labels
  const ratios: Record<string, number | null> = {};

  $(".company-ratios li, #top-ratios li, .ratios-table li").each((_, el) => {
    const name = $(el).find(".name, .text").text().trim().toLowerCase();
    const value = $(el).find(".value, .number").text().trim();

    if (name.includes("market cap")) ratios.market_cap = parseNumber(value);
    if (name.includes("stock p/e") || name.includes("pe ratio")) ratios.pe_ratio = parseNumber(value);
    if (name.includes("roe")) ratios.roe = parseNumber(value);
    if (name.includes("roce")) ratios.roce = parseNumber(value);
  });

  // Also try the top-level data list
  $("[class*='ratio'] span, .company-info .info span").each((_, el) => {
    const text = $(el).text().trim().toLowerCase();
    const nextValue = $(el).next().text().trim();

    if (text.includes("market cap")) ratios.market_cap = ratios.market_cap || parseNumber(nextValue);
    if (text.includes("stock p/e")) ratios.pe_ratio = ratios.pe_ratio || parseNumber(nextValue);
    if (text.includes("roe")) ratios.roe = ratios.roe || parseNumber(nextValue);
    if (text.includes("roce")) ratios.roce = ratios.roce || parseNumber(nextValue);
  });

  // Extract sector from breadcrumb or company info
  let sector: string | null = null;
  const sectorEl = $(".company-info a[href*='sector'], .sub-heading a").first();
  if (sectorEl.length) {
    sector = sectorEl.text().trim() || null;
  }

  const hasData = Object.values(ratios).some((v) => v !== null);
  if (!hasData && !sector) return false;

  // Build update object with only non-null values
  const updateData: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (sector !== null) updateData.sector = sector;
  if (ratios.market_cap !== null) updateData.market_cap = ratios.market_cap;
  if (ratios.pe_ratio !== null) updateData.pe_ratio = ratios.pe_ratio;
  if (ratios.roe !== null) updateData.roe = ratios.roe;
  if (ratios.roce !== null) updateData.roce = ratios.roce;

  await db.from("stocks").update(updateData).eq("symbol", symbol);

  return true;
}

export async function updateAllFundamentals(): Promise<number> {
  console.log("[Screener] Updating fundamentals for all stocks...");
  const start = Date.now();
  const db = getDb();
  const { data: stocks } = await db.from("stocks").select("symbol");

  let updated = 0;
  for (const stock of stocks || []) {
    const success = await scrapeScreenerFundamentals(stock.symbol);
    if (success) updated++;
    await new Promise((r) => setTimeout(r, 1500));
  }

  const latency = Date.now() - start;
  recordSourceResult("screener", updated > 0, latency, updated === 0 ? "No stocks updated" : undefined);
  console.log(`[Screener] Updated fundamentals for ${updated}/${(stocks || []).length} stocks`);
  return updated;
}
