import { NextRequest, NextResponse } from "next/server";
import {
  jobRefreshPrices,
  jobScrapeTrendlyne,
  jobScrapeNseDeals,
  jobScrapeBseDeals,
  jobScrapeMoneyControl,
  jobScrapeSebiShp,
  jobCheckTodayDeals,
  jobRunDiff,
  jobUpdateFundamentals,
  jobTakePortfolioSnapshot,
} from "@/lib/jobs/scheduler";

const CRON_SECRET = process.env.CRON_SECRET;

function verifyCron(request: NextRequest): boolean {
  const authHeader = request.headers.get("authorization");
  if (authHeader === `Bearer ${CRON_SECRET}`) return true;
  if (!CRON_SECRET) return true;
  const { searchParams } = new URL(request.url);
  if (searchParams.get("secret") === CRON_SECRET) return true;
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
        await jobRunDiff().catch(() => null);
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
      case "sebi-shp":
        result = await jobScrapeSebiShp();
        await jobRunDiff().catch(() => null);
        break;
      case "today-deals":
        result = await jobCheckTodayDeals();
        break;
      case "diff":
        result = await jobRunDiff();
        break;
      case "fundamentals":
        result = await jobUpdateFundamentals();
        break;
      case "snapshot":
        result = await jobTakePortfolioSnapshot();
        break;
      case "all-deals": {
        const [trendlyne] = await Promise.allSettled([jobScrapeTrendlyne()]);
        await new Promise((r) => setTimeout(r, 2000));
        const [nse, bse] = await Promise.allSettled([
          jobScrapeNseDeals(),
          jobScrapeBseDeals(),
        ]);
        await new Promise((r) => setTimeout(r, 2000));
        const [mc, sebi] = await Promise.allSettled([
          jobScrapeMoneyControl(),
          jobScrapeSebiShp(),
        ]);
        await jobRunDiff().catch(() => null);
        result = { trendlyne, nse, bse, mc, sebi };
        break;
      }
      default:
        return NextResponse.json(
          {
            error: `Unknown job: ${job}`,
            valid: [
              "prices", "trendlyne", "nse", "bse", "moneycontrol",
              "sebi-shp", "today-deals", "diff",
              "fundamentals", "snapshot", "all-deals"
            ]
          },
          { status: 400 }
        );
    }

    return NextResponse.json({ success: true, job, result, ts: new Date().toISOString() });
  } catch (error) {
    console.error(`[Cron] Job '${job}' failed:`, error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
