// SAST (Substantial Acquisition of Shares and Takeovers) Disclosure Scraper
//
// When anyone crosses 1%, 2%, 5%, 10%, 25% shareholding thresholds,
// they MUST file a SAST disclosure with the exchange within 2 days.
// This catches Kacholia crossing thresholds faster than quarterly SHP.
//
// Sources:
// - NSE: /api/corporates-takeovers (SAST/Takeover disclosures)
// - BSE: /corporates/Substantial_Sharehold.aspx

import { getDb } from "../db";
import { recordSourceResult } from "../health/monitor";
import { isKacholiaEntity, classifyEntity, normalizeEntityName } from "../entities";
import { nseFetch } from "../nse-session";
import { queueNotification } from "../notifications/telegram";

function parseNumber(text: string): number {
  return parseFloat(String(text).replace(/,/g, "").replace(/[^\d.\-]/g, "")) || 0;
}

interface SastDisclosure {
  symbol: string;
  entityName: string;
  entityType: string;
  regulation: string;
  triggerPct: number | null;
  sharesBefore: number | null;
  pctBefore: number | null;
  sharesAfter: number | null;
  pctAfter: number | null;
  disclosureDate: string;
  exchange: string;
}

// Fetch SAST disclosures from NSE for a specific stock
async function fetchNseSastDisclosures(symbol: string): Promise<SastDisclosure[]> {
  try {
    const url = `https://www.nseindia.com/api/corporates-takeovers?index=equities&symbol=${encodeURIComponent(symbol)}`;
    const res = await nseFetch(url);
    if (!res.ok) return [];

    const data = await res.json();
    const records = data?.data || data || [];
    if (!Array.isArray(records)) return [];

    const results: SastDisclosure[] = [];
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

    for (const r of records) {
      const acqName = (r.acqName || r.acquirerName || "").trim();
      const discDate = r.intimDate || r.date || "";

      if (discDate) {
        const d = new Date(discDate);
        if (d < ninetyDaysAgo) continue;
      }

      const regulation = (r.tkReg || r.regulation || "").trim();
      const pctBefore = r.befAcqSharesPer ? parseNumber(String(r.befAcqSharesPer)) : null;
      const pctAfter = r.aftAcqSharesPer ? parseNumber(String(r.aftAcqSharesPer)) : null;

      // Determine which threshold was crossed
      let triggerPct: number | null = null;
      if (pctBefore != null && pctAfter != null) {
        const thresholds = [1, 2, 5, 10, 15, 25, 50, 75];
        for (const t of thresholds) {
          if ((pctBefore < t && pctAfter >= t) || (pctBefore >= t && pctAfter < t)) {
            triggerPct = t;
            break;
          }
        }
      }

      results.push({
        symbol,
        entityName: acqName,
        entityType: isKacholiaEntity(acqName) ? classifyEntity(acqName) : "other",
        regulation,
        triggerPct,
        sharesBefore: r.befAcqSharesNo ? parseNumber(String(r.befAcqSharesNo)) : null,
        pctBefore,
        sharesAfter: r.aftAcqSharesNo ? parseNumber(String(r.aftAcqSharesNo)) : null,
        pctAfter,
        disclosureDate: discDate,
        exchange: "NSE",
      });
    }

    return results;
  } catch (err) {
    console.error(`[SAST] NSE fetch failed for ${symbol}:`, err);
    return [];
  }
}

/**
 * Main: Scan all portfolio stocks for SAST threshold crossing disclosures.
 */
export async function scrapeSastDisclosures(): Promise<number> {
  console.log("[SAST] Scanning for substantial acquisition disclosures...");
  const start = Date.now();

  try {
    const db = getDb();
    const { data: stocks } = await db.from("stocks").select("id, symbol, name");
    if (!stocks || stocks.length === 0) return 0;

    let newDisclosures = 0;

    for (const stock of stocks) {
      if (stock.symbol.startsWith("BSE:")) continue;

      const disclosures = await fetchNseSastDisclosures(stock.symbol);
      await new Promise((r) => setTimeout(r, 300));

      for (const d of disclosures) {
        const isAk = isKacholiaEntity(d.entityName);

        const { data } = await db.from("sast_disclosures").upsert(
          {
            stock_id: stock.id,
            entity_name: isAk ? normalizeEntityName(d.entityName) : d.entityName,
            entity_type: d.entityType,
            regulation: d.regulation,
            trigger_pct: d.triggerPct,
            shares_before: d.sharesBefore,
            pct_before: d.pctBefore,
            shares_after: d.sharesAfter,
            pct_after: d.pctAfter,
            disclosure_date: d.disclosureDate,
            exchange: d.exchange,
            source: "nse",
          },
          { onConflict: "stock_id,entity_name,disclosure_date,regulation", ignoreDuplicates: true }
        ).select("id");

        if (data && data.length > 0) {
          newDisclosures++;

          if (isAk) {
            const direction = (d.pctAfter || 0) > (d.pctBefore || 0) ? "📈" : "📉";
            await queueNotification(
              "telegram",
              "urgent",
              `${direction} SAST THRESHOLD: ${stock.name} (${stock.symbol})`,
              [
                `<b>Entity:</b> ${normalizeEntityName(d.entityName)}`,
                `<b>Regulation:</b> ${d.regulation}`,
                d.triggerPct ? `<b>Threshold crossed:</b> ${d.triggerPct}%` : "",
                d.pctBefore != null ? `<b>Before:</b> ${d.pctBefore}%` : "",
                d.pctAfter != null ? `<b>After:</b> ${d.pctAfter}%` : "",
                d.sharesAfter ? `<b>Shares:</b> ${d.sharesAfter.toLocaleString("en-IN")}` : "",
                `\n⚡ SAST disclosure — mandatory filing when crossing ownership thresholds`,
              ].filter(Boolean).join("\n"),
              { symbol: stock.symbol, isKacholia: true }
            );
          }
        }
      }
    }

    const latency = Date.now() - start;
    recordSourceResult("sast-disclosures", true, latency);
    console.log(`[SAST] Found ${newDisclosures} new SAST disclosures`);
    return newDisclosures;
  } catch (error) {
    const latency = Date.now() - start;
    recordSourceResult("sast-disclosures", false, latency, String(error));
    console.error("[SAST] Scrape failed:", error);
    return 0;
  }
}
