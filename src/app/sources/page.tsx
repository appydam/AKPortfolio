"use client";

import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Database, Brain, Shield, Zap, Radio, BarChart3, TrendingUp,
  AlertTriangle, Activity, Eye, Layers, Target, GitCompare,
  LineChart, PieChart, Scale, Trophy, ArrowUpDown, Bell,
  Server, Clock, CheckCircle, XCircle, Gauge,
} from "lucide-react";

const DATA_SOURCES = [
  { name: "NSE Bulk Deals API", desc: "Official NSE exchange bulk deal data (>1% trades)", type: "Deals", schedule: "Every 3h", icon: Database },
  { name: "NSE Block Deals API", desc: "Official NSE block deal data (>0.5% trades)", type: "Deals", schedule: "Every 3h", icon: Database },
  { name: "BSE Bulk Deals JSON", desc: "BSE exchange bulk deals via direct JSON API", type: "Deals", schedule: "Every 3h", icon: Database },
  { name: "BSE Block Deals JSON", desc: "BSE block deals — catches BSE-only listed stocks", type: "Deals", schedule: "Every 3h", icon: Database },
  { name: "BSE HTML Bulk Deals", desc: "Fallback HTML scraper for BSE deals page", type: "Deals", schedule: "Every 3h", icon: Database },
  { name: "BSE Announcements RSS", desc: "Corporate filings & SHP alerts from BSE XML feed", type: "Filings", schedule: "Every 3h", icon: Radio },
  { name: "Trendlyne Holdings", desc: "Full portfolio with share counts & holding percentages", type: "Holdings", schedule: "Every 2h", icon: BarChart3 },
  { name: "Trendlyne Deals", desc: "Aggregated bulk/block deal history", type: "Deals", schedule: "Every 2h", icon: BarChart3 },
  { name: "MoneyControl Bulk Deals", desc: "Cross-check deals from NSE + BSE via MoneyControl", type: "Deals", schedule: "Every 4h", icon: Database },
  { name: "SEBI SHP (NSE)", desc: "Shareholding pattern filings — exact share counts per company", type: "Filings", schedule: "Twice daily", icon: Shield },
  { name: "SEBI SHP (BSE)", desc: "Same SHP data from BSE side — catches BSE-only filings", type: "Filings", schedule: "Twice daily", icon: Shield },
  { name: "BSE Corporate Filings RSS", desc: "Detects fresh SHP filings the moment they're published", type: "Filings", schedule: "Twice daily", icon: Radio },
  { name: "Yahoo Finance Charts", desc: "Live prices + 20-day volume history for all holdings", type: "Prices", schedule: "Every 5 min", icon: LineChart },
  { name: "NSE Quote API", desc: "Primary price source with intraday data & order book", type: "Prices", schedule: "Every 5 min", icon: Zap },
  { name: "Google Finance", desc: "Backup price source when NSE is rate-limited", type: "Prices", schedule: "Every 5 min", icon: Zap },
  { name: "Screener.in", desc: "Stock fundamentals — PE, ROE, ROCE, market cap, sector", type: "Fundamentals", schedule: "Daily", icon: PieChart },
  { name: "NIFTY50 Index (Yahoo)", desc: "Index data for beta, correlation & benchmark comparison", type: "Index", schedule: "With insights", icon: TrendingUp },
];

const INTELLIGENCE_LAYERS = [
  { name: "Multi-Entity Tracker", desc: "Tracks 4 entities: Ashish himself, wife Rashmi Kacholia, Ashish Kacholia HUF, and Lucky Investment Managers Pvt Ltd — across ALL scrapers simultaneously", icon: Eye, category: "Tracking" },
  { name: "Today-Deals Fast Checker", desc: "Polls NSE + BSE for today's bulk/block deals every 30 minutes after market close — catches new deals within 30 minutes of exchange publishing", icon: Zap, category: "Tracking" },
  { name: "Daily Portfolio Estimator", desc: "Computes estimated portfolio value between SHP filings using last known positions x live prices, adjusted for any intra-quarter bulk deals", icon: Gauge, category: "Tracking" },
  { name: "Volume Anomaly Detector", desc: "Scans all 48+ portfolio stocks for unusual volume (3x+ average). Fires Telegram alert for extreme spikes (10x+). Interprets volume + price direction.", icon: AlertTriangle, category: "Detection" },
  { name: "Corporate Action Tracker", desc: "Monitors NSE for stock splits, bonus issues, and rights. Auto-adjusts share counts so positions don't go stale between quarterly filings.", icon: GitCompare, category: "Detection" },
  { name: "Early SHP Filing Scanner", desc: "Catches shareholding pattern filings from portfolio companies the moment they're filed — weeks before aggregators like Trendlyne pick them up", icon: Radio, category: "Detection" },
  { name: "Deal Diff Engine", desc: "Compares quarterly holdings — detects new portfolio entries, full exits, increased positions, and reduced positions. Fires Telegram summary.", icon: ArrowUpDown, category: "Analysis" },
  { name: "Conviction Scorer", desc: "Scores 0-100 per stock based on position size, add-on buys, holding period, averaging down behavior, and recent deal frequency", icon: Target, category: "Analysis" },
  { name: "Deal Pattern Recognition", desc: "Classifies each stock's deal history into behavioral patterns: accumulation, averaging down, trimming into strength, distribution, one-time buy", icon: Brain, category: "Analysis" },
  { name: "Entry Quality Analyzer", desc: "For each stock: weighted avg entry price, current return %, max drawdown post-entry, quality grade (Excellent/Good/Average/Poor)", icon: Trophy, category: "Analysis" },
  { name: "Portfolio Drawdown Tracker", desc: "Tracks max drawdown from peak, trough date, recovery period, and current drawdown from all-time high", icon: Activity, category: "Risk" },
  { name: "Portfolio Beta Calculator", desc: "Computes beta vs NIFTY50 using covariance/variance method. Shows correlation, alpha, and Defensive/Aggressive classification.", icon: Scale, category: "Risk" },
  { name: "Win/Loss Analyzer", desc: "Win rate for all exited positions, average win %, average loss %, best and worst exits — measures trade quality over time", icon: Trophy, category: "Risk" },
  { name: "Performance Attribution", desc: "Identifies which stocks are driving returns (top 5 contributors) vs which are dragging (bottom 5 detractors) between snapshots", icon: BarChart3, category: "Analysis" },
  { name: "Sector Rotation Tracker", desc: "Maps sector allocation by quarter over time — reveals where Kacholia is rotating into and out of across economic cycles", icon: PieChart, category: "Analysis" },
  { name: "Multi-Source Price Aggregation", desc: "NSE -> Google Finance -> Yahoo Finance failover chain with weighted consensus. 5-second cache during market hours, 6-hour off-market.", icon: Layers, category: "Infrastructure" },
  { name: "Cross-Validation Engine", desc: "Compares prices across 3 sources. Flags >1% deviations. Stores conflicts in audit trail. Uses weighted consensus for best price.", icon: Shield, category: "Infrastructure" },
  { name: "Telegram Alert System", desc: "Instant notifications for: new deals, portfolio entries/exits, volume anomalies, corporate actions, quarterly diffs, price conflicts", icon: Bell, category: "Infrastructure" },
  { name: "Insights Cache", desc: "Server-side caching of all analytics — 15 min TTL during market hours, 1 hour off-market. Pre-warmed by cron 3x daily.", icon: Server, category: "Infrastructure" },
];

const TRACKING_SPEED = [
  { event: "Ashish makes a bulk deal (>1% of company)", speed: "~30 minutes", source: "Today-deals checker + NSE/BSE APIs" },
  { event: "His wife Rashmi makes a bulk deal", speed: "~30 minutes", source: "Multi-entity tracker" },
  { event: "His HUF or Lucky Investment makes a deal", speed: "~30 minutes", source: "Multi-entity tracker" },
  { event: "A portfolio stock has 10x volume spike", speed: "Same evening", source: "Volume anomaly detector" },
  { event: "A portfolio stock announces split/bonus", speed: "Next morning", source: "Corporate action tracker" },
  { event: "Quarterly SHP filing comes in early", speed: "Same day", source: "Early SHP scanner + BSE RSS" },
  { event: "His daily portfolio value changes", speed: "Every day 4 PM", source: "Daily estimator" },
  { event: "Quarter-over-quarter position changes", speed: "Within hours of filing", source: "Deal diff engine + Trendlyne" },
];

const TYPE_COLORS: Record<string, string> = {
  Deals: "bg-blue-100 text-blue-800",
  Holdings: "bg-green-100 text-green-800",
  Filings: "bg-purple-100 text-purple-800",
  Prices: "bg-amber-100 text-amber-800",
  Fundamentals: "bg-rose-100 text-rose-800",
  Index: "bg-cyan-100 text-cyan-800",
};

const CATEGORY_COLORS: Record<string, string> = {
  Tracking: "bg-blue-100 text-blue-800",
  Detection: "bg-red-100 text-red-800",
  Analysis: "bg-green-100 text-green-800",
  Risk: "bg-amber-100 text-amber-800",
  Infrastructure: "bg-gray-100 text-gray-800",
};

export default function SourcesPage() {
  const { data: healthData } = useQuery({
    queryKey: ["health"],
    queryFn: async () => {
      const res = await fetch("/api/health");
      return res.json();
    },
    refetchInterval: 15_000,
  });

  const sourceStatuses = healthData?.sources || {};

  return (
    <div className="mx-auto max-w-7xl space-y-8 p-4 md:p-6">
      {/* Hero */}
      <div className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">How We Track Ashish Kacholia</h1>
        <p className="text-lg text-muted-foreground max-w-3xl">
          The most comprehensive Ashish Kacholia portfolio tracker ever built.
          17 data sources, 19 intelligence layers, tracking across 4 entities — his every movement captured within minutes.
        </p>
        <div className="flex gap-3 pt-2">
          <Badge className="bg-blue-600 text-white text-sm px-3 py-1">17 Data Sources</Badge>
          <Badge className="bg-green-600 text-white text-sm px-3 py-1">19 Intelligence Layers</Badge>
          <Badge className="bg-purple-600 text-white text-sm px-3 py-1">4 Entities Tracked</Badge>
          <Badge className="bg-amber-600 text-white text-sm px-3 py-1">13 Automated Cron Jobs</Badge>
        </div>
      </div>

      {/* Tracking Speed */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-xl">
            <Clock className="h-5 w-5 text-primary" />
            How Fast We Know
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th className="pb-2 font-medium">Event</th>
                  <th className="pb-2 font-medium">Detection Speed</th>
                  <th className="pb-2 font-medium">Source</th>
                </tr>
              </thead>
              <tbody>
                {TRACKING_SPEED.map((row, i) => (
                  <tr key={i} className="border-b last:border-0">
                    <td className="py-2.5 pr-4">{row.event}</td>
                    <td className="py-2.5 pr-4">
                      <Badge variant="outline" className="font-mono text-xs">{row.speed}</Badge>
                    </td>
                    <td className="py-2.5 text-muted-foreground text-xs">{row.source}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Multi-Entity Tracking */}
      <Card className="border-2 border-primary/20">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-xl">
            <Eye className="h-5 w-5 text-primary" />
            Multi-Entity Tracking
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Most trackers only watch for &quot;Ashish Kacholia&quot;. We track ALL his entities across every data source.
          </p>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { entity: "Ashish Rameshchandra Kacholia", type: "Self", color: "border-blue-500 bg-blue-50" },
              { entity: "Rashmi Ashish Kacholia", type: "Wife", color: "border-pink-500 bg-pink-50" },
              { entity: "Ashish Kacholia HUF", type: "HUF", color: "border-purple-500 bg-purple-50" },
              { entity: "Lucky Investment Managers Pvt Ltd", type: "Company", color: "border-amber-500 bg-amber-50" },
            ].map((e) => (
              <div key={e.type} className={`rounded-lg border-2 p-3 ${e.color}`}>
                <Badge className="mb-1 text-[10px]">{e.type}</Badge>
                <p className="text-sm font-medium">{e.entity}</p>
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            + 20 name variations including initials, reversed order, and abbreviations. Every scraper checks all variants.
          </p>
        </CardContent>
      </Card>

      {/* Data Sources */}
      <div>
        <h2 className="text-2xl font-bold mb-4 flex items-center gap-2">
          <Database className="h-6 w-6 text-primary" />
          17 Data Sources
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {DATA_SOURCES.map((source, i) => {
            const Icon = source.icon;
            return (
              <div key={i} className="rounded-lg border p-3 space-y-1.5 hover:bg-accent/50 transition-colors">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <Icon className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    <span className="font-medium text-sm">{source.name}</span>
                  </div>
                  <Badge className={`${TYPE_COLORS[source.type] || ""} text-[10px] flex-shrink-0`}>{source.type}</Badge>
                </div>
                <p className="text-xs text-muted-foreground">{source.desc}</p>
                <div className="flex items-center gap-1.5">
                  <Clock className="h-3 w-3 text-muted-foreground" />
                  <span className="text-[10px] text-muted-foreground">{source.schedule}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Intelligence Layers */}
      <div>
        <h2 className="text-2xl font-bold mb-4 flex items-center gap-2">
          <Brain className="h-6 w-6 text-primary" />
          19 Intelligence Layers
        </h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {INTELLIGENCE_LAYERS.map((layer, i) => {
            const Icon = layer.icon;
            return (
              <div key={i} className="rounded-lg border p-4 space-y-2 hover:bg-accent/50 transition-colors">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <Icon className="h-4 w-4 text-primary flex-shrink-0" />
                    <span className="font-semibold text-sm">{layer.name}</span>
                  </div>
                  <Badge className={`${CATEGORY_COLORS[layer.category] || ""} text-[10px]`}>{layer.category}</Badge>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">{layer.desc}</p>
              </div>
            );
          })}
        </div>
      </div>

      {/* Live Source Health */}
      {healthData && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-xl">
              <Activity className="h-5 w-5 text-primary" />
              Live Source Health
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-4">
              {Object.entries(sourceStatuses).map(([name, status]: [string, unknown]) => {
                const s = status as { uptime?: number; lastSuccess?: string; consecutiveFailures?: number };
                const isHealthy = (s.consecutiveFailures || 0) < 3;
                return (
                  <div key={name} className="flex items-center gap-2 rounded border px-3 py-2">
                    {isHealthy
                      ? <CheckCircle className="h-3.5 w-3.5 text-green-600 flex-shrink-0" />
                      : <XCircle className="h-3.5 w-3.5 text-red-600 flex-shrink-0" />
                    }
                    <div className="min-w-0">
                      <p className="text-xs font-medium truncate">{name}</p>
                      <p className="text-[10px] text-muted-foreground">
                        {s.uptime !== undefined ? `${s.uptime.toFixed(0)}% uptime` : "No data yet"}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Architecture */}
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Architecture</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <h4 className="font-semibold text-foreground">Stack</h4>
              <ul className="space-y-1 text-xs">
                <li>Next.js 16 (App Router) + TypeScript</li>
                <li>Supabase (PostgreSQL) — 12 tables</li>
                <li>Tailwind CSS + shadcn/ui + Recharts</li>
                <li>Vercel (Serverless + Cron Jobs)</li>
                <li>Cheerio (HTML scraping)</li>
                <li>Telegram Bot API (alerts)</li>
              </ul>
            </div>
            <div className="space-y-2">
              <h4 className="font-semibold text-foreground">Automation</h4>
              <ul className="space-y-1 text-xs">
                <li>13 automated cron jobs on Vercel</li>
                <li>Price refresh every 5 minutes</li>
                <li>Deal checking every 30 min after close</li>
                <li>Insights pre-warmed 3x daily</li>
                <li>Failover: NSE -&gt; Google -&gt; Yahoo</li>
                <li>Auto-skip unhealthy sources</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Footer */}
      <div className="text-center py-6 text-xs text-muted-foreground space-y-1">
        <p>Built to be the most comprehensive Ashish Kacholia portfolio tracker ever created.</p>
        <p>All data sourced from publicly available SEBI-mandated disclosures, exchange filings, and aggregator websites.</p>
      </div>
    </div>
  );
}
