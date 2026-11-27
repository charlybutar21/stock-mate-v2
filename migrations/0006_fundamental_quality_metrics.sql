-- Migration 0006_fundamental_quality_metrics.sql
-- Adds institutional Fundamental Quality Score (FQS) inputs & liquidity metrics
-- to both idx_stocks (shared IHSG catalog) and stock_fundamentals (user watchlist items).
-- Integer scaling conventions:
--   *_bps  -> percentage * 100 (1% = 100)
--   *_x100 -> multiple/ratio * 100 (1.00x = 100)
--   *_idr  -> integer Rupiah (1 : 1)
--   *_positive -> boolean integer (1 = true, 0 = false, NULL = unknown)

ALTER TABLE idx_stocks ADD COLUMN market_cap_idr INTEGER;
ALTER TABLE idx_stocks ADD COLUMN adtv_idr INTEGER;
ALTER TABLE idx_stocks ADD COLUMN roa_bps INTEGER;
ALTER TABLE idx_stocks ADD COLUMN roic_bps INTEGER;
ALTER TABLE idx_stocks ADD COLUMN operating_margin_bps INTEGER;
ALTER TABLE idx_stocks ADD COLUMN net_margin_bps INTEGER;
ALTER TABLE idx_stocks ADD COLUMN revenue_growth_bps INTEGER;
ALTER TABLE idx_stocks ADD COLUMN net_income_growth_bps INTEGER;
ALTER TABLE idx_stocks ADD COLUMN current_ratio_x100 INTEGER;
ALTER TABLE idx_stocks ADD COLUMN net_debt_to_ebitda_x100 INTEGER;
ALTER TABLE idx_stocks ADD COLUMN equity_to_assets_bps INTEGER;
ALTER TABLE idx_stocks ADD COLUMN wholesale_der_x100 INTEGER;
ALTER TABLE idx_stocks ADD COLUMN cfo_to_ni_x100 INTEGER;
ALTER TABLE idx_stocks ADD COLUMN fcf_margin_bps INTEGER;
ALTER TABLE idx_stocks ADD COLUMN fcf_yield_bps INTEGER;
ALTER TABLE idx_stocks ADD COLUMN cfo_positive INTEGER;
ALTER TABLE idx_stocks ADD COLUMN fcf_positive INTEGER;
ALTER TABLE idx_stocks ADD COLUMN piotroski_f_score INTEGER;
ALTER TABLE idx_stocks ADD COLUMN altman_z_x100 INTEGER;

ALTER TABLE stock_fundamentals ADD COLUMN market_cap_idr INTEGER;
ALTER TABLE stock_fundamentals ADD COLUMN adtv_idr INTEGER;
ALTER TABLE stock_fundamentals ADD COLUMN roa_bps INTEGER;
ALTER TABLE stock_fundamentals ADD COLUMN roic_bps INTEGER;
ALTER TABLE stock_fundamentals ADD COLUMN operating_margin_bps INTEGER;
ALTER TABLE stock_fundamentals ADD COLUMN net_margin_bps INTEGER;
ALTER TABLE stock_fundamentals ADD COLUMN revenue_growth_bps INTEGER;
ALTER TABLE stock_fundamentals ADD COLUMN net_income_growth_bps INTEGER;
ALTER TABLE stock_fundamentals ADD COLUMN current_ratio_x100 INTEGER;
ALTER TABLE stock_fundamentals ADD COLUMN net_debt_to_ebitda_x100 INTEGER;
ALTER TABLE stock_fundamentals ADD COLUMN equity_to_assets_bps INTEGER;
ALTER TABLE stock_fundamentals ADD COLUMN wholesale_der_x100 INTEGER;
ALTER TABLE stock_fundamentals ADD COLUMN cfo_to_ni_x100 INTEGER;
ALTER TABLE stock_fundamentals ADD COLUMN fcf_margin_bps INTEGER;
ALTER TABLE stock_fundamentals ADD COLUMN fcf_yield_bps INTEGER;
ALTER TABLE stock_fundamentals ADD COLUMN cfo_positive INTEGER;
ALTER TABLE stock_fundamentals ADD COLUMN fcf_positive INTEGER;
ALTER TABLE stock_fundamentals ADD COLUMN piotroski_f_score INTEGER;
ALTER TABLE stock_fundamentals ADD COLUMN altman_z_x100 INTEGER;
