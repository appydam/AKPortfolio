import { getDb } from "../db";
import { getConvictionScores, getDealPatterns, getEntryQualityAnalysis } from "./conviction";
import { getPortfolioDrawdown, getPortfolioBeta, getWinLossStats, getPerformanceAttribution } from "./risk";
import { getSectorRotation } from "./sector-rotation";
import { getConcentrationMetrics } from "./portfolio";
import type { InsightsPayload } from "@/types";

function isMarketHours(): boolean {
  const now = new Date();
  const ist = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
  const day = ist.getDay();
  if (day === 0 || day === 6) return false;
  const mins = ist.getHours() * 60 + ist.getMinutes();
  return mins >= 555 && mins <= 930;
}

export async function computeInsights(): Promise<InsightsPayload> {
  const [
    conviction,
    entryQuality,
    dealPatterns,
    drawdown,
    beta,
    winLoss,
    attribution,
    sectorRotation,
  ] = await Promise.all([
    getConvictionScores(),
    getEntryQualityAnalysis(),
    getDealPatterns(),
    getPortfolioDrawdown(),
    getPortfolioBeta(),
    getWinLossStats(),
    getPerformanceAttribution(),
    getSectorRotation(),
  ]);

  return {
    computedAt: new Date().toISOString(),
    conviction,
    entryQuality,
    dealPatterns,
    drawdown,
    beta,
    winLoss,
    topContributors: attribution.topContributors,
    bottomDetractors: attribution.bottomDetractors,
    sectorRotation,
  };
}

export async function getCachedInsights(): Promise<InsightsPayload> {
  const db = getDb();

  const { data: cached } = await db
    .from("insights_cache")
    .select("payload, computed_at")
    .eq("id", 1)
    .single();

  const ttl = isMarketHours() ? 15 * 60 * 1000 : 60 * 60 * 1000;

  if (cached && cached.payload) {
    const age = Date.now() - new Date(cached.computed_at as string).getTime();
    if (age < ttl) {
      try {
        return JSON.parse(cached.payload as string);
      } catch {
        // corrupted cache, recompute
      }
    }
  }

  const insights = await computeInsights();

  await db.from("insights_cache").upsert(
    { id: 1, payload: JSON.stringify(insights), computed_at: new Date().toISOString() },
    { onConflict: "id" }
  );

  return insights;
}
