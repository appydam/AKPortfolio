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
      <div className="rounded-xl border-2 border-primary/20 bg-gradient-to-r from-primary/5 via-background to-primary/5 p-4 md:p-5">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Brain className="h-6 w-6 text-primary" />
              <h1 className="text-xl md:text-2xl font-bold tracking-tight">Ashish Kacholia — Intelligence Terminal</h1>
            </div>
            <p className="text-xs text-muted-foreground">
              17 sources | 19 intelligence layers | 4 entities tracked | Real-time surveillance
            </p>
          </div>
          <div className="flex items-center gap-2">
            {overallHealth && (
              <Link href="/health">
                <Badge variant="outline" className="gap-1 text-[10px] cursor-pointer hover:bg-accent">
                  {healthIcon} {overallHealth.healthy}/{overallHealth.total}
                </Badge>
              </Link>
            )}
            <Button variant="outline" size="sm" onClick={handleScrape} disabled={scraping} className="h-7 text-xs">
              {scraping ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <RefreshCw className="mr-1 h-3 w-3" />}
              {scraping ? "..." : "Refresh"}
            </Button>
          </div>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-2 md:grid-cols-6 gap-3 mt-4">
          <div className="rounded-lg bg-background/80 border p-2.5">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Portfolio Value</p>
            <p className="text-lg md:text-xl font-bold font-mono">
              {totalValue > 0 ? `₹${(totalValue / 1e7).toFixed(0)} Cr` : "—"}
            </p>
          </div>
          <div className="rounded-lg bg-background/80 border p-2.5">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Today</p>
            <p className={`text-lg md:text-xl font-bold font-mono ${avgChange >= 0 ? "text-green-600" : "text-red-600"}`}>
              {avgChange >= 0 ? "+" : ""}{avgChange.toFixed(2)}%
            </p>
          </div>
          <div className="rounded-lg bg-background/80 border p-2.5">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Holdings</p>
            <p className="text-lg md:text-xl font-bold font-mono">{holdings.length}</p>
          </div>
          <div className="rounded-lg bg-background/80 border p-2.5">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Gainers/Losers</p>
            <p className="text-lg md:text-xl font-bold">
              <span className="text-green-600">{gainers}</span>
              <span className="text-muted-foreground mx-1">/</span>
              <span className="text-red-600">{losers}</span>
            </p>
          </div>
          <div className="rounded-lg bg-background/80 border p-2.5">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Entry Quality</p>
            <p className="text-lg md:text-xl font-bold">
              <span className="text-green-600">{excellentEntries}</span>
              <span className="text-muted-foreground text-xs mx-1">exc</span>
              <span className="text-blue-600">{goodEntries}</span>
              <span className="text-muted-foreground text-xs ml-1">good</span>
            </p>
          </div>
          <div className="rounded-lg bg-background/80 border p-2.5">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Deals Tracked</p>
            <p className="text-lg md:text-xl font-bold font-mono">{dealsData?.total || 0}</p>
          </div>
        </div>
      </div>

      {/* ─── SECTION TABS ─── */}
      <div className="flex gap-1 overflow-x-auto pb-1 border-b">
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

          {/* Bottom row: Recent deals + Quick conviction */}
          <div className="grid gap-3 lg:grid-cols-2">
            <DealFeed deals={deals.slice(0, 8)} />
            <Card>
              <CardHeader className="pb-1 pt-3 px-3">
                <CardTitle className="text-sm flex items-center gap-1.5">
                  <Target className="h-3.5 w-3.5" /> Highest Conviction Stocks
                </CardTitle>
              </CardHeader>
              <CardContent className="px-3 pb-3">
                <div className="space-y-1.5">
                  {conviction.slice(0, 8).map((c: Record<string, unknown>, i: number) => (
                    <div key={i} className="flex items-center gap-2 text-xs">
                      <span className="w-4 text-muted-foreground text-right">{i + 1}</span>
                      <span className={`w-7 font-bold ${(c.score as number) >= 50 ? "text-green-600" : (c.score as number) >= 25 ? "text-amber-600" : "text-muted-foreground"}`}>{c.score as number}</span>
                      <Link href={`/stock/${c.symbol}`} className="font-medium text-primary hover:underline w-20 truncate">{c.symbol as string}</Link>
                      <Badge className="text-[9px]" variant="outline">{c.maturity as string}</Badge>
                      <span className="text-muted-foreground ml-auto">{(c.currentWeight as number)?.toFixed(1)}%</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* HOLDINGS */}
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
        <div className="grid gap-3 lg:grid-cols-2">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">All Deals ({dealsData?.total || 0})</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-1.5 max-h-[500px] overflow-y-auto">
                {deals.map((d: Record<string, unknown>, i: number) => (
                  <div key={i} className="flex items-center justify-between text-xs border-b pb-1.5 last:border-0">
                    <div className="flex items-center gap-2">
                      <Badge className={`text-[9px] ${(d.action as string) === "Buy" ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}`}>{d.action as string}</Badge>
                      <Link href={`/stock/${d.symbol}`} className="font-medium text-primary hover:underline">{d.symbol as string}</Link>
                      <span className="text-muted-foreground">{d.deal_date as string}</span>
                    </div>
                    <div className="text-right font-mono">
                      {(d.quantity as number)?.toLocaleString("en-IN")} @ ₹{(d.avg_price as number)?.toFixed(0)}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
          <DealPatternsCard patterns={dealPatterns} />
        </div>
      )}

      {/* RISK & PERFORMANCE */}
      {activeSection === "risk" && (
        <div className="space-y-3">
          <RiskPulse drawdown={drawdown} beta={beta} winLoss={winLoss} concentration={analyticsData?.concentration} />
          <PerformanceAttribution topContributors={topContributors} bottomDetractors={bottomDetractors} />
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
          <Link href="/bigbulls" className="hover:text-foreground">Big Bulls</Link>
        </div>
      </div>
    </div>
  );
}
