"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell, ResponsiveContainer, LabelList } from "recharts";
import { TrendingDown } from "lucide-react";

interface RecoveryEntry {
  symbol: string;
  currentPrice: number;
  avgPrice: number;
  pnlPct: number;
  recoveryNeededPct: number;
  absoluteLoss: number;
  difficulty: string;
}

const difficultyColor: Record<string, string> = {
  "Easy": "#16a34a",
  "Moderate": "#ca8a04",
  "Hard": "#ea580c",
  "Extremely Hard": "#dc2626",
};

const difficultyBadge: Record<string, string> = {
  "Easy": "bg-green-100 text-green-800",
  "Moderate": "bg-yellow-100 text-yellow-800",
  "Hard": "bg-orange-100 text-orange-800",
  "Extremely Hard": "bg-red-100 text-red-800",
};

function fmt(v: number) {
  return v >= 100000 ? `₹${(v / 100000).toFixed(1)}L` : `₹${v.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

export function RecoveryAnalysis({ data }: { data: RecoveryEntry[] }) {
  if (data.length === 0) return null;

  const chartData = data.slice(0, 15).map((d) => ({
    symbol: d.symbol,
    recovery: d.recoveryNeededPct,
    fill: difficultyColor[d.difficulty] || "#94a3b8",
  }));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium flex items-center gap-1.5">
          <TrendingDown className="h-4 w-4 text-red-500" />
          Recovery Needed to Break Even
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Legend */}
        <div className="flex gap-3 text-xs flex-wrap">
          {Object.entries(difficultyBadge).map(([label, cls]) => (
            <Badge key={label} className={`${cls} font-normal`}>{label}</Badge>
          ))}
        </div>

        <ResponsiveContainer width="100%" height={Math.max(200, data.slice(0, 15).length * 28)}>
          <BarChart data={chartData} layout="vertical" margin={{ top: 0, right: 60, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" horizontal={false} />
            <XAxis type="number" tick={{ fontSize: 10 }} unit="%" />
            <YAxis type="category" dataKey="symbol" width={80} tick={{ fontSize: 11 }} />
            <Tooltip
              formatter={(v) => [`${Number(v).toFixed(1)}% rise needed`, "Recovery"]}
              contentStyle={{ fontSize: 12 }}
            />
            <Bar dataKey="recovery" radius={[0, 4, 4, 0]}>
              {chartData.map((entry, i) => (
                <Cell key={i} fill={entry.fill} />
              ))}
              <LabelList
                dataKey="recovery"
                position="right"
                formatter={(v) => `${Number(v).toFixed(0)}%`}
                style={{ fontSize: 10, fill: "#64748b" }}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>

        {/* Summary table for absolute losses */}
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b text-muted-foreground">
                <th className="text-left pb-2 font-medium">Stock</th>
                <th className="text-right pb-2 font-medium">Avg Buy</th>
                <th className="text-right pb-2 font-medium">CMP</th>
                <th className="text-right pb-2 font-medium">Loss</th>
                <th className="text-right pb-2 font-medium">P&L%</th>
                <th className="text-right pb-2 font-medium">Recovery</th>
                <th className="text-right pb-2 font-medium">Difficulty</th>
              </tr>
            </thead>
            <tbody>
              {data.slice(0, 12).map((d) => (
                <tr key={d.symbol} className="border-b last:border-0">
                  <td className="py-1.5 font-medium">{d.symbol}</td>
                  <td className="py-1.5 text-right font-mono">₹{d.avgPrice.toLocaleString("en-IN")}</td>
                  <td className="py-1.5 text-right font-mono">₹{d.currentPrice.toLocaleString("en-IN")}</td>
                  <td className="py-1.5 text-right font-mono text-red-600">-{fmt(d.absoluteLoss)}</td>
                  <td className="py-1.5 text-right font-mono text-red-600">{d.pnlPct}%</td>
                  <td className="py-1.5 text-right font-mono">+{d.recoveryNeededPct}%</td>
                  <td className="py-1.5 text-right">
                    <Badge className={`${difficultyBadge[d.difficulty]} text-[10px]`}>{d.difficulty}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
