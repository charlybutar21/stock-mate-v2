-- Migration 0001_initial.sql
-- Stock-Mate v2 (Cloudflare D1 SQLite)

CREATE TABLE users (
  id TEXT PRIMARY KEY NOT NULL,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER
);
CREATE INDEX idx_users_email_active ON users(email) WHERE deleted_at IS NULL;

CREATE TABLE sessions (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id),
  token_hash TEXT NOT NULL UNIQUE,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_sessions_user_id ON sessions(user_id);
CREATE INDEX idx_sessions_expires_at ON sessions(expires_at);

CREATE TABLE watchlist_items (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id),
  ticker TEXT NOT NULL,
  company_name TEXT NOT NULL,
  sector TEXT NOT NULL,
  current_price INTEGER NOT NULL CHECK (current_price >= 1),
  target_buy_price INTEGER CHECK (target_buy_price IS NULL OR target_buy_price >= 1),
  investment_thesis TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER
);
CREATE INDEX idx_watchlist_user_active ON watchlist_items(user_id, updated_at DESC) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX uq_watchlist_user_ticker_active ON watchlist_items(user_id, ticker) WHERE deleted_at IS NULL;

CREATE TABLE stock_fundamentals (
  id TEXT PRIMARY KEY NOT NULL,
  watchlist_item_id TEXT NOT NULL UNIQUE REFERENCES watchlist_items(id),
  period_label TEXT,
  eps INTEGER,
  bvps INTEGER,
  dps INTEGER CHECK (dps IS NULL OR dps >= 0),
  roe_bps INTEGER,
  der_x100 INTEGER CHECK (der_x100 IS NULL OR der_x100 >= 0),
  eps_growth_bps INTEGER,
  target_per_x100 INTEGER CHECK (target_per_x100 IS NULL OR target_per_x100 > 0),
  target_pbv_x100 INTEGER CHECK (target_pbv_x100 IS NULL OR target_pbv_x100 > 0),
  discount_rate_bps INTEGER NOT NULL DEFAULT 1200,
  projection_years INTEGER NOT NULL DEFAULT 5,
  terminal_growth_bps INTEGER NOT NULL DEFAULT 400,
  dividend_growth_bps INTEGER,
  updated_at INTEGER NOT NULL
);
CREATE INDEX idx_fundamentals_watchlist_item_id ON stock_fundamentals(watchlist_item_id);
