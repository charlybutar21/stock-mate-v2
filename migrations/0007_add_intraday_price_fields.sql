-- Migration 0007: Add intraday open price and daily price change columns to shared idx_stocks catalog
-- Uses integer Rupiah (open_price, daily_change) and basis points (daily_change_bps: 1% = 100 bps) for zero floating-point drift.

ALTER TABLE idx_stocks ADD COLUMN open_price INTEGER;
ALTER TABLE idx_stocks ADD COLUMN daily_change INTEGER;
ALTER TABLE idx_stocks ADD COLUMN daily_change_bps INTEGER;
