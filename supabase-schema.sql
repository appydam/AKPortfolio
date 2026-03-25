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

-- Enable Row Level Security (optional but recommended)
-- ALTER TABLE stocks ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY "Allow all" ON stocks FOR ALL USING (true);
