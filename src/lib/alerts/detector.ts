import { getDb } from "../db";
import type { Deal } from "@/types";

export function detectNewAlerts(newDeals: Deal[]): number {
  const db = getDb();
  let alertCount = 0;

  const insertAlert = db.prepare(`
    INSERT INTO alerts (stock_id, alert_type, message, deal_id)
    VALUES (?, ?, ?, ?)
  `);

  for (const deal of newDeals) {
    const stock = db
      .prepare("SELECT symbol, name FROM stocks WHERE id = ?")
      .get(deal.stock_id) as { symbol: string; name: string } | undefined;

    if (!stock) continue;

    // Check if this is a new entry (first deal for this stock)
    const dealCount = db
      .prepare("SELECT COUNT(*) as count FROM deals WHERE stock_id = ?")
      .get(deal.stock_id) as { count: number };

    let alertType: string;
    let message: string;

    if (deal.action === "Buy" && dealCount.count === 1) {
      alertType = "NEW_ENTRY";
      message = `New portfolio entry: ${stock.name} (${stock.symbol}) — Bought ${deal.quantity.toLocaleString()} shares at ₹${deal.avg_price}`;
    } else if (deal.action === "Buy") {
      alertType = "NEW_BUY";
      message = `${stock.name} (${stock.symbol}) — Bought ${deal.quantity.toLocaleString()} shares at ₹${deal.avg_price}`;
    } else {
      // Check if this might be a full exit
      const holding = db
        .prepare("SELECT shares_held FROM holdings WHERE stock_id = ? ORDER BY quarter DESC LIMIT 1")
        .get(deal.stock_id) as { shares_held: number } | undefined;

      if (holding && deal.quantity >= holding.shares_held) {
        alertType = "EXIT";
        message = `Portfolio exit: ${stock.name} (${stock.symbol}) — Sold ${deal.quantity.toLocaleString()} shares at ₹${deal.avg_price}`;
      } else {
        alertType = "NEW_SELL";
        message = `${stock.name} (${stock.symbol}) — Sold ${deal.quantity.toLocaleString()} shares at ₹${deal.avg_price}`;
      }
    }

    insertAlert.run(deal.stock_id, alertType, message, deal.id);
    alertCount++;
  }

  console.log(`[Alerts] Generated ${alertCount} new alerts`);
  return alertCount;
}

export function getUnreadAlerts() {
  const db = getDb();
  return db
    .prepare(`
      SELECT a.*, s.symbol, s.name as stock_name
      FROM alerts a
      JOIN stocks s ON a.stock_id = s.id
      WHERE a.is_read = 0
      ORDER BY a.created_at DESC
      LIMIT 50
    `)
    .all();
}

export function markAlertRead(alertId: number) {
  const db = getDb();
  db.prepare("UPDATE alerts SET is_read = 1 WHERE id = ?").run(alertId);
}

export function markAllAlertsRead() {
  const db = getDb();
  db.prepare("UPDATE alerts SET is_read = 1 WHERE is_read = 0").run();
}
