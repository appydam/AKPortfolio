import { getDb } from "../db";
import { queueNotification } from "../notifications/telegram";

// Corporate Action Tracker
// Tracks stock splits, bonus issues, and rights issues for Kacholia's holdings.
// These events change his effective share count — without tracking them,
// our position data goes stale between SHP filings.

interface CorporateAction {
  symbol: string;
  name: string;
  actionType: "split" | "bonus" | "rights" | "dividend" | "other";
  description: string;
  exDate: string;
  ratio: string; // e.g., "1:2" for 2-for-1 split, "1:1" for bonus
  adjustmentFactor: number; // multiply existing shares by this
}

// Fetch corporate actions from NSE
async function fetchNseCorporateActions(symbol: string, cookies: string): Promise<CorporateAction[]> {
  try {
    const url = `https://www.nseindia.com/api/corporates-corporateActions?index=equities&symbol=${encodeURIComponent(symbol)}`;
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
        Accept: "application/json",
        Cookie: cookies,
        Referer: "https://www.nseindia.com/",
      },
    });
    if (!res.ok) return [];

    const data = await res.json();
    const actions = data?.data || data || [];
    if (!Array.isArray(actions)) return [];

    const results: CorporateAction[] = [];
    const now = new Date();
    const threeMonthsAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

    for (const a of actions) {
      const subject = (a.subject || "").toLowerCase();
      const exDate = a.exDate || a.bcStartDate || "";
      const purpose = (a.purpose || a.subject || "").toLowerCase();

      // Only look at recent/upcoming actions
      if (exDate) {
        const exDateObj = new Date(exDate);
        if (exDateObj < threeMonthsAgo) continue;
      }

      let actionType: CorporateAction["actionType"] = "other";
      let ratio = "";
      let adjustmentFactor = 1;

      if (subject.includes("split") || purpose.includes("split")) {
        actionType = "split";
        // Parse split ratio like "2/- to 1/-" or "10 to 5" or "Face value split from Rs.10 to Rs.2"
        const splitMatch = subject.match(/(?:from\s*)?(?:rs\.?\s*)?(\d+)\s*(?:\/\-?\s*)?(?:to|into)\s*(?:rs\.?\s*)?(\d+)/i)
          || purpose.match(/(\d+)\s*(?:\/\-?\s*)?(?:to|into)\s*(\d+)/i);
        if (splitMatch) {
          const oldFV = parseInt(splitMatch[1]);
          const newFV = parseInt(splitMatch[2]);
          if (newFV > 0 && oldFV > 0) {
            adjustmentFactor = oldFV / newFV;
            ratio = `${oldFV}:${newFV}`;
          }
        }
      } else if (subject.includes("bonus") || purpose.includes("bonus")) {
        actionType = "bonus";
        // Parse bonus ratio like "1:1" or "2:1"
        const bonusMatch = subject.match(/(\d+)\s*:\s*(\d+)/) || purpose.match(/(\d+)\s*:\s*(\d+)/);
        if (bonusMatch) {
          const bonus = parseInt(bonusMatch[1]);
          const held = parseInt(bonusMatch[2]);
          if (held > 0) {
            adjustmentFactor = (held + bonus) / held;
            ratio = `${bonus}:${held}`;
          }
        }
      } else if (subject.includes("rights") || purpose.includes("rights")) {
        actionType = "rights";
        ratio = "varies";
        adjustmentFactor = 1; // rights don't auto-adjust, just flag
      } else if (subject.includes("dividend") || purpose.includes("dividend")) {
        actionType = "dividend";
        ratio = a.subject || "";
        adjustmentFactor = 1;
      } else {
        continue; // skip unknown actions
      }

      results.push({
        symbol,
        name: a.comp || symbol,
        actionType,
        description: a.subject || a.purpose || "",
        exDate,
        ratio,
        adjustmentFactor,
      });
    }

    return results;
  } catch {
    return [];
  }
}

let _nseCookies: string | null = null;
let _cookieExpiry = 0;

async function refreshNseCookies(): Promise<string> {
  const now = Date.now();
  if (_nseCookies && now < _cookieExpiry) return _nseCookies;
  try {
    const res = await fetch("https://www.nseindia.com", {
      headers: { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36", Accept: "text/html" },
    });
    const setCookies = res.headers.getSetCookie?.() || [];
    const cookieStr = setCookies.map((c) => c.split(";")[0]).join("; ");
    if (cookieStr) {
      _nseCookies = cookieStr;
      _cookieExpiry = now + 4 * 60 * 1000;
      return cookieStr;
    }
  } catch { /* ignore */ }
  return _nseCookies || "";
}

// Scan all portfolio stocks for recent corporate actions
export async function scanCorporateActions(): Promise<CorporateAction[]> {
  console.log("[CorpActions] Scanning portfolio for corporate actions...");
  const db = getDb();

  const { data: latestQ } = await db
    .from("holdings")
    .select("quarter")
    .order("quarter", { ascending: false })
    .limit(1)
    .single();

  if (!latestQ) return [];

  const { data: holdings } = await db
    .from("holdings")
    .select("stock_id, shares_held, stocks(symbol, name)")
    .eq("quarter", latestQ.quarter);

  if (!holdings || holdings.length === 0) return [];

  const cookies = await refreshNseCookies();
  const allActions: CorporateAction[] = [];

  for (const h of holdings) {
    const stock = h.stocks as unknown as Record<string, unknown> | null;
    const symbol = (stock?.symbol as string) || "";
    if (!symbol || symbol.startsWith("BSE:")) continue;

    const actions = await fetchNseCorporateActions(symbol, cookies);

    // For splits and bonus issues, apply the adjustment to holdings
    for (const action of actions) {
      if (action.adjustmentFactor !== 1 && (action.actionType === "split" || action.actionType === "bonus")) {
        const exDate = new Date(action.exDate);
        const today = new Date();

        // Only adjust if ex-date has passed and adjustment is significant
        if (exDate <= today && action.adjustmentFactor > 1) {
          const currentShares = h.shares_held as number;
          const adjustedShares = Math.round(currentShares * action.adjustmentFactor);

          if (adjustedShares !== currentShares) {
            // Update the holding
            await db.from("holdings")
              .update({ shares_held: adjustedShares })
              .eq("stock_id", h.stock_id)
              .eq("quarter", latestQ.quarter);

            console.log(`[CorpActions] Adjusted ${symbol}: ${currentShares} -> ${adjustedShares} shares (${action.actionType} ${action.ratio})`);

            // Notify
            await queueNotification(
              "telegram",
              "normal",
              `Corporate Action: ${symbol}`,
              `${symbol} ${action.actionType}: ${action.description}\n` +
              `Shares adjusted: ${currentShares.toLocaleString("en-IN")} -> ${adjustedShares.toLocaleString("en-IN")}\n` +
              `Ex-date: ${action.exDate}`
            );
          }
        }
      }
    }

    allActions.push(...actions);
    await new Promise((r) => setTimeout(r, 300)); // rate limit
  }

  console.log(`[CorpActions] Found ${allActions.length} corporate actions`);
  return allActions;
}

// Get recent corporate actions for display (no adjustments, just info)
export async function getRecentCorporateActions(): Promise<CorporateAction[]> {
  const db = getDb();

  const { data: latestQ } = await db
    .from("holdings")
    .select("quarter")
    .order("quarter", { ascending: false })
    .limit(1)
    .single();

  if (!latestQ) return [];

  const { data: holdings } = await db
    .from("holdings")
    .select("stocks(symbol)")
    .eq("quarter", latestQ.quarter);

  if (!holdings || holdings.length === 0) return [];

  const cookies = await refreshNseCookies();
  const actions: CorporateAction[] = [];

  // Only check first 15 stocks to stay within time limits
  const toCheck = holdings.slice(0, 15);
  for (const h of toCheck) {
    const stock = h.stocks as unknown as Record<string, unknown> | null;
    const symbol = (stock?.symbol as string) || "";
    if (!symbol || symbol.startsWith("BSE:")) continue;

    const stockActions = await fetchNseCorporateActions(symbol, cookies);
    actions.push(...stockActions.filter(a => a.actionType !== "other"));
    await new Promise((r) => setTimeout(r, 300));
  }

  return actions.sort((a, b) => new Date(b.exDate).getTime() - new Date(a.exDate).getTime());
}
