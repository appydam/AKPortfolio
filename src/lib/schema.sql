CREATE TABLE IF NOT EXISTS stocks (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  symbol        TEXT NOT NULL UNIQUE,
  bse_code      TEXT,
  name          TEXT NOT NULL,
  sector        TEXT,
  market_cap    REAL,
  pe_ratio      REAL,
  roe           REAL,
  roce          REAL,
  updated_at    TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS deals (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  stock_id      INTEGER NOT NULL REFERENCES stocks(id),
  deal_date     TEXT NOT NULL,
  exchange      TEXT NOT NULL,
  deal_type     TEXT NOT NULL,
  action        TEXT NOT NULL,
  quantity      INTEGER NOT NULL,
  avg_price     REAL NOT NULL,
  pct_traded    REAL,
  created_at    TEXT DEFAULT (datetime('now')),
  UNIQUE(stock_id, deal_date, exchange, deal_type, action, quantity)
);

CREATE TABLE IF NOT EXISTS holdings (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  stock_id      INTEGER NOT NULL REFERENCES stocks(id),
  quarter       TEXT NOT NULL,
  shares_held   INTEGER NOT NULL,
  pct_holding   REAL NOT NULL,
  created_at    TEXT DEFAULT (datetime('now')),
  UNIQUE(stock_id, quarter)
);

CREATE TABLE IF NOT EXISTS portfolio_snapshots (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  snapshot_date TEXT NOT NULL UNIQUE,
  total_value   REAL NOT NULL,
  num_holdings  INTEGER NOT NULL,
  details_json  TEXT
);

CREATE TABLE IF NOT EXISTS alerts (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  stock_id      INTEGER NOT NULL REFERENCES stocks(id),
  alert_type    TEXT NOT NULL,
  message       TEXT NOT NULL,
  deal_id       INTEGER REFERENCES deals(id),
  is_read       INTEGER DEFAULT 0,
  created_at    TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS price_cache (
  symbol        TEXT PRIMARY KEY,
  price         REAL NOT NULL,
  change_pct    REAL,
  updated_at    TEXT DEFAULT (datetime('now'))
);

-- Audit trail: every data point with source provenance
CREATE TABLE IF NOT EXISTS audit_log (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_type   TEXT NOT NULL,        -- 'price', 'deal', 'holding', 'fundamental'
  entity_id     TEXT NOT NULL,        -- symbol or deal ID
  source        TEXT NOT NULL,        -- 'nse', 'google', 'yahoo', 'trendlyne', 'bse', 'moneycontrol'
  action        TEXT NOT NULL,        -- 'fetch', 'update', 'conflict', 'failover'
  old_value     TEXT,                 -- JSON of previous value
  new_value     TEXT,                 -- JSON of new value
  confidence    REAL DEFAULT 1.0,     -- 0-1 confidence score
  metadata      TEXT,                 -- JSON extra info
  created_at    TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_log(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log(created_at);

-- Cross-validation results
CREATE TABLE IF NOT EXISTS validation_results (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  symbol        TEXT NOT NULL,
  field         TEXT NOT NULL,        -- 'price', 'shares_held', 'pct_holding'
  source_a      TEXT NOT NULL,
  value_a       REAL NOT NULL,
  source_b      TEXT NOT NULL,
  value_b       REAL NOT NULL,
  deviation_pct REAL NOT NULL,        -- % difference
  status        TEXT NOT NULL,        -- 'match', 'minor_diff', 'conflict'
  resolved      INTEGER DEFAULT 0,
  created_at    TEXT DEFAULT (datetime('now'))
);

-- Historical portfolio tracking (entry/exit with P&L)
CREATE TABLE IF NOT EXISTS portfolio_history (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  stock_id      INTEGER NOT NULL REFERENCES stocks(id),
  event_type    TEXT NOT NULL,        -- 'entry', 'add', 'partial_exit', 'full_exit', 'holding_change'
  event_date    TEXT NOT NULL,
  shares_before INTEGER DEFAULT 0,
  shares_after  INTEGER DEFAULT 0,
  price_at_event REAL,
  deal_id       INTEGER REFERENCES deals(id),
  notes         TEXT,
  created_at    TEXT DEFAULT (datetime('now'))
);

-- Notification queue for Telegram/email
CREATE TABLE IF NOT EXISTS notification_queue (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  channel       TEXT NOT NULL,        -- 'telegram', 'email', 'webhook'
  priority      TEXT DEFAULT 'normal', -- 'urgent', 'normal', 'low'
  title         TEXT NOT NULL,
  message       TEXT NOT NULL,
  metadata      TEXT,                 -- JSON
  sent          INTEGER DEFAULT 0,
  sent_at       TEXT,
  created_at    TEXT DEFAULT (datetime('now'))
);

-- NIFTY index data for comparison
CREATE TABLE IF NOT EXISTS index_data (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  index_name    TEXT NOT NULL,        -- 'NIFTY50', 'NIFTYMIDCAP100', 'NIFTYSMALLCAP250'
  date          TEXT NOT NULL,
  close_value   REAL NOT NULL,
  UNIQUE(index_name, date)
);
