import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export async function GET(request: NextRequest) {
  try {
    const db = getDb();
    const { searchParams } = new URL(request.url);

    const page = parseInt(searchParams.get("page") || "1");
    const limit = Math.min(parseInt(searchParams.get("limit") || "20"), 100);
    const action = searchParams.get("action");
    const offset = (page - 1) * limit;

    let whereClause = "";
    const params: (string | number)[] = [];

    if (action) {
      whereClause = "WHERE d.action = ?";
      params.push(action);
    }

    const total = db
      .prepare(`SELECT COUNT(*) as count FROM deals d ${whereClause}`)
      .get(...params) as { count: number };

    params.push(limit, offset);

    const deals = db
      .prepare(`
        SELECT d.*, s.symbol, s.name as stock_name
        FROM deals d
        JOIN stocks s ON d.stock_id = s.id
        ${whereClause}
        ORDER BY d.deal_date DESC, d.created_at DESC
        LIMIT ? OFFSET ?
      `)
      .all(...params);

    return NextResponse.json({
      deals,
      total: total.count,
      page,
      totalPages: Math.ceil(total.count / limit),
    });
  } catch (error) {
    console.error("[API] Deals error:", error);
    return NextResponse.json({ error: "Failed to fetch deals" }, { status: 500 });
  }
}
