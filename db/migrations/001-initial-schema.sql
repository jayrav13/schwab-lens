CREATE TABLE accounts (
  id            INTEGER PRIMARY KEY,
  uuid          TEXT NOT NULL UNIQUE,
  external_id   TEXT NOT NULL UNIQUE,
  label         TEXT NOT NULL,
  seed_date     TEXT,
  seed_value    REAL,
  benchmark     TEXT,
  first_seen_at TEXT NOT NULL,
  last_seen_at  TEXT NOT NULL
);

CREATE TABLE transactions (
  id               INTEGER PRIMARY KEY,
  account_id       INTEGER NOT NULL REFERENCES accounts(id),
  trade_date       TEXT NOT NULL,
  action_canonical TEXT NOT NULL,
  action_raw       TEXT NOT NULL,
  symbol           TEXT,
  description      TEXT,
  quantity         REAL,
  price            REAL,
  fees             REAL,
  amount           REAL NOT NULL,
  raw              TEXT NOT NULL,
  source_file      TEXT NOT NULL,
  content_hash     TEXT NOT NULL UNIQUE
);
CREATE INDEX idx_tx_account_date   ON transactions(account_id, trade_date);
CREATE INDEX idx_tx_account_action ON transactions(account_id, action_canonical);

CREATE TABLE position_snapshots (
  id           INTEGER PRIMARY KEY,
  account_id   INTEGER NOT NULL REFERENCES accounts(id),
  as_of        TEXT NOT NULL,
  symbol       TEXT NOT NULL,
  description  TEXT,
  quantity     REAL,
  price        REAL,
  market_value REAL,
  cost_basis   REAL,
  asset_type   TEXT,
  raw          TEXT NOT NULL,
  source_file  TEXT NOT NULL,
  content_hash TEXT NOT NULL UNIQUE
);
CREATE INDEX idx_pos_account_asof   ON position_snapshots(account_id, as_of);
CREATE INDEX idx_pos_account_symbol ON position_snapshots(account_id, symbol, as_of);

CREATE TABLE settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
