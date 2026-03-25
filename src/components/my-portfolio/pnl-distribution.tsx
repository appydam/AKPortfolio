"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell, ResponsiveContainer } from "recharts";
import { BarChart3 } from "lucide-react";

interface PnlDistEntry {
  range: string;
  count: number;
  totalPnl: number;
  isPositive: boolean;
}

interface PnlSummary {
  winners: number;
  losers: number;
  winnersPnl: number;
  losersPnl: number;
  winRate: number;
  avgWinPct: number;
  avgLossPct: number;
  bestStock: { symbol: string; pnlPct: number } | null;
  worstStock: { symbol: string; pnlPct: number } | null;
}

interface Props {
  distribution: PnlDistEntry[];
  summary: PnlSummary;
}

function fmt(v: number) {
  const abs = Math.abs(v);
  const str = abs >= 100000 ? `₹${(abs / 100000).toFixed(1)}L` : `₹${abs.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
  return v < 0 ? `-${str}` : `+${str}`;
}

export function PnlDistribution({ distribution, summary }: Props) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium flex items-center gap-1.5">
          <BarChart3 className="h-4 w-4" />
          P&L Distribution — Winners vs Losers
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Stats row */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-lg border p-3 text-center">
            <div className="text-xl font-bold text-green-600">{summary.winners}</div>
            <div className="text-xs text-muted-foreground">Winners</div>
          </div>
          <div className="rounded-lg border p-3 text-center">
            <div className="text-xl font-bold text-red-600">{summary.losers}</div>
            <div className="text-xs text-muted-foreground">Losers</div>
          </div>
          <div className="rounded-lg border p-3 text-center">
            <div className="text-xl font-bold">{summary.winRate}%</div>
            <div className="text-xs text-muted-foreground">Win Rate</div>
          </div>
          <div className="rounded-lg border p-3 text-center">
            <div className={`text-xl font-bold ${summary.winnersPnl + summary.losersPnl >= 0 ? "text-green-600" : "text-red-600"}`}>
              {fmt(summary.winnersPnl + summary.losersPnl)}
            </div>
            <div className="text-xs text-muted-foreground">Net P&L</div>
          </div>
        </div>

        {/* Histogram */}
        <ResponsiveContainer width="100%" height={150}>
          <BarChart data={distribution} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="range" tick={{ fontSize: 10 }} />
            <YAxis allowDecimals={false} tick={{ fontSize: 11 }} width={24} />
            <Tooltip
              formatter={(value) => [`${Number(value)} stock${Number(value) !== 1 ? "s" : ""}`, "Count"]}
              contentStyle={{ fontSize: 12 }}
            />
            <Bar dataKey="count" radius={[4, 4, 0, 0]}>
              {distribution.map((entry, i) => (
                <Cell key={i} fill={entry.isPositive ? "#16a34a" : "#dc2626"} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>

        {/* Best / Worst */}
        <div className="flex gap-3 flex-wrap">
          {summary.bestStock && (
            <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-3 py-2">
              <span className="text-xs text-muted-foreground">Best:</span>
              <span className="text-sm font-semibold">{summary.bestStock.symbol}</span>
              <Badge className="bg-green-100 text-green-800 text-xs">
                +{summary.bestStock.pnlPct}%
              </Badge>
            </div>
          )}
          {summary.worstStock && (
            <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2">
              <span className="text-xs text-muted-foreground">Worst:</span>
              <span className="text-sm font-semibold">{summary.worstStock.symbol}</span>
              <Badge className="bg-red-100 text-red-800 text-xs">
                {summary.worstStock.pnlPct}%
              </Badge>
            </div>
          )}
          <div className="flex items-center gap-2 rounded-lg border px-3 py-2">
            <span className="text-xs text-muted-foreground">Avg win:</span>
            <span className="text-sm font-semibold text-green-600">+{summary.avgWinPct}%</span>
            <span className="text-xs text-muted-foreground">Avg loss:</span>
            <span className="text-sm font-semibold text-red-600">{summary.avgLossPct}%</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
