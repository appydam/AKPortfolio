import { NextRequest, NextResponse } from "next/server";
import { getAggregatedPrices } from "@/lib/prices/aggregator";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const symbolsParam = searchParams.get("symbols");

    if (!symbolsParam) {
      return NextResponse.json({ error: "symbols parameter required" }, { status: 400 });
    }

    const symbols = symbolsParam.split(",").map((s) => s.trim()).filter(Boolean);
    const prices = await getAggregatedPrices(symbols);

    return NextResponse.json({ prices });
  } catch (error) {
    console.error("[API] Prices error:", error);
    return NextResponse.json({ error: "Failed to fetch prices" }, { status: 500 });
  }
}
