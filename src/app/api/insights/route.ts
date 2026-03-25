import { NextResponse } from "next/server";
import { getCachedInsights } from "@/lib/analytics/insights";

export async function GET() {
  try {
    const insights = await getCachedInsights();
    return NextResponse.json(insights);
  } catch (error) {
    console.error("[API] Insights error:", error);
    return NextResponse.json({ error: "Failed to compute insights" }, { status: 500 });
  }
}
