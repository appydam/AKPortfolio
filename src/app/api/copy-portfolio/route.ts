import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";

// Copy Portfolio Calculator
// Given an investment amount, compute exactly how many shares of each stock
// to buy to replicate Kacholia's portfolio proportionally.

interface Allocation {
  symbol: string;
  name: string;
  sector: string;
  price: number;
  kacholiaWeight: number; // his % allocation
  convictionScore: number;
  yourShares: number; // shares you should buy
  yourInvestment: number; // ₹ to invest in this stock
  yourWeight: number; // your resulting % allocation
}

export async function GET(request: NextRequest) {
  try {
    const db = getDb();
    const { searchParams } = new URL(request.url);
    const amount = parseFloat(searchParams.get("amount") || "500000");
    const mode = searchParams.get("mode") || "proportional"; // proportional | conviction | equal

    // Get latest holdings
    const { data: latestQ } = await db
      .from("holdings")
      .select("quarter")
      .order("quarter", { ascending: false })
      .limit(1)
      .single();

    if (!latestQ) return NextResponse.json({ error: "No holdings data" }, { status: 400 });

    const { data: holdings } = await db
      .from("holdings")
      .select("stock_id, shares_held, pct_holding, stocks(symbol, name, sector)")
      .eq("quarter", latestQ.quarter);

    if (!holdings || holdings.length === 0) return NextResponse.json({ error: "No holdings" }, { status: 400 });

    // Get prices
    const symbols = holdings.map((h: Record<string, unknown>) => {
      const stock = h.stocks as unknown as Record<string, unknown> | null;
      return stock?.symbol as string;
    }).filter(Boolean);

    const { data: prices } = await db
      .from("price_cache")
      .select("symbol, price")
      .in("symbol", symbols);

    const priceMap = new Map<string, number>();
    for (const p of prices || []) priceMap.set(p.symbol, p.price);

    // Get conviction scores from cache
    const { data: cached } = await db.from("insights_cache").select("payload").eq("id", 1).single();
    const convictionMap = new Map<string, number>();
    if (cached?.payload) {
      try {
        const insights = JSON.parse(cached.payload as string);
        for (const c of insights.conviction || []) convictionMap.set(c.symbol, c.score);
      } catch { /* ignore */ }
    }

    // Compute Kacholia's portfolio weights
    let totalAkValue = 0;
    const holdingsList: Array<{
      symbol: string; name: string; sector: string;
      price: number; akValue: number; akWeight: number;
      conviction: number;
    }> = [];

    for (const h of holdings) {
      const stock = h.stocks as unknown as Record<string, unknown> | null;
      const symbol = (stock?.symbol as string) || "";
      const name = (stock?.name as string) || "";
      const sector = (stock?.sector as string) || "Unknown";
      const price = priceMap.get(symbol) || 0;
      const value = price * (h.shares_held as number);

      if (price === 0) continue; // skip stocks without price data

      totalAkValue += value;
      holdingsList.push({
        symbol, name, sector, price, akValue: value, akWeight: 0,
        conviction: convictionMap.get(symbol) || 0,
      });
    }

    // Calculate weights
    for (const h of holdingsList) {
      h.akWeight = totalAkValue > 0 ? (h.akValue / totalAkValue) * 100 : 0;
    }

    // Sort by weight descending
    holdingsList.sort((a, b) => b.akWeight - a.akWeight);

    // Calculate allocations based on mode
    let allocations: Allocation[] = [];

    if (mode === "conviction") {
      // Weight by conviction score instead of portfolio weight
      const totalConviction = holdingsList.reduce((s, h) => s + h.conviction, 0);
      allocations = holdingsList
        .filter(h => h.conviction > 0)
        .map(h => {
          const weight = totalConviction > 0 ? (h.conviction / totalConviction) * 100 : 0;
          const investment = amount * (weight / 100);
          const shares = Math.floor(investment / h.price);
          return {
            symbol: h.symbol,
            name: h.name,
            sector: h.sector,
            price: h.price,
            kacholiaWeight: Math.round(h.akWeight * 10) / 10,
            convictionScore: h.conviction,
            yourShares: shares,
            yourInvestment: Math.round(shares * h.price),
            yourWeight: Math.round(weight * 10) / 10,
          };
        })
        .filter(a => a.yourShares > 0);
    } else if (mode === "equal") {
      // Equal weight across all stocks
      const perStock = amount / holdingsList.length;
      allocations = holdingsList.map(h => {
        const shares = Math.floor(perStock / h.price);
        return {
          symbol: h.symbol,
          name: h.name,
          sector: h.sector,
          price: h.price,
          kacholiaWeight: Math.round(h.akWeight * 10) / 10,
          convictionScore: h.conviction,
          yourShares: shares,
          yourInvestment: Math.round(shares * h.price),
          yourWeight: Math.round((100 / holdingsList.length) * 10) / 10,
        };
      }).filter(a => a.yourShares > 0);
    } else {
      // Proportional — mirror his exact weights
      allocations = holdingsList.map(h => {
        const investment = amount * (h.akWeight / 100);
        const shares = Math.floor(investment / h.price);
        return {
          symbol: h.symbol,
          name: h.name,
          sector: h.sector,
          price: h.price,
          kacholiaWeight: Math.round(h.akWeight * 10) / 10,
          convictionScore: h.conviction,
          yourShares: shares,
          yourInvestment: Math.round(shares * h.price),
          yourWeight: Math.round(h.akWeight * 10) / 10,
        };
      }).filter(a => a.yourShares > 0);
    }

    const totalInvested = allocations.reduce((s, a) => s + a.yourInvestment, 0);
    const totalStocks = allocations.length;
    const cashRemaining = Math.round(amount - totalInvested);

    // Sector breakdown of your allocation
    const sectorBreakdown: Record<string, number> = {};
    for (const a of allocations) {
      sectorBreakdown[a.sector] = (sectorBreakdown[a.sector] || 0) + a.yourInvestment;
    }
    const sectors = Object.entries(sectorBreakdown)
      .map(([sector, value]) => ({ sector, value, pct: Math.round((value / totalInvested) * 1000) / 10 }))
      .sort((a, b) => b.value - a.value);

    return NextResponse.json({
      inputAmount: amount,
      mode,
      totalInvested,
      cashRemaining,
      totalStocks,
      allocations,
      sectors,
      kacholiaPortfolioValue: Math.round(totalAkValue),
    });
  } catch (error) {
    console.error("[API] Copy portfolio error:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
