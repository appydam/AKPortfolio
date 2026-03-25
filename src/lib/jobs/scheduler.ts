import { scrapeTrendlyne } from "../scrapers/trendlyne";
import { updateAllFundamentals } from "../scrapers/screener";
import { scrapeBseBulkDeals, scrapeBseAnnouncements } from "../scrapers/bse-rss";
import { scrapeNseBulkDeals, scrapeNseBlockDeals } from "../scrapers/nse-csv";
import { scrapeMoneyControlBulkDeals } from "../scrapers/moneycontrol";
import { scrapeBseBulkDealsCsv, scrapeBseBlockDealsCsv } from "../scrapers/bse-csv";
import { scrapeSebiShp, scanBseFilingsRss } from "../scrapers/sebi-shp";
import { checkTodayDeals } from "../scrapers/today-deals";
import { runDiffAndAlert } from "../analytics/deal-diff";
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

function isAfterMarketClose(): boolean {
  if (!isMarketDay()) return false;
  const now = new Date();
  const ist = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
  const hours = ist.getHours();
  const minutes = ist.getMinutes();
  const timeInMinutes = hours * 60 + minutes;
  return timeInMinutes >= 1020; // after 5 PM IST (exchange files published ~5:30-6:30 PM)
}

// ─────────────────────────────────────────────
// Individual job functions callable by Vercel Cron API routes
// ─────────────────────────────────────────────

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

export async function jobScrapeTrendlyne(): Promise<{ skipped: boolean; result?: unknown }> {
  if (shouldSkipSource("trendlyne")) {
    console.log("[Jobs] Skipping Trendlyne (source unhealthy)");
    return { skipped: true };
  }
  console.log("[Jobs] Running Trendlyne scrape...");
  const result = await scrapeTrendlyne();
  return { skipped: false, result };
}

export async function jobScrapeNseDeals(): Promise<{ skipped: boolean }> {
  if (shouldSkipSource("nse-csv")) {
    console.log("[Jobs] Skipping NSE CSV (source unhealthy)");
    return { skipped: true };
  }
  console.log("[Jobs] Running NSE bulk/block deals scrape...");
  await scrapeNseBulkDeals(7);
  await new Promise((r) => setTimeout(r, 2000));
  await scrapeNseBlockDeals(7);
  return { skipped: false };
}

export async function jobScrapeBseDeals(): Promise<{ skipped: boolean }> {
  if (shouldSkipSource("bse-rss")) {
    console.log("[Jobs] Skipping BSE (source unhealthy)");
    return { skipped: true };
  }
  console.log("[Jobs] Running BSE bulk deals scrape...");
  // Run both HTML scraper and CSV API scraper
  await Promise.allSettled([
    scrapeBseBulkDeals(),
    scrapeBseBulkDealsCsv(7),
  ]);
  await new Promise((r) => setTimeout(r, 2000));
  await Promise.allSettled([
    scrapeBseAnnouncements(),
    scrapeBseBlockDealsCsv(7),
  ]);
  return { skipped: false };
}

export async function jobScrapeMoneyControl(): Promise<{ skipped: boolean }> {
  if (shouldSkipSource("moneycontrol")) {
    console.log("[Jobs] Skipping MoneyControl (source unhealthy)");
    return { skipped: true };
  }
  console.log("[Jobs] Running MoneyControl scrape...");
  await scrapeMoneyControlBulkDeals();
  return { skipped: false };
}


// NEW: SEBI SHP — runs daily at 8 PM IST (after filing window)
export async function jobScrapeSebiShp(): Promise<{ updated: number; rssAlerts: number }> {
  console.log("[Jobs] Running SEBI SHP scan...");
  const [updated, rssAlerts] = await Promise.allSettled([
    scrapeSebiShp(),
    scanBseFilingsRss(),
  ]);
  return {
    updated: updated.status === "fulfilled" ? updated.value : 0,
    rssAlerts: rssAlerts.status === "fulfilled" ? rssAlerts.value : 0,
  };
}

// NEW: Today's deals — runs every 30 min after 5 PM on trading days
export async function jobCheckTodayDeals(): Promise<{ newDeals: number; alerted: number; skipped: boolean }> {
  if (!isAfterMarketClose()) {
    console.log("[Jobs] Skipping today deals check (market not closed yet)");
    return { newDeals: 0, alerted: 0, skipped: true };
  }
  console.log("[Jobs] Checking today's NSE/BSE deals...");
  const result = await checkTodayDeals();
  return { ...result, skipped: false };
}

// NEW: Quarterly diff — runs after Trendlyne/SHP scrape
export async function jobRunDiff(): Promise<{ newEntries: number; exits: number; increased: number; reduced: number }> {
  console.log("[Jobs] Running holdings diff...");
  return runDiffAndAlert(true); // silent if no new entries/exits
}

export async function jobUpdateFundamentals(): Promise<{ skipped: boolean }> {
  if (shouldSkipSource("screener")) {
    console.log("[Jobs] Skipping Screener (source unhealthy)");
    return { skipped: true };
  }
  console.log("[Jobs] Running Screener fundamentals update...");
  await updateAllFundamentals();
  return { skipped: false };
}

export async function jobTakePortfolioSnapshot(): Promise<{
  holdings: number;
  totalValue: number;
}> {
  console.log("[Jobs] Taking portfolio snapshot...");
  const db = getDb();

  const { data: latestRow } = await db
    .from("holdings")
    .select("quarter")
    .order("quarter", { ascending: false })
    .limit(1)
    .single();

  if (!latestRow) return { holdings: 0, totalValue: 0 };

  const { data: holdingsData } = await db
    .from("holdings")
    .select("shares_held, stocks(symbol)")
    .eq("quarter", latestRow.quarter);

  if (!holdingsData || holdingsData.length === 0) return { holdings: 0, totalValue: 0 };

  const symbols = (holdingsData || []).map((h: Record<string, unknown>) => {
    const stock = h.stocks as unknown as Record<string, unknown> | null;
    return stock?.symbol as string;
  }).filter(Boolean);

  const { data: pricesData } = await db
    .from("price_cache")
    .select("symbol, price")
    .in("symbol", symbols);

  const priceMap = new Map<string, number>();
  for (const p of pricesData || []) priceMap.set(p.symbol, p.price);

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

  await db.from("portfolio_snapshots").upsert(
    {
      snapshot_date: today,
      total_value: totalValue,
      num_holdings: holdingsData.length,
      details_json: JSON.stringify(details),
    },
    { onConflict: "snapshot_date" }
  );

  console.log(`[Jobs] Snapshot: ${holdingsData.length} holdings, ₹${(totalValue / 1e7).toFixed(2)} Cr`);
  return { holdings: holdingsData.length, totalValue };
}
