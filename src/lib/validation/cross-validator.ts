import { getDb } from "../db";
import { fetchNsePrice } from "../prices/nse";
import { fetchGooglePrice } from "../prices/google";
import { getPrice as getYahooPrice } from "../prices/yahoo";
import { logAudit } from "../audit/logger";
import { recordSourceResult } from "../health/monitor";
import type { PriceData } from "@/types";

interface PriceFromSource {
  source: string;
  price: number;
  changePct: number;
  latencyMs: number;
  success: boolean;
  error?: string;
}

interface ValidationResult {
  symbol: string;
  consensusPrice: number;
  consensusChangePct: number;
  confidence: number;
  sources: PriceFromSource[];
  conflicts: Array<{ sourceA: string; sourceB: string; deviationPct: number }>;
}

const CONFLICT_THRESHOLD_PCT = 1.0; // Flag if sources differ by more than 1%

export async function crossValidatePrice(symbol: string): Promise<ValidationResult> {
  const sources: PriceFromSource[] = [];

  // Fetch from all 3 sources in parallel
  const fetchers = [
    { name: "nse", fn: () => fetchNsePrice(symbol) },
    { name: "google", fn: () => fetchGooglePrice(symbol) },
    { name: "yahoo", fn: () => getYahooPrice(symbol) },
  ];

  const results = await Promise.allSettled(
    fetchers.map(async (f) => {
      const start = Date.now();
      try {
        const price = await f.fn();
        const latency = Date.now() - start;
        recordSourceResult(f.name, !!price, latency);

        if (price && price.price > 0) {
          sources.push({
            source: f.name,
            price: price.price,
            changePct: price.change_pct,
            latencyMs: latency,
            success: true,
          });
        } else {
          sources.push({
            source: f.name,
            price: 0,
            changePct: 0,
            latencyMs: latency,
            success: false,
            error: "Empty/zero price",
          });
        }
      } catch (err) {
        const latency = Date.now() - start;
        recordSourceResult(f.name, false, latency, String(err));
        sources.push({
          source: f.name,
          price: 0,
          changePct: 0,
          latencyMs: latency,
          success: false,
          error: String(err),
        });
      }
    })
  );

  const validSources = sources.filter((s) => s.success && s.price > 0);

  if (validSources.length === 0) {
    return {
      symbol,
      consensusPrice: 0,
      consensusChangePct: 0,
      confidence: 0,
      sources,
      conflicts: [],
    };
  }

  // Detect conflicts between sources
  const conflicts: Array<{ sourceA: string; sourceB: string; deviationPct: number }> = [];
  const db = getDb();

  for (let i = 0; i < validSources.length; i++) {
    for (let j = i + 1; j < validSources.length; j++) {
      const a = validSources[i];
      const b = validSources[j];
      const avg = (a.price + b.price) / 2;
      const deviation = Math.abs(a.price - b.price) / avg * 100;

      if (deviation > CONFLICT_THRESHOLD_PCT) {
        conflicts.push({
          sourceA: a.source,
          sourceB: b.source,
          deviationPct: Math.round(deviation * 100) / 100,
        });

        // Log conflict
        await logAudit({
          entityType: "price",
          entityId: symbol,
          source: `${a.source}+${b.source}`,
          action: "conflict",
          oldValue: { source: a.source, price: a.price },
          newValue: { source: b.source, price: b.price },
          confidence: 1 - deviation / 100,
          metadata: { deviationPct: deviation },
        });

        // Store validation result
        await db
          .from("validation_results")
          .insert({
            symbol,
            field: "price",
            source_a: a.source,
            value_a: a.price,
            source_b: b.source,
            value_b: b.price,
            deviation_pct: deviation,
            status: deviation > 5 ? "conflict" : "minor_diff",
          });
      }
    }
  }

  // Calculate consensus price using weighted average
  // Weight: NSE (3x — official exchange), Google (2x), Yahoo (1x)
  const weights: Record<string, number> = { nse: 3, google: 2, yahoo: 1 };
  let weightedSum = 0;
  let weightedChangePctSum = 0;
  let totalWeight = 0;

  for (const s of validSources) {
    const w = weights[s.source] || 1;
    weightedSum += s.price * w;
    weightedChangePctSum += s.changePct * w;
    totalWeight += w;
  }

  const consensusPrice = weightedSum / totalWeight;
  const consensusChangePct = weightedChangePctSum / totalWeight;

  // Confidence: 1.0 if all sources agree, lower if conflicts exist
  const confidence = conflicts.length === 0
    ? Math.min(1.0, validSources.length / 3)
    : Math.max(0.3, 1 - conflicts.reduce((sum, c) => sum + c.deviationPct, 0) / 100);

  // Log validated price
  await logAudit({
    entityType: "price",
    entityId: symbol,
    source: "validator",
    action: "validated",
    newValue: {
      price: Math.round(consensusPrice * 100) / 100,
      changePct: Math.round(consensusChangePct * 100) / 100,
      numSources: validSources.length,
      conflicts: conflicts.length,
    },
    confidence,
  });

  // Update price cache with consensus price
  await db
    .from("price_cache")
    .upsert(
      {
        symbol,
        price: Math.round(consensusPrice * 100) / 100,
        change_pct: Math.round(consensusChangePct * 100) / 100,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "symbol" }
    );

  return {
    symbol,
    consensusPrice: Math.round(consensusPrice * 100) / 100,
    consensusChangePct: Math.round(consensusChangePct * 100) / 100,
    confidence: Math.round(confidence * 1000) / 1000,
    sources,
    conflicts,
  };
}

export async function crossValidateAllPrices(): Promise<{
  validated: number;
  conflicts: number;
  avgConfidence: number;
}> {
  const db = getDb();

  // Get distinct symbols from stocks that have holdings
  const { data: holdingsWithStocks } = await db
    .from("holdings")
    .select("stock_id, stocks(symbol)")
    .limit(1000);

  const symbolSet = new Set<string>();
  for (const h of holdingsWithStocks || []) {
    const stock = h.stocks as unknown as Record<string, unknown> | null;
    if (stock?.symbol) symbolSet.add(stock.symbol as string);
  }

  const stocks = Array.from(symbolSet);

  let validated = 0;
  let totalConflicts = 0;
  let totalConfidence = 0;

  for (const symbol of stocks) {
    const result = await crossValidatePrice(symbol);
    if (result.consensusPrice > 0) {
      validated++;
      totalConfidence += result.confidence;
    }
    totalConflicts += result.conflicts.length;

    // Small delay between symbols
    await new Promise((r) => setTimeout(r, 500));
  }

  return {
    validated,
    conflicts: totalConflicts,
    avgConfidence: validated > 0 ? Math.round((totalConfidence / validated) * 1000) / 1000 : 0,
  };
}
