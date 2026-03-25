"use client";

import { useQuery } from "@tanstack/react-query";
import { PortfolioSummary } from "@/components/dashboard/portfolio-summary";
import { HoldingsTable } from "@/components/dashboard/holdings-table";
import { DealFeed } from "@/components/dashboard/deal-feed";
import { PortfolioChart } from "@/components/dashboard/portfolio-chart";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RefreshCw, Loader2, CheckCircle, AlertTriangle, XCircle } from "lucide-react";
import { useState } from "react";
import Link from "next/link";

export default function DashboardPage() {
  const [scraping, setScraping] = useState(false);

  const { data: holdingsData, isLoading: holdingsLoading, refetch: refetchHoldings } = useQuery({
    queryKey: ["holdings"],
    queryFn: async () => {
      const res = await fetch("/api/holdings");
      return res.json();
    },
    refetchInterval: 10_000, // 10s — backend caches at 5s during market hours
  });

  const { data: dealsData, refetch: refetchDeals } = useQuery({
    queryKey: ["deals"],
    queryFn: async () => {
      const res = await fetch("/api/deals?limit=10");
      return res.json();
    },
    refetchInterval: 120_000,
  });

  const { data: historyData } = useQuery({
    queryKey: ["portfolio-history"],
    queryFn: async () => {
      const res = await fetch("/api/portfolio-history");
      return res.json();
    },
    refetchInterval: 300_000,
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
  const snapshots = historyData?.snapshots || [];
  const overallHealth = healthData?.overall;

  const healthIcon = overallHealth?.status === "all_healthy"
    ? <CheckCircle className="h-3.5 w-3.5 text-green-600" />
    : overallHealth?.status === "some_degraded"
    ? <AlertTriangle className="h-3.5 w-3.5 text-yellow-600" />
    : overallHealth?.status === "critical"
    ? <XCircle className="h-3.5 w-3.5 text-red-600" />
    : null;

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Ashish Kacholia Portfolio</h1>
          <div className="flex items-center gap-3">
            <p className="text-sm text-muted-foreground">
              Live tracking from NSE, BSE, Trendlyne, MoneyControl — 5s price refresh
            </p>
            {overallHealth && (
              <Link href="/health">
                <Badge variant="outline" className="gap-1 text-xs cursor-pointer hover:bg-accent">
                  {healthIcon}
                  {overallHealth.healthy}/{overallHealth.total} sources
                </Badge>
              </Link>
            )}
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleScrape}
          disabled={scraping}
        >
          {scraping ? (
            <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="mr-1.5 h-4 w-4" />
          )}
          {scraping ? "Scraping..." : "Refresh Data"}
        </Button>
      </div>

      <PortfolioSummary
        holdings={holdings}
        totalValue={totalValue}
        quarter={quarter}
        dealsCount={dealsData?.total || 0}
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          {holdingsLoading ? (
            <div className="flex h-64 items-center justify-center rounded-md border">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <HoldingsTable holdings={holdings} />
          )}
        </div>
        <div>
          <DealFeed deals={deals} />
        </div>
      </div>

      <PortfolioChart snapshots={snapshots} />
    </div>
  );
}
