import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export async function GET(request: NextRequest) {
  try {
    const db = getDb();
    const { searchParams } = new URL(request.url);
    const unreadOnly = searchParams.get("unread") === "true";

    let alertsQuery = db
      .from("alerts")
      .select("*, stocks(symbol, name)")
      .order("created_at", { ascending: false })
      .limit(50);

    if (unreadOnly) {
      alertsQuery = alertsQuery.eq("is_read", false);
    }

    const { data: alertsData, error } = await alertsQuery;
    if (error) throw error;

    const alerts = (alertsData || []).map((a: Record<string, unknown>) => {
      const stock = a.stocks as unknown as Record<string, unknown> | null;
      const { stocks: _stocks, ...rest } = a;
      return {
        ...rest,
        symbol: stock?.symbol ?? null,
        stock_name: stock?.name ?? null,
      };
    });

    const { count: unreadCount } = await db
      .from("alerts")
      .select("*", { count: "exact", head: true })
      .eq("is_read", false);

    return NextResponse.json({ alerts, unreadCount: unreadCount || 0 });
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
      await db
        .from("alerts")
        .update({ is_read: true })
        .eq("id", body.alertId);
    } else if (body.action === "mark_all_read") {
      await db
        .from("alerts")
        .update({ is_read: true })
        .eq("is_read", false);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[API] Alerts POST error:", error);
    return NextResponse.json({ error: "Failed to update alerts" }, { status: 500 });
  }
}
