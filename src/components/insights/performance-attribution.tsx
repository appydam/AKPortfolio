"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import type { Attribution } from "@/types";

export function PerformanceAttribution({
  topContributors, bottomDetractors,
}: {
  topContributors: Attribution[];
  bottomDetractors: Attribution[];
}) {
  if (topContributors.length === 0 && bottomDetractors.length === 0) {
    return (
      <Card>
        <CardHeader><CardTitle className="text-lg">Performance Attribution</CardTitle></CardHeader>
        <CardContent><p className="text-sm text-muted-foreground">Need at least 2 portfolio snapshots. Data will appear after daily snapshots run.</p></CardContent>
      </Card>
    );
  }

  const contribData = topContributors.map(a => ({
    name: a.symbol,
    value: a.contribution / 1e7, // Convert to Cr
    pct: a.contributionPct,
    priceChange: a.priceChangePct,
    weight: a.weight,
  }));

  const detractData = bottomDetractors.map(a => ({
    name: a.symbol,
    value: a.contribution / 1e7,
    pct: a.contributionPct,
    priceChange: a.priceChangePct,
    weight: a.weight,
  }));

  const CustomTooltip = ({ active, payload }: { active?: boolean; payload?: Array<{ payload: Record<string, number | string> }> }) => {
    if (!active || !payload?.[0]) return null;
    const d = payload[0].payload;
    return (
      <div className="rounded-md border bg-background p-2 shadow-md text-xs space-y-0.5">
        <p className="font-semibold">{d.name}</p>
        <p>Value change: {(d.value as number) > 0 ? "+" : ""}{(d.value as number).toFixed(2)} Cr</p>
        <p>Price change: {(d.priceChange as number) > 0 ? "+" : ""}{d.priceChange}%</p>
        <p>Portfolio weight: {d.weight}%</p>
      </div>
    );
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-lg">Performance Attribution (Snapshot to Snapshot)</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid gap-6 md:grid-cols-2">
          {/* Contributors */}
          <div>
            <h4 className="text-sm font-medium text-green-600 mb-2">Driving Returns</h4>
            {contribData.length > 0 ? (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={contribData} layout="vertical" margin={{ left: 60, right: 10 }}>
                  <XAxis type="number" tickFormatter={(v) => `${v.toFixed(1)} Cr`} fontSize={10} />
                  <YAxis type="category" dataKey="name" fontSize={11} width={55} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                    {contribData.map((_, i) => <Cell key={i} fill="#22c55e" />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : <p className="text-xs text-muted-foreground">No data</p>}
          </div>

          {/* Detractors */}
          <div>
            <h4 className="text-sm font-medium text-red-600 mb-2">Dragging Returns</h4>
            {detractData.length > 0 ? (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={detractData} layout="vertical" margin={{ left: 60, right: 10 }}>
                  <XAxis type="number" tickFormatter={(v) => `${v.toFixed(1)} Cr`} fontSize={10} />
                  <YAxis type="category" dataKey="name" fontSize={11} width={55} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="value" radius={[4, 0, 0, 4]}>
                    {detractData.map((_, i) => <Cell key={i} fill="#ef4444" />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : <p className="text-xs text-muted-foreground">No data</p>}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
