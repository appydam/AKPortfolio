// Board Meeting & Corporate Event Tracker
//
// Tracks upcoming and recent board meetings for AK's portfolio companies.
// Board meetings are catalysts — they announce results, dividends, splits,
// fund raising, buybacks, and other events that move stock prices.
//
// Sources:
// - NSE: /api/corporates-board-meetings (scheduled board meetings)
// - BSE: BSE corporate filings RSS (board meeting intimations)

import { getDb } from "../db";
import { recordSourceResult } from "../health/monitor";
import { nseFetch } from "../nse-session";
import { queueNotification } from "../notifications/telegram";

interface BoardMeeting {
  symbol: string;
  meetingDate: string;
  purpose: string;
  description: string;
  announcementDate: string | null;
  exchange: string;
}

// Classify board meeting purpose
function classifyPurpose(text: string): string {
  const lower = text.toLowerCase();
  if (lower.includes("financial result") || lower.includes("quarterly result") || lower.includes("annual result")) {
    return "Results";
  }
  if (lower.includes("dividend")) return "Dividend";
  if (lower.includes("fund raising") || lower.includes("fundraising") || lower.includes("rights issue") || lower.includes("preferential")) {
    return "Fund Raising";
  }
  if (lower.includes("bonus")) return "Bonus";
  if (lower.includes("split") || lower.includes("sub-division")) return "Split";
  if (lower.includes("buyback") || lower.includes("buy back") || lower.includes("buy-back")) return "Buyback";
  if (lower.includes("merger") || lower.includes("amalgamation") || lower.includes("acquisition")) return "M&A";
  return "Other";
}

// Fetch board meetings from NSE for a specific stock
async function fetchNseBoardMeetings(symbol: string): Promise<BoardMeeting[]> {
  try {
    const url = `https://www.nseindia.com/api/corporates-board-meetings?index=equities&symbol=${encodeURIComponent(symbol)}`;
    const res = await nseFetch(url);
    if (!res.ok) return [];

    const data = await res.json();
    const records = data?.data || data || [];
    if (!Array.isArray(records)) return [];

    const results: BoardMeeting[] = [];
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
    const ninetyDaysAhead = new Date();
    ninetyDaysAhead.setDate(ninetyDaysAhead.getDate() + 90);

    for (const r of records) {
      const meetingDate = r.meetingDate || r.bm_date || "";
      if (!meetingDate) continue;

      const meetDateObj = new Date(meetingDate);
      // Only include meetings within ±90 days
      if (meetDateObj < ninetyDaysAgo || meetDateObj > ninetyDaysAhead) continue;

      const purpose = r.bm_purpose || r.purpose || r.subject || "";
      const description = r.bm_desc || r.description || purpose;

      results.push({
        symbol,
        meetingDate,
        purpose: classifyPurpose(purpose),
        description: description.trim(),
        announcementDate: r.bm_timestamp || r.announceDate || null,
        exchange: "NSE",
      });
    }

    return results;
  } catch (err) {
    console.error(`[BoardMeetings] NSE fetch failed for ${symbol}:`, err);
    return [];
  }
}

/**
 * Main: Scan all portfolio stocks for upcoming and recent board meetings.
 */
export async function scrapeBoardMeetings(): Promise<number> {
  console.log("[BoardMeetings] Scanning portfolio for board meetings...");
  const start = Date.now();

  try {
    const db = getDb();

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

    let newMeetings = 0;

    for (const h of holdings) {
      const stock = h.stocks as unknown as Record<string, unknown> | null;
      const symbol = (stock?.symbol as string) || "";
      const stockId = (stock?.id as number) || h.stock_id;
      const name = (stock?.name as string) || symbol;
      if (!symbol || symbol.startsWith("BSE:")) continue;

      const meetings = await fetchNseBoardMeetings(symbol);
      await new Promise((r) => setTimeout(r, 300));

      for (const m of meetings) {
        const { data } = await db.from("board_meetings").upsert(
          {
            stock_id: stockId,
            meeting_date: m.meetingDate,
            purpose: m.purpose,
            description: m.description,
            announcement_date: m.announcementDate,
            exchange: m.exchange,
            source: "nse",
          },
          { onConflict: "stock_id,meeting_date,purpose", ignoreDuplicates: true }
        ).select("id");

        if (data && data.length > 0) {
          newMeetings++;

          // Alert for upcoming meetings (within 7 days)
          const meetDate = new Date(m.meetingDate);
          const daysUntil = Math.ceil((meetDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));

          if (daysUntil >= 0 && daysUntil <= 7) {
            const urgency = daysUntil <= 2 ? "urgent" : "normal";
            const emoji = m.purpose === "Results" ? "📊"
              : m.purpose === "Dividend" ? "💰"
              : m.purpose === "Fund Raising" ? "💵"
              : m.purpose === "Bonus" ? "🎁"
              : m.purpose === "Split" ? "✂️"
              : m.purpose === "Buyback" ? "🔄"
              : m.purpose === "M&A" ? "🤝"
              : "📋";

            await queueNotification(
              "telegram",
              urgency,
              `${emoji} BOARD MEETING: ${name} (${symbol})`,
              [
                `<b>Date:</b> ${m.meetingDate}${daysUntil === 0 ? " (TODAY)" : daysUntil === 1 ? " (TOMORROW)" : ` (in ${daysUntil} days)`}`,
                `<b>Purpose:</b> ${m.purpose}`,
                m.description !== m.purpose ? `<b>Details:</b> ${m.description}` : "",
                `\nBoard meeting for AK portfolio stock — potential catalyst`,
              ].filter(Boolean).join("\n")
            );
          }
        }
      }
    }

    const latency = Date.now() - start;
    recordSourceResult("board-meetings", true, latency);
    console.log(`[BoardMeetings] Found ${newMeetings} new board meetings`);
    return newMeetings;
  } catch (error) {
    const latency = Date.now() - start;
    recordSourceResult("board-meetings", false, latency, String(error));
    console.error("[BoardMeetings] Scrape failed:", error);
    return 0;
  }
}
