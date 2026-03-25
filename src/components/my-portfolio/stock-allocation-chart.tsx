"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { PieChart as PieIcon } from "lucide-react";

const COLORS = ["#2563eb","#16a34a","#dc2626","#ca8a04","#9333ea","#0891b2","#e11d48","#65a30d","#7c3aed","#d97706","#0f766e","#be123c"];
const ASSET_COLORS = ["#2563eb", "#16a34a", "#ca8a04", "#94a3b8"];

interface StockAllocation {
  symbol: string;
  currentValue: number;
  weightPct: number;
}

interface AssetAllocation {
  category: string;
  invested: number;
  currentValue: number;
  pnl: number;
  pnlPct: number;
  weightPct: number;
}

interface Props {
  stockAllocation: StockAllocation[];
  assetAllocation: AssetAllocation[];
}

function fmt(v: number) {
  if (v >= 100000) return `₹${(v / 100000).toFixed(1)}L`;
  return `₹${v.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

export function StockAllocationChart({ stockAllocation, assetAllocation }: Props) {
  // Group small positions into "Others"
  const threshold = 3;
  const main = stockAllocation.filter((s) => s.weightPct >= threshold);
  const others = stockAllocation.filter((s) => s.weightPct < threshold);
  const othersValue = others.reduce((s, h) => s + h.currentValue, 0);
  const othersWeight = others.reduce((s, h) => s + h.weightPct, 0);

  const pieData = [
    ...main.map((s) => ({ name: s.symbol, value: s.currentValue, weight: s.weightPct })),
    ...(others.length > 0 ? [{ name: `Others (${others.length})`, value: othersValue, weight: Math.round(othersWeight * 100) / 100 }] : []),
  ];

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {/* Stock allocation donut */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium flex items-center gap-1.5">
            <PieIcon className="h-4 w-4" />
            Stock Allocation
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={280}>
            <PieChart>
              <Pie
                data={pieData}
                cx="50%"
                cy="50%"
                innerRadius={65}
                outerRadius={105}
                dataKey="value"
                paddingAngle={2}
              >
                {pieData.map((_, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip
                formatter={(value, name) => [fmt(Number(value)), String(name)]}
                contentStyle={{ fontSize: 12 }}
              />
              <Legend
                iconType="circle"
                iconSize={8}
                formatter={(value, entry) => (
                  <span style={{ fontSize: 11 }}>
                    {value} <span style={{ color: "#94a3b8" }}>({(entry.payload as { weight: number }).weight}%)</span>
                  </span>
                )}
              />
            </PieChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Asset class allocation donut */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium flex items-center gap-1.5">
            <PieIcon className="h-4 w-4" />
            Asset Class Allocation
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={280}>
            <PieChart>
              <Pie
                data={assetAllocation.map((a) => ({ name: a.category, value: a.currentValue, pnlPct: a.pnlPct, weight: a.weightPct }))}
                cx="50%"
                cy="50%"
                innerRadius={65}
                outerRadius={105}
                dataKey="value"
                paddingAngle={2}
              >
                {assetAllocation.map((_, i) => (
                  <Cell key={i} fill={ASSET_COLORS[i % ASSET_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip
                formatter={(value, name) => [fmt(Number(value)), String(name)]}
                contentStyle={{ fontSize: 12 }}
              />
              <Legend
                iconType="circle"
                iconSize={8}
                formatter={(value, entry) => {
                  const p = entry.payload as { pnlPct: number; weight: number };
                  const pct = p.pnlPct ?? 0;
                  return (
                    <span style={{ fontSize: 11 }}>
                      {value}{" "}
                      <span style={{ color: pct >= 0 ? "#16a34a" : "#dc2626" }}>
                        ({pct >= 0 ? "+" : ""}{pct}%)
                      </span>
                    </span>
                  );
                }}
              />
            </PieChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}
