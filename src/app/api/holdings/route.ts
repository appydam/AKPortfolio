import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getAggregatedPrices } from "@/lib/prices/aggregator";

export async function GET() {
  try {
    const db = getDb();

    const { data: latestQuarterRow } = await db
      .from("holdings")
      .select("quarter")
      .order("quarter", { ascending: false })
      .limit(1)
      .single();

    if (!latestQuarterRow) {
      return NextResponse.json({ holdings: [], totalValue: 0, quarter: null });
    }

    const quarter = latestQuarterRow.quarter;

    // Fetch holdings for the latest quarter
    const { data: holdingsData, error: holdingsError } = await db
      .from("holdings")
      .select("*, stocks(symbol, name, sector, pe_ratio, market_cap, roe, roce)")
      .eq("quarter", quarter)
      .order("pct_holding", { ascending: false });

    if (holdingsError) throw holdingsError;

    const holdings = (holdingsData || []).map((h: Record<string, unknown>) => {
      const stock = h.stocks as unknown as Record<string, unknown> | null;
      return {
        id: h.id,
        stock_id: h.stock_id,
        quarter: h.quarter,
        shares_held: h.shares_held,
        pct_holding: h.pct_holding,
        symbol: stock?.symbol ?? null,
        stock_name: stock?.name ?? null,
        sector: stock?.sector ?? null,
        pe_ratio: stock?.pe_ratio ?? null,
        market_cap: stock?.market_cap ?? null,
        roe: stock?.roe ?? null,
        roce: stock?.roce ?? null,
      };
    });

    // Use multi-source aggregated prices
    const symbols = holdings.map((h: Record<string, unknown>) => h.symbol as string).filter(Boolean);
    const prices = await getAggregatedPrices(symbols);

    let totalValue = 0;
    const enriched = holdings.map((h: Record<string, unknown>) => {
      const priceData = prices[h.symbol as string];
      const currentPrice = priceData?.price || 0;
      const changePct = priceData?.change_pct || 0;
      const marketValue = currentPrice * (h.shares_held as number);
      totalValue += marketValue;

      return {
        ...h,
        current_price: currentPrice,
        change_pct: changePct,
        market_value: marketValue,
      };
    });

    return NextResponse.json({
      holdings: enriched,
      totalValue,
      quarter,
    });
  } catch (error) {
    console.error("[API] Holdings error:", error);
    return NextResponse.json({ error: "Failed to fetch holdings" }, { status: 500 });
  }
}
