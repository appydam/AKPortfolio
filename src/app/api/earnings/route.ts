import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

// Earnings Calendar — fetch upcoming board meetings / result dates
// for all Kacholia portfolio stocks from NSE corporate filings API

interface EarningsEvent {
  symbol: string;
  name: string;
  sector: string;
  meetingDate: string;
  purpose: string;
  kacholiaWeight: number;
  currentPrice: number;
  daysUntil: number;
  isUpcoming: boolean;
}

async function fetchNseBoardMeetings(symbol: string, cookies: string): Promise<Array<{ date: string; purpose: string }>> {
  try {
    const url = `https://www.nseindia.com/api/corporate-board-meetings?index=equities&symbol=${encodeURIComponent(symbol)}`;
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
    const meetings = data?.data || data || [];
    if (!Array.isArray(meetings)) return [];

    return meetings.map((m: Record<string, string>) => ({
      date: m.bm_date || m.meetingDate || "",
      purpose: m.bm_purpose || m.purpose || m.bm_desc || "",
    })).filter((m: { date: string }) => m.date);
  } catch {
    return [];
  }
}

// Alternative: Use Yahoo Finance earnings date
async function fetchYahooEarningsDate(symbol: string): Promise<string | null> {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}.NS?interval=1d&range=1d`;
    const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
    if (!res.ok) return null;
    const data = await res.json();
    const earningsTs = data?.chart?.result?.[0]?.meta?.earningsTimestamp;
    if (earningsTs) {
      return new Date(earningsTs * 1000).toISOString().split("T")[0];
    }
    return null;
  } catch {
    return null;
  }
}

// Also check board_meetings table if populated
async function getDbBoardMeetings(): Promise<Array<{ stockId: number; meetingDate: string; purpose: string }>> {
  const db = getDb();
  try {
    const { data } = await db
      .from("board_meetings")
      .select("stock_id, meeting_date, purpose")
      .order("meeting_date", { ascending: true });
    return (data || []).map((m: Record<string, unknown>) => ({
      stockId: m.stock_id as number,
      meetingDate: m.meeting_date as string,
      purpose: m.purpose as string,
    }));
  } catch {
    return [];
  }
}

let _cookies: string | null = null;
let _cookieExpiry = 0;

async function getNseCookies(): Promise<string> {
  const now = Date.now();
  if (_cookies && now < _cookieExpiry) return _cookies;
  try {
    const res = await fetch("https://www.nseindia.com", {
      headers: { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36", Accept: "text/html" },
    });
    const setCookies = res.headers.getSetCookie?.() || [];
    const cookieStr = setCookies.map((c) => c.split(";")[0]).join("; ");
    if (cookieStr) { _cookies = cookieStr; _cookieExpiry = now + 4 * 60 * 1000; return cookieStr; }
  } catch { /* ignore */ }
  return _cookies || "";
}

export async function GET() {
  try {
    const db = getDb();

    const { data: latestQ } = await db
      .from("holdings")
      .select("quarter")
      .order("quarter", { ascending: false })
      .limit(1)
      .single();

    if (!latestQ) return NextResponse.json({ events: [] });

    const { data: holdings } = await db
      .from("holdings")
      .select("stock_id, shares_held, pct_holding, stocks(symbol, name, sector)")
      .eq("quarter", latestQ.quarter);

    if (!holdings || holdings.length === 0) return NextResponse.json({ events: [] });

    // Get prices
    const symbols = holdings.map((h: Record<string, unknown>) => {
      const stock = h.stocks as unknown as Record<string, unknown> | null;
      return stock?.symbol as string;
    }).filter(Boolean);

    const { data: prices } = await db.from("price_cache").select("symbol, price").in("symbol", symbols);
    const priceMap = new Map<string, number>();
    for (const p of prices || []) priceMap.set(p.symbol, p.price);

    // Get total portfolio value for weight calculation
    let totalValue = 0;
    const holdingValues = new Map<string, number>();
    for (const h of holdings) {
      const stock = h.stocks as unknown as Record<string, unknown> | null;
      const sym = (stock?.symbol as string) || "";
      const price = priceMap.get(sym) || 0;
      const val = price * (h.shares_held as number);
      totalValue += val;
      holdingValues.set(sym, val);
    }

    // Check DB first for cached board meetings
    const dbMeetings = await getDbBoardMeetings();
    const stockIdToSymbol = new Map<number, { symbol: string; name: string; sector: string }>();
    for (const h of holdings) {
      const stock = h.stocks as unknown as Record<string, unknown> | null;
      stockIdToSymbol.set(h.stock_id as number, {
        symbol: (stock?.symbol as string) || "",
        name: (stock?.name as string) || "",
        sector: (stock?.sector as string) || "Unknown",
      });
    }

    const events: EarningsEvent[] = [];
    const now = new Date();
    const seenSymbols = new Set<string>();

    // Use DB meetings if available
    for (const m of dbMeetings) {
      const info = stockIdToSymbol.get(m.stockId);
      if (!info || seenSymbols.has(info.symbol)) continue;

      const meetingDate = new Date(m.meetingDate);
      const daysUntil = Math.round((meetingDate.getTime() - now.getTime()) / 86400000);

      // Only show meetings within -30 to +90 days
      if (daysUntil < -30 || daysUntil > 90) continue;

      seenSymbols.add(info.symbol);
      const weight = totalValue > 0 ? ((holdingValues.get(info.symbol) || 0) / totalValue) * 100 : 0;

      events.push({
        symbol: info.symbol,
        name: info.name,
        sector: info.sector,
        meetingDate: m.meetingDate,
        purpose: m.purpose,
        kacholiaWeight: Math.round(weight * 10) / 10,
        currentPrice: priceMap.get(info.symbol) || 0,
        daysUntil,
        isUpcoming: daysUntil >= 0,
      });
    }

    // If DB has few results, try fetching from NSE for top 15 holdings
    if (events.length < 5) {
      const cookies = await getNseCookies();
      const topHoldings = [...holdings]
        .sort((a, b) => {
          const stockA = (a as Record<string, unknown>).stocks as unknown as Record<string, unknown> | null;
          const stockB = (b as Record<string, unknown>).stocks as unknown as Record<string, unknown> | null;
          const valA = (priceMap.get((stockA?.symbol as string) || "") || 0) * ((a as Record<string, unknown>).shares_held as number);
          const valB = (priceMap.get((stockB?.symbol as string) || "") || 0) * ((b as Record<string, unknown>).shares_held as number);
          return valB - valA;
        })
        .slice(0, 15);

      for (const h of topHoldings) {
        const stock = h.stocks as unknown as Record<string, unknown> | null;
        const symbol = (stock?.symbol as string) || "";
        if (!symbol || symbol.startsWith("BSE:") || seenSymbols.has(symbol)) continue;

        const meetings = await fetchNseBoardMeetings(symbol, cookies);
        for (const m of meetings) {
          const meetingDate = new Date(m.date);
          const daysUntil = Math.round((meetingDate.getTime() - now.getTime()) / 86400000);
          if (daysUntil < -30 || daysUntil > 90) continue;

          seenSymbols.add(symbol);
          const weight = totalValue > 0 ? ((holdingValues.get(symbol) || 0) / totalValue) * 100 : 0;

          events.push({
            symbol,
            name: (stock?.name as string) || "",
            sector: (stock?.sector as string) || "Unknown",
            meetingDate: m.date,
            purpose: m.purpose,
            kacholiaWeight: Math.round(weight * 10) / 10,
            currentPrice: priceMap.get(symbol) || 0,
            daysUntil,
            isUpcoming: daysUntil >= 0,
          });
          break; // one meeting per stock
        }
        await new Promise((r) => setTimeout(r, 300));
      }
    }

    // Sort: upcoming first (by days until), then past
    events.sort((a, b) => {
      if (a.isUpcoming && !b.isUpcoming) return -1;
      if (!a.isUpcoming && b.isUpcoming) return 1;
      return a.daysUntil - b.daysUntil;
    });

    return NextResponse.json({
      events,
      totalStocksChecked: seenSymbols.size,
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[API] Earnings error:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
