import type { PriceData } from "@/types";

const NSE_QUOTE_URL = "https://www.nseindia.com/api/quote-equity";
const NSE_HOME = "https://www.nseindia.com";

// NSE requires a valid session cookie — we get it by first hitting the homepage
let nseCookies: string | null = null;
let cookieExpiry = 0;

async function refreshCookies(): Promise<string> {
  const now = Date.now();
  if (nseCookies && now < cookieExpiry) return nseCookies;

  try {
    const res = await fetch(NSE_HOME, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "en-US,en;q=0.9",
      },
      redirect: "follow",
    });

    const setCookies = res.headers.getSetCookie?.() || [];
    const cookieStr = setCookies
      .map((c) => c.split(";")[0])
      .join("; ");

    if (cookieStr) {
      nseCookies = cookieStr;
      cookieExpiry = now + 4 * 60 * 1000; // 4 min TTL
      return cookieStr;
    }
  } catch (err) {
    console.error("[NSE] Cookie refresh failed:", err);
  }

  return nseCookies || "";
}

export async function fetchNsePrice(symbol: string): Promise<PriceData | null> {
  try {
    const cookies = await refreshCookies();
    const url = `${NSE_QUOTE_URL}?symbol=${encodeURIComponent(symbol)}`;

    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "application/json",
        "Accept-Language": "en-US,en;q=0.9",
        Cookie: cookies,
        Referer: NSE_HOME,
      },
    });

    if (!res.ok) {
      // Cookies might be stale — force refresh
      if (res.status === 401 || res.status === 403) {
        nseCookies = null;
        cookieExpiry = 0;
      }
      return null;
    }

    const data = await res.json();
    const priceInfo = data?.priceInfo;
    if (!priceInfo) return null;

    const price = priceInfo.lastPrice || priceInfo.close || 0;
    const previousClose = priceInfo.previousClose || 0;
    const changePct = previousClose
      ? ((price - previousClose) / previousClose) * 100
      : priceInfo.pChange || 0;

    return {
      symbol,
      price,
      change_pct: Math.round(changePct * 100) / 100,
      updated_at: new Date().toISOString(),
    };
  } catch (err) {
    console.error(`[NSE] Failed to fetch price for ${symbol}:`, err);
    return null;
  }
}

export async function fetchNsePricesBatch(symbols: string[]): Promise<Record<string, PriceData>> {
  const results: Record<string, PriceData> = {};

  // NSE doesn't have a batch endpoint, so we fetch sequentially with small delays
  for (const symbol of symbols) {
    const price = await fetchNsePrice(symbol);
    if (price) results[symbol] = price;
    // 300ms delay to avoid rate limiting
    await new Promise((r) => setTimeout(r, 300));
  }

  return results;
}

export const SOURCE_NAME = "nse";
