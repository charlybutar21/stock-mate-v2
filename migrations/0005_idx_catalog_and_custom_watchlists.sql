-- Migration 0005_idx_catalog_and_custom_watchlists.sql
-- Shared active IHSG stock catalog + User Custom Watchlists (groups & memberships)

CREATE TABLE idx_stocks (
  ticker TEXT PRIMARY KEY NOT NULL,
  company_name TEXT NOT NULL,
  sector TEXT NOT NULL,
  current_price INTEGER NOT NULL CHECK (current_price >= 1),
  period_label TEXT,
  eps INTEGER,
  bvps INTEGER,
  dps INTEGER CHECK (dps IS NULL OR dps >= 0),
  roe_bps INTEGER,
  der_x100 INTEGER CHECK (der_x100 IS NULL OR der_x100 >= 0),
  eps_growth_bps INTEGER,
  target_per_x100 INTEGER CHECK (target_per_x100 IS NULL OR target_per_x100 > 0),
  target_pbv_x100 INTEGER CHECK (target_pbv_x100 IS NULL OR target_pbv_x100 > 0),
  source TEXT NOT NULL DEFAULT 'tradingview',
  synced_at INTEGER NOT NULL
);
CREATE INDEX idx_idx_stocks_sector ON idx_stocks(sector);
CREATE INDEX idx_idx_stocks_synced_at ON idx_stocks(synced_at DESC);

CREATE TABLE custom_watchlists (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id),
  name TEXT NOT NULL,
  description TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER
);
CREATE INDEX idx_custom_watchlists_user_active
  ON custom_watchlists(user_id, created_at ASC)
  WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX uq_custom_watchlists_user_name_active
  ON custom_watchlists(user_id, lower(name))
  WHERE deleted_at IS NULL;

CREATE TABLE custom_watchlist_stocks (
  watchlist_id TEXT NOT NULL REFERENCES custom_watchlists(id),
  ticker TEXT NOT NULL,
  added_at INTEGER NOT NULL,
  PRIMARY KEY (watchlist_id, ticker)
);
CREATE INDEX idx_custom_watchlist_stocks_ticker ON custom_watchlist_stocks(ticker);
