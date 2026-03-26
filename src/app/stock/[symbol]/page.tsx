"use client";

import { useQuery } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line, CartesianGrid } from "recharts";
import Link from "next/link";
import { ArrowLeft, TrendingUp, TrendingDown, Target, Clock, BarChart3, AlertTriangle } from "lucide-react";

const PATTERN_LABELS: Record<string, { label: string; color: string }> = {
  averaging_down: { label: "Averaging Down", color: "bg-blue-100 text-blue-800" },
  trimming_into_strength: { label: "Trimming Into Strength", color: "bg-amber-100 text-amber-800" },
  accumulation: { label: "Accumulation", color: "bg-green-100 text-green-800" },
  distribution: { label: "Distribution", color: "bg-red-100 text-red-800" },
  one_time_buy: { label: "One-Time Buy", color: "bg-gray-100 text-gray-800" },
  mixed: { label: "Mixed", color: "bg-purple-100 text-purple-800" },
};

const QUALITY_COLORS: Record<string, string> = {
  Excellent: "text-green-600", Good: "text-blue-600", Average: "text-amber-600", Poor: "text-red-600",
};

const MATURITY_COLORS: Record<string, string> = {
  New: "bg-blue-100 text-blue-800", Established: "bg-green-100 text-green-800",
  "Long-term": "bg-purple-100 text-purple-800", Veteran: "bg-amber-100 text-amber-800",
};

export default function StockDeepDivePage() {
  const params = useParams();
  const symbol = (params.symbol as string || "").toUpperCase();

  const { data, isLoading, error } = useQuery({
    queryKey: ["stock", symbol],
    queryFn: async () => {
      const res = await fetch(`/api/stock/${symbol}`);
      if (!res.ok) throw new Error("Stock not found");
      return res.json();
    },
    enabled: !!symbol,
  });

  if (isLoading) {
    return (
      <div className="mx-auto max-w-5xl p-6">
        <div className="flex h-64 items-center justify-center text-muted-foreground">Loading {symbol}...</div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="mx-auto max-w-5xl p-6">
        <Link href="/holdings" className="text-sm text-primary hover:underline flex items-center gap-1 mb-4">
          <ArrowLeft className="h-4 w-4" /> Back to Holdings
        </Link>
        <p className="text-muted-foreground">Stock &quot;{symbol}&quot; not found.</p>
      </div>
    );
  }

  const { stock, holding, holdingsHistory, deals, analysis } = data;
  const patternInfo = PATTERN_LABELS[analysis.pattern] || PATTERN_LABELS.mixed;

  // Chart data: quarterly positions
  const positionChart = (holdingsHistory || []).map((h: { quarter: string; shares_held: number; pct_holding: number }) => ({
    quarter: h.quarter,
    shares: h.shares_held,
    pct: h.pct_holding,
  }));

  // Deal timeline
  const dealTimeline = (deals || []).slice(0, 20).map((d: Record<string, unknown>) => ({
    date: d.deal_date,
    action: d.action,
    qty: (d.quantity as number),
    price: (d.avg_price as number),
    exchange: d.exchange,
    type: d.deal_type,
    value: (d.quantity as number) * (d.avg_price as number),
  }));

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 md:p-6">
      {/* Back link */}
      <Link href="/holdings" className="text-sm text-primary hover:underline flex items-center gap-1">
        <ArrowLeft className="h-4 w-4" /> Back to Holdings
      </Link>

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">{stock.name}</h1>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-lg font-mono">{stock.symbol}</span>
            {stock.sector && <Badge variant="outline">{stock.sector}</Badge>}
            <Badge className={MATURITY_COLORS[analysis.maturity] || ""}>{analysis.maturity}</Badge>
            <Badge className={patternInfo.color}>{patternInfo.label}</Badge>
          </div>
        </div>
        <div className="text-right">
          <p className="text-2xl font-bold">
            {stock.currentPrice > 0 ? `₹${stock.currentPrice.toLocaleString("en-IN")}` : "N/A"}
          </p>
          <p className={`text-sm ${stock.changePct >= 0 ? "text-green-600" : "text-red-600"}`}>
            {stock.changePct >= 0 ? "+" : ""}{stock.changePct?.toFixed(2)}% today
          </p>
        </div>
      </div>

      {/* Key Metrics Row */}
      <div className="grid gap-3 grid-cols-2 sm:grid-cols-4">
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground">Conviction Score</p>
            <p className={`text-2xl font-bold ${analysis.convictionScore >= 50 ? "text-green-600" : analysis.convictionScore >= 25 ? "text-amber-600" : "text-muted-foreground"}`}>
              {analysis.convictionScore}/100
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground">Entry Quality</p>
            <p className={`text-2xl font-bold ${QUALITY_COLORS[analysis.quality] || ""}`}>
              {analysis.quality}
            </p>
            <p className="text-[10px] text-muted-foreground">
              {analysis.currentReturn > 0 ? "+" : ""}{analysis.currentReturn}% from entry
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground">Current Value</p>
            <p className="text-2xl font-bold">
              {holding ? `₹${(holding.currentValue / 1e7).toFixed(1)} Cr` : "Exited"}
            </p>
            <p className="text-[10px] text-muted-foreground">
              {holding ? `${holding.sharesHeld.toLocaleString("en-IN")} shares` : ""}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground">Holding Period</p>
            <p className="text-2xl font-bold">{analysis.quartersHeld}Q</p>
            <p className="text-[10px] text-muted-foreground">{analysis.holdingDays} days</p>
          </CardContent>
        </Card>
      </div>

      {/* Conviction Breakdown + Entry Analysis */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Target className="h-4 w-4" /> Conviction Breakdown
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {[
              { label: "Position Size", value: analysis.convictionBreakdown.positionSize, max: 25, color: "bg-blue-500" },
              { label: "Add-on Buys", value: analysis.convictionBreakdown.addOnDeals, max: 20, color: "bg-green-500" },
              { label: "Holding Duration", value: analysis.convictionBreakdown.holdingPeriod, max: 25, color: "bg-purple-500" },
              { label: "Averaged Down", value: analysis.convictionBreakdown.averagedDown, max: 15, color: "bg-amber-500" },
              { label: "Deal Frequency", value: analysis.convictionBreakdown.dealFrequency, max: 15, color: "bg-rose-500" },
            ].map(({ label, value, max, color }) => (
              <div key={label} className="space-y-0.5">
                <div className="flex justify-between text-xs">
                  <span>{label}</span>
                  <span className="font-mono">{value}/{max}</span>
                </div>
                <div className="h-2 rounded-full bg-muted overflow-hidden">
                  <div className={`h-full rounded-full ${color}`} style={{ width: `${(value / max) * 100}%` }} />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingUp className="h-4 w-4" /> Entry & P&L Analysis
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">Avg Entry Price</span><span className="font-mono">₹{analysis.avgEntryPrice.toLocaleString("en-IN")}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Current Price</span><span className="font-mono">₹{stock.currentPrice.toLocaleString("en-IN")}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Return from Entry</span><span className={`font-mono font-semibold ${analysis.currentReturn >= 0 ? "text-green-600" : "text-red-600"}`}>{analysis.currentReturn > 0 ? "+" : ""}{analysis.currentReturn}%</span></div>
            <div className="border-t pt-2 mt-2" />
            <div className="flex justify-between"><span className="text-muted-foreground">Total Bought</span><span className="font-mono">₹{(analysis.totalBuyCost / 1e7).toFixed(2)} Cr</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Total Sold</span><span className="font-mono">₹{(analysis.totalSellProceeds / 1e7).toFixed(2)} Cr</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Net Invested</span><span className="font-mono">₹{(analysis.totalInvested / 1e7).toFixed(2)} Cr</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Unrealized P&L</span><span className={`font-mono font-semibold ${analysis.unrealizedPnL >= 0 ? "text-green-600" : "text-red-600"}`}>₹{(analysis.unrealizedPnL / 1e7).toFixed(2)} Cr</span></div>
            <div className="border-t pt-2 mt-2" />
            <div className="flex justify-between"><span className="text-muted-foreground">Total Buys</span><span>{analysis.totalBuys}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Total Sells</span><span>{analysis.totalSells}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">First Buy</span><span>{analysis.firstBuyDate || "N/A"}</span></div>
            {stock.pe_ratio && <div className="flex justify-between"><span className="text-muted-foreground">P/E Ratio</span><span>{stock.pe_ratio.toFixed(1)}</span></div>}
            {stock.roe && <div className="flex justify-between"><span className="text-muted-foreground">ROE</span><span>{stock.roe.toFixed(1)}%</span></div>}
          </CardContent>
        </Card>
      </div>

      {/* Quarterly Position Chart */}
      {positionChart.length > 1 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <BarChart3 className="h-4 w-4" /> Position Over Time
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={positionChart}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="quarter" fontSize={10} />
                <YAxis fontSize={10} tickFormatter={(v) => v >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : v >= 1e3 ? `${(v / 1e3).toFixed(0)}K` : v} />
                <Tooltip formatter={(value) => [Number(value).toLocaleString("en-IN"), "Shares"]} />
                <Bar dataKey="shares" fill="#6366f1" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Deal History */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Clock className="h-4 w-4" /> Deal History
          </CardTitle>
        </CardHeader>
        <CardContent>
          {dealTimeline.length === 0 ? (
            <p className="text-sm text-muted-foreground">No deals recorded.</p>
          ) : (
            <div className="space-y-2">
              {dealTimeline.map((d: Record<string, unknown>, i: number) => (
                <div key={i} className="flex items-center justify-between rounded border px-3 py-2 text-sm">
                  <div className="flex items-center gap-3">
                    <Badge className={`text-xs ${(d.action as string) === "Buy" ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}`}>
                      {d.action as string}
                    </Badge>
                    <span className="text-muted-foreground text-xs">{d.date as string}</span>
                    <span className="font-mono">{(d.qty as number).toLocaleString("en-IN")} shares</span>
                    <span className="font-mono">@ ₹{(d.price as number).toLocaleString("en-IN")}</span>
                  </div>
                  <div className="text-right">
                    <span className="text-xs text-muted-foreground">{d.exchange as string} {d.type as string}</span>
                    <p className="font-mono text-xs">₹{((d.value as number) / 1e7).toFixed(2)} Cr</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Fundamentals */}
      {(stock.market_cap || stock.pe_ratio || stock.roe || stock.roce) && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Fundamentals</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
              {stock.market_cap && (
                <div>
                  <p className="text-xs text-muted-foreground">Market Cap</p>
                  <p className="font-mono">₹{(stock.market_cap / 1e7).toFixed(0)} Cr</p>
                </div>
              )}
              {stock.pe_ratio && (
                <div>
                  <p className="text-xs text-muted-foreground">P/E Ratio</p>
                  <p className="font-mono">{stock.pe_ratio.toFixed(1)}</p>
                </div>
              )}
              {stock.roe && (
                <div>
                  <p className="text-xs text-muted-foreground">ROE</p>
                  <p className="font-mono">{stock.roe.toFixed(1)}%</p>
                </div>
              )}
              {stock.roce && (
                <div>
                  <p className="text-xs text-muted-foreground">ROCE</p>
                  <p className="font-mono">{stock.roce.toFixed(1)}%</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
