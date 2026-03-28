import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { holdings, mutualFunds, name, id } = body;

    if (!holdings || !Array.isArray(holdings) || holdings.length === 0) {
      return NextResponse.json({ error: "No holdings provided" }, { status: 400 });
    }

    // Validate each holding has required fields
    for (const h of holdings) {
      if (!h.symbol || !h.quantity || h.quantity <= 0) {
        return NextResponse.json(
          { error: `Invalid holding: ${h.symbol || "unknown"} — symbol and positive quantity required` },
          { status: 400 }
        );
      }
    }

    const db = getDb();

    // If ID provided, update existing portfolio
    if (id) {
      const { data, error } = await db
        .from("user_portfolios")
        .update({
          holdings: JSON.stringify(holdings),
          mutual_funds: JSON.stringify(mutualFunds || []),
          name: name || "My Portfolio",
          updated_at: new Date().toISOString(),
        })
        .eq("id", id)
        .select("id")
        .single();

      if (error || !data) {
        return NextResponse.json({ error: "Portfolio not found" }, { status: 404 });
      }

      return NextResponse.json({ id: data.id, updated: true });
    }

    // Create new portfolio
    const { data, error } = await db
      .from("user_portfolios")
      .insert({
        holdings: JSON.stringify(holdings),
        mutual_funds: JSON.stringify(mutualFunds || []),
        name: name || "My Portfolio",
      })
      .select("id")
      .single();

    if (error) {
      console.error("[Upload] Insert error:", error);
      return NextResponse.json({ error: "Failed to save portfolio" }, { status: 500 });
    }

    return NextResponse.json({ id: data.id, created: true });
  } catch (error) {
    console.error("[Upload] Error:", error);
    return NextResponse.json({ error: "Failed to process upload" }, { status: 500 });
  }
}

// Delete a portfolio
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "Portfolio ID required" }, { status: 400 });
    }

    const db = getDb();
    await db.from("user_portfolios").delete().eq("id", id);

    return NextResponse.json({ deleted: true });
  } catch (error) {
    console.error("[Upload] Delete error:", error);
    return NextResponse.json({ error: "Failed to delete" }, { status: 500 });
  }
}
