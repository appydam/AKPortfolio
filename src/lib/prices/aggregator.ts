import { getDb } from "../db";
import { fetchNsePrice } from "./nse";
import { fetchGooglePrice } from "./google";
import { getPrice as getYahooPrice } from "./yahoo";
import { recordSourceResult } from "../health/monitor";
import type { PriceData } from "@/types";

// Priority order: NSE (official) > Google Finance > Yahoo Finance
const PRICE_SOURCES = [
  { name: "nse", fetcher: fetchNsePrice },
  { name: "google", fetcher: fetchGooglePrice },
  { name: "yahoo", fetcher: async (symbol: string) => getYahooPrice(symbol) },
] as const;

function isMarketHours(): boolean {
  const now = new Date();
  const ist = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
  const hours = ist.getHours();
  const minutes = ist.getMinutes();
  const day = ist.getDay();
  if (day === 0 || day === 6) return false;
  const timeInMinutes = hours * 60 + minutes;
  return timeInMinutes >= 555 && timeInMinutes <= 930;
}

function getCacheTtlMs(): number {
  return isMarketHours() ? 5_000 : 6 * 3600_000; // 5s during market, 6h off
}

export async function getAggregatedPrice(symbol: string): Promise<PriceData | null> {
  const db = getDb();
  const ttl = getCacheTtlMs();

  // Check cache first
  const { data: cached } = await db
    .from("price_cache")
    .select("*")
    .eq("symbol", symbol)
    .single();

  if (cached) {
    const age = Date.now() - new Date(cached.updated_at).getTime();
    if (age < ttl) return cached as PriceData;
  }

  // Try each source in priority order with failover
  for (const source of PRICE_SOURCES) {
    const start = Date.now();
    try {
      const price = await source.fetcher(symbol);
      const latency = Date.now() - start;

      if (price && price.price > 0) {
        recordSourceResult(source.name, true, latency);

        // Update cache
        await db
          .from("price_cache")
          .upsert(
            {
              symbol: price.symbol,
              price: price.price,
              change_pct: price.change_pct,
              updated_at: price.updated_at,
            },
            { onConflict: "symbol" }
          );

        return price;
      }

      recordSourceResult(source.name, false, latency, "Empty/zero price returned");
    } catch (err) {
      const latency = Date.now() - start;
      recordSourceResult(source.name, false, latency, String(err));
      console.error(`[Aggregator] ${source.name} failed for ${symbol}:`, err);
    }
  }

  // All sources failed — return stale cache if available
  if (cached) {
    console.warn(`[Aggregator] All sources failed for ${symbol}, using stale cache`);
    return cached as PriceData;
  }

  return null;
}

export async function getAggregatedPrices(symbols: string[]): Promise<Record<string, PriceData>> {
  const results: Record<string, PriceData> = {};

  // Fetch in parallel batches of 5
  const batchSize = 5;
  for (let i = 0; i < symbols.length; i += batchSize) {
    const batch = symbols.slice(i, i + batchSize);
    const promises = batch.map(async (symbol) => {
      const price = await getAggregatedPrice(symbol);
      if (price) results[symbol] = price;
    });
    await Promise.allSettled(promises);
  }

  return results;
}

export async function refreshAllAggregatedPrices(): Promise<number> {
  const db = getDb();

  // Get distinct symbols from stocks that have holdings
  const { data: holdingsWithStocks } = await db
    .from("holdings")
    .select("stock_id, stocks(symbol)")
    .limit(1000);

  const symbolSet = new Set<string>();
  for (const h of holdingsWithStocks || []) {
    const stock = h.stocks as unknown as Record<string, unknown> | null;
    if (stock?.symbol) symbolSet.add(stock.symbol as string);
  }

  const symbols = Array.from(symbolSet);
  const prices = await getAggregatedPrices(symbols);
  return Object.keys(prices).length;
}
