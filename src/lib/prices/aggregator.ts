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
  const cached = db
    .prepare("SELECT * FROM price_cache WHERE symbol = ?")
    .get(symbol) as PriceData | undefined;

  if (cached) {
    const age = Date.now() - new Date(cached.updated_at).getTime();
    if (age < ttl) return cached;
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
        db.prepare(`
          INSERT INTO price_cache (symbol, price, change_pct, updated_at)
          VALUES (?, ?, ?, ?)
          ON CONFLICT(symbol) DO UPDATE SET
            price = excluded.price,
            change_pct = excluded.change_pct,
            updated_at = excluded.updated_at
        `).run(price.symbol, price.price, price.change_pct, price.updated_at);

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
    return cached;
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
  const stocks = db
    .prepare("SELECT DISTINCT s.symbol FROM stocks s INNER JOIN holdings h ON s.id = h.stock_id")
    .all() as { symbol: string }[];

  const symbols = stocks.map((s) => s.symbol);
  const prices = await getAggregatedPrices(symbols);
  return Object.keys(prices).length;
}
