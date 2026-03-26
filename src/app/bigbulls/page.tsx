"use client";

import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Users, TrendingUp, GitCompare } from "lucide-react";

export default function BigBullsPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["bigbulls"],
    queryFn: async () => {
      const res = await fetch("/api/bigbulls");
      return res.json();
    },
    staleTime: 30 * 60 * 1000, // 30 min cache — this endpoint is slow
  });

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Users className="h-6 w-6 text-primary" />
          Big Bull Comparison
        </h1>
        <p className="text-sm text-muted-foreground">
          Compare Ashish Kacholia&apos;s portfolio with India&apos;s top superstar investors. See who&apos;s buying what, where they overlap, and where they diverge.
        </p>
      </div>

      {isLoading ? (
        <div className="flex h-64 items-center justify-center">
          <div className="text-center space-y-2">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground mx-auto" />
            <p className="text-sm text-muted-foreground">Scraping 6 investor portfolios from Trendlyne...</p>
            <p className="text-xs text-muted-foreground">This takes ~15 seconds (rate-limited)</p>
          </div>
        </div>
      ) : data?.error ? (
        <p className="text-red-600 text-sm">{data.error}</p>
      ) : (
        <>
          {/* Investor Cards */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {(data?.investors || []).map((inv: Record<string, unknown>) => (
              <Card key={inv.id as string} className={inv.id === "ashish-kacholia" ? "border-2 border-primary" : ""}>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base">{inv.name as string}</CardTitle>
                    {inv.id === "ashish-kacholia" && <Badge className="bg-primary text-primary-foreground text-[10px]">Primary</Badge>}
                  </div>
                  <p className="text-xs text-muted-foreground">{inv.description as string}</p>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex gap-4 text-sm">
                    <div>
                      <p className="text-xs text-muted-foreground">Holdings</p>
                      <p className="font-bold">{inv.holdingsCount as number}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Portfolio</p>
                      <p className="font-bold">{inv.totalValueCr as number > 0 ? `₹${inv.totalValueCr} Cr` : "N/A"}</p>
                    </div>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Top 5 Holdings</p>
                    <div className="flex flex-wrap gap-1">
                      {(inv.topHoldings as Array<{ symbol: string; valueCr: number }>).map((h) => (
                        <Badge key={h.symbol} variant="outline" className="text-[10px]">
                          {h.symbol} {h.valueCr > 0 ? `(${h.valueCr} Cr)` : ""}
                        </Badge>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Overlap Analysis */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-xl">
                <GitCompare className="h-5 w-5 text-primary" />
                Overlap with Ashish Kacholia
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                How many stocks does each investor share with Kacholia?
              </p>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {(data?.overlaps || []).map((o: Record<string, unknown>) => {
                  const overlapPct = o.overlapPct as number;
                  return (
                    <div key={o.investorId as string} className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm">{o.investorName as string}</span>
                          <Badge variant="outline" className="text-[10px]">
                            {o.sharedCount as number} shared stocks
                          </Badge>
                        </div>
                        <span className={`text-sm font-bold ${overlapPct >= 20 ? "text-green-600" : overlapPct >= 10 ? "text-amber-600" : "text-muted-foreground"}`}>
                          {overlapPct}% overlap
                        </span>
                      </div>
                      {/* Overlap bar */}
                      <div className="flex h-3 rounded-full overflow-hidden bg-muted">
                        <div className="bg-primary transition-all" style={{ width: `${overlapPct}%` }} />
                      </div>
                      {/* Shared stocks */}
                      {(o.sharedCount as number) > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {(o.sharedStocks as string[]).slice(0, 10).map(s => (
                            <Badge key={s} className="bg-green-100 text-green-800 text-[10px]">{s}</Badge>
                          ))}
                          {(o.sharedStocks as string[]).length > 10 && (
                            <span className="text-[10px] text-muted-foreground self-center">+{(o.sharedStocks as string[]).length - 10} more</span>
                          )}
                        </div>
                      )}
                      <div className="flex gap-4 text-[10px] text-muted-foreground">
                        <span>Only in AK: {o.onlyAKCount as number} stocks</span>
                        <span>Only in {(o.investorName as string).split(" ")[0]}: {o.onlyThemCount as number} stocks</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
