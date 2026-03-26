"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import type { ConvictionScore } from "@/types";

const MATURITY_COLORS = {
  New: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  Established: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  "Long-term": "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
  Veteran: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
};

function getScoreLabel(score: number): { label: string; color: string } {
  if (score >= 70) return { label: "Very High Conviction", color: "text-green-600" };
  if (score >= 50) return { label: "High Conviction", color: "text-green-600" };
  if (score >= 30) return { label: "Moderate Conviction", color: "text-amber-600" };
  if (score >= 15) return { label: "Low Conviction", color: "text-orange-600" };
  return { label: "Exploratory", color: "text-muted-foreground" };
}

function getInsight(c: ConvictionScore): string {
  const parts: string[] = [];

  // Position size insight
  if (c.currentWeight >= 5) parts.push(`One of his biggest bets at ${c.currentWeight}% of portfolio`);
  else if (c.currentWeight >= 2) parts.push(`Meaningful position at ${c.currentWeight}% of portfolio`);
  else parts.push(`Small position at ${c.currentWeight}% of portfolio`);

  // Holding period
  if (c.quartersHeld >= 12) parts.push(`held for ${c.quartersHeld} quarters — long-term bet`);
  else if (c.quartersHeld >= 4) parts.push(`held for ${c.quartersHeld} quarters`);
  else parts.push(`recent entry (${c.quartersHeld}Q ago)`);

  // Add-on deals
  const adds = c.breakdown.addOnDeals / 4; // each add = 4 pts
  if (adds >= 3) parts.push(`added ${Math.round(adds)} times (building position)`);
  else if (adds >= 1) parts.push(`added ${Math.round(adds)} time(s) after entry`);

  // Averaged down
  if (c.breakdown.averagedDown > 0) parts.push("bought more at lower prices (averaged down)");

  return parts.join(". ") + ".";
}

export function ConvictionSignals({ conviction }: { conviction: ConvictionScore[] }) {
  if (!conviction || conviction.length === 0) {
    return (
      <Card>
        <CardHeader><CardTitle className="text-lg">Conviction Signals</CardTitle></CardHeader>
        <CardContent><p className="text-sm text-muted-foreground">No data yet.</p></CardContent>
      </Card>
    );
  }

  const top3 = conviction.slice(0, 3);
  const rest = conviction.slice(3, 20);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-lg">Conviction Signals</CardTitle>
        <p className="text-xs text-muted-foreground">
          How convinced is Kacholia in each stock? Score based on: how much he owns (position size),
          how many times he bought more (add-ons), how long he&apos;s held (duration),
          whether he bought dips (averaged down), and recent activity.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* What the score means */}
        <div className="flex flex-wrap gap-3 text-[10px] border-b pb-3">
          <span><span className="font-bold text-green-600">70-100</span> = Very High Conviction</span>
          <span><span className="font-bold text-green-600">50-69</span> = High</span>
          <span><span className="font-bold text-amber-600">30-49</span> = Moderate</span>
          <span><span className="font-bold text-orange-600">15-29</span> = Low</span>
          <span><span className="font-bold text-muted-foreground">0-14</span> = Exploratory</span>
        </div>

        {/* Top 3 hero cards */}
        <div className="grid gap-3 sm:grid-cols-3">
          {top3.map((c) => {
            const scoreInfo = getScoreLabel(c.score);
            return (
              <Link key={c.symbol} href={`/stock/${c.symbol}`} className="block">
                <div className="rounded-lg border p-3 space-y-2 hover:bg-accent/50 transition-colors">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="font-bold text-sm text-primary">{c.symbol}</span>
                      <p className="text-[10px] text-muted-foreground truncate">{c.name}</p>
                    </div>
                    <div className="text-right">
                      <span className={`text-2xl font-bold ${scoreInfo.color}`}>{c.score}</span>
                      <p className={`text-[9px] ${scoreInfo.color}`}>{scoreInfo.label}</p>
                    </div>
                  </div>
                  <div className="flex gap-1 flex-wrap">
                    <Badge className={`${MATURITY_COLORS[c.maturity]} text-[9px]`}>{c.maturity}</Badge>
                    <Badge variant="outline" className="text-[9px]">{c.currentWeight}% of portfolio</Badge>
                    <Badge variant="outline" className="text-[9px]">{c.quartersHeld}Q held</Badge>
                  </div>
                  <p className="text-[10px] text-muted-foreground leading-relaxed">{getInsight(c)}</p>
                </div>
              </Link>
            );
          })}
        </div>

        {/* All stocks table */}
        <div className="space-y-1">
          <h4 className="text-xs font-medium text-muted-foreground">All Stocks by Conviction</h4>
          {rest.map((c, i) => {
            const scoreInfo = getScoreLabel(c.score);
            return (
              <Link key={c.symbol} href={`/stock/${c.symbol}`} className="block">
                <div className="flex items-center gap-2 rounded px-2 py-1.5 hover:bg-accent/50 text-xs">
                  <span className="w-5 text-muted-foreground text-right">{i + 4}</span>
                  <span className={`w-7 font-bold ${scoreInfo.color}`}>{c.score}</span>
                  <span className="font-medium w-24 truncate text-primary">{c.symbol}</span>
                  <Badge className={`${MATURITY_COLORS[c.maturity]} text-[9px]`}>{c.maturity}</Badge>
                  <span className="flex-1 text-[10px] text-muted-foreground truncate">{getInsight(c)}</span>
                  <span className="text-muted-foreground w-12 text-right">{c.currentWeight}%</span>
                </div>
              </Link>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
