import { getDb } from "../db";

// Kacholia Effect Backtester
// For every historical entry/buy, compute what happened to the stock price
// at +1 week, +1 month, +3 months, +6 months, +1 year after his entry.
// This PROVES the strategy works (or doesn't) with hard numbers.

export interface BacktestEntry {
  symbol: string;
  name: string;
  entryDate: string;
  entryPrice: number;
  action: "Buy" | "Sell";
  quantity: number;
  valueCr: number;
  // Returns after entry (null if not enough time has passed)
  return1w: number | null;
  return1m: number | null;
  return3m: number | null;
  return6m: number | null;
  return1y: number | null;
  currentReturn: number;
  currentPrice: number;
  // Was this a new entry (first ever buy) or an add-on?
  isNewEntry: boolean;
  marketCapAtEntry: string; // "small" (<1000 Cr), "mid" (1000-10000), "large" (>10000)
}

export interface BacktestSummary {
  totalEntries: number;
  newEntries: number;
  addOns: number;
  avgReturn1m: number | null;
  avgReturn3m: number | null;
  avgReturn6m: number | null;
  avgReturn1y: number | null;
  winRate1m: number | null; // % of entries that were profitable after 1 month
  winRate3m: number | null;
  winRate6m: number | null;
  winRate1y: number | null;
  bestEntry: { symbol: string; returnPct: number; period: string } | null;
  worstEntry: { symbol: string; returnPct: number; period: string } | null;
  avgReturnNewEntries3m: number | null; // new entries specifically
  avgReturnSmallCap3m: number | null; // small cap entries specifically
  entries: BacktestEntry[];
}

// Fetch historical price for a symbol at a specific date using Yahoo Finance
async function getHistoricalPrice(symbol: string, targetDate: Date): Promise<number | null> {
  try {
    // Yahoo Finance chart API with daily interval
    const fromTs = Math.floor(targetDate.getTime() / 1000) - 86400 * 5; // 5 days before
    const toTs = Math.floor(targetDate.getTime() / 1000) + 86400 * 5; // 5 days after
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}.NS?period1=${fromTs}&period2=${toTs}&interval=1d`;

    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0" },
    });
    if (!res.ok) return null;

    const data = await res.json();
    const result = data?.chart?.result?.[0];
    if (!result) return null;

    const timestamps = result.timestamp || [];
    const closes = result.indicators?.quote?.[0]?.close || [];

    // Find the closest date
    const targetTs = Math.floor(targetDate.getTime() / 1000);
    let closest = 0;
    let minDiff = Infinity;
    for (let i = 0; i < timestamps.length; i++) {
      const diff = Math.abs(timestamps[i] - targetTs);
      if (diff < minDiff && closes[i]) {
        minDiff = diff;
        closest = i;
      }
    }

    return closes[closest] || null;
  } catch {
    return null;
  }
}

// Get current price from cache
async function getCurrentPrice(symbol: string): Promise<number> {
  const db = getDb();
  const { data } = await db
    .from("price_cache")
    .select("price")
    .eq("symbol", symbol)
    .single();
  return data?.price || 0;
}

export async function runBacktest(): Promise<BacktestSummary> {
  const db = getDb();

  // Get all buy deals with stock info, sorted by date
  const { data: deals } = await db
    .from("deals")
    .select("stock_id, deal_date, action, quantity, avg_price, deal_date_parsed, stocks(symbol, name)")
    .eq("action", "Buy")
    .order("deal_date_parsed", { ascending: true, nullsFirst: false });

  if (!deals || deals.length === 0) {
    return {
      totalEntries: 0, newEntries: 0, addOns: 0,
      avgReturn1m: null, avgReturn3m: null, avgReturn6m: null, avgReturn1y: null,
      winRate1m: null, winRate3m: null, winRate6m: null, winRate1y: null,
      bestEntry: null, worstEntry: null,
      avgReturnNewEntries3m: null, avgReturnSmallCap3m: null,
      entries: [],
    };
  }

  const entries: BacktestEntry[] = [];
  const seenStocks = new Set<number>();
  const now = new Date();

  for (const deal of deals) {
    const stock = deal.stocks as unknown as Record<string, unknown> | null;
    const symbol = (stock?.symbol as string) || "";
    const name = (stock?.name as string) || "";
    const stockId = deal.stock_id as number;
    const entryPrice = deal.avg_price as number;
    const quantity = deal.quantity as number;
    const dealDate = deal.deal_date_parsed as string || deal.deal_date as string;

    if (!symbol || !entryPrice || entryPrice === 0) continue;

    const isNewEntry = !seenStocks.has(stockId);
    seenStocks.add(stockId);

    const entryDate = new Date(dealDate);
    const daysSinceEntry = (now.getTime() - entryDate.getTime()) / (1000 * 60 * 60 * 24);
    const currentPrice = await getCurrentPrice(symbol);
    const currentReturn = currentPrice > 0 ? ((currentPrice - entryPrice) / entryPrice) * 100 : 0;
    const valueCr = (quantity * entryPrice) / 1e7;

    // Classify market cap based on deal value (rough proxy)
    let marketCapAtEntry: BacktestEntry["marketCapAtEntry"] = "mid";
    if (valueCr < 10) marketCapAtEntry = "small";
    else if (valueCr > 100) marketCapAtEntry = "large";

    // Calculate returns at different periods using Yahoo historical data
    let return1w: number | null = null;
    let return1m: number | null = null;
    let return3m: number | null = null;
    let return6m: number | null = null;
    let return1y: number | null = null;

    if (daysSinceEntry > 7) {
      const price1w = await getHistoricalPrice(symbol, new Date(entryDate.getTime() + 7 * 86400000));
      if (price1w) return1w = ((price1w - entryPrice) / entryPrice) * 100;
    }
    if (daysSinceEntry > 30) {
      const price1m = await getHistoricalPrice(symbol, new Date(entryDate.getTime() + 30 * 86400000));
      if (price1m) return1m = ((price1m - entryPrice) / entryPrice) * 100;
    }
    if (daysSinceEntry > 90) {
      const price3m = await getHistoricalPrice(symbol, new Date(entryDate.getTime() + 90 * 86400000));
      if (price3m) return3m = ((price3m - entryPrice) / entryPrice) * 100;
    }
    if (daysSinceEntry > 180) {
      const price6m = await getHistoricalPrice(symbol, new Date(entryDate.getTime() + 180 * 86400000));
      if (price6m) return6m = ((price6m - entryPrice) / entryPrice) * 100;
    }
    if (daysSinceEntry > 365) {
      const price1y = await getHistoricalPrice(symbol, new Date(entryDate.getTime() + 365 * 86400000));
      if (price1y) return1y = ((price1y - entryPrice) / entryPrice) * 100;
    }

    entries.push({
      symbol, name, entryDate: dealDate, entryPrice,
      action: "Buy", quantity, valueCr: Math.round(valueCr * 10) / 10,
      return1w: return1w !== null ? Math.round(return1w * 10) / 10 : null,
      return1m: return1m !== null ? Math.round(return1m * 10) / 10 : null,
      return3m: return3m !== null ? Math.round(return3m * 10) / 10 : null,
      return6m: return6m !== null ? Math.round(return6m * 10) / 10 : null,
      return1y: return1y !== null ? Math.round(return1y * 10) / 10 : null,
      currentReturn: Math.round(currentReturn * 10) / 10,
      currentPrice,
      isNewEntry,
      marketCapAtEntry,
    });

    // Rate limit Yahoo API
    await new Promise((r) => setTimeout(r, 300));
  }

  // Compute summary statistics
  const avg = (arr: number[]) => arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : null;
  const winRate = (arr: (number | null)[]) => {
    const valid = arr.filter((v): v is number => v !== null);
    return valid.length > 0 ? (valid.filter(v => v > 0).length / valid.length) * 100 : null;
  };

  const r1m = entries.map(e => e.return1m).filter((v): v is number => v !== null);
  const r3m = entries.map(e => e.return3m).filter((v): v is number => v !== null);
  const r6m = entries.map(e => e.return6m).filter((v): v is number => v !== null);
  const r1y = entries.map(e => e.return1y).filter((v): v is number => v !== null);

  // Best and worst entries (by 3m or current return)
  const sorted = [...entries].sort((a, b) => (b.return3m || b.currentReturn) - (a.return3m || a.currentReturn));
  const bestEntry = sorted[0] ? { symbol: sorted[0].symbol, returnPct: sorted[0].return3m || sorted[0].currentReturn, period: sorted[0].return3m !== null ? "3m" : "current" } : null;
  const worstEntry = sorted[sorted.length - 1] ? { symbol: sorted[sorted.length - 1].symbol, returnPct: sorted[sorted.length - 1].return3m || sorted[sorted.length - 1].currentReturn, period: sorted[sorted.length - 1].return3m !== null ? "3m" : "current" } : null;

  // New entries specifically
  const newEntryReturns3m = entries.filter(e => e.isNewEntry && e.return3m !== null).map(e => e.return3m!);
  const smallCapReturns3m = entries.filter(e => e.marketCapAtEntry === "small" && e.return3m !== null).map(e => e.return3m!);

  return {
    totalEntries: entries.length,
    newEntries: entries.filter(e => e.isNewEntry).length,
    addOns: entries.filter(e => !e.isNewEntry).length,
    avgReturn1m: avg(r1m) !== null ? Math.round(avg(r1m)! * 10) / 10 : null,
    avgReturn3m: avg(r3m) !== null ? Math.round(avg(r3m)! * 10) / 10 : null,
    avgReturn6m: avg(r6m) !== null ? Math.round(avg(r6m)! * 10) / 10 : null,
    avgReturn1y: avg(r1y) !== null ? Math.round(avg(r1y)! * 10) / 10 : null,
    winRate1m: winRate(entries.map(e => e.return1m)) !== null ? Math.round(winRate(entries.map(e => e.return1m))! * 10) / 10 : null,
    winRate3m: winRate(entries.map(e => e.return3m)) !== null ? Math.round(winRate(entries.map(e => e.return3m))! * 10) / 10 : null,
    winRate6m: winRate(entries.map(e => e.return6m)) !== null ? Math.round(winRate(entries.map(e => e.return6m))! * 10) / 10 : null,
    winRate1y: winRate(entries.map(e => e.return1y)) !== null ? Math.round(winRate(entries.map(e => e.return1y))! * 10) / 10 : null,
    bestEntry,
    worstEntry,
    avgReturnNewEntries3m: avg(newEntryReturns3m) !== null ? Math.round(avg(newEntryReturns3m)! * 10) / 10 : null,
    avgReturnSmallCap3m: avg(smallCapReturns3m) !== null ? Math.round(avg(smallCapReturns3m)! * 10) / 10 : null,
    entries,
  };
}
