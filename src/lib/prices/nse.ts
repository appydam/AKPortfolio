import type { PriceData } from "@/types";
import { nseFetch, invalidateNseCookies } from "../nse-session";

const NSE_QUOTE_URL = "https://www.nseindia.com/api/quote-equity";

export async function fetchNsePrice(symbol: string): Promise<PriceData | null> {
  try {
    const url = `${NSE_QUOTE_URL}?symbol=${encodeURIComponent(symbol)}`;
    const res = await nseFetch(url);

    if (!res.ok) {
      if (res.status === 401 || res.status === 403) invalidateNseCookies();
      return null;
    }

    const data = await res.json();
    const priceInfo = data?.priceInfo;
    if (!priceInfo) return null;

    const price = priceInfo.lastPrice || priceInfo.close || 0;
    const previousClose = priceInfo.previousClose || 0;
    const changePct = previousClose
      ? ((price - previousClose) / previousClose) * 100
      : priceInfo.pChange || 0;

    return {
      symbol,
      price,
      change_pct: Math.round(changePct * 100) / 100,
      updated_at: new Date().toISOString(),
    };
  } catch (err) {
    console.error(`[NSE] Failed to fetch price for ${symbol}:`, err);
    return null;
  }
}

export async function fetchNsePricesBatch(symbols: string[]): Promise<Record<string, PriceData>> {
  const results: Record<string, PriceData> = {};

  for (const symbol of symbols) {
    const price = await fetchNsePrice(symbol);
    if (price) results[symbol] = price;
    await new Promise((r) => setTimeout(r, 300));
  }

  return results;
}

export const SOURCE_NAME = "nse";
