import { getDb } from "../db";
import { getDailyEstimate } from "../analytics/daily-estimator";
import { detectVolumeAnomalies } from "../analytics/volume-anomaly";
import { queueNotification, processNotificationQueue } from "./telegram";

// Daily Digest — sent at 6:30 PM IST via Telegram
// Summarizes the entire day: portfolio value, top movers, new deals, anomalies

export async function sendDailyDigest(): Promise<void> {
  console.log("[Digest] Building daily digest...");
  const db = getDb();

  // 1. Portfolio estimate
  const estimate = await getDailyEstimate();

  // 2. Today's new deals (from alerts created today)
  const today = new Date().toISOString().split("T")[0];
  const { data: todayAlerts } = await db
    .from("alerts")
    .select("alert_type, message")
    .gte("created_at", `${today}T00:00:00`)
    .order("created_at", { ascending: false })
    .limit(10);

  // 3. Volume anomalies (already computed by cron, but let's get cached result)
  // We'll just report count from today's alerts
  const newDeals = (todayAlerts || []).filter((a: Record<string, unknown>) =>
    ["NEW_BUY", "NEW_SELL", "NEW_ENTRY", "EXIT", "TODAY_BUY", "TODAY_SELL"].includes(a.alert_type as string)
  );

  // 4. Get yesterday's snapshot for comparison
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split("T")[0];
  const { data: yesterdaySnap } = await db
    .from("portfolio_snapshots")
    .select("total_value")
    .eq("snapshot_date", yesterday)
    .single();

  const yesterdayValue = yesterdaySnap?.total_value || 0;
  const dayChange = yesterdayValue > 0 ? estimate.estimatedValue - yesterdayValue : 0;
  const dayChangePct = yesterdayValue > 0 ? ((dayChange) / yesterdayValue) * 100 : 0;

  // Build the digest message
  const lines: string[] = [];
  lines.push("📊 <b>DAILY DIGEST — Ashish Kacholia Portfolio</b>");
  lines.push(`📅 ${new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Kolkata" })}`);
  lines.push("");

  // Portfolio value
  const valueCr = (estimate.estimatedValue / 1e7).toFixed(1);
  const changeEmoji = dayChange >= 0 ? "📈" : "📉";
  lines.push(`💰 <b>Portfolio Value:</b> ₹${valueCr} Cr`);
  if (dayChange !== 0) {
    const changeCr = (Math.abs(dayChange) / 1e7).toFixed(1);
    lines.push(`${changeEmoji} <b>Day Change:</b> ${dayChange >= 0 ? "+" : "-"}₹${changeCr} Cr (${dayChangePct >= 0 ? "+" : ""}${dayChangePct.toFixed(2)}%)`);
  }
  lines.push(`📦 <b>Holdings:</b> ${estimate.numHoldings} stocks`);
  lines.push("");

  // Top movers
  if (estimate.topMovers.length > 0) {
    lines.push("🔥 <b>Top Movers Today:</b>");
    for (const m of estimate.topMovers) {
      const emoji = m.changePct >= 0 ? "🟢" : "🔴";
      const contribCr = (Math.abs(m.contribution) / 1e7).toFixed(1);
      lines.push(`${emoji} ${m.symbol}: ${m.changePct >= 0 ? "+" : ""}${m.changePct.toFixed(1)}% (${m.contribution >= 0 ? "+" : "-"}₹${contribCr} Cr)`);
    }
    lines.push("");
  }

  // New deals today
  if (newDeals.length > 0) {
    lines.push(`🆕 <b>New Deals Today:</b> ${newDeals.length}`);
    for (const d of newDeals.slice(0, 5)) {
      lines.push(`• ${d.message}`);
    }
    lines.push("");
  } else {
    lines.push("📭 <b>No new deals today</b>");
    lines.push("");
  }

  lines.push("—");
  lines.push("🤖 <i>AK Portfolio Tracker — 17 sources, 19 intelligence layers</i>");

  const message = lines.join("\n");

  // Queue and immediately process
  await queueNotification("telegram", "normal", "Daily Digest", message);
  await processNotificationQueue();

  console.log("[Digest] Daily digest sent");
}
