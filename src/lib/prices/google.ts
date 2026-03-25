import * as cheerio from "cheerio";
import type { PriceData } from "@/types";

// Google Finance web scraping — no API key required
const GOOGLE_FINANCE_URL = "https://www.google.com/finance/quote";

const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml",
  "Accept-Language": "en-US,en;q=0.9",
};

export async function fetchGooglePrice(symbol: string): Promise<PriceData | null> {
  try {
    // Google Finance uses format: SYMBOL:NSE
    const url = `${GOOGLE_FINANCE_URL}/${symbol}:NSE`;

    const res = await fetch(url, { headers: HEADERS });
    if (!res.ok) return null;

    const html = await res.text();
    const $ = cheerio.load(html);

    // Google Finance puts the price in a div with data-last-price attribute
    const priceEl = $("[data-last-price]");
    const price = parseFloat(priceEl.attr("data-last-price") || "0");

    if (!price) {
      // Fallback: try to parse from the visible text
      const priceText = $(".YMlKec.fxKbKc").first().text();
      const parsedPrice = parseFloat(priceText.replace(/[₹,]/g, ""));
      if (!parsedPrice) return null;

      // Try to get change percentage
      const changeEl = $(".JwB6zf, .P2Luy").first().text();
      const changePctMatch = changeEl.match(/([-+]?\d+\.?\d*)%/);
      const changePct = changePctMatch ? parseFloat(changePctMatch[1]) : 0;

      return {
        symbol,
        price: parsedPrice,
        change_pct: Math.round(changePct * 100) / 100,
        updated_at: new Date().toISOString(),
      };
    }

    const changePctEl = $("[data-change-percent]");
    const changePct = parseFloat(changePctEl.attr("data-change-percent") || "0");

    return {
      symbol,
      price,
      change_pct: Math.round(changePct * 100) / 100,
      updated_at: new Date().toISOString(),
    };
  } catch (err) {
    console.error(`[Google] Failed to fetch price for ${symbol}:`, err);
    return null;
  }
}

export async function fetchGooglePricesBatch(symbols: string[]): Promise<Record<string, PriceData>> {
  const results: Record<string, PriceData> = {};

  // Fetch with concurrency limit of 3
  const batchSize = 3;
  for (let i = 0; i < symbols.length; i += batchSize) {
    const batch = symbols.slice(i, i + batchSize);
    const promises = batch.map(async (symbol) => {
      const price = await fetchGooglePrice(symbol);
      if (price) results[symbol] = price;
    });
    await Promise.allSettled(promises);
    // 500ms between batches
    if (i + batchSize < symbols.length) {
      await new Promise((r) => setTimeout(r, 500));
    }
  }

  return results;
}

export const SOURCE_NAME = "google";
