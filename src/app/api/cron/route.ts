import { NextRequest, NextResponse } from "next/server";
import {
  jobRefreshPrices,
  jobScrapeTrendlyne,
  jobScrapeNseDeals,
  jobScrapeBseDeals,
  jobScrapeMoneyControl,
  jobUpdateFundamentals,
  jobTakePortfolioSnapshot,
} from "@/lib/jobs/scheduler";

const CRON_SECRET = process.env.CRON_SECRET;

function verifyCron(request: NextRequest): boolean {
  // Vercel Cron sends this header automatically
  const authHeader = request.headers.get("authorization");
  if (authHeader === `Bearer ${CRON_SECRET}`) return true;

  // Also allow if no secret is set (development)
  if (!CRON_SECRET) return true;

  return false;
}

export async function GET(request: NextRequest) {
  if (!verifyCron(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const job = searchParams.get("job");

  try {
    let result: unknown;

    switch (job) {
      case "prices":
        result = await jobRefreshPrices();
        break;
      case "trendlyne":
        result = await jobScrapeTrendlyne();
        break;
      case "nse":
        result = await jobScrapeNseDeals();
        break;
      case "bse":
        result = await jobScrapeBseDeals();
        break;
      case "moneycontrol":
        result = await jobScrapeMoneyControl();
        break;
      case "fundamentals":
        result = await jobUpdateFundamentals();
        break;
      case "snapshot":
        result = await jobTakePortfolioSnapshot();
        break;
      case "all-deals":
        // Run all deal scrapers sequentially
        const trendlyne = await jobScrapeTrendlyne();
        await new Promise((r) => setTimeout(r, 2000));
        const nse = await jobScrapeNseDeals();
        await new Promise((r) => setTimeout(r, 2000));
        const bse = await jobScrapeBseDeals();
        await new Promise((r) => setTimeout(r, 2000));
        const mc = await jobScrapeMoneyControl();
        result = { trendlyne, nse, bse, mc };
        break;
      default:
        return NextResponse.json(
          { error: `Unknown job: ${job}. Valid: prices, trendlyne, nse, bse, moneycontrol, fundamentals, snapshot, all-deals` },
          { status: 400 }
        );
    }

    return NextResponse.json({ success: true, job, result });
  } catch (error) {
    console.error(`[Cron] Job '${job}' failed:`, error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
