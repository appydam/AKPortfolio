import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export async function GET(request: NextRequest) {
  try {
    const db = getDb();
    const { searchParams } = new URL(request.url);
    const unreadOnly = searchParams.get("unread") === "true";

    const whereClause = unreadOnly ? "WHERE a.is_read = 0" : "";

    const alerts = db
      .prepare(`
        SELECT a.*, s.symbol, s.name as stock_name
        FROM alerts a
        JOIN stocks s ON a.stock_id = s.id
        ${whereClause}
        ORDER BY a.created_at DESC
        LIMIT 50
      `)
      .all();

    const unreadCount = db
      .prepare("SELECT COUNT(*) as count FROM alerts WHERE is_read = 0")
      .get() as { count: number };

    return NextResponse.json({ alerts, unreadCount: unreadCount.count });
  } catch (error) {
    console.error("[API] Alerts error:", error);
    return NextResponse.json({ error: "Failed to fetch alerts" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const db = getDb();
    const body = await request.json();

    if (body.action === "mark_read" && body.alertId) {
      db.prepare("UPDATE alerts SET is_read = 1 WHERE id = ?").run(body.alertId);
    } else if (body.action === "mark_all_read") {
      db.prepare("UPDATE alerts SET is_read = 1 WHERE is_read = 0").run();
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[API] Alerts POST error:", error);
    return NextResponse.json({ error: "Failed to update alerts" }, { status: 500 });
  }
}
