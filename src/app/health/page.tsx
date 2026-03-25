"use client";

import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, CheckCircle, AlertTriangle, XCircle, Activity } from "lucide-react";

interface SourceHealth {
  name: string;
  status: "healthy" | "degraded" | "down";
  lastSuccess: string | null;
  lastFailure: string | null;
  lastError: string | null;
  successCount: number;
  failureCount: number;
  avgLatencyMs: number;
  uptimePercent: number;
  lastChecked: string;
  consecutiveFailures: number;
}

interface OverallStatus {
  status: "all_healthy" | "some_degraded" | "critical";
  healthy: number;
  degraded: number;
  down: number;
  total: number;
}

const statusConfig = {
  healthy: { icon: CheckCircle, color: "text-green-600", bg: "bg-green-100", label: "Healthy" },
  degraded: { icon: AlertTriangle, color: "text-yellow-600", bg: "bg-yellow-100", label: "Degraded" },
  down: { icon: XCircle, color: "text-red-600", bg: "bg-red-100", label: "Down" },
};

const overallStatusConfig = {
  all_healthy: { color: "text-green-600", bg: "bg-green-50 border-green-200", label: "All Systems Operational" },
  some_degraded: { color: "text-yellow-600", bg: "bg-yellow-50 border-yellow-200", label: "Some Sources Degraded" },
  critical: { color: "text-red-600", bg: "bg-red-50 border-red-200", label: "Critical — Multiple Sources Down" },
};

const sourceCategories: Record<string, string[]> = {
  "Price Sources": ["nse", "google", "yahoo"],
  "Deal Sources": ["trendlyne", "bse-rss", "bse-announcements", "nse-csv", "nse-block", "moneycontrol"],
  "Fundamentals": ["screener"],
};

function formatTime(iso: string | null): string {
  if (!iso) return "Never";
  const d = new Date(iso);
  const now = Date.now();
  const diff = now - d.getTime();

  if (diff < 60_000) return `${Math.floor(diff / 1000)}s ago`;
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86400_000) return `${Math.floor(diff / 3600_000)}h ago`;
  return d.toLocaleDateString();
}

export default function HealthPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["health"],
    queryFn: async () => {
      const res = await fetch("/api/health");
      return res.json();
    },
    refetchInterval: 10_000,
  });

  const overall: OverallStatus | null = data?.overall || null;
  const sources: SourceHealth[] = data?.sources || [];

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Source Health Monitor</h1>
        <p className="text-sm text-muted-foreground">
          Real-time status of all data sources with auto-failover
        </p>
      </div>

      {/* Overall Status Banner */}
      {overall && (
        <div className={`rounded-lg border p-4 ${overallStatusConfig[overall.status].bg}`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Activity className={`h-5 w-5 ${overallStatusConfig[overall.status].color}`} />
              <div>
                <div className={`font-semibold ${overallStatusConfig[overall.status].color}`}>
                  {overallStatusConfig[overall.status].label}
                </div>
                <div className="text-xs text-muted-foreground">
                  {overall.healthy} healthy, {overall.degraded} degraded, {overall.down} down — {overall.total} total sources
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Source Categories */}
      {Object.entries(sourceCategories).map(([category, sourceNames]) => (
        <div key={category}>
          <h2 className="mb-3 text-lg font-semibold">{category}</h2>
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {sourceNames.map((name) => {
              const source = sources.find((s) => s.name === name);
              if (!source) return null;

              const config = statusConfig[source.status];
              const StatusIcon = config.icon;

              return (
                <Card key={name}>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium capitalize">
                      {name.replace(/-/g, " ")}
                    </CardTitle>
                    <Badge variant="secondary" className={`${config.bg} ${config.color} text-xs`}>
                      <StatusIcon className="mr-1 h-3 w-3" />
                      {config.label}
                    </Badge>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <div className="text-muted-foreground">Uptime</div>
                        <div className="font-mono font-medium">{source.uptimePercent}%</div>
                      </div>
                      <div>
                        <div className="text-muted-foreground">Avg Latency</div>
                        <div className="font-mono font-medium">{source.avgLatencyMs}ms</div>
                      </div>
                      <div>
                        <div className="text-muted-foreground">Successes</div>
                        <div className="font-mono font-medium text-green-600">{source.successCount}</div>
                      </div>
                      <div>
                        <div className="text-muted-foreground">Failures</div>
                        <div className="font-mono font-medium text-red-600">{source.failureCount}</div>
                      </div>
                    </div>

                    <div className="border-t pt-2 text-xs">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Last Success</span>
                        <span>{formatTime(source.lastSuccess)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Last Failure</span>
                        <span>{formatTime(source.lastFailure)}</span>
                      </div>
                      {source.consecutiveFailures > 0 && (
                        <div className="mt-1 rounded bg-red-50 px-2 py-1 text-red-700">
                          {source.consecutiveFailures} consecutive failure{source.consecutiveFailures > 1 ? "s" : ""}
                        </div>
                      )}
                      {source.lastError && (
                        <div className="mt-1 truncate text-muted-foreground" title={source.lastError}>
                          Error: {source.lastError}
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      ))}

      {/* Architecture Info */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Failover Architecture</CardTitle>
        </CardHeader>
        <CardContent className="text-xs text-muted-foreground space-y-2">
          <div>
            <strong>Price Sources (priority order):</strong> NSE Official JSON → Google Finance → Yahoo Finance.
            If NSE fails, automatically falls back to Google, then Yahoo. 5-second refresh during market hours.
          </div>
          <div>
            <strong>Deal Sources (parallel):</strong> Trendlyne (2h) + NSE Bulk/Block CSV (3h) + BSE RSS (3h) + MoneyControl (4h).
            All sources run independently. Deals are de-duplicated via unique constraints.
          </div>
          <div>
            <strong>Auto-Skip:</strong> Sources with 10+ consecutive failures are paused for 10 minutes to avoid hammering broken endpoints.
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
