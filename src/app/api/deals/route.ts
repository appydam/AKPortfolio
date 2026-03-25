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

    // Count total
    let countQuery = db
      .from("deals")
      .select("*", { count: "exact", head: true });

    if (action) {
      countQuery = countQuery.eq("action", action);
    }

    const { count: total } = await countQuery;

    // Fetch deals with stock info
    let dealsQuery = db
      .from("deals")
      .select("*, stocks(symbol, name)")
      .order("deal_date", { ascending: false })
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (action) {
      dealsQuery = dealsQuery.eq("action", action);
    }

    const { data: dealsData, error } = await dealsQuery;
    if (error) throw error;

    const deals = (dealsData || []).map((d: Record<string, unknown>) => {
      const stock = d.stocks as unknown as Record<string, unknown> | null;
      const { stocks: _stocks, ...rest } = d;
      return {
        ...rest,
        symbol: stock?.symbol ?? null,
        stock_name: stock?.name ?? null,
      };
    });

    const totalCount = total || 0;

    return NextResponse.json({
      deals,
      total: totalCount,
      page,
      totalPages: Math.ceil(totalCount / limit),
    });
  } catch (error) {
    console.error("[API] Deals error:", error);
    return NextResponse.json({ error: "Failed to fetch deals" }, { status: 500 });
  }
}
