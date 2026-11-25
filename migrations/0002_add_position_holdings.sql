-- Migration 0002_add_position_holdings.sql
-- Track user's current position (lots owned and average buy price) per watchlist stock

ALTER TABLE watchlist_items ADD COLUMN owned_lots INTEGER NOT NULL DEFAULT 0 CHECK (owned_lots >= 0);
ALTER TABLE watchlist_items ADD COLUMN avg_buy_price INTEGER CHECK (avg_buy_price IS NULL OR avg_buy_price >= 1);
