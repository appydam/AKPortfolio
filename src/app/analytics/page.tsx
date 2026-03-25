"use client";

import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Loader2, PieChart, AlertTriangle, TrendingUp, TrendingDown } from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from "recharts";

const COLORS = [
  "#2563eb", "#16a34a", "#dc2626", "#ca8a04", "#9333ea",
  "#0891b2", "#e11d48", "#65a30d", "#7c3aed", "#d97706",
];

const riskColors = {
  low: "bg-green-100 text-green-800",
  moderate: "bg-yellow-100 text-yellow-800",
  high: "bg-orange-100 text-orange-800",
  very_high: "bg-red-100 text-red-800",
};

function formatCr(value: number): string {
  const cr = value / 10000000;
  if (cr >= 1) return `₹${cr.toFixed(1)} Cr`;
  return `₹${(value / 100000).toFixed(1)} L`;
}

export default function AnalyticsPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["analytics"],
    queryFn: async () => {
      const res = await fetch("/api/analytics");
      return res.json();
    },
  });

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const sectors = data?.sectors || [];
  const concentration = data?.concentration || {};
  const performers = data?.performers || { gainers: [], losers: [] };

  const sectorChartData = sectors
    .filter((s: { totalValue: number }) => s.totalValue > 0)
    .slice(0, 10)
    .map((s: { sector: string; totalValue: number; pctOfPortfolio: number }) => ({
      name: s.sector === "Unknown" ? "Unclassified" : s.sector,
      value: Math.round(s.totalValue / 10000000),
      pct: s.pctOfPortfolio,
    }));

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Portfolio Analytics</h1>
        <p className="text-sm text-muted-foreground">
          Sector breakdown, concentration risk, and performance analysis
        </p>
      </div>

      {/* Concentration Risk */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Top 5 Concentration</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{concentration.top5Pct || 0}%</div>
            <p className="text-xs text-muted-foreground">of portfolio in top 5 stocks</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Top 10 Concentration</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{concentration.top10Pct || 0}%</div>
            <p className="text-xs text-muted-foreground">of portfolio in top 10 stocks</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">HHI Index</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{concentration.hhi || 0}</div>
            <p className="text-xs text-muted-foreground">Herfindahl-Hirschman (0-10000)</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-1.5">
              Risk Level
              <AlertTriangle className="h-3.5 w-3.5" />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Badge className={`text-sm ${riskColors[concentration.riskLevel as keyof typeof riskColors] || ""}`}>
              {(concentration.riskLevel || "unknown").replace("_", " ").toUpperCase()}
            </Badge>
          </CardContent>
        </Card>
      </div>

      {/* Sector Breakdown Chart */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium flex items-center gap-1.5">
            <PieChart className="h-4 w-4" />
            Sector Allocation (₹ Cr)
          </CardTitle>
        </CardHeader>
        <CardContent>
          {sectorChartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={sectorChartData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 11 }} />
                <Tooltip formatter={(value) => [`₹${value} Cr`, "Value"]} />
                <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                  {sectorChartData.map((_: unknown, i: number) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-center text-muted-foreground py-8">
              Run Screener scrape to populate sector data
            </p>
          )}
        </CardContent>
      </Card>

      {/* Sector Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Sector Details</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Sector</TableHead>
                <TableHead className="text-right">Stocks</TableHead>
                <TableHead className="text-right">Value</TableHead>
                <TableHead className="text-right">% of Portfolio</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sectors.map((s: { sector: string; count: number; totalValue: number; pctOfPortfolio: number }) => (
                <TableRow key={s.sector}>
                  <TableCell className="font-medium">{s.sector === "Unknown" ? "Unclassified" : s.sector}</TableCell>
                  <TableCell className="text-right">{s.count}</TableCell>
                  <TableCell className="text-right font-mono">{formatCr(s.totalValue)}</TableCell>
                  <TableCell className="text-right font-mono">{s.pctOfPortfolio}%</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Top Performers */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium flex items-center gap-1.5">
              <TrendingUp className="h-4 w-4 text-green-600" />
              Top Gainers Today
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {performers.gainers?.slice(0, 8).map((s: { symbol: string; name: string; changePct: number; price: number }) => (
                <div key={s.symbol} className="flex items-center justify-between rounded border p-2">
                  <div>
                    <div className="font-medium text-sm">{s.name}</div>
                    <div className="text-xs text-muted-foreground">{s.symbol}</div>
                  </div>
                  <div className="text-right">
                    <div className="font-mono text-sm">₹{s.price?.toLocaleString("en-IN")}</div>
                    <Badge className="bg-green-100 text-green-800 text-xs">
                      +{s.changePct?.toFixed(2)}%
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium flex items-center gap-1.5">
              <TrendingDown className="h-4 w-4 text-red-600" />
              Top Losers Today
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {performers.losers?.slice(0, 8).map((s: { symbol: string; name: string; changePct: number; price: number }) => (
                <div key={s.symbol} className="flex items-center justify-between rounded border p-2">
                  <div>
                    <div className="font-medium text-sm">{s.name}</div>
                    <div className="text-xs text-muted-foreground">{s.symbol}</div>
                  </div>
                  <div className="text-right">
                    <div className="font-mono text-sm">₹{s.price?.toLocaleString("en-IN")}</div>
                    <Badge className="bg-red-100 text-red-800 text-xs">
                      {s.changePct?.toFixed(2)}%
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
