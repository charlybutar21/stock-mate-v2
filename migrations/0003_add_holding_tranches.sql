-- Migration 0003_add_holding_tranches.sql
-- Store multiple buy / average-down holding entries per watchlist stock (JSON array of {lots, buyPrice})

ALTER TABLE watchlist_items ADD COLUMN holding_tranches_json TEXT;
