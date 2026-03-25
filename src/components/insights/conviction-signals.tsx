"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { ConvictionScore } from "@/types";

const MATURITY_COLORS = {
  New: "bg-blue-100 text-blue-800",
  Established: "bg-green-100 text-green-800",
  "Long-term": "bg-purple-100 text-purple-800",
  Veteran: "bg-amber-100 text-amber-800",
};

const SCORE_COLORS = [
  { key: "positionSize", label: "Size", color: "bg-blue-500" },
  { key: "addOnDeals", label: "Adds", color: "bg-green-500" },
  { key: "holdingPeriod", label: "Duration", color: "bg-purple-500" },
  { key: "averagedDown", label: "Avg Down", color: "bg-amber-500" },
  { key: "dealFrequency", label: "Activity", color: "bg-rose-500" },
];

function ScoreBar({ breakdown, score }: { breakdown: ConvictionScore["breakdown"]; score: number }) {
  return (
    <div className="space-y-1">
      <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-muted">
        {SCORE_COLORS.map(({ key, color }) => {
          const val = breakdown[key as keyof typeof breakdown] || 0;
          return <div key={key} className={`${color} transition-all`} style={{ width: `${val}%` }} />;
        })}
      </div>
      <div className="flex justify-between text-[10px] text-muted-foreground">
        {SCORE_COLORS.map(({ key, label }) => (
          <span key={key}>{label}: {Math.round(breakdown[key as keyof typeof breakdown])}</span>
        ))}
      </div>
    </div>
  );
}

function scoreColor(score: number): string {
  if (score >= 70) return "text-green-600";
  if (score >= 40) return "text-amber-600";
  return "text-muted-foreground";
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
  const rest = conviction.slice(3, 15);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-lg">Conviction Signals</CardTitle>
        <p className="text-xs text-muted-foreground">Score based on position size, add-on buys, holding period, averaging down, deal frequency</p>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Top 3 hero cards */}
        <div className="grid gap-3 sm:grid-cols-3">
          {top3.map((c, i) => (
            <div key={c.symbol} className="rounded-lg border p-3 space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <span className="font-semibold text-sm">{c.symbol}</span>
                  <span className="ml-1.5 text-xs text-muted-foreground">{c.name.substring(0, 20)}</span>
                </div>
                <span className={`text-2xl font-bold ${scoreColor(c.score)}`}>{c.score}</span>
              </div>
              <div className="flex gap-1.5">
                <Badge className={`${MATURITY_COLORS[c.maturity]} text-[10px]`}>{c.maturity}</Badge>
                <Badge variant="outline" className="text-[10px]">{c.currentWeight.toFixed(1)}% wt</Badge>
                <Badge variant="outline" className="text-[10px]">{c.quartersHeld}Q held</Badge>
              </div>
              <ScoreBar breakdown={c.breakdown} score={c.score} />
            </div>
          ))}
        </div>

        {/* Ranked list */}
        {rest.length > 0 && (
          <div className="space-y-1">
            {rest.map((c, i) => (
              <div key={c.symbol} className="flex items-center gap-3 rounded px-2 py-1.5 hover:bg-accent">
                <span className="w-5 text-xs text-muted-foreground text-right">{i + 4}</span>
                <span className={`w-8 font-bold text-sm ${scoreColor(c.score)}`}>{c.score}</span>
                <span className="font-medium text-sm w-24 truncate">{c.symbol}</span>
                <Badge className={`${MATURITY_COLORS[c.maturity]} text-[10px]`}>{c.maturity}</Badge>
                <div className="flex-1">
                  <div className="flex h-1.5 overflow-hidden rounded-full bg-muted">
                    {SCORE_COLORS.map(({ key, color }) => (
                      <div key={key} className={color} style={{ width: `${c.breakdown[key as keyof typeof c.breakdown]}%` }} />
                    ))}
                  </div>
                </div>
                <span className="text-xs text-muted-foreground w-14 text-right">{c.currentWeight.toFixed(1)}%</span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
