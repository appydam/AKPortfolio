"use client";

import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Loader2, User, BarChart3, GitCompareArrows, CircleDot,
  ArrowUpRight, ArrowDownRight,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";

import { HealthScore } from "@/components/my-portfolio/health-score";
import { PerformanceTreemap } from "@/components/my-portfolio/performance-treemap";
import { StockAllocationChart } from "@/components/my-portfolio/stock-allocation-chart";
import { PnlDistribution } from "@/components/my-portfolio/pnl-distribution";
import { RiskScorecard } from "@/components/my-portfolio/risk-scorecard";
import { VsAKRadar } from "@/components/my-portfolio/vs-ak-radar";
import { MFBreakdown } from "@/components/my-portfolio/mf-breakdown";
import { RecoveryAnalysis } from "@/components/my-portfolio/recovery-analysis";
import { DayChangeScatter } from "@/components/my-portfolio/day-change-scatter";
import { InsightsPanel } from "@/components/my-portfolio/insights-panel";

function fmt(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 10000000) return `₹${(value / 10000000).toFixed(1)}Cr`;
  if (abs >= 100000) return `₹${(value / 100000).toFixed(1)}L`;
  return `₹${value.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

function pnlColor(val: number) {
  return val >= 0 ? "text-green-600" : "text-red-600";
}

function PnlBadge({ value }: { value: number }) {
  return (
    <Badge className={`text-xs ${value >= 0 ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}`}>
      {value >= 0 ? "+" : ""}{value.toFixed(2)}%
    </Badge>
  );
}

interface Holding {
  symbol: string; exchange: string; quantity: number; avgPrice: number;
  ltp: number; invested: number; currentValue: number; pnl: number;
  pnlPct: number; dayChangePct: number;
}
interface AKHolding {
  symbol: string; name: string; shares: number; pctHolding: number;
  price: number; changePct: number; value: number;
}
interface Overlap {
  symbol: string; name: string; myQty: number; myAvgPrice: number;
  myPnlPct: number; akShares: number; akPctHolding: number; ltp: number; dayChangePct: number;
}
interface MFHolding {
  fund: string; folio: string; tradingsymbol: string; quantity: number;
  avgNav: number; currentNav: number; invested: number; currentValue: number; pnl: number; pnlPct: number;
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Analytics = Record<string, any>;

interface PortfolioData {
  user: string; syncedAt: string;
  my: { holdings: Holding[]; totalInvested: number; totalCurrent: number; totalPnl: number; totalPnlPct: number; count: number };
  mf: { holdings: MFHolding[]; totalInvested: number; totalCurrent: number; totalPnl: number; totalPnlPct: number; count: number };
  grand: { totalInvested: number; totalCurrent: number; totalPnl: number; totalPnlPct: number };
  ak: { holdings: AKHolding[]; totalValue: number; count: number };
  comparison: { overlap: Overlap[]; onlyMine: string[]; onlyAK: string[]; overlapCount: number; similarityPct: number };
  analytics: Analytics;
}

export default function MyPortfolioPage() {
  const { data, isLoading, error } = useQuery<PortfolioData>({
    queryKey: ["my-portfolio"],
    queryFn: async () => {
      const res = await fetch("/api/my-portfolio");
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      return json;
    },
    retry: 1,
  });

  if (isLoading) return <div className="flex h-48 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  if (error) return <div className="flex h-48 items-center justify-center"><p className="text-sm text-muted-foreground">Error: {(error as Error).message}</p></div>;
  if (!data) return <div className="flex h-48 items-center justify-center"><p className="text-sm text-muted-foreground">No data</p></div>;

  const my = data.my ?? { holdings: [], totalInvested: 0, totalCurrent: 0, totalPnl: 0, totalPnlPct: 0, count: 0 };
  const mf = data.mf ?? { holdings: [], totalInvested: 0, totalCurrent: 0, totalPnl: 0, totalPnlPct: 0, count: 0 };
  const grand = data.grand ?? { totalInvested: 0, totalCurrent: 0, totalPnl: 0, totalPnlPct: 0 };
  const ak = data.ak ?? { holdings: [], totalValue: 0, count: 0 };
  const comparison = data.comparison ?? { overlap: [], onlyMine: [], onlyAK: [], overlapCount: 0, similarityPct: 0 };
  const analytics = data.analytics ?? {};

  const top10 = [...(my.holdings || [])]
    .sort((a, b) => b.currentValue - a.currentValue)
    .slice(0, 10)
    .map((h) => ({ name: h.symbol, invested: Math.round(h.invested), current: Math.round(h.currentValue) }));

  return (
    <div className="mx-auto max-w-7xl space-y-3 p-3 md:p-4">

      {/* ── Header ── */}
      <div>
        <h1 className="text-xl font-bold tracking-tight">My Portfolio</h1>
        <p className="text-xs text-muted-foreground">
          {data.user} · {data.syncedAt} · {my.count} stocks · {mf.count} MFs
        </p>
      </div>

      {/* ── Single summary row: 8 stat pills ── */}
      <div className="grid grid-cols-4 gap-2 lg:grid-cols-8">
        {[
          { label: "Invested", value: fmt(grand.totalInvested), sub: null },
          { label: "Current", value: fmt(grand.totalCurrent), sub: null },
          { label: "Overall P&L", value: (grand.totalPnl >= 0 ? "+" : "") + fmt(grand.totalPnl), sub: `${grand.totalPnlPct >= 0 ? "+" : ""}${grand.totalPnlPct.toFixed(1)}%`, color: pnlColor(grand.totalPnl) },
          { label: "Stocks P&L", value: (my.totalPnl >= 0 ? "+" : "") + fmt(my.totalPnl), sub: `${my.totalPnlPct >= 0 ? "+" : ""}${my.totalPnlPct.toFixed(1)}%`, color: pnlColor(my.totalPnl) },
          { label: "MF P&L", value: (mf.totalPnl >= 0 ? "+" : "") + fmt(mf.totalPnl), sub: `${mf.totalPnlPct >= 0 ? "+" : ""}${mf.totalPnlPct.toFixed(1)}%`, color: pnlColor(mf.totalPnl) },
          { label: "AK Overlap", value: `${comparison.overlapCount} stocks`, sub: `${comparison.similarityPct}% match` },
          { label: "Win Rate", value: `${analytics.pnlSummary?.winRate ?? 0}%`, sub: `${analytics.pnlSummary?.winners ?? 0}W / ${analytics.pnlSummary?.losers ?? 0}L` },
          { label: "Day P&L", value: (analytics.dayChange?.totalDayPnl ?? 0) >= 0 ? "+" + fmt(analytics.dayChange?.totalDayPnl ?? 0) : fmt(analytics.dayChange?.totalDayPnl ?? 0), sub: `${analytics.dayChange?.greenCount ?? 0}▲ ${analytics.dayChange?.redCount ?? 0}▼`, color: pnlColor(analytics.dayChange?.totalDayPnl ?? 0) },
        ].map((s) => (
          <Card key={s.label} className="p-0">
            <CardContent className="p-2.5">
              <div className="text-[10px] text-muted-foreground leading-none mb-1">{s.label}</div>
              <div className={`text-sm font-bold leading-tight ${s.color ?? ""}`}>{s.value}</div>
              {s.sub && <div className={`text-[10px] mt-0.5 ${s.color ?? "text-muted-foreground"}`}>{s.sub}</div>}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* ── Row 1: Health Score + Insights ── */}
      {(analytics.healthScore || analytics.insights?.length > 0) && (
        <div className="grid gap-3 lg:grid-cols-2">
          {analytics.healthScore && <HealthScore data={analytics.healthScore} />}
          {analytics.insights?.length > 0 && <InsightsPanel insights={analytics.insights} />}
        </div>
      )}

      {/* ── Allocation Donuts (already 2-col internally) ── */}
      {analytics.stockAllocation && analytics.assetAllocation && (
        <StockAllocationChart
          stockAllocation={analytics.stockAllocation}
          assetAllocation={analytics.assetAllocation}
        />
      )}

      {/* ── Treemap (full width) ── */}
      {analytics.treemapData?.length > 0 && <PerformanceTreemap data={analytics.treemapData} />}

      {/* ── Row 2: Top 10 chart + P&L Distribution ── */}
      <div className="grid gap-3 lg:grid-cols-2">
        <Card>
          <CardHeader className="py-2 px-4">
            <CardTitle className="text-xs font-medium flex items-center gap-1.5">
              <BarChart3 className="h-3.5 w-3.5" />Top 10 — Invested vs Current
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-3">
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={top10} layout="vertical" margin={{ top: 0, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}K`} />
                <YAxis type="category" dataKey="name" width={80} tick={{ fontSize: 10 }} />
                <Tooltip formatter={(value) => [`₹${Number(value).toLocaleString("en-IN")}`, ""]} />
                <Legend iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="invested" name="Invested" fill="#94a3b8" radius={[0, 3, 3, 0]} />
                <Bar dataKey="current" name="Current" fill="#2563eb" radius={[0, 3, 3, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        {analytics.pnlDistribution && analytics.pnlSummary && (
          <PnlDistribution distribution={analytics.pnlDistribution} summary={analytics.pnlSummary} />
        )}
      </div>

      {/* ── Row 3: Risk + Day Change ── */}
      <div className="grid gap-3 lg:grid-cols-2">
        {analytics.risk && <RiskScorecard data={analytics.risk} />}
        {analytics.dayChange && <DayChangeScatter data={analytics.dayChange} />}
      </div>

      {/* ── Row 4: Radar + Recovery ── */}
      <div className="grid gap-3 lg:grid-cols-2">
        {analytics.vsAK && <VsAKRadar data={analytics.vsAK} />}
        {analytics.recovery?.length > 0 && <RecoveryAnalysis data={analytics.recovery} />}
      </div>

      {/* ── MF Breakdown ── */}
      {analytics.mfCategories?.length > 0 && <MFBreakdown categories={analytics.mfCategories} />}

      {/* ── Tabs ── */}
      <Tabs defaultValue="holdings">
        <TabsList className="h-8">
          <TabsTrigger value="holdings" className="text-xs h-7">
            <User className="mr-1 h-3.5 w-3.5" />Holdings ({my.count})
          </TabsTrigger>
          <TabsTrigger value="overlap" className="text-xs h-7">
            <GitCompareArrows className="mr-1 h-3.5 w-3.5" />AK Overlap ({comparison.overlapCount})
          </TabsTrigger>
          <TabsTrigger value="mf" className="text-xs h-7">
            <BarChart3 className="mr-1 h-3.5 w-3.5" />MFs ({mf.count})
          </TabsTrigger>
          <TabsTrigger value="unique" className="text-xs h-7">
            <CircleDot className="mr-1 h-3.5 w-3.5" />Unique
          </TabsTrigger>
        </TabsList>

        <TabsContent value="holdings">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="text-xs">
                    <TableHead className="py-2">Symbol</TableHead>
                    <TableHead className="py-2 text-right">Qty</TableHead>
                    <TableHead className="py-2 text-right">Avg</TableHead>
                    <TableHead className="py-2 text-right">LTP</TableHead>
                    <TableHead className="py-2 text-right">Invested</TableHead>
                    <TableHead className="py-2 text-right">Current</TableHead>
                    <TableHead className="py-2 text-right">P&L</TableHead>
                    <TableHead className="py-2 text-right">P&L%</TableHead>
                    <TableHead className="py-2 text-right">Day%</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {my.holdings.sort((a, b) => b.currentValue - a.currentValue).map((h) => (
                    <TableRow key={h.symbol} className="text-xs">
                      <TableCell className="py-1.5 font-medium">{h.symbol}</TableCell>
                      <TableCell className="py-1.5 text-right">{h.quantity}</TableCell>
                      <TableCell className="py-1.5 text-right font-mono">₹{h.avgPrice.toLocaleString("en-IN")}</TableCell>
                      <TableCell className="py-1.5 text-right font-mono">₹{h.ltp.toLocaleString("en-IN")}</TableCell>
                      <TableCell className="py-1.5 text-right font-mono">{fmt(h.invested)}</TableCell>
                      <TableCell className="py-1.5 text-right font-mono">{fmt(h.currentValue)}</TableCell>
                      <TableCell className={`py-1.5 text-right font-mono ${pnlColor(h.pnl)}`}>{h.pnl >= 0 ? "+" : ""}{fmt(h.pnl)}</TableCell>
                      <TableCell className="py-1.5 text-right"><PnlBadge value={h.pnlPct} /></TableCell>
                      <TableCell className={`py-1.5 text-right font-mono ${pnlColor(h.dayChangePct)}`}>{h.dayChangePct >= 0 ? "+" : ""}{h.dayChangePct.toFixed(2)}%</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="overlap">
          <Card>
            <CardContent className="p-0">
              {comparison.overlap.length === 0 ? (
                <p className="text-center text-muted-foreground py-6 text-sm">No overlapping stocks found</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow className="text-xs">
                      <TableHead className="py-2">Symbol</TableHead>
                      <TableHead className="py-2">Name</TableHead>
                      <TableHead className="py-2 text-right">Your Qty</TableHead>
                      <TableHead className="py-2 text-right">Your Avg</TableHead>
                      <TableHead className="py-2 text-right">AK Shares</TableHead>
                      <TableHead className="py-2 text-right">AK%</TableHead>
                      <TableHead className="py-2 text-right">LTP</TableHead>
                      <TableHead className="py-2 text-right">P&L%</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {comparison.overlap.map((h) => (
                      <TableRow key={h.symbol} className="text-xs">
                        <TableCell className="py-1.5 font-medium">{h.symbol}</TableCell>
                        <TableCell className="py-1.5 max-w-[120px] truncate">{h.name}</TableCell>
                        <TableCell className="py-1.5 text-right">{h.myQty}</TableCell>
                        <TableCell className="py-1.5 text-right font-mono">₹{h.myAvgPrice.toLocaleString("en-IN")}</TableCell>
                        <TableCell className="py-1.5 text-right font-mono">{h.akShares.toLocaleString("en-IN")}</TableCell>
                        <TableCell className="py-1.5 text-right font-mono">{h.akPctHolding}%</TableCell>
                        <TableCell className="py-1.5 text-right font-mono">₹{h.ltp.toLocaleString("en-IN")}</TableCell>
                        <TableCell className="py-1.5 text-right"><PnlBadge value={h.myPnlPct} /></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="mf">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="text-xs">
                    <TableHead className="py-2">Fund</TableHead>
                    <TableHead className="py-2 text-right">Units</TableHead>
                    <TableHead className="py-2 text-right">Avg NAV</TableHead>
                    <TableHead className="py-2 text-right">NAV</TableHead>
                    <TableHead className="py-2 text-right">Invested</TableHead>
                    <TableHead className="py-2 text-right">Current</TableHead>
                    <TableHead className="py-2 text-right">P&L</TableHead>
                    <TableHead className="py-2 text-right">P&L%</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(mf.holdings || []).sort((a, b) => b.currentValue - a.currentValue).map((h) => (
                    <TableRow key={h.tradingsymbol} className="text-xs">
                      <TableCell className="py-1.5 font-medium max-w-[220px] truncate">{h.fund}</TableCell>
                      <TableCell className="py-1.5 text-right font-mono">{h.quantity.toFixed(2)}</TableCell>
                      <TableCell className="py-1.5 text-right font-mono">₹{h.avgNav.toFixed(2)}</TableCell>
                      <TableCell className="py-1.5 text-right font-mono">₹{h.currentNav.toFixed(2)}</TableCell>
                      <TableCell className="py-1.5 text-right font-mono">{fmt(h.invested)}</TableCell>
                      <TableCell className="py-1.5 text-right font-mono">{fmt(h.currentValue)}</TableCell>
                      <TableCell className={`py-1.5 text-right font-mono ${pnlColor(h.pnl)}`}>{h.pnl >= 0 ? "+" : ""}{fmt(h.pnl)}</TableCell>
                      <TableCell className="py-1.5 text-right"><PnlBadge value={h.pnlPct} /></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="unique">
          <div className="grid gap-3 lg:grid-cols-2">
            <Card>
              <CardHeader className="py-2 px-4">
                <CardTitle className="text-xs font-medium flex items-center gap-1.5">
                  <ArrowUpRight className="h-3.5 w-3.5 text-blue-600" />
                  Only Yours ({comparison.onlyMine.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-3">
                <div className="space-y-1">
                  {comparison.onlyMine.map((symbol) => {
                    const h = my.holdings.find((x) => x.symbol === symbol);
                    return (
                      <div key={symbol} className="flex items-center justify-between rounded border px-2 py-1">
                        <div>
                          <span className="font-medium text-xs">{symbol}</span>
                          <span className="text-[10px] text-muted-foreground ml-2">{h?.quantity} @ ₹{h?.avgPrice.toLocaleString("en-IN")}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs">₹{h?.ltp.toLocaleString("en-IN")}</span>
                          {h && <PnlBadge value={h.pnlPct} />}
                        </div>
                      </div>
                    );
                  })}
                  {comparison.onlyMine.length === 0 && <p className="text-xs text-muted-foreground text-center py-3">All your stocks overlap with AK</p>}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="py-2 px-4">
                <CardTitle className="text-xs font-medium flex items-center gap-1.5">
                  <ArrowDownRight className="h-3.5 w-3.5 text-orange-600" />
                  Only AK&apos;s ({comparison.onlyAK.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-3">
                <div className="space-y-1 max-h-64 overflow-y-auto">
                  {comparison.onlyAK.map((symbol) => {
                    const h = ak.holdings.find((x) => x.symbol === symbol);
                    return (
                      <div key={symbol} className="flex items-center justify-between rounded border px-2 py-1">
                        <div>
                          <span className="font-medium text-xs">{h?.name || symbol}</span>
                          <span className="text-[10px] text-muted-foreground ml-2">{h?.pctHolding}% hold</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs">₹{h?.price?.toLocaleString("en-IN")}</span>
                          <span className="text-[10px] text-muted-foreground">{fmt(h?.value || 0)}</span>
                        </div>
                      </div>
                    );
                  })}
                  {comparison.onlyAK.length === 0 && <p className="text-xs text-muted-foreground text-center py-3">You hold all of AK&apos;s stocks</p>}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
