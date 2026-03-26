// Source health monitoring — tracks success/failure rates, latency, and uptime

export interface SourceHealth {
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

interface SourceMetrics {
  successes: number;
  failures: number;
  latencies: number[];
  lastSuccess: string | null;
  lastFailure: string | null;
  lastError: string | null;
  consecutiveFailures: number;
}

// In-memory store for health metrics (resets on restart)
const healthStore: Map<string, SourceMetrics> = new Map();

// All tracked sources — EVERY scraper and data source must be listed here
const ALL_SOURCES = [
  // Price sources
  "nse",
  "google",
  "yahoo",
  // Deal sources — exchange APIs
  "nse-csv",
  "nse-block",
  "bse-csv",
  "bse-block",
  "bse-rss",
  "bse-announcements",
  // Deal sources — aggregators
  "trendlyne",
  "trendlyne-activity",
  "tickertape",
  "tickertape-activity",
  "moneycontrol",
  // Holdings & filings
  "sebi-shp",
  "today-deals",
  // Fundamentals
  "screener",
  // New intelligence scrapers
  "insider-trades",
  "sast-disclosures",
  "promoter-pledges",
  "fii-dii-activity",
  "board-meetings",
  // Big bulls
  "bigbulls",
];

function getOrCreateMetrics(source: string): SourceMetrics {
  if (!healthStore.has(source)) {
    healthStore.set(source, {
      successes: 0,
      failures: 0,
      latencies: [],
      lastSuccess: null,
      lastFailure: null,
      lastError: null,
      consecutiveFailures: 0,
    });
  }
  return healthStore.get(source)!;
}

export function recordSourceResult(
  source: string,
  success: boolean,
  latencyMs: number,
  error?: string
): void {
  const metrics = getOrCreateMetrics(source);

  if (success) {
    metrics.successes++;
    metrics.lastSuccess = new Date().toISOString();
    metrics.consecutiveFailures = 0;
  } else {
    metrics.failures++;
    metrics.lastFailure = new Date().toISOString();
    metrics.lastError = error || "Unknown error";
    metrics.consecutiveFailures++;
  }

  // Keep last 100 latency readings
  metrics.latencies.push(latencyMs);
  if (metrics.latencies.length > 100) {
    metrics.latencies.shift();
  }
}

export function getSourceHealth(source: string): SourceHealth {
  const metrics = getOrCreateMetrics(source);
  const total = metrics.successes + metrics.failures;

  const avgLatency =
    metrics.latencies.length > 0
      ? metrics.latencies.reduce((a, b) => a + b, 0) / metrics.latencies.length
      : 0;

  const uptimePercent = total > 0 ? (metrics.successes / total) * 100 : 100;

  let status: "healthy" | "degraded" | "down";
  if (metrics.consecutiveFailures >= 5) {
    status = "down";
  } else if (metrics.consecutiveFailures >= 2 || uptimePercent < 80) {
    status = "degraded";
  } else {
    status = "healthy";
  }

  return {
    name: source,
    status,
    lastSuccess: metrics.lastSuccess,
    lastFailure: metrics.lastFailure,
    lastError: metrics.lastError,
    successCount: metrics.successes,
    failureCount: metrics.failures,
    avgLatencyMs: Math.round(avgLatency),
    uptimePercent: Math.round(uptimePercent * 10) / 10,
    lastChecked: metrics.lastSuccess || metrics.lastFailure || new Date().toISOString(),
    consecutiveFailures: metrics.consecutiveFailures,
  };
}

export function getAllSourceHealth(): SourceHealth[] {
  return ALL_SOURCES.map(getSourceHealth);
}

export function getOverallStatus(): {
  status: "all_healthy" | "some_degraded" | "critical";
  healthy: number;
  degraded: number;
  down: number;
  total: number;
} {
  const all = getAllSourceHealth();
  const healthy = all.filter((s) => s.status === "healthy").length;
  const degraded = all.filter((s) => s.status === "degraded").length;
  const down = all.filter((s) => s.status === "down").length;

  let status: "all_healthy" | "some_degraded" | "critical";
  if (down >= 3) {
    status = "critical";
  } else if (degraded > 0 || down > 0) {
    status = "some_degraded";
  } else {
    status = "all_healthy";
  }

  return { status, healthy, degraded, down, total: all.length };
}

// Check if a specific source should be skipped (too many failures)
export function shouldSkipSource(source: string): boolean {
  const health = getSourceHealth(source);
  // Skip if 10+ consecutive failures — will retry after cooldown
  if (health.consecutiveFailures >= 10) {
    // Allow retry every 10 minutes
    const lastAttempt = health.lastFailure;
    if (lastAttempt) {
      const timeSince = Date.now() - new Date(lastAttempt).getTime();
      return timeSince < 10 * 60 * 1000;
    }
  }
  return false;
}

// Persist health snapshot to Supabase (call periodically from cron)
export async function persistHealthSnapshot(): Promise<void> {
  try {
    // Dynamic import to avoid circular deps
    const { getDb } = await import("../db");
    const db = getDb();
    const all = getAllSourceHealth();
    const overall = getOverallStatus();

    await db.from("health_snapshots").upsert(
      {
        id: 1,
        sources: JSON.stringify(all),
        overall_status: overall.status,
        healthy_count: overall.healthy,
        degraded_count: overall.degraded,
        down_count: overall.down,
        snapshot_at: new Date().toISOString(),
      },
      { onConflict: "id" }
    );
  } catch (error) {
    console.error("[Health] Failed to persist snapshot:", error);
  }
}

// Restore health from DB on cold start (Vercel serverless)
export async function restoreHealthFromDb(): Promise<void> {
  try {
    const { getDb } = await import("../db");
    const db = getDb();
    const { data } = await db
      .from("health_snapshots")
      .select("sources, snapshot_at")
      .eq("id", 1)
      .single();

    if (!data?.sources) return;

    const snapshotAge = Date.now() - new Date(data.snapshot_at).getTime();
    // Only restore if snapshot is < 1 hour old
    if (snapshotAge > 3600_000) return;

    const sources: SourceHealth[] = JSON.parse(data.sources);
    for (const s of sources) {
      const metrics = getOrCreateMetrics(s.name);
      metrics.successes = s.successCount;
      metrics.failures = s.failureCount;
      metrics.lastSuccess = s.lastSuccess;
      metrics.lastFailure = s.lastFailure;
      metrics.lastError = s.lastError;
      metrics.consecutiveFailures = s.consecutiveFailures;
    }
    console.log("[Health] Restored health metrics from DB snapshot");
  } catch {
    // Ignore — fresh start is fine
  }
}
