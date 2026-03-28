// Compare a user's portfolio against all Big Bull investors
import { INVESTORS, type InvestorProfile } from "../investors";

interface UserHolding {
  symbol: string;
  quantity: number;
  avgPrice: number;
}

interface InvestorHolding {
  investorId: string;
  symbol: string;
  name: string;
  sharesHeld: number;
  pctHolding: number;
  holdingValueCr: number;
}

export interface BullComparison {
  investorId: string;
  investorName: string;
  description: string;
  totalHoldings: number;
  overlapCount: number;
  similarityPct: number;
  overlapStocks: string[];
  onlyBull: string[];
}

export interface ConsensusPick {
  symbol: string;
  name: string;
  heldByCount: number;
  heldBy: string[];
}

export interface ComparisonResult {
  comparisons: BullComparison[];
  consensusPicks: ConsensusPick[];
}

export function compareWithAllBulls(
  userHoldings: UserHolding[],
  allBullHoldings: Map<string, InvestorHolding[]>
): ComparisonResult {
  const userSymbols = new Set(userHoldings.map((h) => h.symbol));

  // Per-bull comparison
  const comparisons: BullComparison[] = [];

  for (const investor of INVESTORS) {
    const bullHoldings = allBullHoldings.get(investor.id) || [];
    const bullSymbols = new Set(bullHoldings.map((h) => h.symbol));

    const overlap = [...userSymbols].filter((s) => bullSymbols.has(s));
    const onlyBull = [...bullSymbols].filter((s) => !userSymbols.has(s));

    comparisons.push({
      investorId: investor.id,
      investorName: investor.name,
      description: investor.description,
      totalHoldings: bullHoldings.length,
      overlapCount: overlap.length,
      similarityPct: userSymbols.size > 0
        ? Math.round((overlap.length / userSymbols.size) * 100)
        : 0,
      overlapStocks: overlap,
      onlyBull,
    });
  }

  // Sort by similarity (most similar first)
  comparisons.sort((a, b) => b.similarityPct - a.similarityPct);

  // Consensus picks — stocks held by 2+ bulls that user doesn't have
  const stockBullCount = new Map<string, { name: string; bulls: string[] }>();

  for (const investor of INVESTORS) {
    const bullHoldings = allBullHoldings.get(investor.id) || [];
    for (const h of bullHoldings) {
      if (userSymbols.has(h.symbol)) continue; // user already owns it
      const existing = stockBullCount.get(h.symbol);
      if (existing) {
        existing.bulls.push(investor.name);
      } else {
        stockBullCount.set(h.symbol, { name: h.name, bulls: [investor.name] });
      }
    }
  }

  const consensusPicks: ConsensusPick[] = [...stockBullCount.entries()]
    .filter(([, v]) => v.bulls.length >= 2) // at least 2 bulls hold it
    .map(([symbol, v]) => ({
      symbol,
      name: v.name,
      heldByCount: v.bulls.length,
      heldBy: v.bulls,
    }))
    .sort((a, b) => b.heldByCount - a.heldByCount);

  return { comparisons, consensusPicks };
}
