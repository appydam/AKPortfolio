"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { Landmark } from "lucide-react";

const COLORS = ["#2563eb","#16a34a","#ca8a04","#9333ea","#0891b2","#e11d48","#65a30d","#d97706","#94a3b8"];

interface MFCategory {
  category: string;
  funds: number;
  invested: number;
  currentValue: number;
  pnl: number;
  pnlPct: number;
  weightPct: number;
}

function fmt(v: number) {
  const abs = Math.abs(v);
  return abs >= 100000
    ? `₹${(abs / 100000).toFixed(1)}L`
    : `₹${abs.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

export function MFBreakdown({ categories }: { categories: MFCategory[] }) {
  if (categories.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium flex items-center gap-1.5">
          <Landmark className="h-4 w-4" />
          Mutual Fund Category Breakdown
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
          <ResponsiveContainer width="100%" height={210}>
            <PieChart>
              <Pie
                data={categories.map((c) => ({ name: c.category, value: c.currentValue }))}
                cx="50%"
                cy="50%"
                innerRadius={50}
                outerRadius={82}
                dataKey="value"
                paddingAngle={2}
              >
                {categories.map((_, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip formatter={(v) => [fmt(Number(v)), ""]} contentStyle={{ fontSize: 12 }} />
              <Legend iconType="circle" iconSize={8} formatter={(value) => <span style={{ fontSize: 11 }}>{value}</span>} />
            </PieChart>
          </ResponsiveContainer>

          <div className="lg:flex-1 overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b text-muted-foreground">
                  <th className="text-left pb-2 font-medium">Category</th>
                  <th className="text-right pb-2 font-medium">Invested</th>
                  <th className="text-right pb-2 font-medium">Current</th>
                  <th className="text-right pb-2 font-medium">P&L %</th>
                  <th className="text-right pb-2 font-medium">Weight</th>
                </tr>
              </thead>
              <tbody>
                {categories.map((cat, i) => (
                  <tr key={cat.category} className="border-b last:border-0">
                    <td className="py-2 flex items-center gap-1.5">
                      <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                      {cat.category}
                    </td>
                    <td className="py-2 text-right font-mono">{fmt(cat.invested)}</td>
                    <td className="py-2 text-right font-mono">{fmt(cat.currentValue)}</td>
                    <td className="py-2 text-right">
                      <Badge className={cat.pnlPct >= 0 ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"} style={{ fontSize: 10 }}>
                        {cat.pnlPct >= 0 ? "+" : ""}{cat.pnlPct}%
                      </Badge>
                    </td>
                    <td className="py-2 text-right text-muted-foreground">{cat.weightPct}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
