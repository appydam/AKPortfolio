import { NextResponse } from "next/server";
import { getFullAnalytics } from "@/lib/analytics/portfolio";

export async function GET() {
  try {
    const analytics = await getFullAnalytics();
    return NextResponse.json(analytics);
  } catch (error) {
    console.error("[API] Analytics error:", error);
    return NextResponse.json({ error: "Failed to fetch analytics" }, { status: 500 });
  }
}
