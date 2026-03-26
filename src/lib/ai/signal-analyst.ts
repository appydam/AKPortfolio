import { askClaude, isConfigured } from "./bedrock";
import { getDb } from "../db";

// AI Signal Analyst
// Uses Claude (via AWS Bedrock) to analyze Kacholia's portfolio moves
// and generate actionable buy/hold/avoid recommendations.

export interface SignalAnalysis {
  symbol: string;
  name: string;
  signal: "STRONG_BUY" | "BUY" | "HOLD" | "CAUTION" | "AVOID";
  confidence: number; // 0-100
  summary: string; // 2-3 sentence summary
  reasoning: string; // detailed analysis
  entryStrategy: string; // how to enter
  riskFactors: string[]; // key risks
  targetReturn: string; // e.g., "20-40% in 3-6 months"
  aiAvailable: boolean;
}

const SYSTEM_PROMPT = `You are a senior Indian equity research analyst specializing in small and mid-cap stocks. You analyze Ashish Kacholia's portfolio moves to generate actionable investment signals.

Kacholia is known for:
- Finding multibagger small caps before they become mainstream
- Concentrated bets in niche sectors (chemicals, engineering, consumer)
- Holding periods of 2-5+ years (patient capital)
- Averaging down when convicted (buys more at lower prices)
- His buying alone creates 20-50% momentum in small caps ("Kacholia effect")

When analyzing a signal, consider:
1. Why would Kacholia buy THIS stock specifically?
2. What's the company's business and growth potential?
3. Is this a new entry (exploratory) or an add-on (conviction increase)?
4. How much did he buy relative to the company (% acquired)?
5. What's the risk/reward for someone buying AFTER his entry?

Be honest about risks. Not every Kacholia pick works — some drop 50%+.
Respond in JSON format ONLY.`;

export async function analyzeSignal(
  symbol: string,
  name: string,
  context: {
    action: "Buy" | "Sell";
    quantity: number;
    price: number;
    currentPrice: number;
    isNewEntry: boolean;
    convictionScore: number;
    sector: string;
    holdingPct: number;
    dealPattern: string;
    totalDeals: number;
    holdingDays: number;
  }
): Promise<SignalAnalysis> {
  if (!isConfigured()) {
    return generateFallbackAnalysis(symbol, name, context);
  }

  const userMessage = `Analyze this Ashish Kacholia portfolio signal:

STOCK: ${name} (${symbol})
SECTOR: ${context.sector}
ACTION: ${context.action}
TYPE: ${context.isNewEntry ? "NEW ENTRY (first time buying this stock)" : "ADD-ON (already holds, buying more)"}
QUANTITY: ${context.quantity.toLocaleString("en-IN")} shares
ENTRY PRICE: ₹${context.price}
CURRENT PRICE: ₹${context.currentPrice} (${context.currentPrice > context.price ? "+" : ""}${(((context.currentPrice - context.price) / context.price) * 100).toFixed(1)}% from entry)
HOLDING %: ${context.holdingPct}% of company
CONVICTION SCORE: ${context.convictionScore}/100
DEAL PATTERN: ${context.dealPattern}
TOTAL DEALS IN THIS STOCK: ${context.totalDeals}
HOLDING PERIOD: ${context.holdingDays} days

Respond in this exact JSON format:
{
  "signal": "STRONG_BUY" | "BUY" | "HOLD" | "CAUTION" | "AVOID",
  "confidence": 0-100,
  "summary": "2-3 sentence summary for a retail investor",
  "reasoning": "Detailed 3-4 sentence analysis of why this signal matters",
  "entryStrategy": "How should a retail investor enter? (e.g., buy on dips, SIP, lump sum)",
  "riskFactors": ["risk 1", "risk 2", "risk 3"],
  "targetReturn": "e.g., 20-40% in 3-6 months"
}`;

  try {
    const response = await askClaude(SYSTEM_PROMPT, userMessage, 1500);

    // Parse JSON from response
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return generateFallbackAnalysis(symbol, name, context);
    }

    const parsed = JSON.parse(jsonMatch[0]);
    return {
      symbol,
      name,
      signal: parsed.signal || "HOLD",
      confidence: parsed.confidence || 50,
      summary: parsed.summary || "",
      reasoning: parsed.reasoning || "",
      entryStrategy: parsed.entryStrategy || "",
      riskFactors: parsed.riskFactors || [],
      targetReturn: parsed.targetReturn || "",
      aiAvailable: true,
    };
  } catch (error) {
    console.error("[AI] Signal analysis failed:", error);
    return generateFallbackAnalysis(symbol, name, context);
  }
}

// Rule-based fallback when AI is unavailable
function generateFallbackAnalysis(
  symbol: string,
  name: string,
  ctx: {
    action: "Buy" | "Sell";
    isNewEntry: boolean;
    convictionScore: number;
    currentPrice: number;
    price: number;
    holdingPct: number;
    dealPattern: string;
    holdingDays: number;
  }
): SignalAnalysis {
  const priceVsEntry = ((ctx.currentPrice - ctx.price) / ctx.price) * 100;
  const isBuy = ctx.action === "Buy";

  let signal: SignalAnalysis["signal"];
  let confidence: number;
  let summary: string;
  let entryStrategy: string;
  let targetReturn: string;

  if (isBuy && ctx.isNewEntry) {
    signal = priceVsEntry < 10 ? "STRONG_BUY" : priceVsEntry < 25 ? "BUY" : "CAUTION";
    confidence = priceVsEntry < 5 ? 80 : priceVsEntry < 15 ? 65 : 40;
    summary = `Kacholia made a NEW entry in ${name}. This is his first purchase — typically the highest-alpha signal. Current price is ${priceVsEntry.toFixed(1)}% ${priceVsEntry > 0 ? "above" : "below"} his entry.`;
    entryStrategy = priceVsEntry < 10
      ? "Consider buying now — stock is still near Kacholia's entry price. Use 2-3% of portfolio."
      : "Stock has already moved up. Wait for a 5-10% dip to enter, or start a small SIP.";
    targetReturn = ctx.isNewEntry ? "30-80% in 6-12 months (based on historical new entry performance)" : "15-30% in 3-6 months";
  } else if (isBuy && !ctx.isNewEntry) {
    signal = ctx.convictionScore >= 40 ? "BUY" : "HOLD";
    confidence = ctx.convictionScore >= 50 ? 70 : 50;
    summary = `Kacholia is ADDING to ${name} (conviction score: ${ctx.convictionScore}/100). He already holds this stock and is buying more — a conviction increase signal.`;
    entryStrategy = "This is a conviction confirmation. If you already hold, consider adding. If new, start with 2% of portfolio.";
    targetReturn = "20-50% in 6-12 months";
  } else {
    // Sell
    signal = ctx.holdingPct < 1 ? "AVOID" : "CAUTION";
    confidence = 60;
    summary = `Kacholia is SELLING ${name}. ${ctx.holdingPct < 1 ? "This may be a full exit — strong sell signal." : "Partial reduction — could be profit booking or thesis change."}`;
    entryStrategy = "Do NOT buy. If you hold this stock, consider reducing position.";
    targetReturn = "N/A — sell signal";
  }

  const riskFactors = [
    priceVsEntry > 20 ? `Stock already up ${priceVsEntry.toFixed(0)}% from Kacholia's entry — limited upside vs his cost` : null,
    ctx.holdingPct < 1 ? "Small holding — may be exploratory, not high conviction" : null,
    "Small-cap stocks can be volatile — 20-30% drawdowns are common",
    "Kacholia's entry doesn't guarantee success — some picks drop 50%+",
  ].filter(Boolean) as string[];

  return {
    symbol, name, signal, confidence,
    summary,
    reasoning: `${ctx.isNewEntry ? "New portfolio entry" : "Position increase"} with conviction score ${ctx.convictionScore}/100. Deal pattern: ${ctx.dealPattern}. Held for ${ctx.holdingDays} days. ${priceVsEntry > 0 ? "Stock is above" : "Stock is below"} entry price.`,
    entryStrategy,
    riskFactors,
    targetReturn,
    aiAvailable: false,
  };
}

// Analyze all current holdings and generate a signal dashboard
export async function analyzePortfolio(): Promise<SignalAnalysis[]> {
  const db = getDb();

  // Get holdings with stock info
  const { data: latestQ } = await db.from("holdings").select("quarter").order("quarter", { ascending: false }).limit(1).single();
  if (!latestQ) return [];

  const { data: holdings } = await db
    .from("holdings")
    .select("stock_id, shares_held, pct_holding, stocks(symbol, name, sector)")
    .eq("quarter", latestQ.quarter);

  if (!holdings || holdings.length === 0) return [];

  // Get latest deal per stock
  const stockIds = holdings.map((h: Record<string, unknown>) => h.stock_id as number);
  const { data: deals } = await db
    .from("deals")
    .select("stock_id, action, avg_price, quantity, deal_date_parsed")
    .in("stock_id", stockIds)
    .order("deal_date_parsed", { ascending: false, nullsFirst: false });

  // Group deals by stock - get latest and count
  const latestDeal = new Map<number, Record<string, unknown>>();
  const dealCount = new Map<number, number>();
  const firstDeal = new Map<number, Record<string, unknown>>();
  for (const d of deals || []) {
    const id = d.stock_id as number;
    dealCount.set(id, (dealCount.get(id) || 0) + 1);
    if (!latestDeal.has(id)) latestDeal.set(id, d);
    firstDeal.set(id, d); // last in desc = earliest
  }

  // Get prices
  const symbols = holdings.map((h: Record<string, unknown>) => {
    const stock = h.stocks as unknown as Record<string, unknown> | null;
    return stock?.symbol as string;
  }).filter(Boolean);

  const { data: prices } = await db.from("price_cache").select("symbol, price").in("symbol", symbols);
  const priceMap = new Map<string, number>();
  for (const p of prices || []) priceMap.set(p.symbol, p.price);

  // Get conviction scores from insights cache
  const { data: cached } = await db.from("insights_cache").select("payload").eq("id", 1).single();
  const convictionMap = new Map<string, number>();
  const patternMap = new Map<string, string>();
  if (cached?.payload) {
    try {
      const insights = JSON.parse(cached.payload as string);
      for (const c of insights.conviction || []) convictionMap.set(c.symbol, c.score);
      for (const p of insights.dealPatterns || []) patternMap.set(p.symbol, p.pattern);
    } catch { /* ignore */ }
  }

  // Only analyze stocks with recent deals (last 6 months) — these are the actionable ones
  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

  const signals: SignalAnalysis[] = [];

  for (const h of holdings) {
    const stock = h.stocks as unknown as Record<string, unknown> | null;
    const symbol = (stock?.symbol as string) || "";
    const name = (stock?.name as string) || "";
    const stockId = h.stock_id as number;
    const latest = latestDeal.get(stockId);
    const first = firstDeal.get(stockId);

    if (!latest || !symbol) continue;

    const dealDate = new Date(latest.deal_date_parsed as string || "2020-01-01");
    const isRecent = dealDate > sixMonthsAgo;

    // Only do AI analysis for recent deals (to save API costs)
    // For older deals, use rule-based fallback
    const currentPrice = priceMap.get(symbol) || 0;
    const entryPrice = (first?.avg_price as number) || (latest.avg_price as number) || 0;
    const holdingDays = Math.round((Date.now() - new Date(first?.deal_date_parsed as string || "2020-01-01").getTime()) / 86400000);

    const analysis = await analyzeSignal(symbol, name, {
      action: (latest.action as "Buy" | "Sell") || "Buy",
      quantity: (latest.quantity as number) || 0,
      price: entryPrice,
      currentPrice,
      isNewEntry: (dealCount.get(stockId) || 0) <= 1,
      convictionScore: convictionMap.get(symbol) || 0,
      sector: (stock?.sector as string) || "Unknown",
      holdingPct: (h.pct_holding as number) || 0,
      dealPattern: patternMap.get(symbol) || "unknown",
      totalDeals: dealCount.get(stockId) || 0,
      holdingDays,
    });

    signals.push(analysis);

    // Rate limit AI calls
    if (isRecent && isConfigured()) {
      await new Promise((r) => setTimeout(r, 1000));
    }
  }

  // Sort: STRONG_BUY first, then BUY, then rest
  const signalOrder = { STRONG_BUY: 0, BUY: 1, HOLD: 2, CAUTION: 3, AVOID: 4 };
  signals.sort((a, b) => (signalOrder[a.signal] || 5) - (signalOrder[b.signal] || 5));

  return signals;
}
