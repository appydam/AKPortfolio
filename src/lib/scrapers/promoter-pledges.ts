// Promoter Pledge Tracking
//
// Tracks pledged shares by promoters of AK's portfolio companies.
// Rising pledge levels = promoter under financial stress = risk signal.
// Falling pledge levels = debt repayment = positive signal.
//
// Source: NSE corporate governance data + BSE SHP filings
// The SHP (Shareholding Pattern) filings include pledge data.

import { getDb } from "../db";
import { recordSourceResult } from "../health/monitor";
import { nseFetch } from "../nse-session";
import { queueNotification } from "../notifications/telegram";

function parseNumber(text: string): number {
  return parseFloat(String(text).replace(/,/g, "").replace(/[^\d.\-]/g, "")) || 0;
}

interface PledgeData {
  symbol: string;
  quarter: string;
  promoterHoldingPct: number;
  pledgedPct: number;
  pledgedShares: number | null;
  totalPromoterShares: number | null;
}

// Fetch promoter pledge data from NSE
async function fetchNsePromoterPledge(symbol: string): Promise<PledgeData | null> {
  try {
    // NSE provides pledge data in the shareholding pattern API
    const url = `https://www.nseindia.com/api/corporate-share-holding-pattern?symbol=${encodeURIComponent(symbol)}&shareHolderType=Promoter_and_Shareholding_Pattern`;
    const res = await nseFetch(url);
    if (!res.ok) return null;

    const data = await res.json();

    // The SHP data includes promoter holding and pledge percentage
    const shpData = data?.data || data?.shareholding || [];
    if (!Array.isArray(shpData) || shpData.length === 0) return null;

    let totalPromoterShares = 0;
    let pledgedShares = 0;
    let promoterHoldingPct = 0;

    for (const row of shpData) {
      const category = (row.category || row.holderCategory || "").toLowerCase();
      if (category.includes("promoter")) {
        totalPromoterShares += parseNumber(String(row.noOfShares || row.shares || 0));
        pledgedShares += parseNumber(String(row.pledgedEncumbered || row.sharesEncumbered || 0));
        promoterHoldingPct += parseNumber(String(row.pct || row.percentage || 0));
      }
    }

    if (totalPromoterShares === 0) return null;

    const pledgedPct = totalPromoterShares > 0
      ? (pledgedShares / totalPromoterShares) * 100
      : 0;

    // Determine current quarter
    const now = new Date();
    const q = Math.ceil((now.getMonth() + 1) / 3);
    const quarter = `${now.getFullYear()}-Q${q}`;

    return {
      symbol,
      quarter,
      promoterHoldingPct,
      pledgedPct: Math.round(pledgedPct * 100) / 100,
      pledgedShares,
      totalPromoterShares,
    };
  } catch (err) {
    console.error(`[Pledges] NSE fetch failed for ${symbol}:`, err);
    return null;
  }
}

/**
 * Main: Scan all portfolio stocks for promoter pledge data.
 */
export async function scrapePromoterPledges(): Promise<number> {
  console.log("[Pledges] Scanning portfolio for promoter pledge data...");
  const start = Date.now();

  try {
    const db = getDb();

    // Get latest quarter holdings
    const { data: latestQ } = await db
      .from("holdings")
      .select("quarter")
      .order("quarter", { ascending: false })
      .limit(1)
      .single();

    if (!latestQ) return 0;

    const { data: holdings } = await db
      .from("holdings")
      .select("stock_id, stocks(id, symbol, name)")
      .eq("quarter", latestQ.quarter);

    if (!holdings || holdings.length === 0) return 0;

    let updated = 0;

    for (const h of holdings) {
      const stock = h.stocks as unknown as Record<string, unknown> | null;
      const symbol = (stock?.symbol as string) || "";
      const stockId = (stock?.id as number) || h.stock_id;
      const name = (stock?.name as string) || symbol;
      if (!symbol || symbol.startsWith("BSE:")) continue;

      const pledgeData = await fetchNsePromoterPledge(symbol);
      await new Promise((r) => setTimeout(r, 300));

      if (!pledgeData) continue;

      // Get previous quarter's pledge data for comparison
      const { data: prevPledge } = await db
        .from("promoter_pledges")
        .select("pledged_pct")
        .eq("stock_id", stockId)
        .neq("quarter", pledgeData.quarter)
        .order("quarter", { ascending: false })
        .limit(1)
        .single();

      const changeFromPrev = prevPledge
        ? pledgeData.pledgedPct - prevPledge.pledged_pct
        : null;

      const { data } = await db.from("promoter_pledges").upsert(
        {
          stock_id: stockId,
          quarter: pledgeData.quarter,
          promoter_holding_pct: pledgeData.promoterHoldingPct,
          pledged_pct: pledgeData.pledgedPct,
          pledged_shares: pledgeData.pledgedShares,
          total_promoter_shares: pledgeData.totalPromoterShares,
          change_from_prev: changeFromPrev,
          source: "nse",
        },
        { onConflict: "stock_id,quarter" }
      ).select("id");

      if (data && data.length > 0) updated++;

      // Alert on high pledge levels (>30%) or significant increases
      if (pledgeData.pledgedPct > 30) {
        await queueNotification(
          "telegram",
          "urgent",
          `⚠️ HIGH PLEDGE: ${name} (${symbol})`,
          [
            `<b>Promoter pledge:</b> ${pledgeData.pledgedPct.toFixed(1)}% of promoter holding`,
            `<b>Promoter holding:</b> ${pledgeData.promoterHoldingPct.toFixed(1)}%`,
            pledgeData.pledgedShares
              ? `<b>Pledged shares:</b> ${pledgeData.pledgedShares.toLocaleString("en-IN")}`
              : "",
            changeFromPrev != null
              ? `<b>Change from prev quarter:</b> ${changeFromPrev > 0 ? "+" : ""}${changeFromPrev.toFixed(1)}pp`
              : "",
            `\n⚠️ High pledge levels may indicate promoter financial stress`,
          ].filter(Boolean).join("\n")
        );
      } else if (changeFromPrev != null && changeFromPrev > 10) {
        await queueNotification(
          "telegram",
          "normal",
          `📊 Pledge Increase: ${name} (${symbol})`,
          `Promoter pledge increased by ${changeFromPrev.toFixed(1)}pp to ${pledgeData.pledgedPct.toFixed(1)}%`
        );
      } else if (changeFromPrev != null && changeFromPrev < -10) {
        await queueNotification(
          "telegram",
          "normal",
          `✅ Pledge Decrease: ${name} (${symbol})`,
          `Promoter pledge decreased by ${Math.abs(changeFromPrev).toFixed(1)}pp to ${pledgeData.pledgedPct.toFixed(1)}%`
        );
      }
    }

    const latency = Date.now() - start;
    recordSourceResult("promoter-pledges", true, latency);
    console.log(`[Pledges] Updated ${updated} stocks with pledge data`);
    return updated;
  } catch (error) {
    const latency = Date.now() - start;
    recordSourceResult("promoter-pledges", false, latency, String(error));
    console.error("[Pledges] Scrape failed:", error);
    return 0;
  }
}
