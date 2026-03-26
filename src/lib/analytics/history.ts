import { getDb } from "../db";

interface TimelineEvent {
  id: number;
  symbol: string;
  stockName: string;
  eventType: string;
  eventDate: string;
  sharesBefore: number;
  sharesAfter: number;
  priceAtEvent: number | null;
  valueChange: number | null;
  notes: string | null;
}

interface StockPnL {
  symbol: string;
  name: string;
  currentShares: number;
  currentPrice: number;
  currentValue: number;
  avgBuyPrice: number | null;
  totalInvested: number | null;
  unrealizedPnL: number | null;
  unrealizedPnLPct: number | null;
  totalBuyValue: number;
  totalSellValue: number;
  realizedPnL: number;
}

export async function buildPortfolioTimeline(): Promise<void> {
  const db = getDb();
  console.log("[History] Building portfolio timeline from deals...");

  // Clear existing timeline
  await db.from("portfolio_history").delete().neq("id", 0);

  // Get all deals ordered by date, with stock info
  const { data: deals } = await db
    .from("deals")
    .select("*, stocks(symbol, name)")
    .order("deal_date_parsed", { ascending: true, nullsFirst: false })
    .order("id", { ascending: true });

  if (!deals || deals.length === 0) {
    console.log("[History] No deals found");
    return;
  }

  // Track running share count per stock
  const shareCount = new Map<number, number>();
  const rows: Array<Record<string, unknown>> = [];

  for (const deal of deals) {
    const stock = deal.stocks as unknown as Record<string, unknown> | null;
    const before = shareCount.get(deal.stock_id) || 0;
    let after: number;
    let eventType: string;

    if (deal.action === "Buy") {
      after = before + deal.quantity;
      eventType = before === 0 ? "entry" : "add";
    } else {
      after = Math.max(0, before - deal.quantity);
      eventType = after === 0 ? "full_exit" : "partial_exit";
    }

    const notes = `${deal.action} ${deal.quantity.toLocaleString()} shares @ ₹${deal.avg_price}`;

    rows.push({
      stock_id: deal.stock_id,
      event_type: eventType,
      event_date: deal.deal_date,
      shares_before: before,
      shares_after: after,
      price_at_event: deal.avg_price,
      deal_id: deal.id,
      notes,
    });

    shareCount.set(deal.stock_id, after);
  }

  // Insert in batches
  const batchSize = 100;
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    await db.from("portfolio_history").insert(batch);
  }

  console.log(`[History] Built timeline with ${deals.length} events`);
}

export async function getTimeline(options?: {
  symbol?: string;
  eventType?: string;
  limit?: number;
}): Promise<TimelineEvent[]> {
  const db = getDb();
  const limit = options?.limit || 100;

  let query = db
    .from("portfolio_history")
    .select("id, event_type, event_date, shares_before, shares_after, price_at_event, notes, stocks(symbol, name)")
    .order("event_date", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit);

  if (options?.symbol) {
    // Need to filter by symbol through the stocks relation
    // First get the stock_id for this symbol
    const { data: stockRow } = await db
      .from("stocks")
      .select("id")
      .eq("symbol", options.symbol)
      .single();

    if (stockRow) {
      query = query.eq("stock_id", stockRow.id);
    } else {
      return [];
    }
  }

  if (options?.eventType) {
    query = query.eq("event_type", options.eventType);
  }

  const { data } = await query;

  return (data || []).map((row: Record<string, unknown>) => {
    const stock = row.stocks as unknown as Record<string, unknown> | null;
    const sharesBefore = row.shares_before as number;
    const sharesAfter = row.shares_after as number;
    const priceAtEvent = row.price_at_event as number | null;
    const eventType = row.event_type as string;

    let valueChange: number | null = null;
    if (priceAtEvent !== null) {
      if (eventType === "entry" || eventType === "add") {
        valueChange = -(sharesAfter - sharesBefore) * priceAtEvent;
      } else {
        valueChange = (sharesBefore - sharesAfter) * priceAtEvent;
      }
    }

    return {
      id: row.id as number,
      symbol: (stock?.symbol as string) || "",
      stockName: (stock?.name as string) || "",
      eventType,
      eventDate: row.event_date as string,
      sharesBefore,
      sharesAfter,
      priceAtEvent,
      valueChange,
      notes: row.notes as string | null,
    };
  });
}

export async function getStockPnL(): Promise<StockPnL[]> {
  const db = getDb();

  // Get latest quarter
  const { data: latestRow } = await db
    .from("holdings")
    .select("quarter")
    .order("quarter", { ascending: false })
    .limit(1)
    .single();

  if (!latestRow) return [];
  const quarter = latestRow.quarter;

  // Get current holdings with stock info
  const { data: holdingsData } = await db
    .from("holdings")
    .select("stock_id, shares_held, stocks(symbol, name)")
    .eq("quarter", quarter)
    .gt("shares_held", 1);

  if (!holdingsData || holdingsData.length === 0) return [];

  // Get prices for all symbols
  const symbols = (holdingsData || []).map((h: Record<string, unknown>) => {
    const stock = h.stocks as unknown as Record<string, unknown> | null;
    return stock?.symbol as string;
  }).filter(Boolean);

  const { data: pricesData } = await db
    .from("price_cache")
    .select("symbol, price")
    .in("symbol", symbols);

  const priceMap = new Map<string, number>();
  for (const p of pricesData || []) {
    priceMap.set(p.symbol, p.price);
  }

  // Get buy/sell totals from deals
  const stockIds = holdingsData.map((h: Record<string, unknown>) => h.stock_id as number);

  const { data: dealsData } = await db
    .from("deals")
    .select("stock_id, action, quantity, avg_price")
    .in("stock_id", stockIds);

  // Aggregate deal stats in JS
  const buyMap = new Map<number, { value: number; qty: number; avgPrice: number }>();
  const sellMap = new Map<number, { value: number; qty: number }>();

  for (const d of dealsData || []) {
    const dealValue = d.quantity * d.avg_price;
    if (d.action === "Buy") {
      const existing = buyMap.get(d.stock_id) || { value: 0, qty: 0, avgPrice: 0 };
      existing.value += dealValue;
      existing.qty += d.quantity;
      buyMap.set(d.stock_id, existing);
    } else {
      const existing = sellMap.get(d.stock_id) || { value: 0, qty: 0 };
      existing.value += dealValue;
      existing.qty += d.quantity;
      sellMap.set(d.stock_id, existing);
    }
  }

  // Compute avg buy price
  for (const [stockId, buy] of buyMap) {
    buy.avgPrice = buy.qty > 0 ? buy.value / buy.qty : 0;
    buyMap.set(stockId, buy);
  }

  return holdingsData.map((h: Record<string, unknown>) => {
    const stock = h.stocks as unknown as Record<string, unknown> | null;
    const symbol = (stock?.symbol as string) || "";
    const name = (stock?.name as string) || "";
    const stockId = h.stock_id as number;
    const sharesHeld = h.shares_held as number;

    const buy = buyMap.get(stockId);
    const sell = sellMap.get(stockId);
    const currentPrice = priceMap.get(symbol) || 0;
    const currentValue = currentPrice * sharesHeld;
    const totalBuyValue = buy?.value || 0;
    const totalSellValue = sell?.value || 0;
    const avgBuyPrice = buy?.avgPrice || null;
    const totalInvested = totalBuyValue - totalSellValue;
    const unrealizedPnL = totalInvested > 0 ? currentValue - totalInvested : null;
    const unrealizedPnLPct = totalInvested > 0 && unrealizedPnL !== null
      ? Math.round((unrealizedPnL / totalInvested) * 10000) / 100
      : null;

    return {
      symbol,
      name,
      currentShares: sharesHeld,
      currentPrice,
      currentValue,
      avgBuyPrice,
      totalInvested: totalInvested > 0 ? totalInvested : null,
      unrealizedPnL,
      unrealizedPnLPct,
      totalBuyValue,
      totalSellValue,
      realizedPnL: totalSellValue - (sell ? (buy?.avgPrice || 0) * (sell.qty || 0) : 0),
    };
  }).sort((a: StockPnL, b: StockPnL) => b.currentValue - a.currentValue);
}
