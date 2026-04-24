-- Phase 1 initial schema. See spec at
-- docs/superpowers/specs/2026-04-24-phase1-sqlite-multi-brokerage-design.md

CREATE TABLE brokerages (
  slug         TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  created_at   TEXT NOT NULL
);

CREATE TABLE accounts (
  id             INTEGER PRIMARY KEY,
  brokerage_slug TEXT NOT NULL REFERENCES brokerages(slug),
  external_id    TEXT NOT NULL,
  label          TEXT NOT NULL,
  seed_date      TEXT,
  seed_value     REAL,
  benchmark      TEXT,
  first_seen_at  TEXT NOT NULL,
  last_seen_at   TEXT NOT NULL,
  UNIQUE(brokerage_slug, external_id)
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

INSERT INTO brokerages (slug, display_name, created_at) VALUES ('schwab',    'Charles Schwab',    '2026-04-24T00:00:00Z');

INSERT INTO brokerages (slug, display_name, created_at) VALUES ('robinhood', 'Robinhood',         '2026-04-24T00:00:00Z');

INSERT INTO brokerages (slug, display_name, created_at) VALUES ('chase',     'JPM Self-Directed', '2026-04-24T00:00:00Z');

INSERT INTO brokerages (slug, display_name, created_at) VALUES ('fidelity',  'Fidelity',          '2026-04-24T00:00:00Z');
