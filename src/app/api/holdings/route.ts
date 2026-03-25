import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getAggregatedPrices } from "@/lib/prices/aggregator";

export async function GET() {
  try {
    const db = getDb();

    const latestQuarter = db
      .prepare("SELECT quarter FROM holdings ORDER BY quarter DESC LIMIT 1")
      .get() as { quarter: string } | undefined;

    if (!latestQuarter) {
      return NextResponse.json({ holdings: [], totalValue: 0, quarter: null });
    }

    const holdings = db
      .prepare(`
        SELECT h.*, s.symbol, s.name as stock_name, s.sector, s.pe_ratio, s.market_cap, s.roe, s.roce
        FROM holdings h
        JOIN stocks s ON h.stock_id = s.id
        WHERE h.quarter = ?
        ORDER BY h.pct_holding DESC
      `)
      .all(latestQuarter.quarter) as Array<{
        id: number;
        stock_id: number;
        quarter: string;
        shares_held: number;
        pct_holding: number;
        symbol: string;
        stock_name: string;
        sector: string | null;
        pe_ratio: number | null;
        market_cap: number | null;
        roe: number | null;
        roce: number | null;
      }>;

    // Use multi-source aggregated prices
    const symbols = holdings.map((h) => h.symbol);
    const prices = await getAggregatedPrices(symbols);

    let totalValue = 0;
    const enriched = holdings.map((h) => {
      const priceData = prices[h.symbol];
      const currentPrice = priceData?.price || 0;
      const changePct = priceData?.change_pct || 0;
      const marketValue = currentPrice * h.shares_held;
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
      quarter: latestQuarter.quarter,
    });
  } catch (error) {
    console.error("[API] Holdings error:", error);
    return NextResponse.json({ error: "Failed to fetch holdings" }, { status: 500 });
  }
}
