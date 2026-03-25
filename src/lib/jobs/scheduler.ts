import cron from "node-cron";
import { scrapeTrendlyne } from "../scrapers/trendlyne";
import { updateAllFundamentals } from "../scrapers/screener";
import { scrapeBseBulkDeals, scrapeBseAnnouncements } from "../scrapers/bse-rss";
import { scrapeNseBulkDeals, scrapeNseBlockDeals } from "../scrapers/nse-csv";
import { scrapeMoneyControlBulkDeals } from "../scrapers/moneycontrol";
import { refreshAllAggregatedPrices } from "../prices/aggregator";
import { shouldSkipSource } from "../health/monitor";
import { getDb } from "../db";

function isMarketDay(): boolean {
  const now = new Date();
  const ist = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
  const day = ist.getDay();
  return day !== 0 && day !== 6;
}

function isMarketHours(): boolean {
  if (!isMarketDay()) return false;
  const now = new Date();
  const ist = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
  const hours = ist.getHours();
  const minutes = ist.getMinutes();
  const timeInMinutes = hours * 60 + minutes;
  return timeInMinutes >= 555 && timeInMinutes <= 930; // 9:15 AM - 3:30 PM IST
}

export function startScheduler() {
  console.log("[Scheduler] Starting background jobs with multi-source support...");

  // ─────────────────────────────────────────────
  // PRICE REFRESH: Every 5 seconds during market hours
  // Uses NSE > Google > Yahoo failover chain
  // ─────────────────────────────────────────────
  let priceRefreshInterval: ReturnType<typeof setInterval> | null = null;

  function startPricePolling() {
    if (priceRefreshInterval) return;
    console.log("[Scheduler] Starting 5-second price polling");
    priceRefreshInterval = setInterval(async () => {
      if (!isMarketHours()) {
        stopPricePolling();
        return;
      }
      try {
        await refreshAllAggregatedPrices();
      } catch (error) {
        console.error("[Scheduler] Price refresh failed:", error);
      }
    }, 5_000);
  }

  function stopPricePolling() {
    if (priceRefreshInterval) {
      console.log("[Scheduler] Stopping price polling (market closed)");
      clearInterval(priceRefreshInterval);
      priceRefreshInterval = null;
    }
  }

  // Check every minute if we should start/stop price polling
  cron.schedule("* * * * *", () => {
    if (isMarketHours()) {
      startPricePolling();
    } else {
      stopPricePolling();
    }
  });

  // Also do a single price refresh every 5 minutes outside market hours
  cron.schedule("*/5 * * * *", async () => {
    if (!isMarketHours()) {
      try {
        await refreshAllAggregatedPrices();
      } catch (error) {
        console.error("[Scheduler] Off-hours price refresh failed:", error);
      }
    }
  });

  // ─────────────────────────────────────────────
  // DEAL SCRAPING: Multiple sources, staggered
  // ─────────────────────────────────────────────

  // Trendlyne: Every 2 hours on weekdays
  cron.schedule("0 */2 * * 1-5", async () => {
    if (shouldSkipSource("trendlyne")) return;
    console.log("[Scheduler] Running Trendlyne scrape...");
    try {
      await scrapeTrendlyne();
    } catch (error) {
      console.error("[Scheduler] Trendlyne failed:", error);
    }
  });

  // NSE Bulk Deals: Every 3 hours on weekdays
  cron.schedule("30 */3 * * 1-5", async () => {
    if (shouldSkipSource("nse-csv")) return;
    console.log("[Scheduler] Running NSE bulk deals scrape...");
    try {
      await scrapeNseBulkDeals(7);
      await new Promise((r) => setTimeout(r, 2000));
      await scrapeNseBlockDeals(7);
    } catch (error) {
      console.error("[Scheduler] NSE deals failed:", error);
    }
  });

  // BSE Bulk Deals: Every 3 hours on weekdays (offset by 1h from NSE)
  cron.schedule("0 1,4,7,10,13,16 * * 1-5", async () => {
    if (shouldSkipSource("bse-rss")) return;
    console.log("[Scheduler] Running BSE bulk deals scrape...");
    try {
      await scrapeBseBulkDeals();
      await new Promise((r) => setTimeout(r, 2000));
      await scrapeBseAnnouncements();
    } catch (error) {
      console.error("[Scheduler] BSE deals failed:", error);
    }
  });

  // MoneyControl: Every 4 hours on weekdays
  cron.schedule("15 */4 * * 1-5", async () => {
    if (shouldSkipSource("moneycontrol")) return;
    console.log("[Scheduler] Running MoneyControl scrape...");
    try {
      await scrapeMoneyControlBulkDeals();
    } catch (error) {
      console.error("[Scheduler] MoneyControl failed:", error);
    }
  });

  // ─────────────────────────────────────────────
  // FUNDAMENTALS: Daily
  // ─────────────────────────────────────────────

  // Screener fundamentals: daily at 7 AM IST (1:30 AM UTC)
  cron.schedule("30 1 * * *", async () => {
    if (shouldSkipSource("screener")) return;
    console.log("[Scheduler] Running Screener fundamentals update...");
    try {
      await updateAllFundamentals();
    } catch (error) {
      console.error("[Scheduler] Screener update failed:", error);
    }
  });

  // ─────────────────────────────────────────────
  // PORTFOLIO SNAPSHOT: Daily at 4 PM IST
  // ─────────────────────────────────────────────
  cron.schedule("30 10 * * 1-5", async () => {
    console.log("[Scheduler] Taking portfolio snapshot...");
    try {
      await takePortfolioSnapshot();
    } catch (error) {
      console.error("[Scheduler] Snapshot failed:", error);
    }
  });

  console.log("[Scheduler] All jobs scheduled:");
  console.log("  - Prices: Every 5s during market hours (NSE > Google > Yahoo)");
  console.log("  - Trendlyne deals: Every 2h (weekdays)");
  console.log("  - NSE bulk/block deals: Every 3h (weekdays)");
  console.log("  - BSE bulk deals + RSS: Every 3h offset (weekdays)");
  console.log("  - MoneyControl deals: Every 4h (weekdays)");
  console.log("  - Screener fundamentals: Daily 7 AM IST");
  console.log("  - Portfolio snapshot: Daily 4 PM IST");
}

async function takePortfolioSnapshot() {
  const db = getDb();

  const holdings = db
    .prepare(`
      SELECT h.shares_held, s.symbol
      FROM holdings h
      JOIN stocks s ON h.stock_id = s.id
      WHERE h.quarter = (SELECT quarter FROM holdings ORDER BY quarter DESC LIMIT 1)
    `)
    .all() as { shares_held: number; symbol: string }[];

  if (holdings.length === 0) return;

  let totalValue = 0;
  const details: Record<string, { shares: number; price: number; value: number }> = {};

  for (const h of holdings) {
    const cached = db
      .prepare("SELECT price FROM price_cache WHERE symbol = ?")
      .get(h.symbol) as { price: number } | undefined;

    const price = cached?.price || 0;
    const value = price * h.shares_held;
    totalValue += value;
    details[h.symbol] = { shares: h.shares_held, price, value };
  }

  const today = new Date().toISOString().split("T")[0];

  db.prepare(`
    INSERT INTO portfolio_snapshots (snapshot_date, total_value, num_holdings, details_json)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(snapshot_date) DO UPDATE SET
      total_value = excluded.total_value,
      num_holdings = excluded.num_holdings,
      details_json = excluded.details_json
  `).run(today, totalValue, holdings.length, JSON.stringify(details));

  console.log(`[Scheduler] Snapshot: ${holdings.length} holdings, total ₹${(totalValue / 10000000).toFixed(2)} Cr`);
}
