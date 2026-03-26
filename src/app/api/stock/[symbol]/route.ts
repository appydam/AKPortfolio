import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { classifyEntity } from "@/lib/entities";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ symbol: string }> }) {
  const { symbol } = await params;
  const db = getDb();

  // 1. Stock info
  const { data: stock } = await db
    .from("stocks")
    .select("*")
    .eq("symbol", symbol.toUpperCase())
    .single();

  if (!stock) {
    return NextResponse.json({ error: "Stock not found" }, { status: 404 });
  }

  // 2. Current holding
  const { data: latestQ } = await db
    .from("holdings")
    .select("quarter")
    .order("quarter", { ascending: false })
    .limit(1)
    .single();

  const { data: holding } = latestQ
    ? await db
        .from("holdings")
        .select("shares_held, pct_holding, quarter")
        .eq("stock_id", stock.id)
        .eq("quarter", latestQ.quarter)
        .single()
    : { data: null };

  // 3. All holdings history (quarterly positions)
  const { data: holdingsHistory } = await db
    .from("holdings")
    .select("quarter, shares_held, pct_holding")
    .eq("stock_id", stock.id)
    .order("quarter", { ascending: true });

  // 4. All deals for this stock
  const { data: deals } = await db
    .from("deals")
    .select("deal_date, exchange, deal_type, action, quantity, avg_price, pct_traded")
    .eq("stock_id", stock.id)
    .order("deal_date", { ascending: false });

  // 5. Current price
  const { data: priceData } = await db
    .from("price_cache")
    .select("price, change_pct, updated_at")
    .eq("symbol", symbol.toUpperCase())
    .single();

  // 6. Entry quality metrics
  const buys = (deals || []).filter((d: Record<string, unknown>) => d.action === "Buy");
  const sells = (deals || []).filter((d: Record<string, unknown>) => d.action === "Sell");

  const totalBuyCost = buys.reduce((s: number, d: Record<string, unknown>) => s + (d.quantity as number) * (d.avg_price as number), 0);
  const totalBuyQty = buys.reduce((s: number, d: Record<string, unknown>) => s + (d.quantity as number), 0);
  const avgEntryPrice = totalBuyQty > 0 ? totalBuyCost / totalBuyQty : 0;

  const totalSellProceeds = sells.reduce((s: number, d: Record<string, unknown>) => s + (d.quantity as number) * (d.avg_price as number), 0);
  const totalSellQty = sells.reduce((s: number, d: Record<string, unknown>) => s + (d.quantity as number), 0);

  const currentPrice = priceData?.price || 0;
  const currentReturn = avgEntryPrice > 0 ? ((currentPrice - avgEntryPrice) / avgEntryPrice) * 100 : 0;
  const currentValue = (holding?.shares_held || 0) * currentPrice;
  const totalInvested = totalBuyCost - totalSellProceeds;
  const unrealizedPnL = currentValue - (totalInvested > 0 ? totalInvested : 0);

  // 7. Deal pattern classification
  let avgDown = 0;
  for (let i = 1; i < buys.length; i++) {
    if ((buys[i].avg_price as number) < (buys[i - 1].avg_price as number) * 0.95) avgDown++;
  }

  const avgBuy = buys.length > 0 ? buys.reduce((s: number, b: Record<string, unknown>) => s + (b.avg_price as number), 0) / buys.length : 0;
  const sellsAboveAvg = sells.filter((s: Record<string, unknown>) => (s.avg_price as number) > avgBuy * 1.05).length;

  let pattern = "mixed";
  if (buys.length === 1 && sells.length === 0) pattern = "one_time_buy";
  else if (buys.length >= 2 && sells.length === 0 && avgDown >= 1) pattern = "averaging_down";
  else if (buys.length >= 3 && sells.length === 0) pattern = "accumulation";
  else if (sells.length >= 3 && buys.length === 0) pattern = "distribution";
  else if (sellsAboveAvg >= 2) pattern = "trimming_into_strength";

  // 8. Holding duration
  const firstBuyDate = buys.length > 0 ? buys[buys.length - 1].deal_date : null; // last in desc = earliest
  const holdingDays = firstBuyDate ? Math.round((Date.now() - new Date(firstBuyDate as string).getTime()) / (1000 * 60 * 60 * 24)) : 0;
  const quartersHeld = (holdingsHistory || []).length;

  // 9. Entity breakdown from deals
  // We don't have client_name in deals table, so skip this for now

  // 10. Conviction score components
  const maxWeight = 10; // approximate
  const weight = holding ? (holding.pct_holding || 0) : 0;
  const positionSize = Math.min(25, (weight / Math.max(maxWeight, 1)) * 25);
  const addOnDeals = Math.min(20, Math.max(0, buys.length - 1) * 4);
  const holdingPeriodScore = Math.min(25, quartersHeld * 1.25);
  const averagedDownScore = Math.min(15, avgDown * 5);
  const recentDeals = (deals || []).filter((d: Record<string, unknown>) => {
    const date = new Date(d.deal_date as string);
    return date > new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
  }).length;
  const dealFrequency = Math.min(15, recentDeals * 5);
  const convictionScore = Math.round(positionSize + addOnDeals + holdingPeriodScore + averagedDownScore + dealFrequency);

  let maturity = "New";
  if (quartersHeld >= 20) maturity = "Veteran";
  else if (quartersHeld >= 12) maturity = "Long-term";
  else if (quartersHeld >= 2) maturity = "Established";

  // Quality grade
  let quality = "Poor";
  if (currentReturn > 50) quality = "Excellent";
  else if (currentReturn > 20) quality = "Good";
  else if (currentReturn > 0) quality = "Average";

  return NextResponse.json({
    stock: {
      ...stock,
      currentPrice,
      changePct: priceData?.change_pct || 0,
      priceUpdatedAt: priceData?.updated_at || null,
    },
    holding: holding ? {
      sharesHeld: holding.shares_held,
      pctHolding: holding.pct_holding,
      quarter: holding.quarter,
      currentValue,
    } : null,
    holdingsHistory: holdingsHistory || [],
    deals: deals || [],
    analysis: {
      avgEntryPrice: Math.round(avgEntryPrice * 100) / 100,
      currentReturn: Math.round(currentReturn * 100) / 100,
      totalBuyCost: Math.round(totalBuyCost),
      totalSellProceeds: Math.round(totalSellProceeds),
      totalInvested: Math.round(totalInvested),
      unrealizedPnL: Math.round(unrealizedPnL),
      holdingDays,
      quartersHeld,
      pattern,
      quality,
      maturity,
      convictionScore,
      convictionBreakdown: {
        positionSize: Math.round(positionSize * 10) / 10,
        addOnDeals: Math.round(addOnDeals * 10) / 10,
        holdingPeriod: Math.round(holdingPeriodScore * 10) / 10,
        averagedDown: Math.round(averagedDownScore * 10) / 10,
        dealFrequency: Math.round(dealFrequency * 10) / 10,
      },
      totalBuys: buys.length,
      totalSells: sells.length,
      firstBuyDate,
    },
  });
}
