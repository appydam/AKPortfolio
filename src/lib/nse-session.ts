// Centralized NSE cookie/session management
// ALL scrapers and price fetchers that hit nseindia.com MUST use this shared session.
// Previously each module maintained its own cookie cache — causing redundant homepage
// hits and cascading failures when one module's cookies expired.

const NSE_HOME = "https://www.nseindia.com";

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

let cookies: string | null = null;
let expiry = 0;
let refreshPromise: Promise<string> | null = null;

export const NSE_HEADERS = {
  "User-Agent": UA,
  Accept: "application/json",
  "Accept-Language": "en-US,en;q=0.9",
  Referer: NSE_HOME,
};

/**
 * Get valid NSE session cookies.
 * - Caches for 3.5 minutes (NSE invalidates at ~4 min).
 * - Deduplicates concurrent refresh calls (only one homepage hit at a time).
 * - If refresh fails, returns stale cookies (better than nothing).
 */
export async function getNseCookies(): Promise<string> {
  const now = Date.now();
  if (cookies && now < expiry) return cookies;

  // Deduplicate concurrent refreshes
  if (refreshPromise) return refreshPromise;

  refreshPromise = doRefresh();
  try {
    return await refreshPromise;
  } finally {
    refreshPromise = null;
  }
}

async function doRefresh(): Promise<string> {
  try {
    const res = await fetch(NSE_HOME, {
      headers: {
        "User-Agent": UA,
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "en-US,en;q=0.9",
      },
      redirect: "follow",
    });

    const setCookies = res.headers.getSetCookie?.() || [];
    const cookieStr = setCookies.map((c) => c.split(";")[0]).join("; ");

    if (cookieStr) {
      cookies = cookieStr;
      expiry = Date.now() + 3.5 * 60 * 1000; // 3.5 min TTL
      return cookieStr;
    }
  } catch (err) {
    console.error("[NSE-Session] Cookie refresh failed:", err);
  }

  return cookies || "";
}

/**
 * Force-invalidate cookies (call after 401/403 responses).
 */
export function invalidateNseCookies(): void {
  cookies = null;
  expiry = 0;
}

/**
 * Make an authenticated NSE API request with automatic retry on auth failure.
 */
export async function nseFetch(
  url: string,
  opts?: { accept?: string; maxRetries?: number }
): Promise<Response> {
  const { accept = "application/json", maxRetries = 1 } = opts || {};

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const c = await getNseCookies();
    const res = await fetch(url, {
      headers: { ...NSE_HEADERS, Cookie: c, Accept: accept },
    });

    if (res.ok) return res;

    if ((res.status === 401 || res.status === 403) && attempt < maxRetries) {
      invalidateNseCookies();
      await new Promise((r) => setTimeout(r, 500));
      continue;
    }

    return res; // caller handles non-OK
  }

  // TypeScript exhaustiveness — shouldn't reach here
  throw new Error("[NSE-Session] Max retries exceeded");
}
