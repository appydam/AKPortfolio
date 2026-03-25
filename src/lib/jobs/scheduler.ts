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

// ─────────────────────────────────────────────
// Individual job functions callable by Vercel Cron API routes
// ─────────────────────────────────────────────

/**
 * Refresh all aggregated prices.
 * Call from a Vercel Cron route on a frequent schedule during market hours.
 */
export async function jobRefreshPrices(): Promise<{ refreshed: number }> {
  console.log("[Jobs] Running price refresh...");
  try {
    const count = await refreshAllAggregatedPrices();
    console.log(`[Jobs] Refreshed ${count} prices`);
    return { refreshed: count };
  } catch (error) {
    console.error("[Jobs] Price refresh failed:", error);
    throw error;
  }
}

/**
 * Scrape deals from Trendlyne.
 * Call from a Vercel Cron route every 2 hours on weekdays.
 */
export async function jobScrapeTrendlyne(): Promise<{ skipped: boolean; result?: unknown }> {
  if (shouldSkipSource("trendlyne")) {
    console.log("[Jobs] Skipping Trendlyne (source unhealthy)");
    return { skipped: true };
  }
  console.log("[Jobs] Running Trendlyne scrape...");
  try {
    const result = await scrapeTrendlyne();
    return { skipped: false, result };
  } catch (error) {
    console.error("[Jobs] Trendlyne failed:", error);
    throw error;
  }
}

/**
 * Scrape NSE bulk and block deals.
 * Call from a Vercel Cron route every 3 hours on weekdays.
 */
export async function jobScrapeNseDeals(): Promise<{ skipped: boolean }> {
  if (shouldSkipSource("nse-csv")) {
    console.log("[Jobs] Skipping NSE CSV (source unhealthy)");
    return { skipped: true };
  }
  console.log("[Jobs] Running NSE bulk/block deals scrape...");
  try {
    await scrapeNseBulkDeals(7);
    await new Promise((r) => setTimeout(r, 2000));
    await scrapeNseBlockDeals(7);
    return { skipped: false };
  } catch (error) {
    console.error("[Jobs] NSE deals failed:", error);
    throw error;
  }
}

/**
 * Scrape BSE bulk deals and announcements.
 * Call from a Vercel Cron route every 3 hours (offset from NSE) on weekdays.
 */
export async function jobScrapeBseDeals(): Promise<{ skipped: boolean }> {
  if (shouldSkipSource("bse-rss")) {
    console.log("[Jobs] Skipping BSE RSS (source unhealthy)");
    return { skipped: true };
  }
  console.log("[Jobs] Running BSE bulk deals scrape...");
  try {
    await scrapeBseBulkDeals();
    await new Promise((r) => setTimeout(r, 2000));
    await scrapeBseAnnouncements();
    return { skipped: false };
  } catch (error) {
    console.error("[Jobs] BSE deals failed:", error);
    throw error;
  }
}

/**
 * Scrape MoneyControl bulk deals.
 * Call from a Vercel Cron route every 4 hours on weekdays.
 */
export async function jobScrapeMoneyControl(): Promise<{ skipped: boolean }> {
  if (shouldSkipSource("moneycontrol")) {
    console.log("[Jobs] Skipping MoneyControl (source unhealthy)");
    return { skipped: true };
  }
  console.log("[Jobs] Running MoneyControl scrape...");
  try {
    await scrapeMoneyControlBulkDeals();
    return { skipped: false };
  } catch (error) {
    console.error("[Jobs] MoneyControl failed:", error);
    throw error;
  }
}

/**
 * Update stock fundamentals from Screener.
 * Call from a Vercel Cron route daily.
 */
export async function jobUpdateFundamentals(): Promise<{ skipped: boolean }> {
  if (shouldSkipSource("screener")) {
    console.log("[Jobs] Skipping Screener (source unhealthy)");
    return { skipped: true };
  }
  console.log("[Jobs] Running Screener fundamentals update...");
  try {
    await updateAllFundamentals();
    return { skipped: false };
  } catch (error) {
    console.error("[Jobs] Screener update failed:", error);
    throw error;
  }
}

/**
 * Take a portfolio snapshot.
 * Call from a Vercel Cron route daily at 4 PM IST on weekdays.
 */
export async function jobTakePortfolioSnapshot(): Promise<{
  holdings: number;
  totalValue: number;
}> {
  console.log("[Jobs] Taking portfolio snapshot...");
  const db = getDb();

  // Get latest quarter
  const { data: latestRow } = await db
    .from("holdings")
    .select("quarter")
    .order("quarter", { ascending: false })
    .limit(1)
    .single();

  if (!latestRow) return { holdings: 0, totalValue: 0 };

  // Get holdings with stock symbols
  const { data: holdingsData } = await db
    .from("holdings")
    .select("shares_held, stocks(symbol)")
    .eq("quarter", latestRow.quarter);

  if (!holdingsData || holdingsData.length === 0) return { holdings: 0, totalValue: 0 };

  // Get all prices
  const symbols = (holdingsData || []).map((h: Record<string, unknown>) => {
    const stock = h.stocks as unknown as Record<string, unknown> | null;
    return stock?.symbol as string;
  }).filter(Boolean);

  const { data: pricesData } = await db
    .from("price_cache")
    .select("symbol, price")
    .in("symbol", symbols);

  const priceMap = new Map<string, number>();
  for (const p of pricesData || []) {
    priceMap.set(p.symbol, p.price);
  }

  let totalValue = 0;
  const details: Record<string, { shares: number; price: number; value: number }> = {};

  for (const h of holdingsData) {
    const stock = h.stocks as unknown as Record<string, unknown> | null;
    const symbol = (stock?.symbol as string) || "";
    const price = priceMap.get(symbol) || 0;
    const value = price * (h.shares_held as number);
    totalValue += value;
    details[symbol] = { shares: h.shares_held as number, price, value };
  }

  const today = new Date().toISOString().split("T")[0];

  await db
    .from("portfolio_snapshots")
    .upsert(
      {
        snapshot_date: today,
        total_value: totalValue,
        num_holdings: holdingsData.length,
        details_json: JSON.stringify(details),
      },
      { onConflict: "snapshot_date" }
    );

  console.log(`[Jobs] Snapshot: ${holdingsData.length} holdings, total ₹${(totalValue / 10000000).toFixed(2)} Cr`);
  return { holdings: holdingsData.length, totalValue };
}
