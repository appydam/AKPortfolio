-- AKPortfolio v2 Intelligence Tables Migration
-- Run this in Supabase SQL Editor: https://supabase.com/dashboard/project/bzdyjcvuxjyipvafxvkh/sql
-- Or via psql: psql $DATABASE_URL -f scripts/migrate-v2.sql

-- 1. Health monitoring persistence (survives serverless cold starts)
CREATE TABLE IF NOT EXISTS health_snapshots (
  id              INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  sources         TEXT NOT NULL,
  overall_status  TEXT NOT NULL,
  healthy_count   INTEGER NOT NULL,
  degraded_count  INTEGER NOT NULL,
  down_count      INTEGER NOT NULL,
  snapshot_at     TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Insider trading disclosures (SEBI PIT) — 2-day signal
CREATE TABLE IF NOT EXISTS insider_trades (
  id              SERIAL PRIMARY KEY,
  stock_id        INTEGER NOT NULL REFERENCES stocks(id),
  entity_name     TEXT NOT NULL,
  entity_type     TEXT NOT NULL,
  category        TEXT NOT NULL,
  trade_type      TEXT NOT NULL,
  quantity        BIGINT NOT NULL,
  avg_price       DOUBLE PRECISION,
  trade_date      TEXT NOT NULL,
  disclosure_date TEXT NOT NULL,
  exchange        TEXT NOT NULL,
  mode_of_acq     TEXT,
  pre_holding_pct DOUBLE PRECISION,
  post_holding_pct DOUBLE PRECISION,
  source          TEXT NOT NULL,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(stock_id, entity_name, trade_date, trade_type, quantity)
);
CREATE INDEX IF NOT EXISTS idx_insider_trades_stock ON insider_trades(stock_id);
CREATE INDEX IF NOT EXISTS idx_insider_trades_date ON insider_trades(trade_date);

-- 3. SAST threshold crossing disclosures
CREATE TABLE IF NOT EXISTS sast_disclosures (
  id              SERIAL PRIMARY KEY,
  stock_id        INTEGER NOT NULL REFERENCES stocks(id),
  entity_name     TEXT NOT NULL,
  entity_type     TEXT NOT NULL,
  regulation      TEXT NOT NULL,
  trigger_pct     DOUBLE PRECISION,
  shares_before   BIGINT,
  pct_before      DOUBLE PRECISION,
  shares_after    BIGINT,
  pct_after       DOUBLE PRECISION,
  disclosure_date TEXT NOT NULL,
  exchange        TEXT NOT NULL,
  source          TEXT NOT NULL,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(stock_id, entity_name, disclosure_date, regulation)
);
CREATE INDEX IF NOT EXISTS idx_sast_stock ON sast_disclosures(stock_id);

-- 4. Promoter pledge tracking
CREATE TABLE IF NOT EXISTS promoter_pledges (
  id              SERIAL PRIMARY KEY,
  stock_id        INTEGER NOT NULL REFERENCES stocks(id),
  quarter         TEXT NOT NULL,
  promoter_holding_pct  DOUBLE PRECISION NOT NULL,
  pledged_pct           DOUBLE PRECISION NOT NULL,
  pledged_shares        BIGINT,
  total_promoter_shares BIGINT,
  change_from_prev      DOUBLE PRECISION,
  source          TEXT NOT NULL,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(stock_id, quarter)
);

-- 5. FII/DII daily activity
CREATE TABLE IF NOT EXISTS fii_dii_activity (
  id              SERIAL PRIMARY KEY,
  stock_id        INTEGER NOT NULL REFERENCES stocks(id),
  date            TEXT NOT NULL,
  fii_buy_qty     BIGINT DEFAULT 0,
  fii_sell_qty    BIGINT DEFAULT 0,
  fii_net_qty     BIGINT DEFAULT 0,
  fii_net_value   DOUBLE PRECISION DEFAULT 0,
  dii_buy_qty     BIGINT DEFAULT 0,
  dii_sell_qty    BIGINT DEFAULT 0,
  dii_net_qty     BIGINT DEFAULT 0,
  dii_net_value   DOUBLE PRECISION DEFAULT 0,
  source          TEXT NOT NULL,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(stock_id, date)
);
CREATE INDEX IF NOT EXISTS idx_fii_dii_stock_date ON fii_dii_activity(stock_id, date);

-- 6. Board meetings
CREATE TABLE IF NOT EXISTS board_meetings (
  id              SERIAL PRIMARY KEY,
  stock_id        INTEGER NOT NULL REFERENCES stocks(id),
  meeting_date    TEXT NOT NULL,
  purpose         TEXT NOT NULL,
  description     TEXT,
  announcement_date TEXT,
  exchange        TEXT NOT NULL,
  source          TEXT NOT NULL,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(stock_id, meeting_date, purpose)
);
CREATE INDEX IF NOT EXISTS idx_board_meetings_date ON board_meetings(meeting_date);

-- Done! Verify:
SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename;
