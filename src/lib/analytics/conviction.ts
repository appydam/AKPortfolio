import { getDb } from "../db";
import type { ConvictionScore, EntryQualityAnalysis, DealPattern } from "@/types";

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

export async function getConvictionScores(): Promise<ConvictionScore[]> {
  const db = getDb();
  const quarter = await getLatestQuarter();
  if (!quarter) return [];

  // 1. Get current holdings with stock info
  const { data: holdingsData } = await db
    .from("holdings")
    .select("stock_id, shares_held, pct_holding, stocks(symbol, name)")
    .eq("quarter", quarter);

  if (!holdingsData || holdingsData.length === 0) return [];

  // 2. Get ALL holdings (all quarters) to compute holding duration per stock
  const { data: allHoldings } = await db
    .from("holdings")
    .select("stock_id, quarter")
    .order("quarter", { ascending: true });

  // 3. Get all deals grouped by stock
  const stockIds = holdingsData.map((h: Record<string, unknown>) => h.stock_id as number);
  const { data: dealsData } = await db
    .from("deals")
    .select("stock_id, action, avg_price, deal_date")
    .in("stock_id", stockIds)
    .order("deal_date", { ascending: true });

  // 4. Get prices for position weight
  const symbols = holdingsData.map((h: Record<string, unknown>) => {
    const stock = h.stocks as unknown as Record<string, unknown> | null;
    return stock?.symbol as string;
  }).filter(Boolean);

  const { data: prices } = await db
    .from("price_cache")
    .select("symbol, price")
    .in("symbol", symbols);

  const priceMap = new Map<string, number>();
  for (const p of prices || []) priceMap.set(p.symbol, p.price);

  // Compute total portfolio value
  let totalValue = 0;
  const holdingValues = new Map<number, number>();
  for (const h of holdingsData) {
    const stock = h.stocks as unknown as Record<string, unknown> | null;
    const sym = (stock?.symbol as string) || "";
    const price = priceMap.get(sym) || 0;
    const val = price * (h.shares_held as number);
    totalValue += val;
    holdingValues.set(h.stock_id as number, val);
  }

  // Quarters per stock
  const quartersPerStock = new Map<number, Set<string>>();
  for (const h of allHoldings || []) {
    const id = h.stock_id as number;
    if (!quartersPerStock.has(id)) quartersPerStock.set(id, new Set());
    quartersPerStock.get(id)!.add(h.quarter as string);
  }

  // Deals per stock
  const dealsPerStock = new Map<number, Array<{ action: string; avg_price: number; deal_date: string }>>();
  for (const d of dealsData || []) {
    const id = d.stock_id as number;
    if (!dealsPerStock.has(id)) dealsPerStock.set(id, []);
    dealsPerStock.get(id)!.push({ action: d.action, avg_price: d.avg_price, deal_date: d.deal_date });
  }

  // Max weight for normalization
  const maxWeight = totalValue > 0
    ? Math.max(...Array.from(holdingValues.values()).map(v => (v / totalValue) * 100))
    : 1;

  const now = new Date();
  const currentQ = `${now.getFullYear()}-Q${Math.ceil((now.getMonth() + 1) / 3)}`;

  // Recent quarter boundary (4 quarters back)
  const qNum = parseInt(currentQ.split("-Q")[1]);
  const qYear = parseInt(currentQ.split("-Q")[0]);
  const recentBoundary = new Date(qYear, (qNum - 1) * 3 - 12, 1);

  const results: ConvictionScore[] = [];

  for (const h of holdingsData) {
    const stock = h.stocks as unknown as Record<string, unknown> | null;
    const stockId = h.stock_id as number;
    const symbol = (stock?.symbol as string) || "";
    const name = (stock?.name as string) || "";
    const value = holdingValues.get(stockId) || 0;
    const weight = totalValue > 0 ? (value / totalValue) * 100 : 0;

    const quarters = quartersPerStock.get(stockId) || new Set();
    const quartersHeld = quarters.size;
    const firstQ = [...quarters].sort()[0] || currentQ;

    const deals = dealsPerStock.get(stockId) || [];
    const buys = deals.filter(d => d.action === "Buy");

    // Position size score (0-25)
    const positionSize = maxWeight > 0 ? Math.min(25, (weight / maxWeight) * 25) : 0;

    // Add-on deals (0-20): buys after the first one
    const addOnCount = Math.max(0, buys.length - 1);
    const addOnDeals = Math.min(20, addOnCount * 4);

    // Holding period (0-25)
    const holdingPeriod = Math.min(25, quartersHeld * 1.25);

    // Averaged down (0-15): each time a buy was at lower price than previous
    let avgDownCount = 0;
    for (let i = 1; i < buys.length; i++) {
      if (buys[i].avg_price < buys[i - 1].avg_price * 0.95) {
        avgDownCount++;
      }
    }
    const averagedDown = Math.min(15, avgDownCount * 5);

    // Deal frequency (0-15): deals in last ~1 year
    const recentDeals = deals.filter(d => new Date(d.deal_date) > recentBoundary).length;
    const dealFrequency = Math.min(15, recentDeals * 5);

    const score = Math.round(positionSize + addOnDeals + holdingPeriod + averagedDown + dealFrequency);

    let maturity: ConvictionScore["maturity"];
    if (quartersHeld < 2) maturity = "New";
    else if (quartersHeld < 12) maturity = "Established";
    else if (quartersHeld < 20) maturity = "Long-term";
    else maturity = "Veteran";

    results.push({
      stockId,
      symbol,
      name,
      score,
      breakdown: {
        positionSize: Math.round(positionSize * 10) / 10,
        addOnDeals: Math.round(addOnDeals * 10) / 10,
        holdingPeriod: Math.round(holdingPeriod * 10) / 10,
        averagedDown: Math.round(averagedDown * 10) / 10,
        dealFrequency: Math.round(dealFrequency * 10) / 10,
      },
      maturity,
      firstSeenQuarter: firstQ,
      quartersHeld,
      currentWeight: Math.round(weight * 10) / 10,
    });
  }

  return results.sort((a, b) => b.score - a.score);
}

export async function getDealPatterns(): Promise<DealPattern[]> {
  const db = getDb();

  const { data: dealsData } = await db
    .from("deals")
    .select("stock_id, action, avg_price, deal_date, stocks(symbol, name)")
    .order("deal_date", { ascending: true });

  if (!dealsData || dealsData.length === 0) return [];

  // Group by stock
  const grouped = new Map<number, { symbol: string; name: string; deals: Array<{ action: string; price: number; date: string }> }>();
  for (const d of dealsData) {
    const stock = d.stocks as unknown as Record<string, unknown> | null;
    const id = d.stock_id as number;
    if (!grouped.has(id)) {
      grouped.set(id, {
        symbol: (stock?.symbol as string) || "",
        name: (stock?.name as string) || "",
        deals: [],
      });
    }
    grouped.get(id)!.deals.push({
      action: d.action as string,
      price: d.avg_price as number,
      date: d.deal_date as string,
    });
  }

  const results: DealPattern[] = [];

  for (const [stockId, info] of grouped) {
    const buys = info.deals.filter(d => d.action === "Buy");
    const sells = info.deals.filter(d => d.action === "Sell");

    let pattern: DealPattern["pattern"];
    let description: string;

    if (buys.length === 1 && sells.length === 0) {
      pattern = "one_time_buy";
      description = `Single buy at ${buys[0].price.toFixed(0)}`;
    } else if (buys.length >= 2 && sells.length === 0) {
      // Check if averaging down: successive buys at lower prices
      let avgDown = 0;
      for (let i = 1; i < buys.length; i++) {
        if (buys[i].price < buys[i - 1].price * 0.95) avgDown++;
      }
      if (avgDown >= 1) {
        pattern = "averaging_down";
        description = `${buys.length} buys, averaged down ${avgDown} times`;
      } else {
        // Check unique months
        const months = new Set(buys.map(b => b.date.substring(0, 7)));
        if (months.size >= 3) {
          pattern = "accumulation";
          description = `Steady accumulation: ${buys.length} buys over ${months.size} months`;
        } else {
          pattern = "mixed";
          description = `${buys.length} buys over ${months.size} month(s)`;
        }
      }
    } else if (sells.length >= 2 && buys.length === 0) {
      const months = new Set(sells.map(s => s.date.substring(0, 7)));
      if (months.size >= 3) {
        pattern = "distribution";
        description = `Distribution: ${sells.length} sells over ${months.size} months`;
      } else {
        pattern = "mixed";
        description = `${sells.length} sells`;
      }
    } else if (sells.length >= 2 && buys.length >= 1) {
      // Check if trimming into strength
      const avgBuy = buys.reduce((s, b) => s + b.price, 0) / buys.length;
      const sellsAboveAvg = sells.filter(s => s.price > avgBuy * 1.05).length;
      if (sellsAboveAvg >= 2) {
        pattern = "trimming_into_strength";
        description = `Trimming: ${sellsAboveAvg} sells above avg buy price of ${avgBuy.toFixed(0)}`;
      } else {
        pattern = "mixed";
        description = `${buys.length} buys, ${sells.length} sells`;
      }
    } else {
      pattern = "mixed";
      description = `${buys.length} buys, ${sells.length} sells`;
    }

    results.push({
      stockId,
      symbol: info.symbol,
      name: info.name,
      pattern,
      dealCount: info.deals.length,
      description,
    });
  }

  return results.sort((a, b) => b.dealCount - a.dealCount);
}

export async function getEntryQualityAnalysis(): Promise<EntryQualityAnalysis[]> {
  const db = getDb();
  const quarter = await getLatestQuarter();
  if (!quarter) return [];

  // Current holdings
  const { data: holdingsData } = await db
    .from("holdings")
    .select("stock_id, stocks(symbol, name)")
    .eq("quarter", quarter);

  if (!holdingsData || holdingsData.length === 0) return [];

  const stockIds = holdingsData.map((h: Record<string, unknown>) => h.stock_id as number);

  // All buy deals per stock
  const { data: buyDeals } = await db
    .from("deals")
    .select("stock_id, quantity, avg_price, deal_date")
    .in("stock_id", stockIds)
    .eq("action", "Buy")
    .order("deal_date", { ascending: true });

  // Current prices
  const symbols = holdingsData.map((h: Record<string, unknown>) => {
    const stock = h.stocks as unknown as Record<string, unknown> | null;
    return stock?.symbol as string;
  }).filter(Boolean);

  const { data: prices } = await db
    .from("price_cache")
    .select("symbol, price")
    .in("symbol", symbols);

  const priceMap = new Map<string, number>();
  for (const p of prices || []) priceMap.set(p.symbol, p.price);

  // Snapshots for drawdown tracking
  const { data: snapshots } = await db
    .from("portfolio_snapshots")
    .select("snapshot_date, details_json")
    .order("snapshot_date", { ascending: true });

  // Build per-stock price history from snapshots
  const priceHistory = new Map<string, Array<{ date: string; price: number }>>();
  for (const s of snapshots || []) {
    if (!s.details_json) continue;
    try {
      const details = JSON.parse(s.details_json as string);
      for (const [sym, data] of Object.entries(details)) {
        const d = data as { price?: number };
        if (d.price && d.price > 0) {
          if (!priceHistory.has(sym)) priceHistory.set(sym, []);
          priceHistory.get(sym)!.push({ date: s.snapshot_date as string, price: d.price });
        }
      }
    } catch { /* ignore */ }
  }

  // Buys per stock
  const buysPerStock = new Map<number, Array<{ quantity: number; avg_price: number; deal_date: string }>>();
  for (const d of buyDeals || []) {
    const id = d.stock_id as number;
    if (!buysPerStock.has(id)) buysPerStock.set(id, []);
    buysPerStock.get(id)!.push({ quantity: d.quantity, avg_price: d.avg_price, deal_date: d.deal_date });
  }

  const results: EntryQualityAnalysis[] = [];

  for (const h of holdingsData) {
    const stock = h.stocks as unknown as Record<string, unknown> | null;
    const stockId = h.stock_id as number;
    const symbol = (stock?.symbol as string) || "";
    const name = (stock?.name as string) || "";
    const currentPrice = priceMap.get(symbol) || 0;
    const buys = buysPerStock.get(stockId) || [];

    if (buys.length === 0 || currentPrice === 0) continue;

    // Weighted avg entry price
    const totalCost = buys.reduce((s, b) => s + b.quantity * b.avg_price, 0);
    const totalQty = buys.reduce((s, b) => s + b.quantity, 0);
    const avgEntryPrice = totalQty > 0 ? totalCost / totalQty : 0;

    if (avgEntryPrice === 0) continue;

    const currentReturn = ((currentPrice - avgEntryPrice) / avgEntryPrice) * 100;

    // Max drawdown from entry: find lowest price after first buy
    const firstBuyDate = buys[0].deal_date;
    const history = priceHistory.get(symbol) || [];
    const afterEntry = history.filter(p => p.date >= firstBuyDate);
    let minPriceAfterEntry = currentPrice;
    for (const p of afterEntry) {
      if (p.price < minPriceAfterEntry) minPriceAfterEntry = p.price;
    }
    const maxDrawdownFromEntry = ((minPriceAfterEntry - avgEntryPrice) / avgEntryPrice) * 100;

    // Holding days
    const entryDate = new Date(firstBuyDate);
    const holdingDays = Math.round((Date.now() - entryDate.getTime()) / (1000 * 60 * 60 * 24));

    // Quality grade
    let quality: EntryQualityAnalysis["quality"];
    if (currentReturn > 50) quality = "Excellent";
    else if (currentReturn > 20) quality = "Good";
    else if (currentReturn > 0) quality = "Average";
    else quality = "Poor";

    results.push({
      stockId,
      symbol,
      name,
      avgEntryPrice: Math.round(avgEntryPrice * 100) / 100,
      currentPrice,
      currentReturn: Math.round(currentReturn * 100) / 100,
      maxDrawdownFromEntry: Math.round(maxDrawdownFromEntry * 100) / 100,
      quality,
      holdingDays,
    });
  }

  return results.sort((a, b) => b.currentReturn - a.currentReturn);
}
