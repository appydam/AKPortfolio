"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { HoldingsTable } from "@/components/dashboard/holdings-table";
import { DealFeed } from "@/components/dashboard/deal-feed";
import { ConvictionSignals } from "@/components/insights/conviction-signals";
import { RiskPulse } from "@/components/insights/risk-pulse";
import { PerformanceAttribution } from "@/components/insights/performance-attribution";
import { HoldingsHeatmap } from "@/components/insights/holdings-heatmap";
import { DealPatternsCard } from "@/components/insights/deal-patterns-card";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import {
  RefreshCw, Loader2, CheckCircle, AlertTriangle, XCircle,
  TrendingUp, TrendingDown, BarChart3, Target, PieChart, FileText,
  Activity, Brain, Zap, Eye, Clock, LogIn, LogOut, ArrowDownCircle, ArrowUpCircle,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
  PieChart as RPieChart, Pie,
} from "recharts";

const SECTION_TABS = [
  { id: "overview", label: "Overview", icon: Eye },
  { id: "holdings", label: "All Holdings", icon: BarChart3 },
  { id: "conviction", label: "Conviction", icon: Target },
  { id: "alpha", label: "Alpha Signals", icon: Zap },
  { id: "deals", label: "Deals & Patterns", icon: FileText },
  { id: "risk", label: "Risk & Performance", icon: Activity },
  { id: "sectors", label: "Sectors", icon: PieChart },
  { id: "timeline", label: "Timeline", icon: Clock },
] as const;

type SectionId = (typeof SECTION_TABS)[number]["id"];

const SECTOR_COLORS = [
  "#3b82f6", "#22c55e", "#f59e0b", "#ef4444", "#8b5cf6",
  "#ec4899", "#06b6d4", "#84cc16", "#f97316", "#6366f1",
  "#14b8a6", "#e11d48", "#a855f7", "#64748b",
];

export default function CommandCenter() {
  const [activeSection, setActiveSection] = useState<SectionId>("overview");
  const [scraping, setScraping] = useState(false);

  const { data: insightsData, isLoading: insightsLoading } = useQuery({
    queryKey: ["insights"],
    queryFn: () => fetch("/api/insights").then(r => r.json()),
    staleTime: 5 * 60 * 1000,
  });

  const { data: holdingsData, refetch: refetchHoldings } = useQuery({
    queryKey: ["holdings"],
    queryFn: () => fetch("/api/holdings").then(r => r.json()),
    refetchInterval: 10_000,
  });

  const { data: dealsData, refetch: refetchDeals } = useQuery({
    queryKey: ["deals"],
    queryFn: () => fetch("/api/deals?limit=25").then(r => r.json()),
    refetchInterval: 120_000,
  });

  const { data: analyticsData } = useQuery({
    queryKey: ["analytics"],
    queryFn: () => fetch("/api/analytics").then(r => r.json()),
    staleTime: 5 * 60 * 1000,
  });

  const { data: healthData } = useQuery({
    queryKey: ["health"],
    queryFn: () => fetch("/api/health").then(r => r.json()),
    refetchInterval: 15_000,
  });

  const { data: timelineData } = useQuery({
    queryKey: ["timeline"],
    queryFn: () => fetch("/api/timeline").then(r => r.json()),
    staleTime: 5 * 60 * 1000,
    enabled: activeSection === "timeline",
  });

  const { data: signalsData, isLoading: signalsLoading } = useQuery({
    queryKey: ["signals"],
    queryFn: () => fetch("/api/signals").then(r => r.json()),
    staleTime: 15 * 60 * 1000,
    enabled: activeSection === "alpha",
  });

  const { data: backtestData, isLoading: backtestLoading } = useQuery({
    queryKey: ["backtest"],
    queryFn: () => fetch("/api/backtest").then(r => r.json()),
    staleTime: 60 * 60 * 1000, // 1 hour cache — backtest is slow
    enabled: activeSection === "alpha",
  });

  const handleScrape = async () => {
    setScraping(true);
    try {
      await fetch("/api/scrape", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) });
      await Promise.all([refetchHoldings(), refetchDeals()]);
    } finally { setScraping(false); }
  };

  const holdings = holdingsData?.holdings || [];
  const totalValue = holdingsData?.totalValue || 0;
  const quarter = holdingsData?.quarter || "";
  const deals = dealsData?.deals || [];
  const overallHealth = healthData?.overall;
  const conviction = insightsData?.conviction || [];
  const entryQuality = insightsData?.entryQuality || [];
  const dealPatterns = insightsData?.dealPatterns || [];
  const drawdown = insightsData?.drawdown || { maxDrawdownPct: 0, peakDate: "", peakValue: 0, troughDate: "", troughValue: 0, recoveryDate: null, recoveryDays: null, currentDrawdownPct: 0 };
  const beta = insightsData?.beta || { beta: 1, correlation: 0, alpha: 0, interpretation: "Loading..." };
  const winLoss = insightsData?.winLoss || { totalExits: 0, wins: 0, losses: 0, winRate: 0, avgWinPct: 0, avgLossPct: 0, bestExit: null, worstExit: null };
  const topContributors = insightsData?.topContributors || [];
  const bottomDetractors = insightsData?.bottomDetractors || [];
  const sectors = analyticsData?.sectors || [];
  const performers = analyticsData?.performers || { gainers: [], losers: [] };

  // Compute stats
  const gainers = holdings.filter((h: Record<string, unknown>) => (h.change_pct as number) > 0).length;
  const losers = holdings.filter((h: Record<string, unknown>) => (h.change_pct as number) < 0).length;
  const avgChange = holdings.length > 0
    ? holdings.reduce((s: number, h: Record<string, unknown>) => s + ((h.change_pct as number) || 0), 0) / holdings.length
    : 0;
  const excellentEntries = entryQuality.filter((e: { quality: string }) => e.quality === "Excellent").length;
  const goodEntries = entryQuality.filter((e: { quality: string }) => e.quality === "Good").length;

  const healthIcon = overallHealth?.status === "all_healthy"
    ? <CheckCircle className="h-3 w-3 text-green-500" />
    : overallHealth?.status === "some_degraded"
    ? <AlertTriangle className="h-3 w-3 text-yellow-500" />
    : <XCircle className="h-3 w-3 text-red-500" />;

  return (
    <div className="mx-auto max-w-[1400px] p-3 md:p-4 space-y-3">
      {/* ─── HERO HEADER ─── */}
      <div className="relative overflow-hidden rounded-xl border border-primary/20 bg-gradient-to-br from-primary/10 via-background to-primary/5 p-5 md:p-6">
        {/* Subtle glow effect */}
        <div className="absolute -top-24 -right-24 h-48 w-48 rounded-full bg-primary/10 blur-3xl" />
        <div className="absolute -bottom-16 -left-16 h-32 w-32 rounded-full bg-primary/5 blur-2xl" />

        <div className="relative flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2.5 mb-1.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 ring-1 ring-primary/20">
                <Brain className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h1 className="text-xl md:text-2xl font-bold tracking-tight">Ashish Kacholia</h1>
                <p className="text-[11px] text-primary/70 font-medium -mt-0.5">Intelligence Terminal</p>
              </div>
            </div>
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              <Badge className="bg-primary/10 text-primary border-primary/20 text-[10px]">17 Sources</Badge>
              <Badge className="bg-primary/10 text-primary border-primary/20 text-[10px]">19 Intelligence Layers</Badge>
              <Badge className="bg-primary/10 text-primary border-primary/20 text-[10px]">4 Entities Tracked</Badge>
              {overallHealth && (
                <Link href="/health">
                  <Badge variant="outline" className="gap-1 text-[10px] cursor-pointer hover:bg-accent">
                    {healthIcon} {overallHealth.healthy}/{overallHealth.total} live
                  </Badge>
                </Link>
              )}
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={handleScrape} disabled={scraping} className="h-8 text-xs">
            {scraping ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="mr-1.5 h-3.5 w-3.5" />}
            {scraping ? "Scraping..." : "Refresh Data"}
          </Button>
        </div>

        {/* Stats row */}
        <div className="relative grid grid-cols-2 md:grid-cols-6 gap-2.5 mt-5">
          <div className="rounded-lg bg-card/80 backdrop-blur border p-3">
            <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-medium">Portfolio</p>
            <p className="text-xl md:text-2xl font-bold font-mono tracking-tight">
              {totalValue > 0 ? `₹${(totalValue / 1e7).toFixed(0)}` : "—"}
              <span className="text-xs font-normal text-muted-foreground ml-0.5">Cr</span>
            </p>
          </div>
          <div className="rounded-lg bg-card/80 backdrop-blur border p-3">
            <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-medium">Today</p>
            <p className={`text-xl md:text-2xl font-bold font-mono tracking-tight ${avgChange >= 0 ? "text-emerald-500" : "text-red-500"}`}>
              {avgChange >= 0 ? "+" : ""}{avgChange.toFixed(2)}%
            </p>
          </div>
          <div className="rounded-lg bg-card/80 backdrop-blur border p-3">
            <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-medium">Stocks</p>
            <p className="text-xl md:text-2xl font-bold font-mono tracking-tight">{holdings.length}</p>
          </div>
          <div className="rounded-lg bg-card/80 backdrop-blur border p-3">
            <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-medium">Gainers / Losers</p>
            <p className="text-xl md:text-2xl font-bold font-mono tracking-tight">
              <span className="text-emerald-500">{gainers}</span>
              <span className="text-muted-foreground/50 mx-0.5">/</span>
              <span className="text-red-500">{losers}</span>
            </p>
          </div>
          <div className="rounded-lg bg-card/80 backdrop-blur border p-3">
            <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-medium">Entry Quality</p>
            <p className="text-xl md:text-2xl font-bold font-mono tracking-tight">
              <span className="text-emerald-500">{excellentEntries}</span>
              <span className="text-[10px] font-normal text-muted-foreground mx-0.5">exc</span>
              <span className="text-blue-500">{goodEntries}</span>
              <span className="text-[10px] font-normal text-muted-foreground ml-0.5">good</span>
            </p>
          </div>
          <div className="rounded-lg bg-card/80 backdrop-blur border p-3">
            <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-medium">Deals</p>
            <p className="text-xl md:text-2xl font-bold font-mono tracking-tight">{dealsData?.total || 0}</p>
          </div>
        </div>
      </div>

      {/* ─── SECTION TABS ─── */}
      <div className="flex gap-1 overflow-x-auto pb-1 border-b border-border/50">
        {SECTION_TABS.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveSection(tab.id)}
              className={`flex items-center gap-1.5 rounded-t-md px-3 py-2 text-xs font-medium transition-colors whitespace-nowrap ${
                activeSection === tab.id
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground"
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* ─── SECTION CONTENT ─── */}

      {/* OVERVIEW */}
      {activeSection === "overview" && (
        <div className="space-y-3">
          {/* Top row: Heatmap + Top Movers */}
          <div className="grid gap-3 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <HoldingsHeatmap
                conviction={conviction}
                holdings={holdings.map((h: Record<string, unknown>) => ({
                  symbol: h.symbol || "",
                  market_value: h.market_value || 0,
                  change_pct: h.change_pct || 0,
                }))}
              />
            </div>
            <div className="space-y-3">
              {/* Top Gainers */}
              <Card>
                <CardHeader className="pb-1 pt-3 px-3">
                  <CardTitle className="text-sm flex items-center gap-1.5">
                    <TrendingUp className="h-3.5 w-3.5 text-green-600" /> Top Gainers
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-3 pb-3 space-y-1">
                  {(performers.gainers || []).slice(0, 5).map((g: Record<string, unknown>) => (
                    <div key={g.symbol as string} className="flex justify-between text-xs">
                      <Link href={`/stock/${g.symbol}`} className="font-medium text-primary hover:underline">{g.symbol as string}</Link>
                      <span className="text-green-600 font-mono">+{(g.changePct as number)?.toFixed(1)}%</span>
                    </div>
                  ))}
                </CardContent>
              </Card>
              {/* Top Losers */}
              <Card>
                <CardHeader className="pb-1 pt-3 px-3">
                  <CardTitle className="text-sm flex items-center gap-1.5">
                    <TrendingDown className="h-3.5 w-3.5 text-red-600" /> Top Losers
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-3 pb-3 space-y-1">
                  {(performers.losers || []).slice(0, 5).map((l: Record<string, unknown>) => (
                    <div key={l.symbol as string} className="flex justify-between text-xs">
                      <Link href={`/stock/${l.symbol}`} className="font-medium text-primary hover:underline">{l.symbol as string}</Link>
                      <span className="text-red-600 font-mono">{(l.changePct as number)?.toFixed(1)}%</span>
                    </div>
                  ))}
                </CardContent>
              </Card>
              {/* Sector Pie */}
              {sectors.length > 0 && (
                <Card>
                  <CardHeader className="pb-1 pt-3 px-3">
                    <CardTitle className="text-sm flex items-center gap-1.5">
                      <PieChart className="h-3.5 w-3.5" /> Sector Split
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="px-3 pb-2">
                    <ResponsiveContainer width="100%" height={160}>
                      <RPieChart>
                        <Pie
                          data={sectors.slice(0, 8).map((s: Record<string, unknown>, i: number) => ({
                            name: s.sector, value: s.pctOfPortfolio, fill: SECTOR_COLORS[i],
                          }))}
                          dataKey="value"
                          cx="50%" cy="50%"
                          innerRadius={35} outerRadius={65}
                          paddingAngle={2}
                        >
                          {sectors.slice(0, 8).map((_: unknown, i: number) => (
                            <Cell key={i} fill={SECTOR_COLORS[i]} />
                          ))}
                        </Pie>
                        <Tooltip formatter={(value) => [`${Number(value).toFixed(1)}%`, "Weight"]} />
                      </RPieChart>
                    </ResponsiveContainer>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {sectors.slice(0, 6).map((s: Record<string, unknown>, i: number) => (
                        <span key={i} className="text-[9px] flex items-center gap-0.5">
                          <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: SECTOR_COLORS[i] }} />
                          {s.sector as string} ({s.pctOfPortfolio as number}%)
                        </span>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          </div>

          {/* Bottom: Conviction quick list */}
          <Card>
            <CardHeader className="pb-1 pt-3 px-3">
              <CardTitle className="text-sm flex items-center gap-1.5">
                <Target className="h-3.5 w-3.5" /> Top Conviction Stocks
              </CardTitle>
              <p className="text-[10px] text-muted-foreground">Ranked by how much Kacholia believes in each stock — based on position size, buying behavior, and holding duration</p>
            </CardHeader>
            <CardContent className="px-3 pb-3">
              <div className="grid gap-x-6 gap-y-1 sm:grid-cols-2">
                {conviction.slice(0, 10).map((c: Record<string, unknown>, i: number) => (
                  <Link key={i} href={`/stock/${c.symbol}`} className="flex items-center gap-2 text-xs py-1 hover:bg-accent/50 rounded px-1">
                    <span className="w-4 text-muted-foreground text-right">{i + 1}</span>
                    <span className={`w-7 font-bold ${(c.score as number) >= 50 ? "text-green-600" : (c.score as number) >= 25 ? "text-amber-600" : "text-muted-foreground"}`}>{c.score as number}</span>
                    <span className="font-medium text-primary w-20 truncate">{c.symbol as string}</span>
                    <Badge className="text-[9px]" variant="outline">{c.maturity as string}</Badge>
                    <span className="text-muted-foreground ml-auto">{(c.currentWeight as number)?.toFixed(1)}% of portfolio</span>
                  </Link>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* HOLDINGS */}
      {/* ALPHA SIGNALS */}
      {activeSection === "alpha" && (
        <div className="space-y-4">
          {/* Backtest Results */}
          <Card className="border-primary/20">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Zap className="h-4 w-4 text-primary" />
                Kacholia Effect — Does Following Him Actually Work?
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                Historical analysis of every bulk deal entry. What happened to the stock price after Kacholia bought?
              </p>
            </CardHeader>
            <CardContent>
              {backtestLoading ? (
                <div className="flex h-32 items-center justify-center">
                  <div className="text-center">
                    <Loader2 className="h-6 w-6 animate-spin text-primary mx-auto mb-2" />
                    <p className="text-xs text-muted-foreground">Running backtest on {deals.length} historical entries...</p>
                    <p className="text-[10px] text-muted-foreground">Fetching historical prices from Yahoo Finance</p>
                  </div>
                </div>
              ) : backtestData?.totalEntries > 0 ? (
                <div className="space-y-4">
                  <div className="grid gap-3 grid-cols-2 sm:grid-cols-4">
                    <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 text-center">
                      <p className="text-[10px] text-muted-foreground uppercase">Avg Return (3M)</p>
                      <p className={`text-2xl font-bold font-mono ${(backtestData.avgReturn3m || 0) >= 0 ? "text-emerald-500" : "text-red-500"}`}>
                        {backtestData.avgReturn3m !== null ? `${backtestData.avgReturn3m > 0 ? "+" : ""}${backtestData.avgReturn3m}%` : "—"}
                      </p>
                    </div>
                    <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 text-center">
                      <p className="text-[10px] text-muted-foreground uppercase">Win Rate (3M)</p>
                      <p className={`text-2xl font-bold font-mono ${(backtestData.winRate3m || 0) >= 50 ? "text-emerald-500" : "text-red-500"}`}>
                        {backtestData.winRate3m !== null ? `${backtestData.winRate3m}%` : "—"}
                      </p>
                    </div>
                    <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 text-center">
                      <p className="text-[10px] text-muted-foreground uppercase">Avg Return (1Y)</p>
                      <p className={`text-2xl font-bold font-mono ${(backtestData.avgReturn1y || 0) >= 0 ? "text-emerald-500" : "text-red-500"}`}>
                        {backtestData.avgReturn1y !== null ? `${backtestData.avgReturn1y > 0 ? "+" : ""}${backtestData.avgReturn1y}%` : "—"}
                      </p>
                    </div>
                    <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 text-center">
                      <p className="text-[10px] text-muted-foreground uppercase">Entries Analyzed</p>
                      <p className="text-2xl font-bold font-mono">{backtestData.totalEntries}</p>
                      <p className="text-[9px] text-muted-foreground">{backtestData.newEntries} new, {backtestData.addOns} add-ons</p>
                    </div>
                  </div>

                  {/* Best/Worst */}
                  <div className="grid gap-3 sm:grid-cols-2">
                    {backtestData.bestEntry && (
                      <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3">
                        <p className="text-[10px] text-emerald-600 uppercase font-medium">Best Entry</p>
                        <p className="font-bold text-emerald-600">{backtestData.bestEntry.symbol} — +{backtestData.bestEntry.returnPct}% ({backtestData.bestEntry.period})</p>
                      </div>
                    )}
                    {backtestData.worstEntry && (
                      <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-3">
                        <p className="text-[10px] text-red-600 uppercase font-medium">Worst Entry</p>
                        <p className="font-bold text-red-600">{backtestData.worstEntry.symbol} — {backtestData.worstEntry.returnPct}% ({backtestData.worstEntry.period})</p>
                      </div>
                    )}
                  </div>

                  {/* Per-entry table */}
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b">
                          <th className="text-left pb-1.5 font-medium">Stock</th>
                          <th className="text-left pb-1.5 font-medium">Entry Date</th>
                          <th className="text-right pb-1.5 font-medium">Entry ₹</th>
                          <th className="text-right pb-1.5 font-medium">+1W</th>
                          <th className="text-right pb-1.5 font-medium">+1M</th>
                          <th className="text-right pb-1.5 font-medium">+3M</th>
                          <th className="text-right pb-1.5 font-medium">+6M</th>
                          <th className="text-right pb-1.5 font-medium">+1Y</th>
                          <th className="text-right pb-1.5 font-medium">Now</th>
                          <th className="text-left pb-1.5 font-medium">Type</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(backtestData.entries || []).map((e: Record<string, unknown>, i: number) => (
                          <tr key={i} className="border-b last:border-0 hover:bg-accent/50">
                            <td className="py-1.5">
                              <Link href={`/stock/${e.symbol}`} className="font-medium text-primary hover:underline">{e.symbol as string}</Link>
                            </td>
                            <td className="py-1.5 text-muted-foreground">{e.entryDate as string}</td>
                            <td className="py-1.5 text-right font-mono">₹{(e.entryPrice as number)?.toFixed(0)}</td>
                            {[e.return1w, e.return1m, e.return3m, e.return6m, e.return1y].map((r, j) => (
                              <td key={j} className={`py-1.5 text-right font-mono ${r === null ? "text-muted-foreground" : (r as number) >= 0 ? "text-emerald-500" : "text-red-500"}`}>
                                {r !== null ? `${(r as number) > 0 ? "+" : ""}${r}%` : "—"}
                              </td>
                            ))}
                            <td className={`py-1.5 text-right font-mono font-semibold ${(e.currentReturn as number) >= 0 ? "text-emerald-500" : "text-red-500"}`}>
                              {(e.currentReturn as number) > 0 ? "+" : ""}{e.currentReturn as number}%
                            </td>
                            <td className="py-1.5">
                              <Badge variant="outline" className={`text-[9px] ${e.isNewEntry ? "text-primary" : ""}`}>
                                {e.isNewEntry ? "New Entry" : "Add-on"}
                              </Badge>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-4">No deal data to backtest. Run a Trendlyne scrape first.</p>
              )}
            </CardContent>
          </Card>

          {/* AI Signal Dashboard */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Brain className="h-4 w-4 text-primary" />
                AI Signal Analyst
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                {signalsData?.signals?.[0]?.aiAvailable
                  ? "Claude AI analyzes each stock and generates actionable buy/hold/avoid signals"
                  : "Rule-based signal analysis (add AWS Bedrock credentials for AI-powered analysis)"}
              </p>
            </CardHeader>
            <CardContent>
              {signalsLoading ? (
                <div className="flex h-32 items-center justify-center">
                  <div className="text-center">
                    <Loader2 className="h-6 w-6 animate-spin text-primary mx-auto mb-2" />
                    <p className="text-xs text-muted-foreground">Analyzing {holdings.length} stocks...</p>
                  </div>
                </div>
              ) : (signalsData?.signals || []).length > 0 ? (
                <div className="space-y-2">
                  {(signalsData.signals as Array<Record<string, unknown>>).map((s, i) => {
                    const signalColors: Record<string, string> = {
                      STRONG_BUY: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
                      BUY: "bg-green-500/10 text-green-600 border-green-500/20",
                      HOLD: "bg-blue-500/10 text-blue-600 border-blue-500/20",
                      CAUTION: "bg-amber-500/10 text-amber-600 border-amber-500/20",
                      AVOID: "bg-red-500/10 text-red-600 border-red-500/20",
                    };
                    const color = signalColors[s.signal as string] || signalColors.HOLD;
                    return (
                      <div key={i} className={`rounded-lg border p-3 ${color}`}>
                        <div className="flex items-start justify-between">
                          <div className="flex items-center gap-2">
                            <Badge className={`${color} text-xs font-bold`}>{s.signal as string}</Badge>
                            <Link href={`/stock/${s.symbol}`} className="font-semibold text-sm hover:underline">{s.symbol as string}</Link>
                            <span className="text-xs text-muted-foreground">{s.name as string}</span>
                          </div>
                          <span className="text-xs font-mono text-muted-foreground">{s.confidence as number}% confidence</span>
                        </div>
                        <p className="text-xs mt-1.5 leading-relaxed">{s.summary as string}</p>
                        {(s.entryStrategy as string) ? (
                          <p className="text-[10px] text-muted-foreground mt-1">
                            <span className="font-medium">Strategy:</span> {s.entryStrategy as string}
                          </p>
                        ) : null}
                        {(s.targetReturn as string) ? (
                          <p className="text-[10px] text-muted-foreground">
                            <span className="font-medium">Target:</span> {s.targetReturn as string}
                          </p>
                        ) : null}
                        {(s.riskFactors as string[])?.length > 0 && (
                          <div className="mt-1.5 flex flex-wrap gap-1">
                            {(s.riskFactors as string[]).slice(0, 3).map((r, j) => (
                              <span key={j} className="text-[9px] text-muted-foreground bg-background/50 rounded px-1.5 py-0.5">{r}</span>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-4">No signals generated yet.</p>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {activeSection === "holdings" && (
        <div>
          {insightsLoading ? (
            <div className="flex h-64 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : (
            <HoldingsTable holdings={holdings} />
          )}
        </div>
      )}

      {/* CONVICTION */}
      {activeSection === "conviction" && (
        <div className="space-y-3">
          <ConvictionSignals conviction={conviction} />
          {/* Entry Quality Table */}
          {entryQuality.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Entry Quality Analysis</CardTitle>
                <p className="text-xs text-muted-foreground">How well did Kacholia time his entries?</p>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left pb-1.5 font-medium">Stock</th>
                        <th className="text-right pb-1.5 font-medium">Avg Entry</th>
                        <th className="text-right pb-1.5 font-medium">CMP</th>
                        <th className="text-right pb-1.5 font-medium">Return</th>
                        <th className="text-right pb-1.5 font-medium">Days Held</th>
                        <th className="text-right pb-1.5 font-medium">Grade</th>
                      </tr>
                    </thead>
                    <tbody>
                      {entryQuality.slice(0, 15).map((e: Record<string, unknown>) => (
                        <tr key={e.symbol as string} className="border-b last:border-0">
                          <td className="py-1.5">
                            <Link href={`/stock/${e.symbol}`} className="font-medium text-primary hover:underline">{e.symbol as string}</Link>
                          </td>
                          <td className="text-right font-mono">₹{(e.avgEntryPrice as number)?.toFixed(0)}</td>
                          <td className="text-right font-mono">₹{(e.currentPrice as number)?.toFixed(0)}</td>
                          <td className={`text-right font-mono font-semibold ${(e.currentReturn as number) >= 0 ? "text-green-600" : "text-red-600"}`}>
                            {(e.currentReturn as number) > 0 ? "+" : ""}{(e.currentReturn as number)?.toFixed(1)}%
                          </td>
                          <td className="text-right text-muted-foreground">{e.holdingDays as number}d</td>
                          <td className="text-right">
                            <Badge variant="outline" className={`text-[9px] ${
                              e.quality === "Excellent" ? "text-green-600" : e.quality === "Good" ? "text-blue-600" : e.quality === "Average" ? "text-amber-600" : "text-red-600"
                            }`}>{e.quality as string}</Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* DEALS & PATTERNS */}
      {activeSection === "deals" && (
        <div className="space-y-3">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Bulk & Block Deals ({dealsData?.total || 0})</CardTitle>
              <p className="text-xs text-muted-foreground">
                Every publicly disclosed trade where Kacholia (or his entities) bought/sold &gt;1% of a company in a single transaction.
                These are official NSE/BSE filings — the fastest public signal of his activity.
              </p>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left pb-1.5 font-medium">Date</th>
                      <th className="text-left pb-1.5 font-medium">Stock</th>
                      <th className="text-left pb-1.5 font-medium">Action</th>
                      <th className="text-right pb-1.5 font-medium">Shares</th>
                      <th className="text-right pb-1.5 font-medium">Price</th>
                      <th className="text-right pb-1.5 font-medium">Value</th>
                      <th className="text-right pb-1.5 font-medium">% of Co.</th>
                      <th className="text-left pb-1.5 font-medium">Exchange</th>
                    </tr>
                  </thead>
                  <tbody>
                    {deals.map((d: Record<string, unknown>, i: number) => {
                      const qty = d.quantity as number || 0;
                      const price = d.avg_price as number || 0;
                      const value = qty * price;
                      const pctTraded = d.pct_traded as number | null;
                      return (
                        <tr key={i} className="border-b last:border-0 hover:bg-accent/50">
                          <td className="py-1.5 text-muted-foreground whitespace-nowrap">{d.deal_date as string}</td>
                          <td className="py-1.5">
                            <Link href={`/stock/${d.symbol}`} className="font-medium text-primary hover:underline">{d.symbol as string}</Link>
                          </td>
                          <td className="py-1.5">
                            <Badge className={`text-[9px] ${(d.action as string) === "Buy" ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}`}>
                              {d.action as string}
                            </Badge>
                          </td>
                          <td className="py-1.5 text-right font-mono">{qty.toLocaleString("en-IN")}</td>
                          <td className="py-1.5 text-right font-mono">{price.toFixed(0)}</td>
                          <td className="py-1.5 text-right font-mono">{(value / 1e7).toFixed(1)} Cr</td>
                          <td className="py-1.5 text-right font-mono">
                            {pctTraded ? `${pctTraded.toFixed(2)}%` : "—"}
                          </td>
                          <td className="py-1.5 text-muted-foreground">{d.exchange as string}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
          <DealPatternsCard patterns={dealPatterns} />
        </div>
      )}

      {/* RISK & PORTFOLIO HEALTH */}
      {activeSection === "risk" && (
        <div className="space-y-3">
          {/* Concentration Risk — always has data */}
          {analyticsData?.concentration && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Concentration Risk</CardTitle>
                <p className="text-xs text-muted-foreground">How diversified is Kacholia&apos;s portfolio? Higher concentration = higher risk but also higher conviction.</p>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 sm:grid-cols-4">
                  <div className="rounded-lg border p-3">
                    <p className="text-[10px] text-muted-foreground">Top 5 Stocks</p>
                    <p className="text-xl font-bold">{analyticsData.concentration.top5Pct}%</p>
                    <p className="text-[10px] text-muted-foreground">of total portfolio</p>
                  </div>
                  <div className="rounded-lg border p-3">
                    <p className="text-[10px] text-muted-foreground">Top 10 Stocks</p>
                    <p className="text-xl font-bold">{analyticsData.concentration.top10Pct}%</p>
                    <p className="text-[10px] text-muted-foreground">of total portfolio</p>
                  </div>
                  <div className="rounded-lg border p-3">
                    <p className="text-[10px] text-muted-foreground">HHI Index</p>
                    <p className="text-xl font-bold">{analyticsData.concentration.hhi}</p>
                    <p className="text-[10px] text-muted-foreground">{analyticsData.concentration.hhi < 1000 ? "Diversified" : analyticsData.concentration.hhi < 1800 ? "Moderately concentrated" : "Highly concentrated"}</p>
                  </div>
                  <div className="rounded-lg border p-3">
                    <p className="text-[10px] text-muted-foreground">Risk Level</p>
                    <p className={`text-xl font-bold ${analyticsData.concentration.riskLevel === "low" ? "text-green-600" : analyticsData.concentration.riskLevel === "moderate" ? "text-amber-600" : "text-red-600"}`}>
                      {analyticsData.concentration.riskLevel.charAt(0).toUpperCase() + analyticsData.concentration.riskLevel.slice(1)}
                    </p>
                    <p className="text-[10px] text-muted-foreground">{holdings.length} stocks total</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Entry Quality Summary */}
          {entryQuality.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Entry Quality Summary</CardTitle>
                <p className="text-xs text-muted-foreground">How well did Kacholia time his entries? Based on average buy price vs current market price.</p>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 sm:grid-cols-4 mb-4">
                  <div className="rounded-lg border p-3 text-center">
                    <p className="text-2xl font-bold text-green-600">{entryQuality.filter((e: { quality: string }) => e.quality === "Excellent").length}</p>
                    <p className="text-[10px] text-muted-foreground">Excellent (&gt;50% return)</p>
                  </div>
                  <div className="rounded-lg border p-3 text-center">
                    <p className="text-2xl font-bold text-blue-600">{entryQuality.filter((e: { quality: string }) => e.quality === "Good").length}</p>
                    <p className="text-[10px] text-muted-foreground">Good (20-50% return)</p>
                  </div>
                  <div className="rounded-lg border p-3 text-center">
                    <p className="text-2xl font-bold text-amber-600">{entryQuality.filter((e: { quality: string }) => e.quality === "Average").length}</p>
                    <p className="text-[10px] text-muted-foreground">Average (0-20% return)</p>
                  </div>
                  <div className="rounded-lg border p-3 text-center">
                    <p className="text-2xl font-bold text-red-600">{entryQuality.filter((e: { quality: string }) => e.quality === "Poor").length}</p>
                    <p className="text-[10px] text-muted-foreground">Poor (negative return)</p>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  Note: Entry quality is calculated only for stocks where we have bulk deal data (entry price). Many holdings were acquired below the bulk deal threshold, so entry price data is limited.
                </p>
              </CardContent>
            </Card>
          )}

          {/* Drawdown & Beta — show only if we have data */}
          {(drawdown.maxDrawdownPct !== 0 || topContributors.length > 0) && (
            <>
              <RiskPulse drawdown={drawdown} beta={beta} winLoss={winLoss} />
              <PerformanceAttribution topContributors={topContributors} bottomDetractors={bottomDetractors} />
            </>
          )}

          {/* Explain if sections are empty */}
          {drawdown.maxDrawdownPct === 0 && topContributors.length === 0 && (
            <Card>
              <CardContent className="py-6 text-center text-sm text-muted-foreground">
                <p className="font-medium mb-1">Drawdown, Beta & Attribution — Building Data</p>
                <p className="text-xs">These metrics need multiple daily snapshots to compute. The system takes a snapshot every market day at 4 PM IST. After a few days of data, you&apos;ll see: max drawdown from peak, portfolio beta vs NIFTY50, and which stocks are driving or dragging returns.</p>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* SECTORS */}
      {activeSection === "sectors" && (
        <div className="space-y-3">
          {sectors.length > 0 ? (
            <>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Sector Allocation</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={350}>
                    <BarChart data={sectors} layout="vertical" margin={{ left: 80, right: 20 }}>
                      <XAxis type="number" tickFormatter={(v) => `${v}%`} fontSize={10} />
                      <YAxis type="category" dataKey="sector" fontSize={11} width={75} />
                      <Tooltip formatter={(value) => [`${Number(value).toFixed(1)}%`, "Weight"]} />
                      <Bar dataKey="pctOfPortfolio" radius={[0, 4, 4, 0]}>
                        {sectors.map((_: unknown, i: number) => <Cell key={i} fill={SECTOR_COLORS[i % SECTOR_COLORS.length]} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Sector Details</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b">
                          <th className="text-left pb-1.5 font-medium">Sector</th>
                          <th className="text-right pb-1.5 font-medium">Stocks</th>
                          <th className="text-right pb-1.5 font-medium">Value (Cr)</th>
                          <th className="text-right pb-1.5 font-medium">Weight</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sectors.map((s: Record<string, unknown>, i: number) => (
                          <tr key={i} className="border-b last:border-0">
                            <td className="py-1.5 flex items-center gap-1.5">
                              <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: SECTOR_COLORS[i % SECTOR_COLORS.length] }} />
                              {s.sector as string}
                            </td>
                            <td className="text-right">{s.count as number}</td>
                            <td className="text-right font-mono">₹{((s.totalValue as number) / 1e7).toFixed(0)}</td>
                            <td className="text-right font-mono font-semibold">{s.pctOfPortfolio as number}%</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            </>
          ) : (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground text-sm">
                Sector data loading...
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* TIMELINE */}
      {activeSection === "timeline" && (
        <div className="space-y-3">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Activity Timeline</CardTitle>
              <p className="text-xs text-muted-foreground">Every entry, addition, partial exit, and full exit — reconstructed from deal history</p>
            </CardHeader>
            <CardContent>
              {!timelineData?.events || timelineData.events.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">No timeline events yet. Run a scrape to populate deal history.</p>
              ) : (
                <div className="space-y-2 max-h-[500px] overflow-y-auto">
                  {(timelineData.events as Array<Record<string, unknown>>).slice(0, 30).map((e, i) => {
                    const type = e.eventType as string;
                    const Icon = type === "entry" ? LogIn : type === "add" ? ArrowDownCircle : type === "full_exit" ? LogOut : ArrowUpCircle;
                    const color = type === "entry" ? "bg-blue-100 text-blue-800" : type === "add" ? "bg-green-100 text-green-800" : type === "full_exit" ? "bg-red-100 text-red-800" : "bg-orange-100 text-orange-800";
                    return (
                      <div key={i} className="flex items-center gap-3 border-b pb-2 last:border-0 text-xs">
                        <Badge className={`${color} text-[9px] gap-0.5 w-24 justify-center`}>
                          <Icon className="h-3 w-3" /> {type.replace("_", " ")}
                        </Badge>
                        <Link href={`/stock/${e.symbol}`} className="font-medium text-primary hover:underline w-20 truncate">{e.symbol as string}</Link>
                        <span className="text-muted-foreground">{e.eventDate as string}</span>
                        <span className="font-mono">{(e.sharesBefore as number)?.toLocaleString("en-IN")} → {(e.sharesAfter as number)?.toLocaleString("en-IN")}</span>
                        {e.priceAtEvent ? <span className="font-mono text-muted-foreground">@ ₹{(e.priceAtEvent as number).toFixed(0)}</span> : null}
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* P&L Tracker */}
          {timelineData?.pnl && (timelineData.pnl as Array<Record<string, unknown>>).length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">P&L Per Stock</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left pb-1.5 font-medium">Stock</th>
                        <th className="text-right pb-1.5 font-medium">Shares</th>
                        <th className="text-right pb-1.5 font-medium">Avg Buy</th>
                        <th className="text-right pb-1.5 font-medium">CMP</th>
                        <th className="text-right pb-1.5 font-medium">Value (Cr)</th>
                        <th className="text-right pb-1.5 font-medium">P&L %</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(timelineData.pnl as Array<Record<string, unknown>>).slice(0, 20).map((p, i) => (
                        <tr key={i} className="border-b last:border-0">
                          <td className="py-1.5">
                            <Link href={`/stock/${p.symbol}`} className="font-medium text-primary hover:underline">{p.symbol as string}</Link>
                          </td>
                          <td className="text-right font-mono">{(p.currentShares as number)?.toLocaleString("en-IN")}</td>
                          <td className="text-right font-mono">₹{(p.avgBuyPrice as number)?.toFixed(0) || "—"}</td>
                          <td className="text-right font-mono">₹{(p.currentPrice as number)?.toFixed(0)}</td>
                          <td className="text-right font-mono">₹{((p.currentValue as number) / 1e7).toFixed(1)}</td>
                          <td className={`text-right font-mono font-semibold ${(p.unrealizedPnLPct as number) >= 0 ? "text-green-600" : "text-red-600"}`}>
                            {(p.unrealizedPnLPct as number) != null ? `${(p.unrealizedPnLPct as number) > 0 ? "+" : ""}${(p.unrealizedPnLPct as number)?.toFixed(1)}%` : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Footer bar */}
      <div className="flex items-center justify-between text-[10px] text-muted-foreground border-t pt-2">
        <span>Quarter: {quarter} | Prices refresh every 5 min | {insightsData?.computedAt ? `Insights: ${new Date(insightsData.computedAt).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata" })}` : ""}</span>
        <div className="flex gap-3">
          <Link href="/sources" className="hover:text-foreground">17 Sources</Link>
        </div>
      </div>
    </div>
  );
}
