import { getDb } from "../db";
import { queueNotification } from "../notifications/telegram";

// Volume Anomaly Detector
// Checks if any stock in Kacholia's portfolio is trading at 5x+ normal volume.
// Unusually high volume in a portfolio stock MAY indicate large buying/selling
// by insiders or big investors — worth flagging even if we can't confirm.

interface VolumeAnomaly {
  symbol: string;
  name: string;
  todayVolume: number;
  avgVolume: number;
  volumeRatio: number; // today / avg
  priceChangePct: number;
  interpretation: string;
}

// Fetch today's volume for a symbol from NSE
async function fetchNseVolume(symbol: string, cookies: string): Promise<{ volume: number; avgVolume: number } | null> {
  try {
    const url = `https://www.nseindia.com/api/quote-equity?symbol=${encodeURIComponent(symbol)}&section=trade_info`;
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
        Accept: "application/json",
        Cookie: cookies,
        Referer: "https://www.nseindia.com/",
      },
    });
    if (!res.ok) return null;
    const data = await res.json();

    // NSE provides totalTradedVolume and averageVolume (or we derive from marketDeptOrderBook)
    const volume = data?.securityWiseDP?.quantityTraded
      || data?.marketDeptOrderBook?.totalTradedVolume
      || data?.totalTradedVolume
      || 0;

    // Average volume often in preOpenMarket or separate field
    const avgVol = data?.securityWiseDP?.deliveryToTradedQuantity
      ? volume // if no avg available, use same (ratio=1)
      : 0;

    return { volume: Number(volume) || 0, avgVolume: Number(avgVol) || 0 };
  } catch {
    return null;
  }
}

// Alternative: Use Yahoo Finance for volume data (more reliable, no cookies needed)
async function fetchYahooVolume(symbol: string): Promise<{ volume: number; avgVolume: number } | null> {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}.NS?interval=1d&range=1mo`;
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0" },
    });
    if (!res.ok) return null;
    const data = await res.json();
    const result = data?.chart?.result?.[0];
    if (!result) return null;

    const volumes = result.indicators?.quote?.[0]?.volume || [];
    if (volumes.length < 5) return null;

    // Today's volume = last entry
    const todayVol = volumes[volumes.length - 1] || 0;

    // Average volume = mean of last 20 days (excluding today)
    const pastVols = volumes.slice(-21, -1).filter((v: number) => v > 0);
    const avgVol = pastVols.length > 0
      ? pastVols.reduce((a: number, b: number) => a + b, 0) / pastVols.length
      : 0;

    return { volume: todayVol, avgVolume: Math.round(avgVol) };
  } catch {
    return null;
  }
}

export async function detectVolumeAnomalies(threshold = 3): Promise<VolumeAnomaly[]> {
  const db = getDb();

  // Get all current portfolio stocks
  const { data: latestQ } = await db
    .from("holdings")
    .select("quarter")
    .order("quarter", { ascending: false })
    .limit(1)
    .single();

  if (!latestQ) return [];

  const { data: holdings } = await db
    .from("holdings")
    .select("stocks(symbol, name)")
    .eq("quarter", latestQ.quarter);

  if (!holdings || holdings.length === 0) return [];

  const { data: prices } = await db
    .from("price_cache")
    .select("symbol, change_pct")
    .in("symbol", holdings.map((h: Record<string, unknown>) => {
      const stock = h.stocks as unknown as Record<string, unknown> | null;
      return stock?.symbol as string;
    }).filter(Boolean));

  const changePctMap = new Map<string, number>();
  for (const p of prices || []) changePctMap.set(p.symbol, p.change_pct || 0);

  const anomalies: VolumeAnomaly[] = [];

  // Check each stock — use Yahoo Finance (no auth needed, includes 20-day avg)
  for (const h of holdings) {
    const stock = h.stocks as unknown as Record<string, unknown> | null;
    const symbol = (stock?.symbol as string) || "";
    const name = (stock?.name as string) || "";
    if (!symbol) continue;

    const volData = await fetchYahooVolume(symbol);
    if (!volData || volData.avgVolume === 0) continue;

    const ratio = volData.volume / volData.avgVolume;

    if (ratio >= threshold) {
      const changePct = changePctMap.get(symbol) || 0;
      let interpretation: string;
      if (ratio >= 10) {
        interpretation = changePct > 2
          ? "Extreme volume + price up — possible large accumulation"
          : changePct < -2
          ? "Extreme volume + price down — possible large distribution"
          : "Extreme volume, neutral price — block deal likely";
      } else if (ratio >= 5) {
        interpretation = changePct > 1
          ? "Very high volume with positive momentum"
          : changePct < -1
          ? "Very high volume with selling pressure"
          : "Significant volume spike — watch for bulk deal filing";
      } else {
        interpretation = "Above-average volume — may indicate institutional activity";
      }

      anomalies.push({
        symbol,
        name,
        todayVolume: volData.volume,
        avgVolume: volData.avgVolume,
        volumeRatio: Math.round(ratio * 10) / 10,
        priceChangePct: changePct,
        interpretation,
      });
    }

    // Rate limit: 200ms between Yahoo requests
    await new Promise((r) => setTimeout(r, 200));
  }

  // Sort by ratio descending
  anomalies.sort((a, b) => b.volumeRatio - a.volumeRatio);

  // Alert on extreme anomalies (10x+)
  for (const a of anomalies.filter(a => a.volumeRatio >= 10)) {
    await queueNotification(
      "telegram",
      "urgent",
      `Volume Alert: ${a.symbol}`,
      `${a.symbol} (${a.name}) trading at ${a.volumeRatio}x normal volume!\n` +
      `Today: ${(a.todayVolume / 1e6).toFixed(1)}M | Avg: ${(a.avgVolume / 1e6).toFixed(1)}M\n` +
      `Price: ${a.priceChangePct > 0 ? "+" : ""}${a.priceChangePct.toFixed(1)}%\n` +
      a.interpretation
    );
  }

  return anomalies;
}
