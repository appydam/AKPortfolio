import { getDb } from "../db";

// Daily Portfolio Value Estimator
// Between quarters, we estimate Kacholia's portfolio value daily:
//   Base = last quarter's holdings (shares × current prices)
//   Adjustments = add/subtract any bulk/block deals since quarter end
// This gives a near-accurate daily P&L curve even between SHP filings.

interface DailyEstimate {
  date: string;
  estimatedValue: number;
  baseValue: number; // from quarterly holdings
  adjustmentValue: number; // from intra-quarter deals
  numHoldings: number;
  topMovers: Array<{ symbol: string; name: string; changePct: number; contribution: number }>;
}

interface EstimatedHolding {
  stockId: number;
  symbol: string;
  name: string;
  baseShares: number; // from last SHP
  adjustedShares: number; // after applying intra-quarter deals
  currentPrice: number;
  changePct: number;
  baseValue: number;
  adjustedValue: number;
}

async function getLatestQuarter(): Promise<{ quarter: string; endDate: Date } | null> {
  const db = getDb();
  const { data } = await db
    .from("holdings")
    .select("quarter")
    .order("quarter", { ascending: false })
    .limit(1)
    .single();

  if (!data?.quarter) return null;

  // Parse quarter like "2026-Q1" into end date
  const [year, q] = (data.quarter as string).split("-Q");
  const qNum = parseInt(q);
  // Quarter end: Q1=Mar31, Q2=Jun30, Q3=Sep30, Q4=Dec31
  const endMonth = qNum * 3;
  const endDate = new Date(parseInt(year), endMonth, 0); // last day of that month
  return { quarter: data.quarter as string, endDate };
}

export async function getEstimatedHoldings(): Promise<EstimatedHolding[]> {
  const db = getDb();
  const qInfo = await getLatestQuarter();
  if (!qInfo) return [];

  // 1. Get base holdings from last quarter
  const { data: holdingsData } = await db
    .from("holdings")
    .select("stock_id, shares_held, stocks(symbol, name)")
    .eq("quarter", qInfo.quarter);

  if (!holdingsData || holdingsData.length === 0) return [];

  // 2. Get all deals AFTER the quarter end date (intra-quarter adjustments)
  const quarterEndStr = qInfo.endDate.toISOString().split("T")[0];
  const { data: recentDeals } = await db
    .from("deals")
    .select("stock_id, action, quantity")
    .gt("deal_date", quarterEndStr)
    .order("deal_date_parsed", { ascending: true, nullsFirst: false });

  // Compute deal adjustments per stock
  const adjustments = new Map<number, number>();
  for (const d of recentDeals || []) {
    const id = d.stock_id as number;
    const delta = (d.action as string) === "Buy" ? (d.quantity as number) : -(d.quantity as number);
    adjustments.set(id, (adjustments.get(id) || 0) + delta);
  }

  // 3. Get current prices
  const symbols = holdingsData.map((h: Record<string, unknown>) => {
    const stock = h.stocks as unknown as Record<string, unknown> | null;
    return stock?.symbol as string;
  }).filter(Boolean);

  const { data: prices } = await db
    .from("price_cache")
    .select("symbol, price, change_pct")
    .in("symbol", symbols);

  const priceMap = new Map<string, { price: number; changePct: number }>();
  for (const p of prices || []) {
    priceMap.set(p.symbol, { price: p.price, changePct: p.change_pct || 0 });
  }

  // 4. Build estimated holdings
  const results: EstimatedHolding[] = [];

  for (const h of holdingsData) {
    const stock = h.stocks as unknown as Record<string, unknown> | null;
    const stockId = h.stock_id as number;
    const symbol = (stock?.symbol as string) || "";
    const name = (stock?.name as string) || "";
    const baseShares = h.shares_held as number;
    const dealAdj = adjustments.get(stockId) || 0;
    const adjustedShares = Math.max(0, baseShares + dealAdj);
    const priceData = priceMap.get(symbol);
    const currentPrice = priceData?.price || 0;
    const changePct = priceData?.changePct || 0;

    results.push({
      stockId,
      symbol,
      name,
      baseShares,
      adjustedShares,
      currentPrice,
      changePct,
      baseValue: baseShares * currentPrice,
      adjustedValue: adjustedShares * currentPrice,
    });
  }

  // Also include stocks from recent deals that weren't in quarterly holdings (new entries)
  const holdingStockIds = new Set(holdingsData.map((h: Record<string, unknown>) => h.stock_id as number));
  for (const [stockId, adj] of adjustments) {
    if (holdingStockIds.has(stockId) || adj <= 0) continue;
    // New entry via bulk deal — look up stock info
    const { data: stockInfo } = await db
      .from("stocks")
      .select("symbol, name")
      .eq("id", stockId)
      .single();
    if (!stockInfo) continue;
    const priceData = priceMap.get(stockInfo.symbol);
    const price = priceData?.price || 0;
    results.push({
      stockId,
      symbol: stockInfo.symbol,
      name: stockInfo.name,
      baseShares: 0,
      adjustedShares: adj,
      currentPrice: price,
      changePct: priceData?.changePct || 0,
      baseValue: 0,
      adjustedValue: adj * price,
    });
  }

  return results.sort((a, b) => b.adjustedValue - a.adjustedValue);
}

export async function getDailyEstimate(): Promise<DailyEstimate> {
  const holdings = await getEstimatedHoldings();

  const totalBase = holdings.reduce((s, h) => s + h.baseValue, 0);
  const totalAdj = holdings.reduce((s, h) => s + h.adjustedValue, 0);

  // Top movers by absolute contribution to daily change
  const movers = holdings
    .map(h => ({
      symbol: h.symbol,
      name: h.name,
      changePct: h.changePct,
      contribution: h.adjustedValue * (h.changePct / 100),
    }))
    .sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution));

  return {
    date: new Date().toISOString().split("T")[0],
    estimatedValue: totalAdj,
    baseValue: totalBase,
    adjustmentValue: totalAdj - totalBase,
    numHoldings: holdings.filter(h => h.adjustedShares > 0).length,
    topMovers: movers.slice(0, 5),
  };
}
