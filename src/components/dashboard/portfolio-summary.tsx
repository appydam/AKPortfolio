"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingUp, TrendingDown, Briefcase, Activity } from "lucide-react";
import type { HoldingWithPrice } from "@/types";

interface PortfolioSummaryProps {
  holdings: HoldingWithPrice[];
  totalValue: number;
  quarter: string | null;
  dealsCount: number;
}

function formatCrores(value: number): string {
  const cr = value / 10000000;
  if (cr >= 1) return `₹${cr.toFixed(2)} Cr`;
  const lakh = value / 100000;
  if (lakh >= 1) return `₹${lakh.toFixed(2)} L`;
  return `₹${value.toFixed(0)}`;
}

export function PortfolioSummary({ holdings, totalValue, quarter, dealsCount }: PortfolioSummaryProps) {
  const gainers = holdings.filter((h) => h.change_pct > 0).length;
  const losers = holdings.filter((h) => h.change_pct < 0).length;

  const avgChange =
    holdings.length > 0
      ? holdings.reduce((sum, h) => sum + (h.change_pct || 0), 0) / holdings.length
      : 0;

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Total Portfolio Value</CardTitle>
          <Briefcase className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{formatCrores(totalValue)}</div>
          <p className="text-xs text-muted-foreground">
            {holdings.length} stocks {quarter ? `• ${quarter}` : ""}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Today&apos;s Change</CardTitle>
          {avgChange >= 0 ? (
            <TrendingUp className="h-4 w-4 text-green-600" />
          ) : (
            <TrendingDown className="h-4 w-4 text-red-600" />
          )}
        </CardHeader>
        <CardContent>
          <div className={`text-2xl font-bold ${avgChange >= 0 ? "text-green-600" : "text-red-600"}`}>
            {avgChange >= 0 ? "+" : ""}{avgChange.toFixed(2)}%
          </div>
          <p className="text-xs text-muted-foreground">
            Average across all holdings
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Gainers / Losers</CardTitle>
          <Activity className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">
            <span className="text-green-600">{gainers}</span>
            {" / "}
            <span className="text-red-600">{losers}</span>
          </div>
          <p className="text-xs text-muted-foreground">
            {holdings.length - gainers - losers} unchanged
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Recent Deals</CardTitle>
          <FileText className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{dealsCount}</div>
          <p className="text-xs text-muted-foreground">
            Bulk/Block deals tracked
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

function FileText(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/>
      <path d="M14 2v4a2 2 0 0 0 2 2h4"/>
      <path d="M10 9H8"/>
      <path d="M16 13H8"/>
      <path d="M16 17H8"/>
    </svg>
  );
}
