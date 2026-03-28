import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getAggregatedPrices } from "@/lib/prices/aggregator";
import myHoldingsData from "@/data/my-holdings.json";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type RawHoldings = { user: string; user_id?: string; synced_at: string; holdings: any[]; mutual_funds?: any[] };

async function loadPortfolioData(portfolioId: string | null): Promise<RawHoldings> {
  if (!portfolioId) return myHoldingsData as RawHoldings;

  const db = getDb();
  const { data, error } = await db
    .from("user_portfolios")
    .select("*")
    .eq("id", portfolioId)
    .single();

  if (error || !data) throw new Error("Portfolio not found");

  const holdings = typeof data.holdings === "string" ? JSON.parse(data.holdings) : data.holdings;
  const mutualFunds = data.mutual_funds
    ? (typeof data.mutual_funds === "string" ? JSON.parse(data.mutual_funds) : data.mutual_funds)
    : [];

  return {
    user: data.name || "My Portfolio",
    synced_at: data.updated_at ? new Date(data.updated_at).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10),
    holdings: holdings.map((h: Record<string, unknown>) => ({
      symbol: h.symbol,
      exchange: h.exchange || "NSE",
      quantity: h.quantity,
      average_price: h.avgPrice ?? h.average_price ?? 0,
      last_price: h.lastPrice ?? h.last_price ?? 0,
      close_price: h.closePrice ?? h.close_price ?? 0,
      pnl: h.pnl ?? 0,
      day_change_pct: h.dayChangePct ?? h.day_change_pct ?? 0,
    })),
    mutual_funds: mutualFunds,
  };
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const portfolioId = searchParams.get("id");
    const sourceData = await loadPortfolioData(portfolioId);

    // --- My Mutual Funds (Coin) ---
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mfHoldings = (sourceData.mutual_funds || []).map((mf: any) => {
      const invested = (mf.quantity || 0) * (mf.average_price || 0);
      const current = (mf.quantity || 0) * (mf.last_price || 0);
      return {
        fund: mf.fund,
        folio: mf.folio,
        tradingsymbol: mf.tradingsymbol,
        quantity: mf.quantity,
        avgNav: mf.average_price,
        currentNav: mf.last_price,
        invested,
        currentValue: current,
        pnl: current - invested,
        pnlPct: invested > 0 ? ((current - invested) / invested) * 100 : 0,
      };
    });

    const mfTotalInvested = mfHoldings.reduce((s, h) => s + h.invested, 0);
    const mfTotalCurrent = mfHoldings.reduce((s, h) => s + h.currentValue, 0);

    // --- My (Zerodha) stock holdings ---
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const myHoldings = sourceData.holdings.map((h: any) => {
      const invested = (h.quantity || 0) * (h.average_price || 0);
      const current = (h.quantity || 0) * (h.last_price || 0);
      const dayPnl = ((h.last_price || 0) - (h.close_price || 0)) * (h.quantity || 0);
      return {
        symbol: h.symbol,
        exchange: h.exchange,
        quantity: h.quantity,
        avgPrice: h.average_price,
        ltp: h.last_price,
        closePrice: h.close_price,
        invested,
        currentValue: current,
        pnl: h.pnl,
        pnlPct: invested > 0 ? ((current - invested) / invested) * 100 : 0,
        dayChangePct: h.day_change_pct,
        dayPnl,
      };
    });

    const myTotalInvested = myHoldings.reduce((s, h) => s + h.invested, 0);
    const myTotalCurrent = myHoldings.reduce((s, h) => s + h.currentValue, 0);
    const myTotalPnl = myTotalCurrent - myTotalInvested;

    // --- AK holdings (from DB) ---
    let akHoldings: { symbol: string; name: string; shares: number; pctHolding: number; price: number; changePct: number; value: number }[] = [];
    let akTotalValue = 0;

    try {
      const db = getDb();
      const { data: latestQuarterRow } = await db
        .from("holdings")
        .select("quarter")
        .order("quarter", { ascending: false })
        .limit(1)
        .single();

      if (latestQuarterRow) {
        const { data: holdingsData } = await db
          .from("holdings")
          .select("*, stocks(symbol, name, sector)")
          .eq("quarter", latestQuarterRow.quarter)
          .order("pct_holding", { ascending: false });

        const symbols = (holdingsData || [])
          .map((h: Record<string, unknown>) => (h.stocks as Record<string, unknown>)?.symbol)
          .filter(Boolean) as string[];

        const prices = await getAggregatedPrices(symbols);

        akHoldings = (holdingsData || []).map((h: Record<string, unknown>) => {
          const stock = h.stocks as Record<string, unknown> | null;
          const sym = (stock?.symbol as string) || "";
          const priceData = prices[sym];
          const price = priceData?.price || 0;
          const value = price * (h.shares_held as number);
          akTotalValue += value;
          return {
            symbol: sym,
            name: (stock?.name as string) || sym,
            shares: h.shares_held as number,
            pctHolding: h.pct_holding as number,
            price,
            changePct: priceData?.change_pct || 0,
            value,
          };
        });
      }
    } catch (akError) {
      console.warn("[API] Could not fetch AK holdings:", akError);
    }

    // --- Overlap analysis ---
    const mySymbols = new Set(myHoldings.map((h) => h.symbol));
    const akSymbols = new Set(akHoldings.map((h) => h.symbol));
    const common = [...mySymbols].filter((s) => akSymbols.has(s));
    const onlyMine = [...mySymbols].filter((s) => !akSymbols.has(s));
    const onlyAK = [...akSymbols].filter((s) => !mySymbols.has(s));

    const overlap = common.map((symbol) => {
      const mine = myHoldings.find((h) => h.symbol === symbol)!;
      const ak = akHoldings.find((h) => h.symbol === symbol)!;
      return {
        symbol,
        name: ak.name,
        myQty: mine.quantity,
        myAvgPrice: mine.avgPrice,
        myPnlPct: mine.pnlPct,
        akShares: ak.shares,
        akPctHolding: ak.pctHolding,
        ltp: mine.ltp,
        dayChangePct: mine.dayChangePct,
      };
    });

    const grandInvested = myTotalInvested + mfTotalInvested;
    const grandCurrent = myTotalCurrent + mfTotalCurrent;

    // =========================================
    // ANALYTICS ENGINE
    // =========================================

    // --- 1. Stock Allocation ---
    const sortedByValue = [...myHoldings].sort((a, b) => b.currentValue - a.currentValue);
    const stockAllocation = sortedByValue.map((h) => ({
      symbol: h.symbol,
      currentValue: h.currentValue,
      weightPct: myTotalCurrent > 0 ? round2((h.currentValue / myTotalCurrent) * 100) : 0,
    }));

    // --- Asset Allocation (Stocks vs MF categories) ---
    const goldMFs = mfHoldings.filter((m) => /gold/i.test(m.fund));
    const silverMFs = mfHoldings.filter((m) => /silver/i.test(m.fund));
    const equityMFs = mfHoldings.filter((m) => !/gold|silver/i.test(m.fund));

    const goldInvested = goldMFs.reduce((s, m) => s + m.invested, 0);
    const goldCurrent = goldMFs.reduce((s, m) => s + m.currentValue, 0);
    const silverInvested = silverMFs.reduce((s, m) => s + m.invested, 0);
    const silverCurrent = silverMFs.reduce((s, m) => s + m.currentValue, 0);
    const eqMFInvested = equityMFs.reduce((s, m) => s + m.invested, 0);
    const eqMFCurrent = equityMFs.reduce((s, m) => s + m.currentValue, 0);

    const assetAllocation = [
      { category: "Stocks", invested: myTotalInvested, currentValue: myTotalCurrent, pnl: myTotalPnl, pnlPct: myTotalInvested > 0 ? round2((myTotalPnl / myTotalInvested) * 100) : 0, weightPct: grandCurrent > 0 ? round2((myTotalCurrent / grandCurrent) * 100) : 0 },
      { category: "Equity MFs", invested: eqMFInvested, currentValue: eqMFCurrent, pnl: eqMFCurrent - eqMFInvested, pnlPct: eqMFInvested > 0 ? round2(((eqMFCurrent - eqMFInvested) / eqMFInvested) * 100) : 0, weightPct: grandCurrent > 0 ? round2((eqMFCurrent / grandCurrent) * 100) : 0 },
      { category: "Gold", invested: goldInvested, currentValue: goldCurrent, pnl: goldCurrent - goldInvested, pnlPct: goldInvested > 0 ? round2(((goldCurrent - goldInvested) / goldInvested) * 100) : 0, weightPct: grandCurrent > 0 ? round2((goldCurrent / grandCurrent) * 100) : 0 },
      { category: "Silver", invested: silverInvested, currentValue: silverCurrent, pnl: silverCurrent - silverInvested, pnlPct: silverInvested > 0 ? round2(((silverCurrent - silverInvested) / silverInvested) * 100) : 0, weightPct: grandCurrent > 0 ? round2((silverCurrent / grandCurrent) * 100) : 0 },
    ].filter((a) => a.currentValue > 0);

    // --- 2. Treemap data ---
    const treemapData = myHoldings.map((h) => ({
      name: h.symbol,
      size: Math.max(h.currentValue, 1),
      pnlPct: round2(h.pnlPct),
    }));

    // --- 3. P&L Distribution ---
    const pnlBuckets = [
      { min: -Infinity, max: -50, label: "< -50%" },
      { min: -50, max: -25, label: "-50 to -25%" },
      { min: -25, max: -10, label: "-25 to -10%" },
      { min: -10, max: 0, label: "-10 to 0%" },
      { min: 0, max: 10, label: "0 to +10%" },
      { min: 10, max: 25, label: "+10 to +25%" },
      { min: 25, max: 50, label: "+25 to +50%" },
      { min: 50, max: Infinity, label: "> +50%" },
    ];

    const pnlDistribution = pnlBuckets.map((bucket) => {
      const inBucket = myHoldings.filter((h) => h.pnlPct >= bucket.min && h.pnlPct < bucket.max);
      return {
        range: bucket.label,
        count: inBucket.length,
        totalPnl: inBucket.reduce((s, h) => s + h.pnl, 0),
        isPositive: bucket.min >= 0,
      };
    });

    const winners = myHoldings.filter((h) => h.pnlPct > 0);
    const losers = myHoldings.filter((h) => h.pnlPct <= 0);
    const bestStock = sortedByValue.length > 0
      ? [...myHoldings].sort((a, b) => b.pnlPct - a.pnlPct)[0]
      : null;
    const worstStock = sortedByValue.length > 0
      ? [...myHoldings].sort((a, b) => a.pnlPct - b.pnlPct)[0]
      : null;

    const pnlSummary = {
      winners: winners.length,
      losers: losers.length,
      winnersPnl: winners.reduce((s, h) => s + h.pnl, 0),
      losersPnl: losers.reduce((s, h) => s + h.pnl, 0),
      winRate: myHoldings.length > 0 ? round2((winners.length / myHoldings.length) * 100) : 0,
      avgWinPct: winners.length > 0 ? round2(winners.reduce((s, h) => s + h.pnlPct, 0) / winners.length) : 0,
      avgLossPct: losers.length > 0 ? round2(losers.reduce((s, h) => s + h.pnlPct, 0) / losers.length) : 0,
      bestStock: bestStock ? { symbol: bestStock.symbol, pnlPct: round2(bestStock.pnlPct) } : null,
      worstStock: worstStock ? { symbol: worstStock.symbol, pnlPct: round2(worstStock.pnlPct) } : null,
    };

    // --- 4. Risk & Diversification ---
    const weights = stockAllocation.map((s) => s.weightPct);
    const top5Pct = round2(weights.slice(0, 5).reduce((s, w) => s + w, 0));
    const top10Pct = round2(weights.slice(0, 10).reduce((s, w) => s + w, 0));
    const hhi = Math.round(weights.reduce((s, w) => s + w * w, 0));
    const effectivePositions = hhi > 0 ? round2(10000 / hhi) : myHoldings.length;
    const diversificationScore = Math.min(100, Math.round((effectivePositions / Math.max(myHoldings.length, 1)) * 100));
    const riskLevel = hhi < 600 ? "low" : hhi < 1200 ? "moderate" : hhi < 2000 ? "high" : "very_high";

    const risk = {
      top5Pct,
      top10Pct,
      hhi,
      effectivePositions,
      diversificationScore,
      largestPosition: stockAllocation[0] ? { symbol: stockAllocation[0].symbol, weightPct: stockAllocation[0].weightPct } : null,
      riskLevel,
      // Concentration curve for chart
      concentrationCurve: weights.map((_, i) => ({
        position: i + 1,
        cumulativeWeight: round2(weights.slice(0, i + 1).reduce((s, w) => s + w, 0)),
      })),
    };

    // --- 5. You vs AK Radar ---
    const akWeights = akHoldings.map((h) => akTotalValue > 0 ? (h.value / akTotalValue) * 100 : 0);
    const akHHI = akWeights.reduce((s, w) => s + w * w, 0);
    const akEffPos = akHHI > 0 ? 10000 / akHHI : akHoldings.length;
    const akWinners = akHoldings.filter((h) => h.changePct > 0);
    const akAvgDayChange = akHoldings.length > 0
      ? akHoldings.reduce((s, h) => s + h.changePct, 0) / akHoldings.length : 0;
    const myAvgDayChange = myHoldings.length > 0
      ? myHoldings.reduce((s, h) => s + h.dayChangePct, 0) / myHoldings.length : 0;
    const myGreenRatio = myHoldings.length > 0 ? (winners.length / myHoldings.length) * 100 : 0;
    const akGreenRatio = akHoldings.length > 0 ? (akWinners.length / akHoldings.length) * 100 : 0;

    const maxPos = Math.max(effectivePositions, akEffPos, 1);
    const maxStocks = Math.max(myHoldings.length, akHoldings.length, 1);

    const vsAK = [
      { metric: "Diversification", you: round2((effectivePositions / maxPos) * 100), ak: round2((akEffPos / maxPos) * 100) },
      { metric: "Portfolio Size", you: round2((myHoldings.length / maxStocks) * 100), ak: round2((akHoldings.length / maxStocks) * 100) },
      { metric: "Win Rate", you: round2(myGreenRatio), ak: round2(akGreenRatio) },
      { metric: "Day Momentum", you: clamp(50 + myAvgDayChange * 10, 0, 100), ak: clamp(50 + akAvgDayChange * 10, 0, 100) },
      { metric: "Overlap", you: mySymbols.size > 0 ? round2((common.length / mySymbols.size) * 100) : 0, ak: akSymbols.size > 0 ? round2((common.length / akSymbols.size) * 100) : 0 },
      { metric: "Conviction", you: round2(top5Pct), ak: round2(akWeights.slice(0, 5).reduce((s, w) => s + w, 0)) },
    ];

    // --- 6. MF Category Breakdown ---
    const mfCategoryRules: [string, RegExp][] = [
      ["Large Cap", /large\s*cap/i],
      ["Mid Cap", /mid\s*cap/i],
      ["Small Cap", /small\s*cap/i],
      ["Index Fund", /index|nifty\s*50/i],
      ["Infrastructure", /infra/i],
      ["Gold", /gold/i],
      ["Silver", /silver/i],
      ["Thematic / FOF", /fof|bharat/i],
    ];

    const mfCategories: { category: string; funds: number; invested: number; currentValue: number; pnl: number; pnlPct: number; weightPct: number }[] = [];
    const categorized = new Set<string>();

    for (const [cat, regex] of mfCategoryRules) {
      const matched = mfHoldings.filter((m) => regex.test(m.fund) && !categorized.has(m.tradingsymbol));
      if (matched.length === 0) continue;
      matched.forEach((m) => categorized.add(m.tradingsymbol));
      const inv = matched.reduce((s, m) => s + m.invested, 0);
      const cur = matched.reduce((s, m) => s + m.currentValue, 0);
      mfCategories.push({
        category: cat,
        funds: matched.length,
        invested: inv,
        currentValue: cur,
        pnl: cur - inv,
        pnlPct: inv > 0 ? round2(((cur - inv) / inv) * 100) : 0,
        weightPct: mfTotalCurrent > 0 ? round2((cur / mfTotalCurrent) * 100) : 0,
      });
    }

    // Uncategorized
    const uncategorized = mfHoldings.filter((m) => !categorized.has(m.tradingsymbol));
    if (uncategorized.length > 0) {
      const inv = uncategorized.reduce((s, m) => s + m.invested, 0);
      const cur = uncategorized.reduce((s, m) => s + m.currentValue, 0);
      mfCategories.push({
        category: "Other",
        funds: uncategorized.length,
        invested: inv,
        currentValue: cur,
        pnl: cur - inv,
        pnlPct: inv > 0 ? round2(((cur - inv) / inv) * 100) : 0,
        weightPct: mfTotalCurrent > 0 ? round2((cur / mfTotalCurrent) * 100) : 0,
      });
    }

    // --- 7. Recovery Analysis ---
    const recovery = myHoldings
      .filter((h) => h.pnlPct < 0)
      .map((h) => {
        const recoveryPct = h.ltp > 0 ? round2(((h.avgPrice - h.ltp) / h.ltp) * 100) : 0;
        return {
          symbol: h.symbol,
          currentPrice: h.ltp,
          avgPrice: h.avgPrice,
          pnlPct: round2(h.pnlPct),
          recoveryNeededPct: recoveryPct,
          absoluteLoss: Math.abs(h.pnl),
          difficulty: recoveryPct < 20 ? "Easy" : recoveryPct < 50 ? "Moderate" : recoveryPct < 100 ? "Hard" : "Extremely Hard",
        };
      })
      .sort((a, b) => b.recoveryNeededPct - a.recoveryNeededPct);

    // --- 8. Day Change Analysis ---
    const totalDayPnl = myHoldings.reduce((s, h) => s + h.dayPnl, 0);
    const greenCount = myHoldings.filter((h) => h.dayChangePct > 0).length;
    const redCount = myHoldings.filter((h) => h.dayChangePct < 0).length;
    const flatCount = myHoldings.filter((h) => h.dayChangePct === 0).length;

    const dayChange = {
      data: myHoldings.map((h) => ({
        symbol: h.symbol,
        dayChangePct: h.dayChangePct,
        weightPct: myTotalCurrent > 0 ? round2((h.currentValue / myTotalCurrent) * 100) : 0,
        currentValue: h.currentValue,
        dayPnl: h.dayPnl,
      })),
      avgDayChange: round2(myAvgDayChange),
      totalDayPnl,
      greenCount,
      redCount,
      flatCount,
    };

    // --- 9. Insights Engine ---
    const insights: { type: "warning" | "opportunity" | "info"; title: string; description: string }[] = [];

    // Overconcentrated
    const overConcentrated = stockAllocation.filter((s) => s.weightPct > 15);
    overConcentrated.forEach((s) => {
      insights.push({
        type: "warning",
        title: `${s.symbol} is ${s.weightPct}% of your portfolio`,
        description: `Heavy concentration in a single stock. Consider rebalancing if this exceeds your risk tolerance.`,
      });
    });

    // Biggest drag
    if (worstStock && worstStock.pnl < 0) {
      insights.push({
        type: "warning",
        title: `${worstStock.symbol} is your biggest drag`,
        description: `Down ${Math.abs(round2(worstStock.pnlPct))}% with ₹${Math.abs(Math.round(worstStock.pnl)).toLocaleString("en-IN")} loss. Consider if thesis still holds.`,
      });
    }

    // AK overlap + deep loss = potential averaging down
    const deepLossOverlap = overlap.filter((o) => o.myPnlPct < -40);
    deepLossOverlap.forEach((o) => {
      insights.push({
        type: "opportunity",
        title: `${o.symbol}: Down ${Math.abs(round2(o.myPnlPct))}% but AK holds ${o.akPctHolding}%`,
        description: `Ashish Kacholia still holds this with ${o.akPctHolding}% conviction. Could be an averaging-down opportunity if you share the thesis.`,
      });
    });

    // AK high-conviction stocks you don't own
    const akHighConviction = akHoldings
      .filter((h) => h.pctHolding >= 3 && !mySymbols.has(h.symbol))
      .slice(0, 3);
    akHighConviction.forEach((h) => {
      insights.push({
        type: "opportunity",
        title: `You're missing ${h.name} (AK: ${h.pctHolding}%)`,
        description: `Ashish Kacholia has a high-conviction ${h.pctHolding}% holding. Worth researching if it fits your strategy.`,
      });
    });

    // Dead money
    const deadMoney = myHoldings.filter((h) => Math.abs(h.dayChangePct) < 0.5 && h.pnlPct < -30);
    if (deadMoney.length > 0) {
      insights.push({
        type: "warning",
        title: `${deadMoney.length} stock${deadMoney.length > 1 ? "s" : ""} look like dead money`,
        description: `${deadMoney.map((d) => d.symbol).join(", ")} — down 30%+ with minimal daily movement. Capital might be more productive elsewhere.`,
      });
    }

    // Penny stocks
    const pennyStocks = myHoldings.filter((h) => h.ltp < 20);
    if (pennyStocks.length > 0) {
      insights.push({
        type: "warning",
        title: `${pennyStocks.length} penny stock${pennyStocks.length > 1 ? "s" : ""} in portfolio`,
        description: `${pennyStocks.map((p) => `${p.symbol} (₹${p.ltp})`).join(", ")} — low-price stocks carry higher risk of illiquidity and manipulation.`,
      });
    }

    // Gold hedge
    const goldPnl = goldCurrent - goldInvested;
    if (goldPnl > 0 && myTotalPnl < 0) {
      insights.push({
        type: "info",
        title: `Gold hedge is working`,
        description: `Your gold MFs are up ₹${Math.round(goldPnl).toLocaleString("en-IN")} while stocks are down. Diversification paying off.`,
      });
    }

    // MF vs Stocks comparison
    const mfPnlPct = mfTotalInvested > 0 ? ((mfTotalCurrent - mfTotalInvested) / mfTotalInvested) * 100 : 0;
    const stockPnlPct = myTotalInvested > 0 ? (myTotalPnl / myTotalInvested) * 100 : 0;
    if (Math.abs(mfPnlPct - stockPnlPct) > 5) {
      const better = mfPnlPct > stockPnlPct ? "Mutual funds" : "Direct stocks";
      insights.push({
        type: "info",
        title: `${better} outperforming by ${Math.abs(round2(mfPnlPct - stockPnlPct))}%`,
        description: `Stocks: ${round2(stockPnlPct)}% | MFs: ${round2(mfPnlPct)}%. ${mfPnlPct > stockPnlPct ? "Professional fund managers ahead here." : "Your stock picks are beating the funds."}`,
      });
    }

    // --- 10. Portfolio Health Score ---
    const divScore = Math.min(25, Math.round((diversificationScore / 100) * 25));
    const pnlScore = Math.min(25, Math.max(0, Math.round(((round2((myTotalPnl / Math.max(myTotalInvested, 1)) * 100) + 50) / 100) * 25)));
    const winRateScore = Math.min(25, Math.round((pnlSummary.winRate / 100) * 25));
    const momentumScore = Math.min(25, Math.max(0, Math.round(((myAvgDayChange + 3) / 6) * 25)));
    const totalHealthScore = divScore + pnlScore + winRateScore + momentumScore;

    const grade = totalHealthScore >= 85 ? "A+" : totalHealthScore >= 75 ? "A" : totalHealthScore >= 60 ? "B" : totalHealthScore >= 45 ? "C" : totalHealthScore >= 30 ? "D" : "F";

    const healthScore = {
      score: totalHealthScore,
      grade,
      breakdown: {
        diversification: { score: divScore, max: 25, label: "Diversification" },
        pnl: { score: pnlScore, max: 25, label: "Returns" },
        winRate: { score: winRateScore, max: 25, label: "Win Rate" },
        momentum: { score: momentumScore, max: 25, label: "Momentum" },
      },
    };

    // =========================================
    // RESPONSE
    // =========================================
    return NextResponse.json({
      user: sourceData.user,
      syncedAt: sourceData.synced_at,
      my: {
        holdings: myHoldings,
        totalInvested: myTotalInvested,
        totalCurrent: myTotalCurrent,
        totalPnl: myTotalPnl,
        totalPnlPct: myTotalInvested > 0 ? round2((myTotalPnl / myTotalInvested) * 100) : 0,
        count: myHoldings.length,
      },
      mf: {
        holdings: mfHoldings,
        totalInvested: mfTotalInvested,
        totalCurrent: mfTotalCurrent,
        totalPnl: mfTotalCurrent - mfTotalInvested,
        totalPnlPct: mfTotalInvested > 0 ? round2(((mfTotalCurrent - mfTotalInvested) / mfTotalInvested) * 100) : 0,
        count: mfHoldings.length,
      },
      grand: {
        totalInvested: grandInvested,
        totalCurrent: grandCurrent,
        totalPnl: grandCurrent - grandInvested,
        totalPnlPct: grandInvested > 0 ? round2(((grandCurrent - grandInvested) / grandInvested) * 100) : 0,
      },
      ak: {
        holdings: akHoldings,
        totalValue: akTotalValue,
        count: akHoldings.length,
      },
      comparison: {
        overlap,
        onlyMine,
        onlyAK,
        overlapCount: common.length,
        similarityPct: mySymbols.size > 0 ? Math.round((common.length / mySymbols.size) * 100) : 0,
      },
      analytics: {
        stockAllocation,
        assetAllocation,
        treemapData,
        pnlDistribution,
        pnlSummary,
        risk,
        vsAK,
        mfCategories,
        recovery,
        dayChange,
        insights,
        healthScore,
      },
    });
  } catch (error) {
    console.error("[API] My portfolio error:", error);
    return NextResponse.json({ error: "Failed to fetch portfolio" }, { status: 500 });
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function clamp(n: number, min: number, max: number): number {
  return Math.round(Math.min(max, Math.max(min, n)) * 100) / 100;
}
