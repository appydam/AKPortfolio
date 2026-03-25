import * as cheerio from "cheerio";
import { getDb, ensureStock } from "../db";
import { recordSourceResult } from "../health/monitor";

// Tickertape has a dedicated superstar investor page for Ashish Kacholia
// They pull quarterly SHP data + bulk deals and aggregate nicely
const TICKERTAPE_PORTFOLIO_URL =
  "https://www.tickertape.in/superstar-portfolios/ashish-kacholia-portfolio-assets";
const TICKERTAPE_API_URL =
  "https://api.tickertape.in/superstar-portfolio/assets/ashish-kacholia";

const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept: "application/json, text/html, */*",
  "Accept-Language": "en-US,en;q=0.9",
  Referer: "https://www.tickertape.in/",
  Origin: "https://www.tickertape.in",
};

function parseNumber(text: string): number {
  return parseFloat(String(text).replace(/,/g, "").replace(/[^\d.\-]/g, "")) || 0;
}

export async function scrapeTickertapeHoldings(): Promise<number> {
  console.log("[Tickertape] Scraping Ashish Kacholia holdings...");
  const start = Date.now();

  try {
    const db = getDb();
    let count = 0;

    // Try the JSON API first (cleaner data)
    const apiRes = await fetch(TICKERTAPE_API_URL, {
      headers: { ...HEADERS, Accept: "application/json" },
    });

    if (apiRes.ok) {
      const json = await apiRes.json();
      const holdings = json?.data || json?.assets || json?.holdings || [];

      if (Array.isArray(holdings) && holdings.length > 0) {
        const now = new Date();
        const q = Math.ceil((now.getMonth() + 1) / 3);
        const quarter = `${now.getFullYear()}-Q${q}`;

        for (const h of holdings) {
          const symbol = (h.sid || h.symbol || h.ticker || "").trim().toUpperCase();
          const name = (h.name || h.companyName || symbol).trim();
          const sharesHeld = parseNumber(String(h.shares || h.quantity || h.holdingQty || 0));
          const pctHolding = parseNumber(String(h.holdingPct || h.pct || h.percentage || 0));

          if (!symbol || /^\d+$/.test(symbol)) continue;

          const stockId = await ensureStock(symbol, name);
          await db.from("holdings").upsert(
            { stock_id: stockId, quarter, shares_held: Math.round(sharesHeld), pct_holding: pctHolding },
            { onConflict: "stock_id,quarter" }
          );
          count++;
        }

        recordSourceResult("tickertape", true, Date.now() - start);
        console.log(`[Tickertape] Updated ${count} holdings via API`);
        return count;
      }
    }

    // Fallback: scrape HTML page
    const res = await fetch(TICKERTAPE_PORTFOLIO_URL, { headers: HEADERS });
    if (!res.ok) throw new Error(`Tickertape fetch failed: ${res.status}`);

    const html = await res.text();
    const $ = cheerio.load(html);

    const now = new Date();
    const q = Math.ceil((now.getMonth() + 1) / 3);
    const quarter = `${now.getFullYear()}-Q${q}`;

    // Extract from table or card grid
    $("table tbody tr, .portfolio-table tr, [data-testid='holding-row']").each((_, row) => {
      const cells = $(row).find("td, [data-testid]");
      if (cells.length < 3) return;

      const name = $(cells[0]).text().trim();
      const symbol = $(cells[0]).find("[data-ticker], .ticker-symbol").text().trim().toUpperCase()
        || name.replace(/[^A-Za-z0-9]/g, "").toUpperCase().substring(0, 15);
      const sharesText = $(cells[1]).text().trim();
      const pctText = $(cells[2]).text().trim();

      if (!name || !symbol) return;

      const sharesHeld = parseNumber(sharesText);
      const pctHolding = parseNumber(pctText);

      if (!sharesHeld && !pctHolding) return;

      ensureStock(symbol, name).then((stockId) => {
        db.from("holdings").upsert(
          { stock_id: stockId, quarter, shares_held: Math.round(sharesHeld), pct_holding: pctHolding },
          { onConflict: "stock_id,quarter" }
        );
      });
      count++;
    });

    // Also look for JSON in script tags (Next.js __NEXT_DATA__ or similar)
    const scriptContent = $("script#__NEXT_DATA__").text() || $("script[type='application/json']").first().text();
    if (scriptContent) {
      try {
        const nextData = JSON.parse(scriptContent);
        const props = nextData?.props?.pageProps;
        const apiHoldings = props?.holdings || props?.assets || props?.portfolio || [];
        for (const h of apiHoldings) {
          const symbol = (h.sid || h.symbol || h.ticker || "").trim().toUpperCase();
          const name = (h.name || h.companyName || symbol).trim();
          const sharesHeld = parseNumber(String(h.shares || h.holdingQty || 0));
          const pctHolding = parseNumber(String(h.holdingPct || h.pct || 0));
          if (!symbol || /^\d+$/.test(symbol)) continue;

          const stockId = await ensureStock(symbol, name);
          await db.from("holdings").upsert(
            { stock_id: stockId, quarter, shares_held: Math.round(sharesHeld), pct_holding: pctHolding },
            { onConflict: "stock_id,quarter" }
          );
          count++;
        }
      } catch {
        // JSON parse failed, continue
      }
    }

    const latency = Date.now() - start;
    recordSourceResult("tickertape", true, latency);
    console.log(`[Tickertape] Updated ${count} holdings`);
    return count;
  } catch (error) {
    const latency = Date.now() - start;
    recordSourceResult("tickertape", false, latency, String(error));
    console.error("[Tickertape] Scrape failed:", error);
    return 0;
  }
}

// Tickertape also shows recent buys/sells in the "Activity" tab
export async function scrapeTickertapeActivity(): Promise<number> {
  console.log("[Tickertape] Scraping recent activity...");
  const start = Date.now();

  try {
    const db = getDb();
    let newDeals = 0;

    const activityUrl = "https://api.tickertape.in/superstar-portfolio/activity/ashish-kacholia";
    const res = await fetch(activityUrl, {
      headers: { ...HEADERS, Accept: "application/json" },
    });

    if (!res.ok) {
      recordSourceResult("tickertape-activity", false, Date.now() - start, `HTTP ${res.status}`);
      return 0;
    }

    const json = await res.json();
    const activities = json?.data || json?.activities || [];

    if (!Array.isArray(activities)) return 0;

    for (const act of activities) {
      const symbol = (act.sid || act.symbol || act.ticker || "").trim().toUpperCase();
      const name = (act.name || act.companyName || symbol).trim();
      const action = (act.action || act.type || "").toLowerCase().includes("buy") ? "Buy" : "Sell";
      const quantity = parseNumber(String(act.shares || act.quantity || 0));
      const avgPrice = parseNumber(String(act.price || act.avgPrice || 0));
      const dealDate = act.date || act.reportDate || new Date().toISOString().split("T")[0];

      if (!symbol || !quantity) continue;

      const stockId = await ensureStock(symbol, name);
      const { data } = await db.from("deals").upsert(
        {
          stock_id: stockId,
          deal_date: dealDate,
          exchange: "NSE",
          deal_type: "SHP",
          action,
          quantity,
          avg_price: avgPrice,
          pct_traded: null,
        },
        { onConflict: "stock_id,deal_date,exchange,deal_type,action,quantity", ignoreDuplicates: true }
      ).select("id");

      if (data && data.length > 0) newDeals++;
    }

    const latency = Date.now() - start;
    recordSourceResult("tickertape-activity", true, latency);
    console.log(`[Tickertape] Found ${newDeals} new activity entries`);
    return newDeals;
  } catch (error) {
    const latency = Date.now() - start;
    recordSourceResult("tickertape-activity", false, latency, String(error));
    console.error("[Tickertape] Activity scrape failed:", error);
    return 0;
  }
}
