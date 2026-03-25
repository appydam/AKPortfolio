import { getDb } from "../db";
import type { Deal } from "@/types";

export async function detectNewAlerts(newDeals: Deal[]): Promise<number> {
  const db = getDb();
  let alertCount = 0;

  for (const deal of newDeals) {
    const { data: stock } = await db
      .from("stocks")
      .select("symbol, name")
      .eq("id", deal.stock_id)
      .single();

    if (!stock) continue;

    // Check if this is a new entry (first deal for this stock)
    const { count: dealCount } = await db
      .from("deals")
      .select("*", { count: "exact", head: true })
      .eq("stock_id", deal.stock_id);

    let alertType: string;
    let message: string;

    if (deal.action === "Buy" && (dealCount || 0) === 1) {
      alertType = "NEW_ENTRY";
      message = `New portfolio entry: ${stock.name} (${stock.symbol}) — Bought ${deal.quantity.toLocaleString()} shares at ₹${deal.avg_price}`;
    } else if (deal.action === "Buy") {
      alertType = "NEW_BUY";
      message = `${stock.name} (${stock.symbol}) — Bought ${deal.quantity.toLocaleString()} shares at ₹${deal.avg_price}`;
    } else {
      // Check if this might be a full exit
      const { data: holding } = await db
        .from("holdings")
        .select("shares_held")
        .eq("stock_id", deal.stock_id)
        .order("quarter", { ascending: false })
        .limit(1)
        .single();

      if (holding && deal.quantity >= holding.shares_held) {
        alertType = "EXIT";
        message = `Portfolio exit: ${stock.name} (${stock.symbol}) — Sold ${deal.quantity.toLocaleString()} shares at ₹${deal.avg_price}`;
      } else {
        alertType = "NEW_SELL";
        message = `${stock.name} (${stock.symbol}) — Sold ${deal.quantity.toLocaleString()} shares at ₹${deal.avg_price}`;
      }
    }

    await db
      .from("alerts")
      .insert({
        stock_id: deal.stock_id,
        alert_type: alertType,
        message,
        deal_id: deal.id,
      });

    alertCount++;
  }

  console.log(`[Alerts] Generated ${alertCount} new alerts`);
  return alertCount;
}

export async function getUnreadAlerts() {
  const db = getDb();

  const { data: alertsData } = await db
    .from("alerts")
    .select("*, stocks(symbol, name)")
    .eq("is_read", false)
    .order("created_at", { ascending: false })
    .limit(50);

  return (alertsData || []).map((a: Record<string, unknown>) => {
    const stock = a.stocks as unknown as Record<string, unknown> | null;
    const { stocks: _stocks, ...rest } = a;
    return {
      ...rest,
      symbol: stock?.symbol ?? null,
      stock_name: stock?.name ?? null,
    };
  });
}

export async function markAlertRead(alertId: number) {
  const db = getDb();
  await db.from("alerts").update({ is_read: true }).eq("id", alertId);
}

export async function markAllAlertsRead() {
  const db = getDb();
  await db.from("alerts").update({ is_read: true }).eq("is_read", false);
}
