import { getDb } from "../db";
import type { PriceData } from "@/types";

const YAHOO_BASE = "https://query1.finance.yahoo.com/v8/finance/chart";

function isMarketHours(): boolean {
  const now = new Date();
  const ist = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
  const hours = ist.getHours();
  const minutes = ist.getMinutes();
  const day = ist.getDay();

  // Monday-Friday, 9:15 AM - 3:30 PM IST
  if (day === 0 || day === 6) return false;
  const timeInMinutes = hours * 60 + minutes;
  return timeInMinutes >= 555 && timeInMinutes <= 930; // 9:15=555, 15:30=930
}

function getCacheTtlMs(): number {
  return isMarketHours() ? 60_000 : 6 * 3600_000;
}

async function fetchYahooPrice(symbol: string): Promise<PriceData | null> {
  const yahooSymbol = `${symbol}.NS`;
  const url = `${YAHOO_BASE}/${yahooSymbol}?interval=1d&range=1d`;

  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
      },
    });

    if (!response.ok) return null;

    const data = await response.json();
    const result = data?.chart?.result?.[0];
    if (!result) return null;

    const meta = result.meta;
    const price = meta.regularMarketPrice;
    const previousClose = meta.chartPreviousClose || meta.previousClose;
    const changePct = previousClose
      ? ((price - previousClose) / previousClose) * 100
      : 0;

    return {
      symbol,
      price,
      change_pct: Math.round(changePct * 100) / 100,
      updated_at: new Date().toISOString(),
    };
  } catch (error) {
    console.error(`[Yahoo] Failed to fetch ${symbol}:`, error);
    return null;
  }
}

export async function getPrice(symbol: string): Promise<PriceData | null> {
  const db = getDb();
  const ttl = getCacheTtlMs();

  // Check cache
  const { data: cached } = await db
    .from("price_cache")
    .select("*")
    .eq("symbol", symbol)
    .single();

  if (cached) {
    const age = Date.now() - new Date(cached.updated_at).getTime();
    if (age < ttl) return cached as PriceData;
  }

  // Fetch fresh
  const fresh = await fetchYahooPrice(symbol);
  if (!fresh) return (cached as PriceData) || null;

  // Update cache
  await db
    .from("price_cache")
    .upsert(
      {
        symbol: fresh.symbol,
        price: fresh.price,
        change_pct: fresh.change_pct,
        updated_at: fresh.updated_at,
      },
      { onConflict: "symbol" }
    );

  return fresh;
}

export async function getPrices(symbols: string[]): Promise<Record<string, PriceData>> {
  const results: Record<string, PriceData> = {};

  // Fetch in batches of 5 to avoid rate limiting
  const batchSize = 5;
  for (let i = 0; i < symbols.length; i += batchSize) {
    const batch = symbols.slice(i, i + batchSize);
    const promises = batch.map(async (symbol) => {
      const price = await getPrice(symbol);
      if (price) results[symbol] = price;
    });
    await Promise.allSettled(promises);

    // Small delay between batches
    if (i + batchSize < symbols.length) {
      await new Promise((r) => setTimeout(r, 300));
    }
  }

  return results;
}

export async function refreshAllPrices(): Promise<number> {
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
  const prices = await getPrices(symbols);
  return Object.keys(prices).length;
}
