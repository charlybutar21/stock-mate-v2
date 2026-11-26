-- Migration 0004_decimal_avg_buy_price.sql
-- Store exact 2-decimal average buy price as fixed-point integer cents (price * 100)
-- Matches existing fixed-point convention (der_x100, target_per_x100, target_pbv_x100) with zero float drift.

ALTER TABLE watchlist_items
  ADD COLUMN avg_buy_price_x100 INTEGER CHECK (avg_buy_price_x100 IS NULL OR avg_buy_price_x100 >= 100);

UPDATE watchlist_items
  SET avg_buy_price_x100 = avg_buy_price * 100
  WHERE avg_buy_price IS NOT NULL AND avg_buy_price_x100 IS NULL;
