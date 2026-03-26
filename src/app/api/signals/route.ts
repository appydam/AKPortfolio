import { NextResponse } from "next/server";
import { analyzePortfolio } from "@/lib/ai/signal-analyst";

export async function GET() {
  try {
    const signals = await analyzePortfolio();
    return NextResponse.json({ signals, generatedAt: new Date().toISOString() });
  } catch (error) {
    console.error("[API] Signals error:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
