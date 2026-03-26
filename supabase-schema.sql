-- Run this in your Supabase SQL Editor to create all tables
-- Go to: https://supabase.com/dashboard → Your Project → SQL Editor → New Query

CREATE TABLE IF NOT EXISTS stocks (
  id            SERIAL PRIMARY KEY,
  symbol        TEXT NOT NULL UNIQUE,
  bse_code      TEXT,
  name          TEXT NOT NULL,
  sector        TEXT,
  market_cap    DOUBLE PRECISION,
  pe_ratio      DOUBLE PRECISION,
  roe           DOUBLE PRECISION,
  roce          DOUBLE PRECISION,
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS deals (
  id            SERIAL PRIMARY KEY,
  stock_id      INTEGER NOT NULL REFERENCES stocks(id),
  deal_date     TEXT NOT NULL,
  exchange      TEXT NOT NULL,
  deal_type     TEXT NOT NULL,
  action        TEXT NOT NULL,
  quantity      INTEGER NOT NULL,
  avg_price     DOUBLE PRECISION NOT NULL,
  pct_traded    DOUBLE PRECISION,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(stock_id, deal_date, exchange, deal_type, action, quantity)
);

CREATE TABLE IF NOT EXISTS holdings (
  id            SERIAL PRIMARY KEY,
  stock_id      INTEGER NOT NULL REFERENCES stocks(id),
  quarter       TEXT NOT NULL,
  shares_held   BIGINT NOT NULL,
  pct_holding   DOUBLE PRECISION NOT NULL,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(stock_id, quarter)
);

CREATE TABLE IF NOT EXISTS portfolio_snapshots (
  id            SERIAL PRIMARY KEY,
  snapshot_date TEXT NOT NULL UNIQUE,
  total_value   DOUBLE PRECISION NOT NULL,
  num_holdings  INTEGER NOT NULL,
  details_json  TEXT
);

CREATE TABLE IF NOT EXISTS alerts (
  id            SERIAL PRIMARY KEY,
  stock_id      INTEGER NOT NULL REFERENCES stocks(id),
  alert_type    TEXT NOT NULL,
  message       TEXT NOT NULL,
  deal_id       INTEGER REFERENCES deals(id),
  is_read       INTEGER DEFAULT 0,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS price_cache (
  symbol        TEXT PRIMARY KEY,
  price         DOUBLE PRECISION NOT NULL,
  change_pct    DOUBLE PRECISION,
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS audit_log (
  id            SERIAL PRIMARY KEY,
  entity_type   TEXT NOT NULL,
  entity_id     TEXT NOT NULL,
  source        TEXT NOT NULL,
  action        TEXT NOT NULL,
  old_value     TEXT,
  new_value     TEXT,
  confidence    DOUBLE PRECISION DEFAULT 1.0,
  metadata      TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_log(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log(created_at);

CREATE TABLE IF NOT EXISTS validation_results (
  id            SERIAL PRIMARY KEY,
  symbol        TEXT NOT NULL,
  field         TEXT NOT NULL,
  source_a      TEXT NOT NULL,
  value_a       DOUBLE PRECISION NOT NULL,
  source_b      TEXT NOT NULL,
  value_b       DOUBLE PRECISION NOT NULL,
  deviation_pct DOUBLE PRECISION NOT NULL,
  status        TEXT NOT NULL,
  resolved      INTEGER DEFAULT 0,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS portfolio_history (
  id            SERIAL PRIMARY KEY,
  stock_id      INTEGER NOT NULL REFERENCES stocks(id),
  event_type    TEXT NOT NULL,
  event_date    TEXT NOT NULL,
  shares_before INTEGER DEFAULT 0,
  shares_after  INTEGER DEFAULT 0,
  price_at_event DOUBLE PRECISION,
  deal_id       INTEGER REFERENCES deals(id),
  notes         TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS notification_queue (
  id            SERIAL PRIMARY KEY,
  channel       TEXT NOT NULL,
  priority      TEXT DEFAULT 'normal',
  title         TEXT NOT NULL,
  message       TEXT NOT NULL,
  metadata      TEXT,
  sent          INTEGER DEFAULT 0,
  sent_at       TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS index_data (
  id            SERIAL PRIMARY KEY,
  index_name    TEXT NOT NULL,
  date          TEXT NOT NULL,
  close_value   DOUBLE PRECISION NOT NULL,
  UNIQUE(index_name, date)
);

CREATE TABLE IF NOT EXISTS insights_cache (
  id            INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  payload       TEXT NOT NULL,
  computed_at   TIMESTAMPTZ DEFAULT NOW()
);

-- ═══════════════════════════════════════════════════════
-- NEW INTELLIGENCE TABLES (v2)
-- ═══════════════════════════════════════════════════════

-- Health monitoring persistence (survives serverless cold starts)
CREATE TABLE IF NOT EXISTS health_snapshots (
  id              INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  sources         TEXT NOT NULL,
  overall_status  TEXT NOT NULL,
  healthy_count   INTEGER NOT NULL,
  degraded_count  INTEGER NOT NULL,
  down_count      INTEGER NOT NULL,
  snapshot_at     TIMESTAMPTZ DEFAULT NOW()
);

-- Insider trading disclosures (SEBI PIT Regulations)
-- SEBI mandates insiders disclose trades within 2 business days.
-- This is 10-19 days FASTER than waiting for quarterly SHP filings.
CREATE TABLE IF NOT EXISTS insider_trades (
  id              SERIAL PRIMARY KEY,
  stock_id        INTEGER NOT NULL REFERENCES stocks(id),
  entity_name     TEXT NOT NULL,
  entity_type     TEXT NOT NULL,        -- 'self', 'wife', 'huf', 'company', 'family'
  category        TEXT NOT NULL,         -- 'Promoter', 'KMP', 'Director', 'Designated Person'
  trade_type      TEXT NOT NULL,         -- 'Buy', 'Sell'
  quantity        BIGINT NOT NULL,
  avg_price       DOUBLE PRECISION,
  trade_date      TEXT NOT NULL,
  disclosure_date TEXT NOT NULL,
  exchange        TEXT NOT NULL,
  mode_of_acq     TEXT,                  -- 'Market Purchase', 'Off Market', 'Block Deal' etc
  pre_holding_pct DOUBLE PRECISION,
  post_holding_pct DOUBLE PRECISION,
  source          TEXT NOT NULL,         -- 'nse', 'bse'
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(stock_id, entity_name, trade_date, trade_type, quantity)
);

CREATE INDEX IF NOT EXISTS idx_insider_trades_stock ON insider_trades(stock_id);
CREATE INDEX IF NOT EXISTS idx_insider_trades_date ON insider_trades(trade_date);

-- SAST (Substantial Acquisition of Shares and Takeovers) threshold crossings
-- Filed when anyone crosses 1%, 2%, 5%, 10%, 25% etc thresholds.
CREATE TABLE IF NOT EXISTS sast_disclosures (
  id              SERIAL PRIMARY KEY,
  stock_id        INTEGER NOT NULL REFERENCES stocks(id),
  entity_name     TEXT NOT NULL,
  entity_type     TEXT NOT NULL,
  regulation      TEXT NOT NULL,         -- 'Reg 29(1)', 'Reg 29(2)', 'Reg 31'
  trigger_pct     DOUBLE PRECISION,      -- threshold crossed (1, 2, 5, 10, 25 etc)
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

-- Promoter pledge tracking
-- Pledged shares by promoters of AK's holdings = risk signal.
CREATE TABLE IF NOT EXISTS promoter_pledges (
  id              SERIAL PRIMARY KEY,
  stock_id        INTEGER NOT NULL REFERENCES stocks(id),
  quarter         TEXT NOT NULL,
  promoter_holding_pct  DOUBLE PRECISION NOT NULL,
  pledged_pct           DOUBLE PRECISION NOT NULL, -- % of promoter holding pledged
  pledged_shares        BIGINT,
  total_promoter_shares BIGINT,
  change_from_prev      DOUBLE PRECISION,         -- delta vs previous quarter
  source          TEXT NOT NULL,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(stock_id, quarter)
);

-- FII/DII daily activity on AK's portfolio stocks
CREATE TABLE IF NOT EXISTS fii_dii_activity (
  id              SERIAL PRIMARY KEY,
  stock_id        INTEGER NOT NULL REFERENCES stocks(id),
  date            TEXT NOT NULL,
  fii_buy_qty     BIGINT DEFAULT 0,
  fii_sell_qty    BIGINT DEFAULT 0,
  fii_net_qty     BIGINT DEFAULT 0,
  fii_net_value   DOUBLE PRECISION DEFAULT 0,      -- in crores
  dii_buy_qty     BIGINT DEFAULT 0,
  dii_sell_qty    BIGINT DEFAULT 0,
  dii_net_qty     BIGINT DEFAULT 0,
  dii_net_value   DOUBLE PRECISION DEFAULT 0,
  source          TEXT NOT NULL,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(stock_id, date)
);

CREATE INDEX IF NOT EXISTS idx_fii_dii_stock_date ON fii_dii_activity(stock_id, date);

-- Board meetings and corporate events for AK's holdings
CREATE TABLE IF NOT EXISTS board_meetings (
  id              SERIAL PRIMARY KEY,
  stock_id        INTEGER NOT NULL REFERENCES stocks(id),
  meeting_date    TEXT NOT NULL,
  purpose         TEXT NOT NULL,          -- 'Results', 'Dividend', 'Fund Raising', 'Bonus', 'Split', 'Buyback', 'Other'
  description     TEXT,
  announcement_date TEXT,
  exchange        TEXT NOT NULL,
  source          TEXT NOT NULL,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(stock_id, meeting_date, purpose)
);

CREATE INDEX IF NOT EXISTS idx_board_meetings_date ON board_meetings(meeting_date);

-- Enable Row Level Security (optional but recommended)
-- ALTER TABLE stocks ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY "Allow all" ON stocks FOR ALL USING (true);
