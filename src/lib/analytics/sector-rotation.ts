import { getDb } from "../db";
import type { SectorRotation } from "@/types";

export async function getSectorRotation(): Promise<SectorRotation[]> {
  const db = getDb();

  // Get all holdings across all quarters with stock sector info
  const { data: holdingsData } = await db
    .from("holdings")
    .select("stock_id, quarter, shares_held, pct_holding, stocks(symbol, name, sector)")
    .order("quarter", { ascending: true });

  if (!holdingsData || holdingsData.length === 0) return [];

  // Get current prices (used as proxy for value estimation)
  const symbols = [...new Set(holdingsData.map((h: Record<string, unknown>) => {
    const stock = h.stocks as unknown as Record<string, unknown> | null;
    return stock?.symbol as string;
  }).filter(Boolean))];

  const { data: prices } = await db
    .from("price_cache")
    .select("symbol, price")
    .in("symbol", symbols);

  const priceMap = new Map<string, number>();
  for (const p of prices || []) priceMap.set(p.symbol, p.price);

  // Group by quarter
  const quarterMap = new Map<string, Array<{ sector: string; value: number }>>();

  for (const h of holdingsData) {
    const stock = h.stocks as unknown as Record<string, unknown> | null;
    const symbol = (stock?.symbol as string) || "";
    const sector = (stock?.sector as string) || "Unknown";
    const quarter = h.quarter as string;
    const price = priceMap.get(symbol) || 0;
    const value = price * (h.shares_held as number);

    if (!quarterMap.has(quarter)) quarterMap.set(quarter, []);
    quarterMap.get(quarter)!.push({ sector, value });
  }

  const results: SectorRotation[] = [];

  for (const [quarter, holdings] of quarterMap) {
    const totalValue = holdings.reduce((s, h) => s + h.value, 0);
    const sectorAgg = new Map<string, { value: number; count: number }>();

    for (const h of holdings) {
      if (!sectorAgg.has(h.sector)) sectorAgg.set(h.sector, { value: 0, count: 0 });
      const agg = sectorAgg.get(h.sector)!;
      agg.value += h.value;
      agg.count++;
    }

    const sectors = Array.from(sectorAgg.entries())
      .map(([sector, agg]) => ({
        sector,
        weight: totalValue > 0 ? Math.round((agg.value / totalValue) * 1000) / 10 : 0,
        stockCount: agg.count,
      }))
      .sort((a, b) => b.weight - a.weight);

    results.push({ quarter, sectors });
  }

  return results.sort((a, b) => a.quarter.localeCompare(b.quarter));
}
