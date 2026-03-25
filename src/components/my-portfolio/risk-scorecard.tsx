"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { ShieldAlert } from "lucide-react";

interface RiskData {
  top5Pct: number;
  top10Pct: number;
  hhi: number;
  effectivePositions: number;
  diversificationScore: number;
  largestPosition: { symbol: string; weightPct: number } | null;
  riskLevel: string;
  concentrationCurve: { position: number; cumulativeWeight: number }[];
}

const riskColors: Record<string, string> = {
  low: "bg-green-100 text-green-800",
  moderate: "bg-yellow-100 text-yellow-800",
  high: "bg-orange-100 text-orange-800",
  very_high: "bg-red-100 text-red-800",
};

export function RiskScorecard({ data }: { data: RiskData }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium flex items-center gap-1.5">
          <ShieldAlert className="h-4 w-4" />
          Risk & Diversification
          <Badge className={riskColors[data.riskLevel] || ""}>
            {data.riskLevel.replace("_", " ").toUpperCase()}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Metric cards */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-lg border p-3">
            <div className="text-xl font-bold">{data.top5Pct}%</div>
            <div className="text-xs text-muted-foreground">Top 5 Concentration</div>
          </div>
          <div className="rounded-lg border p-3">
            <div className="text-xl font-bold">{data.top10Pct}%</div>
            <div className="text-xs text-muted-foreground">Top 10 Concentration</div>
          </div>
          <div className="rounded-lg border p-3">
            <div className="text-xl font-bold">{data.hhi}</div>
            <div className="text-xs text-muted-foreground">HHI Index</div>
          </div>
          <div className="rounded-lg border p-3">
            <div className="text-xl font-bold">{data.diversificationScore}</div>
            <div className="text-xs text-muted-foreground">Diversification Score</div>
            <div className="mt-1 h-1.5 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full rounded-full bg-blue-500"
                style={{ width: `${data.diversificationScore}%` }}
              />
            </div>
          </div>
        </div>

        {data.largestPosition && (
          <p className="text-xs text-muted-foreground">
            Largest position: <strong>{data.largestPosition.symbol}</strong> at{" "}
            <strong>{data.largestPosition.weightPct}%</strong> of portfolio ·{" "}
            Effective positions: <strong>{data.effectivePositions}</strong>
          </p>
        )}

        {/* Concentration curve */}
        <div>
          <p className="text-xs text-muted-foreground mb-2">Concentration Curve — cumulative weight by position count</p>
          <ResponsiveContainer width="100%" height={120}>
            <AreaChart data={data.concentrationCurve} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="position" tick={{ fontSize: 10 }} label={{ value: "# of stocks", position: "insideBottom", offset: -2, fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} width={32} unit="%" />
              <Tooltip formatter={(v) => [`${Number(v)}%`, "Cumulative Weight"]} contentStyle={{ fontSize: 12 }} />
              <Area type="monotone" dataKey="cumulativeWeight" stroke="#2563eb" fill="#dbeafe" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
