import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export async function GET() {
  try {
    const db = getDb();

    const { data: snapshots, error } = await db
      .from("portfolio_snapshots")
      .select("snapshot_date, total_value, num_holdings")
      .order("snapshot_date", { ascending: true });

    if (error) throw error;

    return NextResponse.json({ snapshots: snapshots || [] });
  } catch (error) {
    console.error("[API] Portfolio history error:", error);
    return NextResponse.json({ error: "Failed to fetch portfolio history" }, { status: 500 });
  }
}
