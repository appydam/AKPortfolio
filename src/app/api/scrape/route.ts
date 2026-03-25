import { NextRequest, NextResponse } from "next/server";
import { scrapeTrendlyne } from "@/lib/scrapers/trendlyne";
import { updateAllFundamentals } from "@/lib/scrapers/screener";
import { scrapeBseBulkDeals, scrapeBseAnnouncements } from "@/lib/scrapers/bse-rss";
import { scrapeNseBulkDeals, scrapeNseBlockDeals } from "@/lib/scrapers/nse-csv";
import { scrapeMoneyControlBulkDeals } from "@/lib/scrapers/moneycontrol";
import { refreshAllAggregatedPrices } from "@/lib/prices/aggregator";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const source = body.source || "all";

    const results: Record<string, unknown> = {};

    if (source === "all" || source === "trendlyne") {
      results.trendlyne = await scrapeTrendlyne();
    }

    if (source === "all" || source === "nse") {
      const bulkDeals = await scrapeNseBulkDeals(30);
      await new Promise((r) => setTimeout(r, 2000));
      const blockDeals = await scrapeNseBlockDeals(30);
      results.nse = { bulkDeals, blockDeals };
    }

    if (source === "all" || source === "bse") {
      const bulkDeals = await scrapeBseBulkDeals();
      await new Promise((r) => setTimeout(r, 2000));
      const announcements = await scrapeBseAnnouncements();
      results.bse = { bulkDeals, announcements };
    }

    if (source === "all" || source === "moneycontrol") {
      results.moneycontrol = { deals: await scrapeMoneyControlBulkDeals() };
    }

    if (source === "all" || source === "screener") {
      results.screener = { updated: await updateAllFundamentals() };
    }

    if (source === "all" || source === "prices") {
      results.prices = { refreshed: await refreshAllAggregatedPrices() };
    }

    return NextResponse.json({ success: true, results });
  } catch (error) {
    console.error("[API] Scrape error:", error);
    return NextResponse.json(
      { error: "Scrape failed", details: String(error) },
      { status: 500 }
    );
  }
}
