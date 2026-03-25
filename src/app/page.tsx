"use client";

import { useQuery } from "@tanstack/react-query";
import { PortfolioSummary } from "@/components/dashboard/portfolio-summary";
import { DealFeed } from "@/components/dashboard/deal-feed";
import { WhatChanged } from "@/components/insights/what-changed";
import { ConvictionSignals } from "@/components/insights/conviction-signals";
import { RiskPulse } from "@/components/insights/risk-pulse";
import { PerformanceAttribution } from "@/components/insights/performance-attribution";
import { SectorRotationChart } from "@/components/insights/sector-rotation-chart";
import { HoldingsHeatmap } from "@/components/insights/holdings-heatmap";
import { DealPatternsCard } from "@/components/insights/deal-patterns-card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RefreshCw, Loader2, CheckCircle, AlertTriangle, XCircle } from "lucide-react";
import { useState } from "react";
import Link from "next/link";

export default function InsightsPage() {
  const [scraping, setScraping] = useState(false);

  const { data: insightsData, isLoading: insightsLoading } = useQuery({
    queryKey: ["insights"],
    queryFn: async () => {
      const res = await fetch("/api/insights");
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
  });

  const { data: holdingsData, refetch: refetchHoldings } = useQuery({
    queryKey: ["holdings"],
    queryFn: async () => {
      const res = await fetch("/api/holdings");
      return res.json();
    },
    refetchInterval: 10_000,
  });

  const { data: dealsData, refetch: refetchDeals } = useQuery({
    queryKey: ["deals"],
    queryFn: async () => {
      const res = await fetch("/api/deals?limit=10");
      return res.json();
    },
    refetchInterval: 120_000,
  });

  const { data: analyticsData } = useQuery({
    queryKey: ["analytics"],
    queryFn: async () => {
      const res = await fetch("/api/analytics");
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
  });

  const { data: healthData } = useQuery({
    queryKey: ["health"],
    queryFn: async () => {
      const res = await fetch("/api/health");
      return res.json();
    },
    refetchInterval: 15_000,
  });

  const handleScrape = async () => {
    setScraping(true);
    try {
      await fetch("/api/scrape", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) });
      await Promise.all([refetchHoldings(), refetchDeals()]);
    } catch (error) {
      console.error("Scrape failed:", error);
    } finally {
      setScraping(false);
    }
  };

  const holdings = holdingsData?.holdings || [];
  const totalValue = holdingsData?.totalValue || 0;
  const quarter = holdingsData?.quarter || null;
  const deals = dealsData?.deals || [];
  const overallHealth = healthData?.overall;

  const healthIcon = overallHealth?.status === "all_healthy"
    ? <CheckCircle className="h-3.5 w-3.5 text-green-600" />
    : overallHealth?.status === "some_degraded"
    ? <AlertTriangle className="h-3.5 w-3.5 text-yellow-600" />
    : overallHealth?.status === "critical"
    ? <XCircle className="h-3.5 w-3.5 text-red-600" />
    : null;

  // Insights data
  const conviction = insightsData?.conviction || [];
  const entryQuality = insightsData?.entryQuality || [];
  const dealPatterns = insightsData?.dealPatterns || [];
  const drawdown = insightsData?.drawdown || { maxDrawdownPct: 0, peakDate: "", peakValue: 0, troughDate: "", troughValue: 0, recoveryDate: null, recoveryDays: null, currentDrawdownPct: 0 };
  const beta = insightsData?.beta || { beta: 1, correlation: 0, alpha: 0, interpretation: "Loading..." };
  const winLoss = insightsData?.winLoss || { totalExits: 0, wins: 0, losses: 0, winRate: 0, avgWinPct: 0, avgLossPct: 0, bestExit: null, worstExit: null };
  const topContributors = insightsData?.topContributors || [];
  const bottomDetractors = insightsData?.bottomDetractors || [];
  const sectorRotation = insightsData?.sectorRotation || [];

  // Build "what changed" diffs from deal-diff (not in insights yet — compute from conviction changes as proxy)
  // We'll pass empty for now if no diff data
  const diffs = insightsData?.latestDiff || [];

  // Entry quality stats for header
  const excellentCount = entryQuality.filter((e: { quality: string }) => e.quality === "Excellent").length;
  const poorCount = entryQuality.filter((e: { quality: string }) => e.quality === "Poor").length;

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Ashish Kacholia — Intelligence Dashboard</h1>
          <div className="flex items-center gap-3 flex-wrap">
            <p className="text-sm text-muted-foreground">
              {conviction.length} stocks tracked | {excellentCount} excellent entries | {dealPatterns.length} patterns detected
            </p>
            {overallHealth && (
              <Link href="/health">
                <Badge variant="outline" className="gap-1 text-xs cursor-pointer hover:bg-accent">
                  {healthIcon}
                  {overallHealth.healthy}/{overallHealth.total} sources
                </Badge>
              </Link>
            )}
            {insightsData?.computedAt && (
              <Badge variant="outline" className="text-[10px] text-muted-foreground">
                Insights: {new Date(insightsData.computedAt).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata" })}
              </Badge>
            )}
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={handleScrape} disabled={scraping}>
          {scraping ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-1.5 h-4 w-4" />}
          {scraping ? "Scraping..." : "Refresh"}
        </Button>
      </div>

      {/* Portfolio summary cards */}
      <PortfolioSummary holdings={holdings} totalValue={totalValue} quarter={quarter} dealsCount={dealsData?.total || 0} />

      {/* What Changed */}
      {diffs.length > 0 && <WhatChanged diffs={diffs} />}

      {/* Conviction + Risk */}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          {insightsLoading ? (
            <div className="flex h-64 items-center justify-center rounded-md border">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <ConvictionSignals conviction={conviction} />
          )}
        </div>
        <div>
          <RiskPulse
            drawdown={drawdown}
            beta={beta}
            winLoss={winLoss}
            concentration={analyticsData?.concentration}
          />
        </div>
      </div>

      {/* Performance Attribution */}
      <PerformanceAttribution topContributors={topContributors} bottomDetractors={bottomDetractors} />

      {/* Sector Rotation */}
      <SectorRotationChart sectorRotation={sectorRotation} />

      {/* Holdings Heatmap */}
      <HoldingsHeatmap
        conviction={conviction}
        holdings={holdings.map((h: Record<string, unknown>) => ({
          symbol: h.symbol || "",
          market_value: h.market_value || 0,
          change_pct: h.change_pct || 0,
        }))}
      />

      {/* Deal Patterns + Recent Deals */}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <DealPatternsCard patterns={dealPatterns} />
        </div>
        <div>
          <DealFeed deals={deals} />
        </div>
      </div>
    </div>
  );
}
