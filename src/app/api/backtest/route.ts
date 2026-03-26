import { NextResponse } from "next/server";
import { runBacktest } from "@/lib/analytics/backtester";

export async function GET() {
  try {
    const results = await runBacktest();
    return NextResponse.json(results);
  } catch (error) {
    console.error("[API] Backtest error:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
