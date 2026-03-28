"use client";

import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Loader2, LayoutDashboard, Briefcase, BarChart3, Swords,
  PieChart, Upload, ArrowUpRight, ArrowDownRight, Search,
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
import { AIAnalysis } from "@/components/my-portfolio/ai-analysis";
import { UploadZone } from "@/components/my-portfolio/upload-zone";

// ── Helpers ──────────────────────────────────────────────────────────────────

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
    <Badge className={`text-xs ${value >= 0 ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400" : "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400"}`}>
      {value >= 0 ? "+" : ""}{value.toFixed(2)}%
    </Badge>
  );
}

// ── Types ────────────────────────────────────────────────────────────────────

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

interface BullComparison {
  investorId: string;
  investorName: string;
  description: string;
  totalHoldings: number;
  overlapCount: number;
  similarityPct: number;
  overlapStocks: string[];
  onlyBull: string[];
}

interface ComparisonData {
  comparisons: BullComparison[];
  consensusPicks: { symbol: string; name: string; heldByCount: number; heldBy: string[] }[];
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function MyPortfolioPage() {
  const [activeTab, setActiveTab] = useState("overview");
  const [portfolioId, setPortfolioId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  // Load portfolio ID from localStorage
  useEffect(() => {
    const stored = localStorage.getItem("ak_portfolio_id");
    if (stored) setPortfolioId(stored);
  }, []);

  const savePortfolioId = (id: string) => {
    localStorage.setItem("ak_portfolio_id", id);
    setPortfolioId(id);
    setActiveTab("overview");
    refetch();
  };

  const { data, isLoading, error, refetch } = useQuery<PortfolioData>({
    queryKey: ["my-portfolio", portfolioId],
    queryFn: async () => {
      const url = portfolioId ? `/api/my-portfolio?id=${portfolioId}` : "/api/my-portfolio";
      const res = await fetch(url);
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      return json;
    },
    retry: 1,
  });

  // Big Bull comparison — lazy loaded when tab is active
  const { data: comparisonData, isLoading: comparisonLoading } = useQuery<ComparisonData>({
    queryKey: ["my-portfolio-comparison", portfolioId],
    queryFn: async () => {
      const url = portfolioId
        ? `/api/my-portfolio/comparison?id=${portfolioId}`
        : "/api/my-portfolio/comparison";
      const res = await fetch(url);
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      return json;
    },
    enabled: activeTab === "bulls",
    retry: 1,
    staleTime: 5 * 60 * 1000,
  });

  if (isLoading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <div className="text-center space-y-2">
          <Loader2 className="h-6 w-6 animate-spin text-primary mx-auto" />
          <p className="text-sm text-muted-foreground">Loading portfolio...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <div className="text-center space-y-3">
          <p className="text-sm text-muted-foreground">Error: {(error as Error).message}</p>
          <button
            onClick={() => setActiveTab("upload")}
            className="rounded-lg px-4 py-2 text-sm bg-primary text-primary-foreground hover:bg-primary/90"
          >
            Upload Your Portfolio
          </button>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <div className="text-center space-y-3">
          <p className="text-sm text-muted-foreground">No portfolio data yet</p>
          <button
            onClick={() => setActiveTab("upload")}
            className="rounded-lg px-4 py-2 text-sm bg-primary text-primary-foreground hover:bg-primary/90"
          >
            Upload Your Portfolio
          </button>
        </div>
      </div>
    );
  }

  const my = data.my ?? { holdings: [], totalInvested: 0, totalCurrent: 0, totalPnl: 0, totalPnlPct: 0, count: 0 };
  const mf = data.mf ?? { holdings: [], totalInvested: 0, totalCurrent: 0, totalPnl: 0, totalPnlPct: 0, count: 0 };
  const grand = data.grand ?? { totalInvested: 0, totalCurrent: 0, totalPnl: 0, totalPnlPct: 0 };
  const ak = data.ak ?? { holdings: [], totalValue: 0, count: 0 };
  const comparison = data.comparison ?? { overlap: [], onlyMine: [], onlyAK: [], overlapCount: 0, similarityPct: 0 };
  const analytics = data.analytics ?? {};

  const filteredHoldings = searchQuery
    ? my.holdings.filter((h) => h.symbol.toLowerCase().includes(searchQuery.toLowerCase()))
    : my.holdings;

  const top10 = [...(my.holdings || [])]
    .sort((a, b) => b.currentValue - a.currentValue)
    .slice(0, 10)
    .map((h) => ({ name: h.symbol, invested: Math.round(h.invested), current: Math.round(h.currentValue) }));

  return (
    <div className="mx-auto max-w-7xl space-y-4 p-3 md:p-4">

      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight">My Portfolio</h1>
          <p className="text-xs text-muted-foreground">
            {data.user} · Synced {data.syncedAt} · {my.count} stocks{mf.count > 0 ? ` · ${mf.count} MFs` : ""}
          </p>
        </div>
        <button
          onClick={() => setActiveTab("upload")}
          className="rounded-lg px-3 py-1.5 text-xs font-medium border border-primary/30 text-primary hover:bg-primary/5 transition-colors flex items-center gap-1.5"
        >
          <Upload className="h-3.5 w-3.5" />
          {portfolioId ? "Update" : "Upload"}
        </button>
      </div>

      {/* ── Summary Stats ── */}
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        {[
          { label: "Invested", value: fmt(grand.totalInvested) },
          { label: "Current Value", value: fmt(grand.totalCurrent) },
          { label: "Total P&L", value: `${grand.totalPnl >= 0 ? "+" : ""}${fmt(grand.totalPnl)}`, sub: `${grand.totalPnlPct >= 0 ? "+" : ""}${grand.totalPnlPct.toFixed(1)}%`, color: pnlColor(grand.totalPnl) },
          { label: "Win Rate", value: `${analytics.pnlSummary?.winRate ?? 0}%`, sub: `${analytics.pnlSummary?.winners ?? 0}W / ${analytics.pnlSummary?.losers ?? 0}L` },
        ].map((s) => (
          <Card key={s.label} className="p-0">
            <CardContent className="p-3">
              <div className="text-[10px] text-muted-foreground leading-none mb-1.5">{s.label}</div>
              <div className={`text-base font-bold leading-tight ${s.color ?? ""}`}>{s.value}</div>
              {s.sub && <div className={`text-[10px] mt-0.5 ${s.color ?? "text-muted-foreground"}`}>{s.sub}</div>}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* ── Tabs ── */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="h-9 w-full justify-start overflow-x-auto">
          <TabsTrigger value="overview" className="text-xs h-7 gap-1">
            <LayoutDashboard className="h-3.5 w-3.5" />Overview
          </TabsTrigger>
          <TabsTrigger value="holdings" className="text-xs h-7 gap-1">
            <Briefcase className="h-3.5 w-3.5" />Holdings
          </TabsTrigger>
          <TabsTrigger value="analytics" className="text-xs h-7 gap-1">
            <BarChart3 className="h-3.5 w-3.5" />Analytics
          </TabsTrigger>
          <TabsTrigger value="bulls" className="text-xs h-7 gap-1">
            <Swords className="h-3.5 w-3.5" />vs Big Bulls
          </TabsTrigger>
          <TabsTrigger value="mf" className="text-xs h-7 gap-1">
            <PieChart className="h-3.5 w-3.5" />Mutual Funds
          </TabsTrigger>
          <TabsTrigger value="upload" className="text-xs h-7 gap-1">
            <Upload className="h-3.5 w-3.5" />Upload
          </TabsTrigger>
        </TabsList>

        {/* ─────────────────── OVERVIEW TAB ─────────────────── */}
        <TabsContent value="overview" className="space-y-3 mt-3">
          {/* AI Analysis */}
          <AIAnalysis portfolioData={data} />

          {/* Health Score + Insights */}
          <div className="grid gap-3 lg:grid-cols-2">
            {analytics.healthScore && <HealthScore data={analytics.healthScore} />}
            {analytics.insights?.length > 0 && <InsightsPanel insights={analytics.insights} />}
          </div>

          {/* Quick summary: AK Overlap + Day P&L */}
          <div className="grid gap-3 lg:grid-cols-2">
            <Card>
              <CardHeader className="py-2.5 px-4">
                <CardTitle className="text-xs font-medium">AK Overlap</CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-3">
                <div className="flex items-center gap-4">
                  <div className="text-2xl font-bold text-primary">{comparison.overlapCount}</div>
                  <div>
                    <p className="text-xs text-muted-foreground">stocks in common</p>
                    <p className="text-xs font-medium">{comparison.similarityPct}% similarity</p>
                  </div>
                </div>
                {comparison.overlap.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {comparison.overlap.slice(0, 8).map((o) => (
                      <Badge key={o.symbol} variant="outline" className="text-[10px]">{o.symbol}</Badge>
                    ))}
                    {comparison.overlap.length > 8 && (
                      <Badge variant="outline" className="text-[10px] text-muted-foreground">
                        +{comparison.overlap.length - 8} more
                      </Badge>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="py-2.5 px-4">
                <CardTitle className="text-xs font-medium">Today</CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-3">
                <div className="flex items-center gap-4">
                  <div className={`text-2xl font-bold ${pnlColor(analytics.dayChange?.totalDayPnl ?? 0)}`}>
                    {(analytics.dayChange?.totalDayPnl ?? 0) >= 0 ? "+" : ""}{fmt(analytics.dayChange?.totalDayPnl ?? 0)}
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">day P&L</p>
                    <p className="text-xs">
                      <span className="text-green-600">{analytics.dayChange?.greenCount ?? 0} up</span>
                      {" · "}
                      <span className="text-red-600">{analytics.dayChange?.redCount ?? 0} down</span>
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ─────────────────── HOLDINGS TAB ─────────────────── */}
        <TabsContent value="holdings" className="space-y-3 mt-3">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <input
              placeholder="Search stocks..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-lg border pl-9 pr-3 py-2 text-xs bg-background outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          {/* Holdings Table */}
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
                  {filteredHoldings.sort((a, b) => b.currentValue - a.currentValue).map((h) => (
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

          {/* Top 10 + P&L Distribution */}
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

          {/* Treemap */}
          {analytics.treemapData?.length > 0 && <PerformanceTreemap data={analytics.treemapData} />}
        </TabsContent>

        {/* ─────────────────── ANALYTICS TAB ─────────────────── */}
        <TabsContent value="analytics" className="space-y-3 mt-3">
          {/* Allocation Charts */}
          {analytics.stockAllocation && analytics.assetAllocation && (
            <StockAllocationChart
              stockAllocation={analytics.stockAllocation}
              assetAllocation={analytics.assetAllocation}
            />
          )}

          {/* Risk + Day Change */}
          <div className="grid gap-3 lg:grid-cols-2">
            {analytics.risk && <RiskScorecard data={analytics.risk} />}
            {analytics.dayChange && <DayChangeScatter data={analytics.dayChange} />}
          </div>

          {/* Radar + Recovery */}
          <div className="grid gap-3 lg:grid-cols-2">
            {analytics.vsAK && <VsAKRadar data={analytics.vsAK} />}
            {analytics.recovery?.length > 0 && <RecoveryAnalysis data={analytics.recovery} />}
          </div>
        </TabsContent>

        {/* ─────────────────── VS BIG BULLS TAB ─────────────────── */}
        <TabsContent value="bulls" className="space-y-3 mt-3">
          {comparisonLoading ? (
            <div className="flex h-48 items-center justify-center">
              <div className="text-center space-y-2">
                <Loader2 className="h-5 w-5 animate-spin text-primary mx-auto" />
                <p className="text-xs text-muted-foreground">Comparing with Big Bulls...</p>
              </div>
            </div>
          ) : comparisonData ? (
            <>
              {/* Bull Comparison Grid */}
              <div className="grid gap-3 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
                {comparisonData.comparisons.map((bull) => (
                  <Card key={bull.investorId} className="hover:border-primary/30 transition-colors">
                    <CardHeader className="py-3 px-4">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-sm font-semibold">{bull.investorName}</CardTitle>
                        <Badge
                          className={`text-xs ${
                            bull.similarityPct >= 30
                              ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
                              : bull.similarityPct >= 15
                              ? "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400"
                              : "bg-muted text-muted-foreground"
                          }`}
                        >
                          {bull.similarityPct}% match
                        </Badge>
                      </div>
                      <p className="text-[10px] text-muted-foreground">{bull.description}</p>
                    </CardHeader>
                    <CardContent className="px-4 pb-3">
                      <div className="flex items-baseline gap-3 mb-2">
                        <div>
                          <span className="text-lg font-bold text-primary">{bull.overlapCount}</span>
                          <span className="text-xs text-muted-foreground ml-1">overlap</span>
                        </div>
                        <div className="text-xs text-muted-foreground">
                          of {bull.totalHoldings} holdings
                        </div>
                      </div>
                      {bull.overlapStocks.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {bull.overlapStocks.slice(0, 6).map((s) => (
                            <Badge key={s} variant="outline" className="text-[10px]">{s}</Badge>
                          ))}
                          {bull.overlapStocks.length > 6 && (
                            <Badge variant="outline" className="text-[10px] text-muted-foreground">
                              +{bull.overlapStocks.length - 6}
                            </Badge>
                          )}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>

              {/* Consensus Picks */}
              {comparisonData.consensusPicks.length > 0 && (
                <Card>
                  <CardHeader className="py-3 px-4">
                    <CardTitle className="text-sm font-medium flex items-center gap-1.5">
                      <Swords className="h-4 w-4 text-orange-600" />
                      Consensus Picks You&apos;re Missing
                    </CardTitle>
                    <p className="text-[10px] text-muted-foreground">
                      Stocks held by multiple Big Bulls that you don&apos;t own
                    </p>
                  </CardHeader>
                  <CardContent className="p-0">
                    <Table>
                      <TableHeader>
                        <TableRow className="text-xs">
                          <TableHead className="py-2">Stock</TableHead>
                          <TableHead className="py-2 text-right">Bulls Holding</TableHead>
                          <TableHead className="py-2">Held By</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {comparisonData.consensusPicks.slice(0, 15).map((pick) => (
                          <TableRow key={pick.symbol} className="text-xs">
                            <TableCell className="py-1.5">
                              <span className="font-medium">{pick.symbol}</span>
                              <span className="text-muted-foreground ml-1.5">{pick.name}</span>
                            </TableCell>
                            <TableCell className="py-1.5 text-right">
                              <Badge className="bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400 text-[10px]">
                                {pick.heldByCount} bulls
                              </Badge>
                            </TableCell>
                            <TableCell className="py-1.5">
                              <div className="flex flex-wrap gap-1">
                                {pick.heldBy.map((name) => (
                                  <span key={name} className="text-[10px] text-muted-foreground">{name}</span>
                                ))}
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              )}

              {/* AK Overlap Detail */}
              <Card>
                <CardHeader className="py-3 px-4">
                  <CardTitle className="text-xs font-medium">
                    Your Overlap with Ashish Kacholia ({comparison.overlapCount} stocks)
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  {comparison.overlap.length === 0 ? (
                    <p className="text-center text-muted-foreground py-6 text-sm">No overlapping stocks</p>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow className="text-xs">
                          <TableHead className="py-2">Symbol</TableHead>
                          <TableHead className="py-2 text-right">Your Qty</TableHead>
                          <TableHead className="py-2 text-right">Your Avg</TableHead>
                          <TableHead className="py-2 text-right">AK Shares</TableHead>
                          <TableHead className="py-2 text-right">AK%</TableHead>
                          <TableHead className="py-2 text-right">LTP</TableHead>
                          <TableHead className="py-2 text-right">Your P&L%</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {comparison.overlap.map((h) => (
                          <TableRow key={h.symbol} className="text-xs">
                            <TableCell className="py-1.5 font-medium">{h.symbol}</TableCell>
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

              {/* Only Yours / Only AK */}
              <div className="grid gap-3 lg:grid-cols-2">
                <Card>
                  <CardHeader className="py-2 px-4">
                    <CardTitle className="text-xs font-medium flex items-center gap-1.5">
                      <ArrowUpRight className="h-3.5 w-3.5 text-blue-600" />
                      Only Yours ({comparison.onlyMine.length})
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="px-4 pb-3">
                    <div className="space-y-1 max-h-48 overflow-y-auto">
                      {comparison.onlyMine.map((symbol) => {
                        const h = my.holdings.find((x) => x.symbol === symbol);
                        return (
                          <div key={symbol} className="flex items-center justify-between rounded border px-2 py-1">
                            <div>
                              <span className="font-medium text-xs">{symbol}</span>
                              <span className="text-[10px] text-muted-foreground ml-2">{h?.quantity} @ ₹{h?.avgPrice.toLocaleString("en-IN")}</span>
                            </div>
                            {h && <PnlBadge value={h.pnlPct} />}
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
                    <div className="space-y-1 max-h-48 overflow-y-auto">
                      {comparison.onlyAK.map((symbol) => {
                        const h = ak.holdings.find((x) => x.symbol === symbol);
                        return (
                          <div key={symbol} className="flex items-center justify-between rounded border px-2 py-1">
                            <div>
                              <span className="font-medium text-xs">{h?.name || symbol}</span>
                              <span className="text-[10px] text-muted-foreground ml-2">{h?.pctHolding}% hold</span>
                            </div>
                            <span className="font-mono text-xs">₹{h?.price?.toLocaleString("en-IN")}</span>
                          </div>
                        );
                      })}
                      {comparison.onlyAK.length === 0 && <p className="text-xs text-muted-foreground text-center py-3">You hold all of AK&apos;s stocks</p>}
                    </div>
                  </CardContent>
                </Card>
              </div>
            </>
          ) : (
            <div className="flex h-48 items-center justify-center">
              <p className="text-sm text-muted-foreground">Switch to this tab to load comparison data</p>
            </div>
          )}
        </TabsContent>

        {/* ─────────────────── MUTUAL FUNDS TAB ─────────────────── */}
        <TabsContent value="mf" className="space-y-3 mt-3">
          {mf.count === 0 ? (
            <div className="flex h-48 items-center justify-center">
              <p className="text-sm text-muted-foreground">No mutual fund data. Upload a portfolio with MF holdings.</p>
            </div>
          ) : (
            <>
              {/* MF Summary */}
              <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
                {[
                  { label: "MF Invested", value: fmt(mf.totalInvested) },
                  { label: "MF Current", value: fmt(mf.totalCurrent) },
                  { label: "MF P&L", value: `${mf.totalPnl >= 0 ? "+" : ""}${fmt(mf.totalPnl)}`, sub: `${mf.totalPnlPct >= 0 ? "+" : ""}${mf.totalPnlPct.toFixed(1)}%`, color: pnlColor(mf.totalPnl) },
                  { label: "Funds", value: `${mf.count}` },
                ].map((s) => (
                  <Card key={s.label} className="p-0">
                    <CardContent className="p-3">
                      <div className="text-[10px] text-muted-foreground leading-none mb-1.5">{s.label}</div>
                      <div className={`text-base font-bold ${s.color ?? ""}`}>{s.value}</div>
                      {s.sub && <div className={`text-[10px] mt-0.5 ${s.color ?? "text-muted-foreground"}`}>{s.sub}</div>}
                    </CardContent>
                  </Card>
                ))}
              </div>

              {/* MF Table */}
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

              {/* MF Category Breakdown */}
              {analytics.mfCategories?.length > 0 && <MFBreakdown categories={analytics.mfCategories} />}
            </>
          )}
        </TabsContent>

        {/* ─────────────────── UPLOAD TAB ─────────────────── */}
        <TabsContent value="upload" className="mt-3">
          <UploadZone portfolioId={portfolioId} onUploaded={savePortfolioId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
