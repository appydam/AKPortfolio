import { getDb } from "../db";

interface SectorBreakdown {
  sector: string;
  count: number;
  totalValue: number;
  pctOfPortfolio: number;
  stocks: Array<{ symbol: string; name: string; value: number }>;
}

interface ConcentrationMetrics {
  top5Pct: number;
  top10Pct: number;
  hhi: number; // Herfindahl-Hirschman Index (0-10000)
  riskLevel: "low" | "moderate" | "high" | "very_high";
}

interface PerformerData {
  symbol: string;
  name: string;
  price: number;
  changePct: number;
  value: number;
}

async function getLatestQuarter(): Promise<string | null> {
  const db = getDb();
  const { data } = await db
    .from("holdings")
    .select("quarter")
    .order("quarter", { ascending: false })
    .limit(1)
    .single();
  return data?.quarter ?? null;
}

export async function getSectorBreakdown(): Promise<SectorBreakdown[]> {
  const db = getDb();
  const quarter = await getLatestQuarter();
  if (!quarter) return [];

  // Get holdings with stock info
  const { data: holdingsData } = await db
    .from("holdings")
    .select("shares_held, stocks(symbol, name, sector)")
    .eq("quarter", quarter);

  if (!holdingsData || holdingsData.length === 0) return [];

  // Get all price cache entries
  const symbols = (holdingsData || []).map((h: Record<string, unknown>) => {
    const stock = h.stocks as unknown as Record<string, unknown> | null;
    return stock?.symbol as string;
  }).filter(Boolean);

  const { data: prices } = await db
    .from("price_cache")
    .select("symbol, price")
    .in("symbol", symbols);

  const priceMap = new Map<string, number>();
  for (const p of prices || []) {
    priceMap.set(p.symbol, p.price);
  }

  // Build holdings with market values
  const holdings = (holdingsData || []).map((h: Record<string, unknown>) => {
    const stock = h.stocks as unknown as Record<string, unknown> | null;
    const symbol = (stock?.symbol as string) || "";
    const price = priceMap.get(symbol) || 0;
    const marketValue = price * (h.shares_held as number);
    return {
      symbol,
      name: (stock?.name as string) || "",
      sector: (stock?.sector as string) || "Unknown",
      shares_held: h.shares_held as number,
      price,
      market_value: marketValue,
    };
  }).sort((a: { market_value: number }, b: { market_value: number }) => b.market_value - a.market_value);

  const totalValue = holdings.reduce((sum: number, h: { market_value: number }) => sum + h.market_value, 0);
  const sectorMap = new Map<string, SectorBreakdown>();

  for (const h of holdings) {
    const sector = h.sector || "Unknown";
    if (!sectorMap.has(sector)) {
      sectorMap.set(sector, {
        sector,
        count: 0,
        totalValue: 0,
        pctOfPortfolio: 0,
        stocks: [],
      });
    }
    const entry = sectorMap.get(sector)!;
    entry.count++;
    entry.totalValue += h.market_value;
    entry.stocks.push({ symbol: h.symbol, name: h.name, value: h.market_value });
  }

  const result = Array.from(sectorMap.values());
  for (const s of result) {
    s.pctOfPortfolio = totalValue > 0 ? Math.round((s.totalValue / totalValue) * 1000) / 10 : 0;
  }

  return result.sort((a, b) => b.totalValue - a.totalValue);
}

export async function getConcentrationMetrics(): Promise<ConcentrationMetrics> {
  const db = getDb();
  const quarter = await getLatestQuarter();
  if (!quarter) return { top5Pct: 0, top10Pct: 0, hhi: 0, riskLevel: "low" };

  // Get holdings with stock symbols
  const { data: holdingsData } = await db
    .from("holdings")
    .select("shares_held, stocks(symbol)")
    .eq("quarter", quarter);

  if (!holdingsData || holdingsData.length === 0) {
    return { top5Pct: 0, top10Pct: 0, hhi: 0, riskLevel: "low" };
  }

  const symbols = (holdingsData || []).map((h: Record<string, unknown>) => {
    const stock = h.stocks as unknown as Record<string, unknown> | null;
    return stock?.symbol as string;
  }).filter(Boolean);

  const { data: prices } = await db
    .from("price_cache")
    .select("symbol, price")
    .in("symbol", symbols);

  const priceMap = new Map<string, number>();
  for (const p of prices || []) {
    priceMap.set(p.symbol, p.price);
  }

  const holdings = (holdingsData || []).map((h: Record<string, unknown>) => {
    const stock = h.stocks as unknown as Record<string, unknown> | null;
    const symbol = (stock?.symbol as string) || "";
    const price = priceMap.get(symbol) || 0;
    return { market_value: price * (h.shares_held as number) };
  }).sort((a: { market_value: number }, b: { market_value: number }) => b.market_value - a.market_value);

  const totalValue = holdings.reduce((sum: number, h: { market_value: number }) => sum + h.market_value, 0);
  if (totalValue === 0) {
    return { top5Pct: 0, top10Pct: 0, hhi: 0, riskLevel: "low" };
  }

  const top5Value = holdings.slice(0, 5).reduce((sum: number, h: { market_value: number }) => sum + h.market_value, 0);
  const top10Value = holdings.slice(0, 10).reduce((sum: number, h: { market_value: number }) => sum + h.market_value, 0);

  // HHI: sum of squared market share percentages
  const hhi = holdings.reduce((sum: number, h: { market_value: number }) => {
    const share = (h.market_value / totalValue) * 100;
    return sum + share * share;
  }, 0);

  const top5Pct = Math.round((top5Value / totalValue) * 1000) / 10;
  const top10Pct = Math.round((top10Value / totalValue) * 1000) / 10;

  let riskLevel: "low" | "moderate" | "high" | "very_high";
  if (top5Pct > 60) riskLevel = "very_high";
  else if (top5Pct > 40) riskLevel = "high";
  else if (top5Pct > 25) riskLevel = "moderate";
  else riskLevel = "low";

  return {
    top5Pct,
    top10Pct,
    hhi: Math.round(hhi),
    riskLevel,
  };
}

export async function getTopPerformers(limit = 10): Promise<{ gainers: PerformerData[]; losers: PerformerData[] }> {
  const db = getDb();
  const quarter = await getLatestQuarter();
  if (!quarter) return { gainers: [], losers: [] };

  // Get holdings with stock info
  const { data: holdingsData } = await db
    .from("holdings")
    .select("shares_held, stocks(symbol, name)")
    .eq("quarter", quarter);

  if (!holdingsData || holdingsData.length === 0) return { gainers: [], losers: [] };

  const symbols = (holdingsData || []).map((h: Record<string, unknown>) => {
    const stock = h.stocks as unknown as Record<string, unknown> | null;
    return stock?.symbol as string;
  }).filter(Boolean);

  const { data: prices } = await db
    .from("price_cache")
    .select("symbol, price, change_pct")
    .in("symbol", symbols)
    .gt("price", 0);

  const priceMap = new Map<string, { price: number; change_pct: number }>();
  for (const p of prices || []) {
    priceMap.set(p.symbol, { price: p.price, change_pct: p.change_pct });
  }

  const all: PerformerData[] = (holdingsData || [])
    .map((h: Record<string, unknown>) => {
      const stock = h.stocks as unknown as Record<string, unknown> | null;
      const symbol = (stock?.symbol as string) || "";
      const priceData = priceMap.get(symbol);
      if (!priceData) return null;
      return {
        symbol,
        name: (stock?.name as string) || "",
        price: priceData.price,
        changePct: priceData.change_pct,
        value: priceData.price * (h.shares_held as number),
      };
    })
    .filter((x: PerformerData | null): x is PerformerData => x !== null)
    .sort((a: PerformerData, b: PerformerData) => b.changePct - a.changePct);

  return {
    gainers: all.slice(0, limit),
    losers: all.slice(-limit).reverse(),
  };
}

export async function getPortfolioVsIndex(): Promise<Array<{
  date: string;
  portfolioValue: number;
  niftyValue: number;
  portfolioReturn: number;
  niftyReturn: number;
}>> {
  const db = getDb();

  // Get portfolio snapshots
  const { data: snapshotsData } = await db
    .from("portfolio_snapshots")
    .select("snapshot_date, total_value")
    .order("snapshot_date", { ascending: true });

  if (!snapshotsData || snapshotsData.length === 0) return [];

  // Get index data for NIFTY50
  const dates = snapshotsData.map((s: Record<string, unknown>) => s.snapshot_date as string);
  const { data: indexData } = await db
    .from("index_data")
    .select("date, close_value")
    .eq("index_name", "NIFTY50")
    .in("date", dates);

  const indexMap = new Map<string, number>();
  for (const row of indexData || []) {
    indexMap.set(row.date, row.close_value);
  }

  const snapshots = snapshotsData.map((s: Record<string, unknown>) => ({
    date: s.snapshot_date as string,
    portfolioValue: s.total_value as number,
    niftyValue: indexMap.get(s.snapshot_date as string) || null,
  }));

  const basePortfolio = snapshots[0].portfolioValue;
  const baseNifty = snapshots[0].niftyValue || 1;

  return snapshots.map((s: { date: string; portfolioValue: number; niftyValue: number | null }) => ({
    date: s.date,
    portfolioValue: s.portfolioValue,
    niftyValue: s.niftyValue || 0,
    portfolioReturn: basePortfolio > 0
      ? Math.round(((s.portfolioValue - basePortfolio) / basePortfolio) * 10000) / 100
      : 0,
    niftyReturn: baseNifty > 0 && s.niftyValue
      ? Math.round(((s.niftyValue - baseNifty) / baseNifty) * 10000) / 100
      : 0,
  }));
}

export async function fetchNiftyData(): Promise<number> {
  try {
    const url = "https://query1.finance.yahoo.com/v8/finance/chart/%5ENSEI?interval=1d&range=1y";
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0" },
    });

    if (!res.ok) return 0;

    const data = await res.json();
    const result = data?.chart?.result?.[0];
    if (!result) return 0;

    const timestamps = result.timestamp || [];
    const closes = result.indicators?.quote?.[0]?.close || [];

    const db = getDb();
    let count = 0;

    // Build rows for upsert
    const rows: Array<{ index_name: string; date: string; close_value: number }> = [];
    for (let i = 0; i < timestamps.length; i++) {
      if (closes[i]) {
        const date = new Date(timestamps[i] * 1000).toISOString().split("T")[0];
        rows.push({ index_name: "NIFTY50", date, close_value: closes[i] });
        count++;
      }
    }

    // Upsert in batches
    const batchSize = 100;
    for (let i = 0; i < rows.length; i += batchSize) {
      const batch = rows.slice(i, i + batchSize);
      await db
        .from("index_data")
        .upsert(batch, { onConflict: "index_name,date" });
    }

    return count;
  } catch (error) {
    console.error("[Analytics] Failed to fetch NIFTY data:", error);
    return 0;
  }
}

export async function getFullAnalytics() {
  return {
    sectors: await getSectorBreakdown(),
    concentration: await getConcentrationMetrics(),
    performers: await getTopPerformers(),
    indexComparison: await getPortfolioVsIndex(),
  };
}
