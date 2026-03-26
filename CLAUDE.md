@AGENTS.md

# AK Portfolio Tracker — Claude Code Guide

## What This Is

A real-time investment intelligence platform tracking **Ashish Kacholia's** portfolio. It monitors shareholdings from SEBI filings, bulk/block deals across NSE & BSE, and computes conviction scores, risk metrics, and deal patterns. Also tracks 5 other "Big Bull" Indian investors for comparison.

**This is a financial data app — accuracy is paramount. Bad data = bad investment decisions.**

---

## Tech Stack

- **Framework**: Next.js 16 (App Router) — port 4000 (`npm run dev`)
- **Language**: TypeScript (strict mode)
- **Database**: Supabase (remote PostgreSQL) — schema in `supabase-schema.sql`
- **UI**: React 19, Tailwind CSS 4, shadcn/ui, Recharts
- **State**: React Query (@tanstack/react-query)
- **Scraping**: Cheerio for HTML parsing
- **Deployment**: Vercel (20 cron jobs in `vercel.json`)

---

## MCP Servers (available in every session)

Two MCP servers are configured in `.mcp.json`:

1. **Supabase MCP** (`@supabase/mcp-server-supabase`) — Use this to query/inspect/modify the database directly. Prefer this for:
   - Checking table schemas and data
   - Running ad-hoc queries to verify data correctness
   - Debugging data issues
   - Creating/altering tables and indexes

2. **Kite MCP** (`mcp.kite.trade`) — Trading data integration for market data

**Always use the Supabase MCP to verify data when debugging issues.** Don't guess what's in the database — check it.

---

## Data Correctness Rules (CRITICAL)

Since this tracks real money and real investments, follow these rules strictly:

### Before Any Data Change
- **Verify against real-world sources**: Cross-check deal data against NSE/BSE official records, Trendlyne, or MoneyControl before inserting or modifying
- **Never fabricate data**: If a scraper returns empty/error, log it — don't insert placeholder data
- **Preserve audit trail**: The `audit_log` table tracks all changes. Never bypass it
- **Respect multi-source redundancy**: Deals come from NSE, BSE, Trendlyne, and MoneyControl. If sources disagree, flag the discrepancy — don't silently pick one

### Entity Matching
- Ashish Kacholia trades through **multiple entities**: self, wife (Rashmi), HUF, Lucky Investment Managers
- All entity name variants are in `src/lib/entities.ts` — **always use this list** for matching
- Matching is **case-insensitive substring-based** — don't use exact match

### Stock Symbol Handling
- NSE and BSE use different symbols for the same stock
- Always store the NSE symbol as the canonical identifier in the `stocks` table
- BSE codes are resolved weekly (Sunday 3 AM cron job)

### Price Data
- Prices come from 3 sources: NSE real-time, Yahoo Finance, Google Finance
- `price_cache` table stores latest prices — updated every 2 minutes during market hours
- Market hours are **IST 9:15 AM – 3:30 PM** (UTC 3:45 AM – 10:00 AM), Monday–Friday

### Holdings vs Deals
- **Holdings** = quarterly SEBI filings (what % someone owns)
- **Deals** = daily bulk/block transactions (buy/sell actions)
- These are different data sources — don't confuse them

---

## Testing & Verification Checklist

There is no automated test suite. **You must manually verify changes work correctly.**

### After Any Code Change
1. **Run the dev server**: `npm run dev` — confirm no build errors
2. **Check the browser**: Visit `localhost:4000` — verify the page renders
3. **Check the console**: No runtime errors or failed API calls
4. **Verify data**: Use Supabase MCP to query relevant tables and confirm data looks right

### After Scraper Changes
1. **Test the scraper endpoint**: `curl localhost:4000/api/cron?job=<job-name>` with appropriate auth
2. **Check the database**: Query Supabase to verify new data was inserted correctly
3. **Cross-reference**: Compare scraped data against the source website manually
4. **Check deduplication**: Ensure running the scraper twice doesn't create duplicate records

### After UI Changes
1. **Check all 4 main tabs**: Insights (Overview, Holdings, Conviction, Deals, Risk, Sectors, Timeline)
2. **Check Big Bulls page**: Verify investor comparison renders
3. **Check Sources page**: Verify data source status display
4. **Check dark mode**: Toggle theme and verify no visual breaks
5. **Check empty states**: What happens if a table has no data?

### After API/Schema Changes
1. **Verify TypeScript types match**: Types in `src/types/index.ts` must match Supabase schema
2. **Check React Query hooks**: Ensure cache keys and refetch intervals are correct
3. **Test error handling**: What happens if Supabase is unreachable?

---

## Key Files & Architecture

```
src/
├── app/
│   ├── page.tsx                 # Main dashboard (Insights command center)
│   ├── bigbulls/page.tsx        # Big Bull investor comparison
│   ├── sources/page.tsx         # Data source transparency
│   ├── api/cron/route.ts        # All cron job handlers
│   ├── api/insights/route.ts    # Computed insights endpoint
│   ├── api/holdings/route.ts    # Holdings data
│   ├── api/deals/route.ts       # Deal listing
│   └── api/prices/route.ts      # Price endpoint
├── components/
│   ├── dashboard/               # Dashboard widgets
│   ├── insights/                # Insight display components
│   └── ui/                      # shadcn/ui primitives
├── lib/
│   ├── db.ts                    # Supabase client singleton
│   ├── entities.ts              # Kacholia entity name variants (MUST use for matching)
│   ├── investors.ts             # Big Bull registry with Trendlyne IDs
│   ├── scrapers/                # 17 data source scrapers
│   ├── analytics/               # Conviction, risk, portfolio computations
│   │   ├── conviction.ts        # Conviction scoring (0-100)
│   │   ├── risk.ts              # Risk metrics (drawdown, beta, etc.)
│   │   └── portfolio.ts         # Portfolio-level analytics
│   ├── prices/                  # Multi-source price aggregation
│   └── health/                  # Source health monitoring
└── types/index.ts               # All TypeScript type definitions
```

---

## Database Tables (Supabase)

| Table | Purpose |
|-------|---------|
| `stocks` | Master stock registry (symbol, name, sector, P/E, ROE, ROCE) |
| `deals` | All bulk/block deals (date, exchange, action, quantity, price) |
| `holdings` | Quarterly shareholdings with percentages |
| `portfolio_snapshots` | Historical portfolio valuations |
| `portfolio_history` | Event timeline (entry/exit history) |
| `price_cache` | Latest prices — updated every 2 min |
| `insider_trades` | SEBI insider trading disclosures |
| `sast_disclosures` | Substantial Acquisition threshold crossings |
| `promoter_pledges` | Pledged shares per holding (quarterly) |
| `fii_dii_activity` | FII/DII flows on portfolio stocks |
| `board_meetings` | Corporate actions (results, dividends, splits) |
| `insights_cache` | Pre-computed conviction/risk insights |
| `audit_log` | Change tracking for data integrity |
| `health_snapshots` | Source health monitoring state |
| `alerts` | Notifications for deals, entries, exits |

Full schema: `supabase-schema.sql`

---

## Conviction Model (0-100)

- Position size in portfolio: 0-25 pts
- Number of add-on deals: 0-20 pts
- Holding duration in quarters: 0-25 pts
- Averaging down behavior: 0-15 pts
- Deal frequency: 0-15 pts

Logic lives in `src/lib/analytics/conviction.ts`. Any changes must preserve this scoring breakdown.

---

## Cron Jobs (Vercel)

All cron jobs route through `/api/cron?job=<name>`. Schedule defined in `vercel.json`.

**Market hours scrapers** (IST, weekdays only):
- `prices` — every 2 min
- `trendlyne` — every 30 min (4 AM–12 PM)
- `nse` — every 15 min (4 AM–12 PM)
- `bse` — every 10 min (4 AM–12 PM)
- `today-deals` — every 10 min (12–6 PM)
- `volume-scan` — every 30 min (4–10 AM)

**Periodic scrapers**:
- `moneycontrol` — every 2 hrs
- `sebi-shp` — every 3 hrs
- `insider-trades` — every 3 hrs
- `sast` — 3x daily
- `board-meetings` — 2x daily
- `fundamentals` — daily 1:30 AM
- `snapshot` — daily 10:45 AM
- `insights` — 3x daily (5, 11, 4 PM)
- `daily-digest` — daily 1 PM
- `fii-dii` — daily 11 AM
- `pledges` — weekly Monday
- `resolve-bse` — weekly Sunday
- `corp-actions` — daily 2 AM

---

## Data Sources (17 total)

1. **Trendlyne** — Holdings + bulk/block deals
2. **NSE CSV** — Official NSE bulk deal data
3. **NSE Block Deals** — Official NSE block deal data
4. **BSE RSS** — BSE announcements feed
5. **BSE CSV** — Official BSE bulk/block deal data
6. **MoneyControl** — Deal aggregation
7. **SEBI SHP** — Shareholding pattern filings
8. **Insider Trades** — SEBI insider trading disclosures
9. **SAST Disclosures** — Substantial acquisition filings
10. **Promoter Pledges** — Quarterly pledge data
11. **FII/DII Activity** — Foreign/domestic institutional flows
12. **Board Meetings** — Corporate action announcements
13. **Screener.in** — Fundamentals (P/E, ROE, ROCE, market cap)
14. **Yahoo Finance** — Stock prices
15. **Google Finance** — Stock prices
16. **NSE Real-time** — Live price feeds
17. **Today's Deals** — Same-day deal capture

---

## Big Bull Investors

| Investor | Trendlyne ID | Focus |
|----------|-------------|-------|
| Ashish Kacholia | 53746 | Small & mid-cap, ~48 holdings |
| Mukul Agrawal | 53748 | Concentrated small & mid-cap, 40+ holdings |
| Rakesh Jhunjhunwala (Personal) | 53744 | Legacy personal holdings |
| Rare Enterprises (RJ Estate) | 53799 | Bulk of Jhunjhunwala portfolio |
| Vijay Kedia | 53749 | SMILE philosophy |
| Abakkus (Sunil Singhania) | 53790 | Ex-Reliance MF CIO |

Registry with all name variants: `src/lib/investors.ts`

---

## Environment Variables

**Required**:
- `NEXT_PUBLIC_SUPABASE_URL` — Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY` — Backend database access (never expose to client)

**Optional**:
- `CRON_SECRET` — Vercel cron authentication
- `SCREENER_SESSION_COOKIE` — Screener.in premium data access
- `ANTHROPIC_API_KEY` — Claude API direct
- `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`, `BEDROCK_MODEL_ID` — AWS Bedrock
- `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` — Telegram alerts

---

## Common Pitfalls

1. **Don't trust training data for Next.js APIs** — This uses Next.js 16 which has breaking changes. Always read `node_modules/next/dist/docs/` first.
2. **IST vs UTC** — All cron schedules are in UTC. Indian market hours are IST (UTC+5:30). Double-check timezone math.
3. **Trendlyne IDs change** — If an investor page 404s, the ID may have changed. Verify on trendlyne.com.
4. **BSE vs NSE symbols** — Same company can have different ticker symbols on each exchange. Always normalize to NSE symbol.
5. **Stale price_cache** — During non-market hours, prices won't update. Don't treat stale prices as errors.
6. **React Query cache** — Different data types have different refetch intervals (10s for holdings, 5min for insights). Don't change these without understanding the data freshness requirements.
7. **Scraper rate limiting** — NSE and BSE will block aggressive scraping. Respect the cron intervals.
