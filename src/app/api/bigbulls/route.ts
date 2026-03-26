import { NextResponse } from "next/server";
import { INVESTORS } from "@/lib/investors";
import { scrapeAllInvestors, computeOverlap } from "@/lib/scrapers/bigbulls";

export async function GET() {
  try {
    const allHoldings = await scrapeAllInvestors();

    const investors = INVESTORS.map(inv => {
      const holdings = allHoldings.get(inv.id) || [];
      const totalValue = holdings.reduce((s, h) => s + h.holdingValueCr, 0);
      return {
        id: inv.id,
        name: inv.name,
        description: inv.description,
        holdingsCount: holdings.length,
        totalValueCr: Math.round(totalValue * 10) / 10,
        topHoldings: holdings
          .sort((a, b) => b.holdingValueCr - a.holdingValueCr)
          .slice(0, 5)
          .map(h => ({ symbol: h.symbol, name: h.name, valueCr: h.holdingValueCr, pct: h.pctHolding })),
      };
    });

    // Compute overlaps with Ashish Kacholia
    const akHoldings = allHoldings.get("ashish-kacholia") || [];
    const overlaps = INVESTORS
      .filter(inv => inv.id !== "ashish-kacholia")
      .map(inv => {
        const theirHoldings = allHoldings.get(inv.id) || [];
        const overlap = computeOverlap(akHoldings, theirHoldings);
        const shared = overlap.filter(o => o.inA && o.inB);
        const onlyAK = overlap.filter(o => o.inA && !o.inB);
        const onlyThem = overlap.filter(o => !o.inA && o.inB);
        return {
          investorId: inv.id,
          investorName: inv.name,
          sharedCount: shared.length,
          sharedStocks: shared.map(s => s.symbol),
          onlyAKCount: onlyAK.length,
          onlyThemCount: onlyThem.length,
          overlapPct: akHoldings.length > 0
            ? Math.round((shared.length / akHoldings.length) * 1000) / 10
            : 0,
        };
      });

    return NextResponse.json({ investors, overlaps });
  } catch (error) {
    console.error("[BigBulls API] Error:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
