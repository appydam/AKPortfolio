import { getDb } from "../db";
import type { PortfolioDrawdown, PortfolioBeta, WinLossStats, Attribution } from "@/types";

export async function getPortfolioDrawdown(): Promise<PortfolioDrawdown> {
  const db = getDb();
  const defaultResult: PortfolioDrawdown = {
    maxDrawdownPct: 0, peakDate: "", peakValue: 0,
    troughDate: "", troughValue: 0, recoveryDate: null, recoveryDays: null,
    currentDrawdownPct: 0,
  };

  const { data: snapshots } = await db
    .from("portfolio_snapshots")
    .select("snapshot_date, total_value")
    .order("snapshot_date", { ascending: true });

  if (!snapshots || snapshots.length < 2) return defaultResult;

  let peak = 0;
  let peakDate = "";
  let maxDD = 0;
  let maxDDPeakDate = "";
  let maxDDPeakValue = 0;
  let maxDDTroughDate = "";
  let maxDDTroughValue = 0;

  for (const s of snapshots) {
    const value = s.total_value as number;
    const date = s.snapshot_date as string;

    if (value > peak) {
      peak = value;
      peakDate = date;
    }

    const dd = peak > 0 ? ((value - peak) / peak) * 100 : 0;
    if (dd < maxDD) {
      maxDD = dd;
      maxDDPeakDate = peakDate;
      maxDDPeakValue = peak;
      maxDDTroughDate = date;
      maxDDTroughValue = value;
    }
  }

  // Find recovery after trough
  let recoveryDate: string | null = null;
  let recoveryDays: number | null = null;
  if (maxDDTroughDate && maxDDPeakValue > 0) {
    for (const s of snapshots) {
      if ((s.snapshot_date as string) > maxDDTroughDate && (s.total_value as number) >= maxDDPeakValue) {
        recoveryDate = s.snapshot_date as string;
        recoveryDays = Math.round(
          (new Date(recoveryDate).getTime() - new Date(maxDDTroughDate).getTime()) / (1000 * 60 * 60 * 24)
        );
        break;
      }
    }
  }

  // Current drawdown from all-time peak
  const allTimePeak = Math.max(...snapshots.map((s) => s.total_value as number));
  const latestValue = (snapshots[snapshots.length - 1].total_value as number);
  const currentDD = allTimePeak > 0 ? ((latestValue - allTimePeak) / allTimePeak) * 100 : 0;

  return {
    maxDrawdownPct: Math.round(maxDD * 100) / 100,
    peakDate: maxDDPeakDate,
    peakValue: maxDDPeakValue,
    troughDate: maxDDTroughDate,
    troughValue: maxDDTroughValue,
    recoveryDate,
    recoveryDays,
    currentDrawdownPct: Math.round(currentDD * 100) / 100,
  };
}

export async function getPortfolioBeta(): Promise<PortfolioBeta> {
  const db = getDb();
  const defaultResult: PortfolioBeta = { beta: 1, correlation: 0, alpha: 0, interpretation: "Insufficient data" };

  const { data: snapshots } = await db
    .from("portfolio_snapshots")
    .select("snapshot_date, total_value")
    .order("snapshot_date", { ascending: true });

  if (!snapshots || snapshots.length < 10) return defaultResult;

  const dates = snapshots.map((s) => s.snapshot_date as string);
  const { data: indexData } = await db
    .from("index_data")
    .select("date, close_value")
    .eq("index_name", "NIFTY50")
    .in("date", dates)
    .order("date", { ascending: true });

  if (!indexData || indexData.length < 10) return defaultResult;

  // Align dates
  const indexMap = new Map<string, number>();
  for (const i of indexData) indexMap.set(i.date as string, i.close_value as number);

  const aligned: Array<{ pVal: number; mVal: number }> = [];
  for (const s of snapshots) {
    const mVal = indexMap.get(s.snapshot_date as string);
    if (mVal) aligned.push({ pVal: s.total_value as number, mVal });
  }

  if (aligned.length < 10) return defaultResult;

  // Compute returns
  const pReturns: number[] = [];
  const mReturns: number[] = [];
  for (let i = 1; i < aligned.length; i++) {
    pReturns.push((aligned[i].pVal - aligned[i - 1].pVal) / aligned[i - 1].pVal);
    mReturns.push((aligned[i].mVal - aligned[i - 1].mVal) / aligned[i - 1].mVal);
  }

  const n = pReturns.length;
  const meanP = pReturns.reduce((a, b) => a + b, 0) / n;
  const meanM = mReturns.reduce((a, b) => a + b, 0) / n;

  let cov = 0, varM = 0, varP = 0;
  for (let i = 0; i < n; i++) {
    const dp = pReturns[i] - meanP;
    const dm = mReturns[i] - meanM;
    cov += dp * dm;
    varM += dm * dm;
    varP += dp * dp;
  }
  cov /= n;
  varM /= n;
  varP /= n;

  const beta = varM > 0 ? cov / varM : 1;
  const stdP = Math.sqrt(varP);
  const stdM = Math.sqrt(varM);
  const correlation = stdP > 0 && stdM > 0 ? cov / (stdP * stdM) : 0;
  const alpha = (meanP - beta * meanM) * 252; // annualized

  let interpretation: string;
  if (beta < 0.8) interpretation = "Defensive — less volatile than market";
  else if (beta <= 1.2) interpretation = "Market-aligned — moves with NIFTY";
  else interpretation = "Aggressive — amplifies market moves";

  return {
    beta: Math.round(beta * 100) / 100,
    correlation: Math.round(correlation * 100) / 100,
    alpha: Math.round(alpha * 10000) / 100, // as percentage
    interpretation,
  };
}

export async function getWinLossStats(): Promise<WinLossStats> {
  const db = getDb();
  const defaultResult: WinLossStats = {
    totalExits: 0, wins: 0, losses: 0, winRate: 0,
    avgWinPct: 0, avgLossPct: 0, bestExit: null, worstExit: null,
  };

  // Get full exits from portfolio history
  const { data: exits } = await db
    .from("portfolio_history")
    .select("stock_id, price_at_event, stocks(symbol, name)")
    .eq("event_type", "full_exit");

  if (!exits || exits.length === 0) return defaultResult;

  // Get all buy deals for exited stocks
  const exitStockIds = exits.map((e: Record<string, unknown>) => e.stock_id as number);
  const { data: buyDeals } = await db
    .from("deals")
    .select("stock_id, quantity, avg_price")
    .in("stock_id", exitStockIds)
    .eq("action", "Buy");

  // Avg buy price per stock
  const avgBuyMap = new Map<number, number>();
  const buyAgg = new Map<number, { totalCost: number; totalQty: number }>();
  for (const d of buyDeals || []) {
    const id = d.stock_id as number;
    if (!buyAgg.has(id)) buyAgg.set(id, { totalCost: 0, totalQty: 0 });
    const agg = buyAgg.get(id)!;
    agg.totalCost += d.quantity * d.avg_price;
    agg.totalQty += d.quantity;
  }
  for (const [id, agg] of buyAgg) {
    avgBuyMap.set(id, agg.totalQty > 0 ? agg.totalCost / agg.totalQty : 0);
  }

  let wins = 0, losses = 0;
  const winPcts: number[] = [];
  const lossPcts: number[] = [];
  let best: { symbol: string; returnPct: number } | null = null;
  let worst: { symbol: string; returnPct: number } | null = null;

  for (const e of exits) {
    const stockId = e.stock_id as number;
    const exitPrice = e.price_at_event as number | null;
    const avgBuy = avgBuyMap.get(stockId);
    const stock = e.stocks as unknown as Record<string, unknown> | null;
    const symbol = (stock?.symbol as string) || "";

    if (!exitPrice || !avgBuy || avgBuy === 0) continue;

    const returnPct = ((exitPrice - avgBuy) / avgBuy) * 100;

    if (returnPct >= 0) {
      wins++;
      winPcts.push(returnPct);
    } else {
      losses++;
      lossPcts.push(returnPct);
    }

    if (!best || returnPct > best.returnPct) best = { symbol, returnPct: Math.round(returnPct * 10) / 10 };
    if (!worst || returnPct < worst.returnPct) worst = { symbol, returnPct: Math.round(returnPct * 10) / 10 };
  }

  const totalExits = wins + losses;
  return {
    totalExits,
    wins,
    losses,
    winRate: totalExits > 0 ? Math.round((wins / totalExits) * 1000) / 10 : 0,
    avgWinPct: winPcts.length > 0 ? Math.round((winPcts.reduce((a, b) => a + b, 0) / winPcts.length) * 10) / 10 : 0,
    avgLossPct: lossPcts.length > 0 ? Math.round((lossPcts.reduce((a, b) => a + b, 0) / lossPcts.length) * 10) / 10 : 0,
    bestExit: best,
    worstExit: worst,
  };
}

export async function getPerformanceAttribution(): Promise<{ topContributors: Attribution[]; bottomDetractors: Attribution[] }> {
  const db = getDb();
  const empty = { topContributors: [], bottomDetractors: [] };

  // Get two most recent snapshots
  const { data: snapshots } = await db
    .from("portfolio_snapshots")
    .select("snapshot_date, total_value, details_json")
    .order("snapshot_date", { ascending: false })
    .limit(2);

  if (!snapshots || snapshots.length < 2) return empty;

  const latest = snapshots[0];
  const prev = snapshots[1];

  let latestDetails: Record<string, { shares: number; price: number; value: number }>;
  let prevDetails: Record<string, { shares: number; price: number; value: number }>;
  try {
    latestDetails = JSON.parse(latest.details_json as string);
    prevDetails = JSON.parse(prev.details_json as string);
  } catch {
    return empty;
  }

  const totalChange = (latest.total_value as number) - (prev.total_value as number);
  if (totalChange === 0) return empty;

  // Get stock names
  const symbols = [...new Set([...Object.keys(latestDetails), ...Object.keys(prevDetails)])];
  const { data: stocksData } = await db
    .from("stocks")
    .select("symbol, name")
    .in("symbol", symbols);

  const nameMap = new Map<string, string>();
  for (const s of stocksData || []) nameMap.set(s.symbol, s.name);

  const attrs: Attribution[] = [];
  const allSymbols = new Set([...Object.keys(latestDetails), ...Object.keys(prevDetails)]);

  for (const sym of allSymbols) {
    const latestVal = latestDetails[sym]?.value || 0;
    const prevVal = prevDetails[sym]?.value || 0;
    const contribution = latestVal - prevVal;
    const latestPrice = latestDetails[sym]?.price || 0;
    const prevPrice = prevDetails[sym]?.price || 0;
    const priceChange = prevPrice > 0 ? ((latestPrice - prevPrice) / prevPrice) * 100 : 0;
    const weight = (latest.total_value as number) > 0 ? (latestVal / (latest.total_value as number)) * 100 : 0;

    attrs.push({
      symbol: sym,
      name: nameMap.get(sym) || sym,
      contribution,
      contributionPct: totalChange !== 0 ? (contribution / Math.abs(totalChange)) * 100 : 0,
      priceChangePct: Math.round(priceChange * 10) / 10,
      weight: Math.round(weight * 10) / 10,
    });
  }

  attrs.sort((a, b) => b.contribution - a.contribution);

  return {
    topContributors: attrs.slice(0, 5).map(a => ({
      ...a,
      contribution: Math.round(a.contribution),
      contributionPct: Math.round(a.contributionPct * 10) / 10,
    })),
    bottomDetractors: attrs.slice(-5).reverse().map(a => ({
      ...a,
      contribution: Math.round(a.contribution),
      contributionPct: Math.round(a.contributionPct * 10) / 10,
    })),
  };
}
