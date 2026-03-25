import * as cheerio from "cheerio";
import { getDb, ensureStock } from "../db";
import { recordSourceResult } from "../health/monitor";

// BSE Corporate filings — bulk deal reports
const BSE_BULK_DEALS_URL =
  "https://www.bseindia.com/markets/equity/EQReports/BulkandBlockDeals.aspx";
const BSE_ANNOUNCEMENTS_URL =
  "https://www.bseindia.com/corporates/ann.html";

const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
};

const ASHISH_KACHOLIA_VARIANTS = [
  "ashish kacholia",
  "ashish rameshchandra kacholia",
  "a kacholia",
  "ashish r kacholia",
];

function cleanText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function parseNumber(text: string): number {
  const cleaned = text.replace(/,/g, "").replace(/[^\d.\-]/g, "");
  return parseFloat(cleaned) || 0;
}

function isAshishKacholia(clientName: string): boolean {
  const lower = clientName.toLowerCase();
  return ASHISH_KACHOLIA_VARIANTS.some((v) => lower.includes(v));
}

export async function scrapeBseBulkDeals(): Promise<number> {
  console.log("[BSE] Scraping bulk deals...");
  const start = Date.now();

  try {
    const response = await fetch(BSE_BULK_DEALS_URL, { headers: HEADERS });
    if (!response.ok) {
      throw new Error(`BSE bulk deals fetch failed: ${response.status}`);
    }

    const html = await response.text();
    const $ = cheerio.load(html);
    const db = getDb();
    let newDeals = 0;

    // BSE bulk deals page has a table with deal data
    const rows: Array<{
      dealDate: string;
      stockCode: string;
      stockName: string;
      clientName: string;
      dealTypeRaw: string;
      quantity: number;
      avgPrice: number;
    }> = [];

    $("table#ContentPlaceHolder1_gvbulk tr, table.mktdet_1 tr, table tbody tr").each(
      (i, row) => {
        if (i === 0) return; // Skip header row

        const cells = $(row).find("td");
        if (cells.length < 6) return;

        const dealDate = cleanText($(cells[0]).text());
        const stockCode = cleanText($(cells[1]).text());
        const stockName = cleanText($(cells[2]).text());
        const clientName = cleanText($(cells[3]).text());
        const dealTypeRaw = cleanText($(cells[4]).text());
        const quantity = parseNumber($(cells[5]).text());
        const avgPrice = cells.length > 6 ? parseNumber($(cells[6]).text()) : 0;

        // Filter for Ashish Kacholia
        if (!isAshishKacholia(clientName)) return;

        rows.push({ dealDate, stockCode, stockName, clientName, dealTypeRaw, quantity, avgPrice });
      }
    );

    for (const r of rows) {
      const action = r.dealTypeRaw.toLowerCase().includes("buy") || r.dealTypeRaw.toLowerCase().includes("purchase")
        ? "Buy"
        : "Sell";

      // Extract or guess symbol from stock name
      const symbol = r.stockCode || r.stockName.replace(/\s+/g, "").substring(0, 20).toUpperCase();

      const stockId = await ensureStock(symbol, r.stockName);

      const { data } = await db.from("deals").upsert(
        {
          stock_id: stockId,
          deal_date: r.dealDate,
          exchange: "BSE",
          deal_type: "Bulk",
          action,
          quantity: r.quantity,
          avg_price: r.avgPrice,
          pct_traded: null,
        },
        { onConflict: "stock_id,deal_date,exchange,deal_type,action,quantity", ignoreDuplicates: true }
      ).select("id");

      if (data && data.length > 0) newDeals++;
    }

    const latency = Date.now() - start;
    recordSourceResult("bse-rss", true, latency);
    console.log(`[BSE] Found ${newDeals} new deals`);
    return newDeals;
  } catch (error) {
    const latency = Date.now() - start;
    recordSourceResult("bse-rss", false, latency, String(error));
    console.error("[BSE] Scrape failed:", error);
    return 0;
  }
}

// BSE Announcements/Corporate Actions RSS feed
export async function scrapeBseAnnouncements(): Promise<number> {
  console.log("[BSE] Checking announcements RSS...");
  const start = Date.now();

  try {
    // BSE provides XML RSS feeds for corporate announcements
    const rssUrl = "https://www.bseindia.com/data/xml/notices.xml";
    const response = await fetch(rssUrl, { headers: HEADERS });

    if (!response.ok) {
      // Fallback to alternative endpoint
      const altResponse = await fetch(
        "https://www.bseindia.com/corporates/ann.html?curpg=1&annession=&annflag=0",
        { headers: HEADERS }
      );
      if (!altResponse.ok) throw new Error(`BSE announcements failed: ${altResponse.status}`);

      const html = await altResponse.text();
      return parseBseAnnouncementsHtml(html);
    }

    const xml = await response.text();
    return await parseBseAnnouncementsXml(xml);
  } catch (error) {
    const latency = Date.now() - start;
    recordSourceResult("bse-announcements", false, latency, String(error));
    console.error("[BSE] Announcements scrape failed:", error);
    return 0;
  }
}

async function parseBseAnnouncementsXml(xml: string): Promise<number> {
  const $ = cheerio.load(xml, { xmlMode: true });
  let relevantCount = 0;

  const db = getDb();
  const { data: stocks } = await db.from("stocks").select("name");

  const items: Array<{ title: string; description: string }> = [];
  $("item").each((_, item) => {
    items.push({
      title: $(item).find("title").text().toLowerCase(),
      description: $(item).find("description").text().toLowerCase(),
    });
  });

  for (const item of items) {
    const combined = `${item.title} ${item.description}`;

    // Look for shareholding pattern filings
    if (
      combined.includes("shareholding pattern") ||
      combined.includes("bulk deal") ||
      combined.includes("block deal")
    ) {
      // Check if it involves stocks in our portfolio
      for (const stock of stocks || []) {
        if (combined.includes(stock.name.toLowerCase())) {
          relevantCount++;
          console.log(`[BSE RSS] Relevant announcement found for ${stock.name}`);
        }
      }
    }
  }

  recordSourceResult("bse-announcements", true, 0);
  return relevantCount;
}

function parseBseAnnouncementsHtml(html: string): number {
  const $ = cheerio.load(html);
  let relevantCount = 0;

  $("table tr, .ann_table tr").each((_, row) => {
    const text = $(row).text().toLowerCase();
    if (
      text.includes("shareholding pattern") ||
      text.includes("bulk deal") ||
      text.includes("ashish kacholia")
    ) {
      relevantCount++;
    }
  });

  recordSourceResult("bse-announcements", true, 0);
  return relevantCount;
}
