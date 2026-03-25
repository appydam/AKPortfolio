import { getDb } from "../db";
import { queueNotification } from "../notifications/telegram";

// Deal Diff Engine
// After every scrape, compare current holdings vs previous quarter's holdings
// Detect: new entries, full exits, increased positions, reduced positions
// This fires alerts based on SHP quarterly data (most comprehensive view)

interface HoldingSnapshot {
  stockId: number;
  symbol: string;
  name: string;
  sharesHeld: number;
  pctHolding: number;
  quarter: string;
}

interface DiffResult {
  type: "NEW_ENTRY" | "FULL_EXIT" | "INCREASED" | "REDUCED" | "UNCHANGED";
  symbol: string;
  name: string;
  stockId: number;
  prevShares: number;
  currShares: number;
  changeShares: number;
  changePct: number; // % change in shares held
  prevHoldingPct: number;
  currHoldingPct: number;
  estimatedValue: number; // in INR
}

export async function computeHoldingsDiff(): Promise<DiffResult[]> {
  const db = getDb();

  // Get all distinct quarters, sorted desc
  const { data: quarters } = await db
    .from("holdings")
    .select("quarter")
    .order("quarter", { ascending: false })
    .limit(100);

  const distinctQuarters = [...new Set((quarters || []).map((r: { quarter: string }) => r.quarter))];
  if (distinctQuarters.length < 2) return [];

  const currentQ = distinctQuarters[0];
  const prevQ = distinctQuarters[1];

  // Fetch both quarters with stock info
  const [currResult, prevResult] = await Promise.all([
    db.from("holdings").select("stock_id, shares_held, pct_holding, stocks(symbol, name)").eq("quarter", currentQ),
    db.from("holdings").select("stock_id, shares_held, pct_holding, stocks(symbol, name)").eq("quarter", prevQ),
  ]);

  const toMap = (rows: Array<Record<string, unknown>>): Map<number, HoldingSnapshot> => {
    const m = new Map<number, HoldingSnapshot>();
    for (const r of rows) {
      const stock = r.stocks as unknown as Record<string, unknown> | null;
      m.set(r.stock_id as number, {
        stockId: r.stock_id as number,
        symbol: (stock?.symbol as string) || "",
        name: (stock?.name as string) || "",
        sharesHeld: r.shares_held as number,
        pctHolding: r.pct_holding as number,
        quarter: "",
      });
    }
    return m;
  };

  const currMap = toMap(currResult.data || []);
  const prevMap = toMap(prevResult.data || []);

  // Fetch prices for value estimation
  const symbols = [...new Set([...currMap.values(), ...prevMap.values()].map((h) => h.symbol))].filter(Boolean);
  const { data: prices } = await db.from("price_cache").select("symbol, price").in("symbol", symbols);
  const priceMap = new Map<string, number>();
  for (const p of prices || []) priceMap.set(p.symbol, p.price);

  const results: DiffResult[] = [];
  const allStockIds = new Set([...currMap.keys(), ...prevMap.keys()]);

  for (const stockId of allStockIds) {
    const curr = currMap.get(stockId);
    const prev = prevMap.get(stockId);
    const symbol = curr?.symbol || prev?.symbol || "";
    const name = curr?.name || prev?.name || "";
    const price = priceMap.get(symbol) || 0;

    if (!prev && curr) {
      // New entry this quarter
      results.push({
        type: "NEW_ENTRY",
        symbol, name, stockId,
        prevShares: 0,
        currShares: curr.sharesHeld,
        changeShares: curr.sharesHeld,
        changePct: 100,
        prevHoldingPct: 0,
        currHoldingPct: curr.pctHolding,
        estimatedValue: curr.sharesHeld * price,
      });
    } else if (prev && !curr) {
      // Full exit
      results.push({
        type: "FULL_EXIT",
        symbol, name, stockId,
        prevShares: prev.sharesHeld,
        currShares: 0,
        changeShares: -prev.sharesHeld,
        changePct: -100,
        prevHoldingPct: prev.pctHolding,
        currHoldingPct: 0,
        estimatedValue: 0,
      });
    } else if (curr && prev) {
      const change = curr.sharesHeld - prev.sharesHeld;
      const changePct = prev.sharesHeld > 0 ? (change / prev.sharesHeld) * 100 : 0;

      // Only flag if >1% change to avoid noise from rounding
      if (Math.abs(changePct) < 1) {
        results.push({
          type: "UNCHANGED",
          symbol, name, stockId,
          prevShares: prev.sharesHeld,
          currShares: curr.sharesHeld,
          changeShares: change,
          changePct,
          prevHoldingPct: prev.pctHolding,
          currHoldingPct: curr.pctHolding,
          estimatedValue: curr.sharesHeld * price,
        });
        continue;
      }

      results.push({
        type: change > 0 ? "INCREASED" : "REDUCED",
        symbol, name, stockId,
        prevShares: prev.sharesHeld,
        currShares: curr.sharesHeld,
        changeShares: change,
        changePct: Math.round(changePct * 10) / 10,
        prevHoldingPct: prev.pctHolding,
        currHoldingPct: curr.pctHolding,
        estimatedValue: curr.sharesHeld * price,
      });
    }
  }

  return results.sort((a, b) => Math.abs(b.changeShares) - Math.abs(a.changeShares));
}

// Run diff and fire Telegram alerts for significant changes
export async function runDiffAndAlert(silentIfNoChanges = true): Promise<{
  newEntries: number;
  exits: number;
  increased: number;
  reduced: number;
}> {
  console.log("[DiffEngine] Running holdings diff...");
  const db = getDb();

  const diffs = await computeHoldingsDiff();
  const newEntries = diffs.filter((d) => d.type === "NEW_ENTRY");
  const exits = diffs.filter((d) => d.type === "FULL_EXIT");
  const increased = diffs.filter((d) => d.type === "INCREASED");
  const reduced = diffs.filter((d) => d.type === "REDUCED");

  if (newEntries.length === 0 && exits.length === 0 && silentIfNoChanges) {
    console.log("[DiffEngine] No significant changes detected");
    return { newEntries: 0, exits: 0, increased: increased.length, reduced: reduced.length };
  }

  // Build alert messages
  const lines: string[] = ["🔍 *ASHISH KACHOLIA PORTFOLIO UPDATE*\n"];

  if (newEntries.length > 0) {
    lines.push("🆕 *NEW ENTRIES*");
    for (const e of newEntries) {
      const valCr = e.estimatedValue > 0 ? ` (~₹${(e.estimatedValue / 1e7).toFixed(1)} Cr)` : "";
      lines.push(`• ${e.name} (${e.symbol}): ${e.currShares.toLocaleString("en-IN")} shares${valCr}`);
    }
    lines.push("");
  }

  if (exits.length > 0) {
    lines.push("❌ *FULL EXITS*");
    for (const e of exits) {
      lines.push(`• ${e.name} (${e.symbol}): exited ${e.prevShares.toLocaleString("en-IN")} shares`);
    }
    lines.push("");
  }

  if (increased.length > 0) {
    lines.push("📈 *INCREASED POSITIONS* (top 5)");
    for (const e of increased.slice(0, 5)) {
      const valCr = e.estimatedValue > 0 ? ` (~₹${(e.estimatedValue / 1e7).toFixed(1)} Cr)` : "";
      lines.push(`• ${e.symbol}: +${e.changeShares.toLocaleString("en-IN")} (+${e.changePct.toFixed(1)}%)${valCr}`);
    }
    lines.push("");
  }

  if (reduced.length > 0) {
    lines.push("📉 *REDUCED POSITIONS* (top 5)");
    for (const e of reduced.slice(0, 5)) {
      lines.push(`• ${e.symbol}: ${e.changeShares.toLocaleString("en-IN")} (${e.changePct.toFixed(1)}%)`);
    }
  }

  const message = lines.join("\n");
  await queueNotification("telegram", "urgent", "🔍 Kacholia Portfolio Update", message);

  // Also store summary alert in DB
  await db.from("alerts").insert({
    stock_id: newEntries[0]?.stockId || exits[0]?.stockId || increased[0]?.stockId || 1,
    alert_type: "QUARTERLY_DIFF",
    message: `Q-diff: ${newEntries.length} new, ${exits.length} exits, ${increased.length} increased, ${reduced.length} reduced`,
    deal_id: null,
  });

  console.log(`[DiffEngine] Alerted: ${newEntries.length} new entries, ${exits.length} exits`);
  return {
    newEntries: newEntries.length,
    exits: exits.length,
    increased: increased.length,
    reduced: reduced.length,
  };
}

// Get latest diff for display on frontend
export async function getLatestDiff(): Promise<DiffResult[]> {
  return computeHoldingsDiff();
}
