import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export async function GET() {
  try {
    const db = getDb();

    const snapshots = db
      .prepare(`
        SELECT snapshot_date, total_value, num_holdings
        FROM portfolio_snapshots
        ORDER BY snapshot_date ASC
      `)
      .all();

    return NextResponse.json({ snapshots });
  } catch (error) {
    console.error("[API] Portfolio history error:", error);
    return NextResponse.json({ error: "Failed to fetch portfolio history" }, { status: 500 });
  }
}
