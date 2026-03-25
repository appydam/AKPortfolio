import { NextResponse } from "next/server";
import { getAllSourceHealth, getOverallStatus } from "@/lib/health/monitor";

export async function GET() {
  try {
    const sources = getAllSourceHealth();
    const overall = getOverallStatus();

    return NextResponse.json({
      overall,
      sources,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[API] Health error:", error);
    return NextResponse.json({ error: "Failed to fetch health" }, { status: 500 });
  }
}
