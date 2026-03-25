import { NextRequest, NextResponse } from "next/server";
import { getTimeline, getStockPnL, buildPortfolioTimeline } from "@/lib/analytics/history";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const symbol = searchParams.get("symbol") || undefined;
    const eventType = searchParams.get("eventType") || undefined;
    const view = searchParams.get("view") || "timeline";

    if (view === "pnl") {
      const pnl = await getStockPnL();
      return NextResponse.json({ pnl });
    }

    const timeline = await getTimeline({ symbol, eventType, limit: 200 });
    return NextResponse.json({ timeline });
  } catch (error) {
    console.error("[API] Timeline error:", error);
    return NextResponse.json({ error: "Failed to fetch timeline" }, { status: 500 });
  }
}

export async function POST() {
  try {
    await buildPortfolioTimeline();
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[API] Timeline build error:", error);
    return NextResponse.json({ error: "Failed to build timeline" }, { status: 500 });
  }
}
