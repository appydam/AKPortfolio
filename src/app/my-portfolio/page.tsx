"use client";

import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Loader2, TrendingUp, TrendingDown, User, BarChart3,
  GitCompareArrows, CircleDot, ArrowUpRight, ArrowDownRight,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, Legend,
} from "recharts";

// New analysis components
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
  if (abs >= 10000000) return `₹${(value / 10000000).toFixed(2)} Cr`;
  if (abs >= 100000) return `₹${(value / 100000).toFixed(2)} L`;
  return `₹${value.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

function pnlColor(val: number) {
  return val >= 0 ? "text-green-600" : "text-red-600";
}

function PnlBadge({ value }: { value: number }) {
  return (
    <Badge className={value >= 0 ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}>
      {value >= 0 ? "+" : ""}{value.toFixed(2)}%
    </Badge>
  );
}

interface Holding {
  symbol: string;
  exchange: string;
  quantity: number;
  avgPrice: number;
  ltp: number;
  invested: number;
  currentValue: number;
  pnl: number;
  pnlPct: number;
  dayChangePct: number;
}

interface AKHolding {
  symbol: string;
  name: string;
  shares: number;
  pctHolding: number;
  price: number;
  changePct: number;
  value: number;
}

interface Overlap {
  symbol: string;
  name: string;
  myQty: number;
  myAvgPrice: number;
  myPnlPct: number;
  akShares: number;
  akPctHolding: number;
  ltp: number;
  dayChangePct: number;
}

interface MFHolding {
  fund: string;
  folio: string;
  tradingsymbol: string;
  quantity: number;
  avgNav: number;
  currentNav: number;
  invested: number;
  currentValue: number;
  pnl: number;
  pnlPct: number;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Analytics = Record<string, any>;

interface PortfolioData {
  user: string;
  syncedAt: string;
  my: {
    holdings: Holding[];
    totalInvested: number;
    totalCurrent: number;
    totalPnl: number;
    totalPnlPct: number;
    count: number;
  };
  mf: {
    holdings: MFHolding[];
    totalInvested: number;
    totalCurrent: number;
    totalPnl: number;
    totalPnlPct: number;
    count: number;
  };
  grand: {
    totalInvested: number;
    totalCurrent: number;
    totalPnl: number;
    totalPnlPct: number;
  };
  ak: {
    holdings: AKHolding[];
    totalValue: number;
    count: number;
  };
  comparison: {
    overlap: Overlap[];
    onlyMine: string[];
    onlyAK: string[];
    overlapCount: number;
    similarityPct: number;
  };
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

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-64 items-center justify-center">
        <p className="text-muted-foreground">Failed to load portfolio: {(error as Error).message}</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex h-64 items-center justify-center">
        <p className="text-muted-foreground">No portfolio data available</p>
      </div>
    );
  }

  const my = data.my ?? { holdings: [], totalInvested: 0, totalCurrent: 0, totalPnl: 0, totalPnlPct: 0, count: 0 };
  const mf = data.mf ?? { holdings: [], totalInvested: 0, totalCurrent: 0, totalPnl: 0, totalPnlPct: 0, count: 0 };
  const grand = data.grand ?? { totalInvested: 0, totalCurrent: 0, totalPnl: 0, totalPnlPct: 0 };
  const ak = data.ak ?? { holdings: [], totalValue: 0, count: 0 };
  const comparison = data.comparison ?? { overlap: [], onlyMine: [], onlyAK: [], overlapCount: 0, similarityPct: 0 };
  const analytics = data.analytics ?? {};

  const topGainers = [...(my.holdings || [])].sort((a, b) => b.pnlPct - a.pnlPct).slice(0, 5);
  const topLosers = [...(my.holdings || [])].sort((a, b) => a.pnlPct - b.pnlPct).slice(0, 5);

  const top10 = [...(my.holdings || [])]
    .sort((a, b) => b.currentValue - a.currentValue)
    .slice(0, 10)
    .map((h) => ({
      name: h.symbol,
      invested: Math.round(h.invested),
      current: Math.round(h.currentValue),
    }));

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-6">

      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">My Portfolio</h1>
          <p className="text-sm text-muted-foreground">
            {data.user} · Synced {data.syncedAt} · {my.count} stocks · {mf.count} mutual funds
          </p>
        </div>
      </div>

      {/* ── Grand Summary ── */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total Invested</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{fmt(grand.totalInvested)}</div>
            <p className="text-xs text-muted-foreground">{my.count} stocks + {mf.count} MFs</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Current Value</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{fmt(grand.totalCurrent)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Overall P&L</CardTitle>
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${pnlColor(grand.totalPnl)}`}>
              {grand.totalPnl >= 0 ? "+" : ""}{fmt(grand.totalPnl)}
            </div>
            <PnlBadge value={grand.totalPnlPct} />
          </CardContent>
        </Card>
      </div>

      {/* ── Stocks vs MF Breakdown ── */}
      <div className="grid gap-4 md:grid-cols-5">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Stocks Invested</CardTitle></CardHeader>
          <CardContent>
            <div className="text-xl font-bold">{fmt(my.totalInvested)}</div>
            <p className="text-xs text-muted-foreground">{my.count} stocks</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Stocks P&L</CardTitle></CardHeader>
          <CardContent>
            <div className={`text-xl font-bold ${pnlColor(my.totalPnl)}`}>
              {my.totalPnl >= 0 ? "+" : ""}{fmt(my.totalPnl)}
            </div>
            <PnlBadge value={my.totalPnlPct} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">MF Invested</CardTitle></CardHeader>
          <CardContent>
            <div className="text-xl font-bold">{fmt(mf.totalInvested)}</div>
            <p className="text-xs text-muted-foreground">{mf.count} funds</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">MF P&L</CardTitle></CardHeader>
          <CardContent>
            <div className={`text-xl font-bold ${pnlColor(mf.totalPnl)}`}>
              {mf.totalPnl >= 0 ? "+" : ""}{fmt(mf.totalPnl)}
            </div>
            <PnlBadge value={mf.totalPnlPct} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-1.5">
              <GitCompareArrows className="h-3.5 w-3.5" />AK Overlap
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold">{comparison.overlapCount}</div>
            <p className="text-xs text-muted-foreground">{comparison.similarityPct}% of your stocks</p>
          </CardContent>
        </Card>
      </div>

      {/* ── Health Score ── */}
      {analytics.healthScore && <HealthScore data={analytics.healthScore} />}

      {/* ── Insights ── */}
      {analytics.insights?.length > 0 && <InsightsPanel insights={analytics.insights} />}

      {/* ── Allocation Donuts ── */}
      {analytics.stockAllocation && analytics.assetAllocation && (
        <StockAllocationChart
          stockAllocation={analytics.stockAllocation}
          assetAllocation={analytics.assetAllocation}
        />
      )}

      {/* ── Performance Treemap ── */}
      {analytics.treemapData?.length > 0 && <PerformanceTreemap data={analytics.treemapData} />}

      {/* ── Top 10 Invested vs Current ── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium flex items-center gap-1.5">
            <BarChart3 className="h-4 w-4" />
            Top 10 Holdings — Invested vs Current
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={top10} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}K`} />
              <YAxis type="category" dataKey="name" width={90} tick={{ fontSize: 11 }} />
              <Tooltip formatter={(value) => [`₹${Number(value).toLocaleString("en-IN")}`, ""]} />
              <Legend />
              <Bar dataKey="invested" name="Invested" fill="#94a3b8" radius={[0, 4, 4, 0]} />
              <Bar dataKey="current" name="Current" fill="#2563eb" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* ── P&L Distribution ── */}
      {analytics.pnlDistribution && analytics.pnlSummary && (
        <PnlDistribution
          distribution={analytics.pnlDistribution}
          summary={analytics.pnlSummary}
        />
      )}

      {/* ── Risk Scorecard ── */}
      {analytics.risk && <RiskScorecard data={analytics.risk} />}

      {/* ── Day Change Scatter ── */}
      {analytics.dayChange && <DayChangeScatter data={analytics.dayChange} />}

      {/* ── You vs AK Radar ── */}
      {analytics.vsAK && <VsAKRadar data={analytics.vsAK} />}

      {/* ── Recovery Analysis ── */}
      {analytics.recovery?.length > 0 && <RecoveryAnalysis data={analytics.recovery} />}

      {/* ── MF Category Breakdown ── */}
      {analytics.mfCategories?.length > 0 && <MFBreakdown categories={analytics.mfCategories} />}

      {/* ── Tabs: Holdings / Overlap / MFs / Unique ── */}
      <Tabs defaultValue="holdings">
        <TabsList>
          <TabsTrigger value="holdings">
            <User className="mr-1.5 h-4 w-4" />My Holdings
          </TabsTrigger>
          <TabsTrigger value="overlap">
            <GitCompareArrows className="mr-1.5 h-4 w-4" />
            AK Overlap ({comparison.overlapCount})
          </TabsTrigger>
          <TabsTrigger value="mf">
            <BarChart3 className="mr-1.5 h-4 w-4" />
            Mutual Funds ({mf.count})
          </TabsTrigger>
          <TabsTrigger value="unique">
            <CircleDot className="mr-1.5 h-4 w-4" />Unique Stocks
          </TabsTrigger>
        </TabsList>

        {/* My Holdings */}
        <TabsContent value="holdings">
          <Card>
            <CardContent className="pt-4">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Symbol</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                    <TableHead className="text-right">Avg Price</TableHead>
                    <TableHead className="text-right">LTP</TableHead>
                    <TableHead className="text-right">Invested</TableHead>
                    <TableHead className="text-right">Current</TableHead>
                    <TableHead className="text-right">P&L</TableHead>
                    <TableHead className="text-right">P&L %</TableHead>
                    <TableHead className="text-right">Day %</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {my.holdings
                    .sort((a, b) => b.currentValue - a.currentValue)
                    .map((h) => (
                      <TableRow key={h.symbol}>
                        <TableCell className="font-medium">{h.symbol}</TableCell>
                        <TableCell className="text-right">{h.quantity}</TableCell>
                        <TableCell className="text-right font-mono">₹{h.avgPrice.toLocaleString("en-IN")}</TableCell>
                        <TableCell className="text-right font-mono">₹{h.ltp.toLocaleString("en-IN")}</TableCell>
                        <TableCell className="text-right font-mono">{fmt(h.invested)}</TableCell>
                        <TableCell className="text-right font-mono">{fmt(h.currentValue)}</TableCell>
                        <TableCell className={`text-right font-mono ${pnlColor(h.pnl)}`}>
                          {h.pnl >= 0 ? "+" : ""}{fmt(h.pnl)}
                        </TableCell>
                        <TableCell className="text-right"><PnlBadge value={h.pnlPct} /></TableCell>
                        <TableCell className={`text-right font-mono ${pnlColor(h.dayChangePct)}`}>
                          {h.dayChangePct >= 0 ? "+" : ""}{h.dayChangePct.toFixed(2)}%
                        </TableCell>
                      </TableRow>
                    ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* AK Overlap */}
        <TabsContent value="overlap">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium">
                Stocks you hold that are also in Ashish Kacholia&apos;s portfolio
              </CardTitle>
            </CardHeader>
            <CardContent>
              {comparison.overlap.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">No overlapping stocks found</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Symbol</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead className="text-right">Your Qty</TableHead>
                      <TableHead className="text-right">Your Avg</TableHead>
                      <TableHead className="text-right">AK Shares</TableHead>
                      <TableHead className="text-right">AK %Hold</TableHead>
                      <TableHead className="text-right">LTP</TableHead>
                      <TableHead className="text-right">Your P&L %</TableHead>
                      <TableHead className="text-right">Day %</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {comparison.overlap.map((h) => (
                      <TableRow key={h.symbol}>
                        <TableCell className="font-medium">{h.symbol}</TableCell>
                        <TableCell>{h.name}</TableCell>
                        <TableCell className="text-right">{h.myQty}</TableCell>
                        <TableCell className="text-right font-mono">₹{h.myAvgPrice.toLocaleString("en-IN")}</TableCell>
                        <TableCell className="text-right font-mono">{h.akShares.toLocaleString("en-IN")}</TableCell>
                        <TableCell className="text-right font-mono">{h.akPctHolding}%</TableCell>
                        <TableCell className="text-right font-mono">₹{h.ltp.toLocaleString("en-IN")}</TableCell>
                        <TableCell className="text-right"><PnlBadge value={h.myPnlPct} /></TableCell>
                        <TableCell className={`text-right font-mono ${pnlColor(h.dayChangePct)}`}>
                          {h.dayChangePct >= 0 ? "+" : ""}{h.dayChangePct.toFixed(2)}%
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Mutual Funds */}
        <TabsContent value="mf">
          <Card>
            <CardContent className="pt-4">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fund</TableHead>
                    <TableHead className="text-right">Units</TableHead>
                    <TableHead className="text-right">Avg NAV</TableHead>
                    <TableHead className="text-right">Current NAV</TableHead>
                    <TableHead className="text-right">Invested</TableHead>
                    <TableHead className="text-right">Current</TableHead>
                    <TableHead className="text-right">P&L</TableHead>
                    <TableHead className="text-right">P&L %</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(mf.holdings || [])
                    .sort((a, b) => b.currentValue - a.currentValue)
                    .map((h) => (
                      <TableRow key={h.tradingsymbol}>
                        <TableCell className="font-medium max-w-[250px] truncate">{h.fund}</TableCell>
                        <TableCell className="text-right font-mono">{h.quantity.toFixed(2)}</TableCell>
                        <TableCell className="text-right font-mono">₹{h.avgNav.toFixed(2)}</TableCell>
                        <TableCell className="text-right font-mono">₹{h.currentNav.toFixed(2)}</TableCell>
                        <TableCell className="text-right font-mono">{fmt(h.invested)}</TableCell>
                        <TableCell className="text-right font-mono">{fmt(h.currentValue)}</TableCell>
                        <TableCell className={`text-right font-mono ${pnlColor(h.pnl)}`}>
                          {h.pnl >= 0 ? "+" : ""}{fmt(h.pnl)}
                        </TableCell>
                        <TableCell className="text-right"><PnlBadge value={h.pnlPct} /></TableCell>
                      </TableRow>
                    ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Unique Stocks */}
        <TabsContent value="unique">
          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium flex items-center gap-1.5">
                  <ArrowUpRight className="h-4 w-4 text-blue-600" />
                  Only in Your Portfolio ({comparison.onlyMine.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {comparison.onlyMine.map((symbol) => {
                    const h = my.holdings.find((x) => x.symbol === symbol);
                    return (
                      <div key={symbol} className="flex items-center justify-between rounded border p-2">
                        <div>
                          <div className="font-medium text-sm">{symbol}</div>
                          <div className="text-xs text-muted-foreground">
                            {h?.quantity} shares @ ₹{h?.avgPrice.toLocaleString("en-IN")}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="font-mono text-sm">₹{h?.ltp.toLocaleString("en-IN")}</div>
                          {h && <PnlBadge value={h.pnlPct} />}
                        </div>
                      </div>
                    );
                  })}
                  {comparison.onlyMine.length === 0 && (
                    <p className="text-center text-muted-foreground py-4">All your stocks overlap with AK</p>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium flex items-center gap-1.5">
                  <ArrowDownRight className="h-4 w-4 text-orange-600" />
                  Only in AK&apos;s Portfolio ({comparison.onlyAK.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 max-h-[500px] overflow-y-auto">
                  {comparison.onlyAK.map((symbol) => {
                    const h = ak.holdings.find((x) => x.symbol === symbol);
                    return (
                      <div key={symbol} className="flex items-center justify-between rounded border p-2">
                        <div>
                          <div className="font-medium text-sm">{h?.name || symbol}</div>
                          <div className="text-xs text-muted-foreground">{h?.pctHolding}% holding</div>
                        </div>
                        <div className="text-right">
                          <div className="font-mono text-sm">₹{h?.price?.toLocaleString("en-IN")}</div>
                          <div className="font-mono text-xs text-muted-foreground">{fmt(h?.value || 0)}</div>
                        </div>
                      </div>
                    );
                  })}
                  {comparison.onlyAK.length === 0 && (
                    <p className="text-center text-muted-foreground py-4">You hold all of AK&apos;s stocks</p>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      {/* ── Top Gainers / Losers ── */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium flex items-center gap-1.5">
              <TrendingUp className="h-4 w-4 text-green-600" />Your Top Gainers
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {topGainers.map((h) => (
                <div key={h.symbol} className="flex items-center justify-between rounded border p-2">
                  <div>
                    <div className="font-medium text-sm">{h.symbol}</div>
                    <div className="text-xs text-muted-foreground">
                      {h.quantity} shares @ ₹{h.avgPrice.toLocaleString("en-IN")}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-mono text-sm">₹{h.ltp.toLocaleString("en-IN")}</div>
                    <PnlBadge value={h.pnlPct} />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium flex items-center gap-1.5">
              <TrendingDown className="h-4 w-4 text-red-600" />Your Top Losers
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {topLosers.map((h) => (
                <div key={h.symbol} className="flex items-center justify-between rounded border p-2">
                  <div>
                    <div className="font-medium text-sm">{h.symbol}</div>
                    <div className="text-xs text-muted-foreground">
                      {h.quantity} shares @ ₹{h.avgPrice.toLocaleString("en-IN")}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-mono text-sm">₹{h.ltp.toLocaleString("en-IN")}</div>
                    <PnlBadge value={h.pnlPct} />
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
