import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { scrapeAllInvestors } from "@/lib/scrapers/bigbulls";
import { compareWithAllBulls } from "@/lib/analytics/user-comparison";
import myHoldingsData from "@/data/my-holdings.json";

// Cache bull holdings in memory (refreshed every hour)
let cachedBullHoldings: Awaited<ReturnType<typeof scrapeAllInvestors>> | null = null;
let cacheTimestamp = 0;
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

async function getBullHoldings() {
  const now = Date.now();
  if (cachedBullHoldings && now - cacheTimestamp < CACHE_TTL) {
    return cachedBullHoldings;
  }

  console.log("[Comparison] Fetching all Big Bull holdings...");
  cachedBullHoldings = await scrapeAllInvestors();
  cacheTimestamp = now;
  return cachedBullHoldings;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const portfolioId = searchParams.get("id");

    // Load user holdings
    let userHoldings: { symbol: string; quantity: number; avgPrice: number }[];

    if (portfolioId) {
      const db = getDb();
      const { data, error } = await db
        .from("user_portfolios")
        .select("holdings")
        .eq("id", portfolioId)
        .single();

      if (error || !data) {
        return NextResponse.json({ error: "Portfolio not found" }, { status: 404 });
      }

      const holdings = typeof data.holdings === "string" ? JSON.parse(data.holdings) : data.holdings;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      userHoldings = holdings.map((h: any) => ({
        symbol: h.symbol,
        quantity: h.quantity || 0,
        avgPrice: h.avgPrice ?? h.average_price ?? 0,
      }));
    } else {
      // Fall back to static JSON
      userHoldings = myHoldingsData.holdings.map((h) => ({
        symbol: h.symbol,
        quantity: h.quantity,
        avgPrice: h.average_price,
      }));
    }

    // Get all Big Bull holdings
    const bullHoldings = await getBullHoldings();

    // Run comparison
    const result = compareWithAllBulls(userHoldings, bullHoldings);

    return NextResponse.json(result);
  } catch (error) {
    console.error("[Comparison] Error:", error);
    return NextResponse.json(
      { error: "Failed to compute comparison" },
      { status: 500 }
    );
  }
}
