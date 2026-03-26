import { getDb, ensureStock } from "../db";
import { INVESTORS, type InvestorProfile } from "../investors";
import { recordSourceResult } from "../health/monitor";

// Scrape Trendlyne holdings for ANY big bull investor
// Uses the same regex approach as trendlyne.ts but generalized

const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
};

interface InvestorHolding {
  investorId: string;
  symbol: string;
  name: string;
  sharesHeld: number;
  pctHolding: number;
  holdingValueCr: number;
}

export async function scrapeInvestorHoldings(investor: InvestorProfile): Promise<InvestorHolding[]> {
  const holdingsUrl = `https://trendlyne.com/portfolio/superstar-shareholders/${investor.trendlyneId}/latest/${investor.trendlyneSlug}/`;

  try {
    const res = await fetch(holdingsUrl, { headers: HEADERS });
    if (!res.ok) return [];

    const html = await res.text();
    const results: InvestorHolding[] = [];

    // Same regex extraction as trendlyne.ts
    const stockLinkRegex = /<a[^>]*href="[^"]*?\/equity\/share-holding\/\d+\/([A-Z][A-Z0-9]+)\/latest\/[^"]*"[^>]*>([^<]+)<\/a>/g;
    const seen = new Set<string>();
    let match;

    while ((match = stockLinkRegex.exec(html)) !== null) {
      const symbol = match[1];
      if (seen.has(symbol) || /^\d+$/.test(symbol)) continue;
      seen.add(symbol);

      const name = match[2].trim();
      const pos = match.index + match[0].length;
      const rowAfter = html.substring(pos, pos + 2000);

      const valMatch = rowAfter.match(/data-order\s*=\s*"?([\d.]+)"?\s*>\s*([\d.]+)\s*Cr/);
      const holdingValueCr = valMatch ? parseFloat(valMatch[2]) : 0;

      const qtyMatch = rowAfter.match(/<td[^>]*>\s*([\d,]+)\s*<\/td>/);
      const sharesHeld = qtyMatch ? parseInt(qtyMatch[1].replace(/,/g, "")) : 0;

      const pctMatches = rowAfter.match(/data-order=([\d.]+)>\s*[\d.]+%/);
      const pctHolding = pctMatches ? parseFloat(pctMatches[1]) : 0;

      if (!sharesHeld && !pctHolding) continue;

      results.push({
        investorId: investor.id,
        symbol,
        name,
        sharesHeld: sharesHeld || Math.round(holdingValueCr * 1e7), // fallback to value
        pctHolding,
        holdingValueCr,
      });
    }

    return results;
  } catch (error) {
    console.error(`[BigBulls] Failed to scrape ${investor.name}:`, error);
    return [];
  }
}

// Scrape all investors and return comparison data
export async function scrapeAllInvestors(): Promise<Map<string, InvestorHolding[]>> {
  console.log("[BigBulls] Scraping all investor portfolios...");
  const start = Date.now();
  const results = new Map<string, InvestorHolding[]>();

  for (const investor of INVESTORS) {
    const holdings = await scrapeInvestorHoldings(investor);
    results.set(investor.id, holdings);
    console.log(`[BigBulls] ${investor.name}: ${holdings.length} holdings`);
    await new Promise((r) => setTimeout(r, 2000)); // rate limit
  }

  const latency = Date.now() - start;
  recordSourceResult("bigbulls", true, latency);
  return results;
}

// Get overlap between investors
export function computeOverlap(
  holdingsA: InvestorHolding[],
  holdingsB: InvestorHolding[]
): { symbol: string; name: string; inA: boolean; inB: boolean }[] {
  const mapA = new Map(holdingsA.map(h => [h.symbol, h]));
  const mapB = new Map(holdingsB.map(h => [h.symbol, h]));
  const allSymbols = new Set([...mapA.keys(), ...mapB.keys()]);

  return [...allSymbols].map(symbol => ({
    symbol,
    name: mapA.get(symbol)?.name || mapB.get(symbol)?.name || symbol,
    inA: mapA.has(symbol),
    inB: mapB.has(symbol),
  }));
}
