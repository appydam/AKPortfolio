"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from "recharts";
import type { SectorRotation } from "@/types";

const COLORS = [
  "#3b82f6", "#22c55e", "#f59e0b", "#ef4444", "#8b5cf6",
  "#ec4899", "#06b6d4", "#84cc16", "#f97316", "#6366f1",
  "#14b8a6", "#e11d48", "#a855f7", "#64748b",
];

export function SectorRotationChart({ sectorRotation }: { sectorRotation: SectorRotation[] }) {
  if (!sectorRotation || sectorRotation.length === 0) {
    return (
      <Card>
        <CardHeader><CardTitle className="text-lg">Sector Rotation</CardTitle></CardHeader>
        <CardContent><p className="text-sm text-muted-foreground">Need multiple quarters of data to show rotation.</p></CardContent>
      </Card>
    );
  }

  // Collect all unique sectors across quarters
  const allSectors = new Set<string>();
  for (const q of sectorRotation) {
    for (const s of q.sectors) allSectors.add(s.sector);
  }
  const sectors = [...allSectors].slice(0, 12); // limit to 12 sectors for readability

  // Build chart data: one row per quarter, one key per sector
  const chartData = sectorRotation.map(q => {
    const row: Record<string, string | number> = { quarter: q.quarter };
    for (const sector of sectors) {
      const found = q.sectors.find(s => s.sector === sector);
      row[sector] = found?.weight || 0;
    }
    return row;
  });

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-lg">Sector Rotation Over Time</CardTitle>
        <p className="text-xs text-muted-foreground">Portfolio allocation by sector across quarters</p>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={350}>
          <AreaChart data={chartData} margin={{ top: 5, right: 10, bottom: 5, left: 10 }}>
            <XAxis dataKey="quarter" fontSize={10} />
            <YAxis tickFormatter={(v) => `${v}%`} fontSize={10} />
            <Tooltip
              formatter={(value, name) => [`${Number(value).toFixed(1)}%`, name]}
              contentStyle={{ fontSize: 11 }}
            />
            <Legend wrapperStyle={{ fontSize: 10 }} />
            {sectors.map((sector, i) => (
              <Area
                key={sector}
                type="monotone"
                dataKey={sector}
                stackId="1"
                fill={COLORS[i % COLORS.length]}
                stroke={COLORS[i % COLORS.length]}
                fillOpacity={0.7}
              />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
