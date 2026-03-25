"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { DealPattern } from "@/types";

const PATTERN_CONFIG: Record<DealPattern["pattern"], { label: string; color: string; icon: string }> = {
  averaging_down: { label: "Averaging Down", color: "bg-blue-100 text-blue-800", icon: "v" },
  trimming_into_strength: { label: "Trimming", color: "bg-amber-100 text-amber-800", icon: "^" },
  accumulation: { label: "Accumulating", color: "bg-green-100 text-green-800", icon: "+" },
  distribution: { label: "Distributing", color: "bg-red-100 text-red-800", icon: "-" },
  one_time_buy: { label: "Single Buy", color: "bg-gray-100 text-gray-800", icon: "1" },
  mixed: { label: "Mixed", color: "bg-purple-100 text-purple-800", icon: "~" },
};

export function DealPatternsCard({ patterns }: { patterns: DealPattern[] }) {
  if (!patterns || patterns.length === 0) {
    return (
      <Card>
        <CardHeader><CardTitle className="text-lg">Deal Patterns</CardTitle></CardHeader>
        <CardContent><p className="text-sm text-muted-foreground">No deal data yet.</p></CardContent>
      </Card>
    );
  }

  // Group by pattern type
  const grouped = new Map<DealPattern["pattern"], DealPattern[]>();
  for (const p of patterns) {
    if (!grouped.has(p.pattern)) grouped.set(p.pattern, []);
    grouped.get(p.pattern)!.push(p);
  }

  // Sort by most interesting patterns first
  const order: DealPattern["pattern"][] = ["accumulation", "averaging_down", "trimming_into_strength", "distribution", "one_time_buy", "mixed"];
  const sortedGroups = order.filter(p => grouped.has(p)).map(p => ({
    pattern: p,
    stocks: grouped.get(p)!,
  }));

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-lg">Deal Patterns</CardTitle>
        <p className="text-xs text-muted-foreground">Behavioral patterns detected from deal history</p>
      </CardHeader>
      <CardContent className="space-y-3">
        {sortedGroups.map(({ pattern, stocks }) => {
          const config = PATTERN_CONFIG[pattern];
          return (
            <div key={pattern} className="space-y-1">
              <div className="flex items-center gap-2">
                <Badge className={`${config.color} text-xs`}>{config.label}</Badge>
                <span className="text-xs text-muted-foreground">{stocks.length} stocks</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {stocks.slice(0, 8).map(s => (
                  <div key={s.symbol} className="rounded border px-2 py-0.5 text-xs">
                    <span className="font-medium">{s.symbol}</span>
                    <span className="text-muted-foreground ml-1">({s.dealCount})</span>
                  </div>
                ))}
                {stocks.length > 8 && (
                  <span className="text-xs text-muted-foreground self-center">+{stocks.length - 8} more</span>
                )}
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
