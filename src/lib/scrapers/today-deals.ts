import { getDb, ensureStock } from "../db";
import { recordSourceResult } from "../health/monitor";
import { notifyNewDeal } from "../notifications/telegram";
import { isKacholiaEntity } from "../entities";

// Fast-path checker for TODAY's bulk/block deals
// NSE and BSE both publish EOD files ~5:30-6:30 PM IST
// We poll these aggressively after market close to catch deals ASAP

const NSE_HOME = "https://www.nseindia.com";

const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept: "application/json",
  "Accept-Language": "en-US,en;q=0.9",
};

function parseNumber(text: string): number {
  return parseFloat(String(text).replace(/,/g, "").replace(/[^\d.\-]/g, "")) || 0;
}

function todayStr(): string {
  const now = new Date();
  const dd = String(now.getDate()).padStart(2, "0");
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const yyyy = now.getFullYear();
  return `${dd}-${mm}-${yyyy}`;
}

let nseCookies: string | null = null;
let cookieExpiry = 0;

async function refreshNseCookies(): Promise<string> {
  const now = Date.now();
  if (nseCookies && now < cookieExpiry) return nseCookies;
  try {
    const res = await fetch(NSE_HOME, {
      headers: { "User-Agent": HEADERS["User-Agent"], Accept: "text/html" },
    });
    const setCookies = res.headers.getSetCookie?.() || [];
    const cookieStr = setCookies.map((c) => c.split(";")[0]).join("; ");
    if (cookieStr) {
      nseCookies = cookieStr;
      cookieExpiry = now + 4 * 60 * 1000;
      return cookieStr;
    }
  } catch {
    // ignore
  }
  return nseCookies || "";
}

// NSE today's bulk deals — available as JSON ~30 min after market close
async function fetchNseTodayBulkDeals(): Promise<Array<{
  symbol: string; name: string; action: string; quantity: number; avgPrice: number; date: string;
}>> {
  const today = todayStr();
  const cookies = await refreshNseCookies();

  const results: Array<{ symbol: string; name: string; action: string; quantity: number; avgPrice: number; date: string }> = [];

  // Endpoint 1: historical bulk deals for today
  const url = `https://www.nseindia.com/api/historical/bulk-deals?from=${today}&to=${today}`;
  const res = await fetch(url, {
    headers: { ...HEADERS, Cookie: cookies, Referer: NSE_HOME },
  });

  if (res.ok) {
    const data = await res.json();
    const deals = data?.data || [];
    for (const d of deals) {
      if (!isKacholiaEntity(d.BD_CLIENT_NAME || "")) continue;
      results.push({
        symbol: d.BD_SYMBOL || "",
        name: d.BD_SCRIP_NAME || d.BD_SYMBOL || "",
        action: (d.BD_BUY_SELL || "").toLowerCase() === "buy" ? "Buy" : "Sell",
        quantity: parseNumber(String(d.BD_QTY_TRD || 0)),
        avgPrice: parseNumber(String(d.BD_TP_WATP || 0)),
        date: today,
      });
    }
  }

  // Endpoint 2: block deals for today
  await new Promise((r) => setTimeout(r, 1000));
  const blockUrl = `https://www.nseindia.com/api/historical/block-deals?from=${today}&to=${today}`;
  const blockRes = await fetch(blockUrl, {
    headers: { ...HEADERS, Cookie: cookies, Referer: NSE_HOME },
  });

  if (blockRes.ok) {
    const data = await blockRes.json();
    const deals = data?.data || [];
    for (const d of deals) {
      if (!isKacholiaEntity(d.BD_CLIENT_NAME || "")) continue;
      results.push({
        symbol: d.BD_SYMBOL || "",
        name: d.BD_SCRIP_NAME || d.BD_SYMBOL || "",
        action: (d.BD_BUY_SELL || "").toLowerCase() === "buy" ? "Buy" : "Sell",
        quantity: parseNumber(String(d.BD_QTY_TRD || 0)),
        avgPrice: parseNumber(String(d.BD_TP_WATP || 0)),
        date: today,
      });
    }
  }

  return results;
}

// BSE today's bulk deals JSON API
async function fetchBseTodayBulkDeals(): Promise<Array<{
  symbol: string; name: string; action: string; quantity: number; avgPrice: number; date: string;
}>> {
  const now = new Date();
  const dd = String(now.getDate()).padStart(2, "0");
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const yyyy = now.getFullYear();
  const bseDateStr = `${dd}/${mm}/${yyyy}`;

  const results: Array<{ symbol: string; name: string; action: string; quantity: number; avgPrice: number; date: string }> = [];

  const url = `https://api.bseindia.com/BseIndiaAPI/api/BulkDeals/w?strdate=${bseDateStr}&enddate=${bseDateStr}`;
  const res = await fetch(url, {
    headers: {
      ...HEADERS,
      Referer: "https://www.bseindia.com/",
      Origin: "https://www.bseindia.com",
    },
  });

  if (!res.ok) return results;

  try {
    const data = await res.json();
    const deals = data?.Table || data?.data || [];
    for (const d of deals) {
      const clientName = (d.CLIENT_NAME || d.ClientName || "").trim();
      if (!isKacholiaEntity(clientName)) continue;
      results.push({
        symbol: d.SC_CODE || d.SCRIP_CD || "",
        name: d.SC_NAME || d.SCRIP_NAME || "",
        action: (d.BUY_SELL || "").toLowerCase().includes("b") ? "Buy" : "Sell",
        quantity: parseNumber(String(d.DEAL_QTY || 0)),
        avgPrice: parseNumber(String(d.DEAL_PRICE || 0)),
        date: `${dd}-${mm}-${yyyy}`,
      });
    }
  } catch {
    // ignore parse errors
  }

  return results;
}

// Main function: check today's deals and fire alerts for new ones
export async function checkTodayDeals(): Promise<{ newDeals: number; alerted: number }> {
  console.log("[Today] Checking today's deals...");

  const db = getDb();
  let newDeals = 0;
  let alerted = 0;

  try {
    // Fetch from both NSE and BSE in parallel
    const [nseDeals, bseDeals] = await Promise.allSettled([
      fetchNseTodayBulkDeals(),
      fetchBseTodayBulkDeals(),
    ]);

    const allDeals = [
      ...(nseDeals.status === "fulfilled" ? nseDeals.value : []),
      ...(bseDeals.status === "fulfilled" ? bseDeals.value : []),
    ];

    for (const deal of allDeals) {
      if (!deal.symbol || !deal.quantity) continue;

      const resolvedSymbol = /^\d+$/.test(deal.symbol) ? `BSE:${deal.symbol}` : deal.symbol;
      const stockId = await ensureStock(resolvedSymbol, deal.name);

      const { data } = await db.from("deals").upsert(
        {
          stock_id: stockId,
          deal_date: deal.date,
          exchange: deal.symbol.startsWith("BSE:") ? "BSE" : "NSE",
          deal_type: "Bulk",
          action: deal.action,
          quantity: deal.quantity,
          avg_price: deal.avgPrice,
          pct_traded: null,
        },
        { onConflict: "stock_id,deal_date,exchange,deal_type,action,quantity", ignoreDuplicates: true }
      ).select("id");

      if (data && data.length > 0) {
        newDeals++;

        // Fire immediate Telegram alert for brand new deals
        await notifyNewDeal(
          resolvedSymbol,
          deal.name,
          deal.action as "Buy" | "Sell",
          deal.quantity,
          deal.avgPrice,
          deal.symbol.startsWith("BSE:") ? "BSE" : "NSE"
        );
        alerted++;

        // Store in alerts table too
        await db.from("alerts").insert({
          stock_id: stockId,
          alert_type: `TODAY_${deal.action.toUpperCase()}`,
          message: `${deal.action} ${deal.quantity.toLocaleString()} shares of ${deal.name} @ ₹${deal.avgPrice}`,
          deal_id: data[0].id,
        });
      }
    }

    recordSourceResult("today-deals", true, 0);
    console.log(`[Today] ${newDeals} new deals found, ${alerted} alerts sent`);
    return { newDeals, alerted };
  } catch (error) {
    recordSourceResult("today-deals", false, 0, String(error));
    console.error("[Today] Check failed:", error);
    return { newDeals: 0, alerted: 0 };
  }
}
