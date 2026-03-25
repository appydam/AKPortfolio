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
