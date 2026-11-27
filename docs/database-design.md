# Database Design and Data Model — Stock-Mate v2

> **Document Type:** As-Built Database Design Specification  
> **Parent Document:** [README.md](../README.md)  
> **Database Engine:** Cloudflare D1 (SQLite) managed via Drizzle ORM (`drizzle-orm/d1`)  
> **Schema Source:** [`src/server/shared/db/schema.ts`](../src/server/shared/db/schema.ts) · [`migrations/`](../migrations/)

---

## Table of Contents

1. [Entity-Relationship Diagram](#1-entity-relationship-diagram)
2. [Storage & Scaling Conventions](#2-storage--scaling-conventions)
3. [Table Definitions](#3-table-definitions)
4. [Indexes & Query Plan Guarantees](#4-indexes--query-plan-guarantees)
5. [Migration History](#5-migration-history)
6. [Cloudflare KV Key Schema](#6-cloudflare-kv-key-schema)
7. [Data Lifecycle, Soft Deletes & Atomicity](#7-data-lifecycle-soft-deletes--atomicity)

---

## 1. Entity-Relationship Diagram

```mermaid
erDiagram
    users ||--o{ sessions : "authenticates (max 5 active)"
    users ||--o{ watchlist_items : "tracks / owns (max 200 active)"
    users ||--o{ custom_watchlists : "organizes (max 30 active)"
    watchlist_items ||--|| stock_fundamentals : "has 1:1 fundamentals"
    custom_watchlists ||--o{ custom_watchlist_stocks : "contains (max 100 tickers)"
    idx_stocks ||..o{ watchlist_items : "seeds / enriches by ticker (logical)"
    idx_stocks ||..o{ custom_watchlist_stocks : "referenced by ticker (logical)"

    users {
        TEXT id PK "UUID v4"
        TEXT email UK "lowercased, max 254"
        TEXT name "2-80 chars"
        TEXT password_hash "pbkdf2_sha256$100000$salt$dk"
        INTEGER created_at "Unix ms"
        INTEGER updated_at "Unix ms"
        INTEGER deleted_at "Nullable Unix ms (soft delete)"
    }

    sessions {
        TEXT id PK "UUID v4"
        TEXT user_id FK "-> users.id"
        TEXT token_hash UK "SHA-256 hex (64 chars)"
        INTEGER expires_at "Unix ms (+7 days)"
        INTEGER created_at "Unix ms"
    }

    watchlist_items {
        TEXT id PK "UUID v4"
        TEXT user_id FK "-> users.id"
        TEXT ticker "4-letter IDX ticker"
        TEXT company_name "max 120 chars"
        TEXT sector "IDX-IC sector enum"
        INTEGER current_price "IDR >= 1"
        INTEGER owned_lots "default 0, >= 0"
        INTEGER avg_buy_price "Legacy rounded IDR"
        INTEGER avg_buy_price_x100 "Fixed-point price * 100 (>= 100)"
        TEXT holding_tranches_json "JSON array of {lots, buyPrice}"
        INTEGER target_buy_price "Nullable IDR >= 1"
        TEXT investment_thesis "Nullable text (max 2000)"
        INTEGER created_at "Unix ms"
        INTEGER updated_at "Unix ms"
        INTEGER deleted_at "Nullable Unix ms (soft delete)"
    }

    stock_fundamentals {
        TEXT id PK "UUID v4"
        TEXT watchlist_item_id FK_UK "-> watchlist_items.id"
        TEXT period_label "e.g. TTM (TradingView)"
        INTEGER eps "Integer IDR"
        INTEGER bvps "Integer IDR"
        INTEGER dps "Integer IDR >= 0"
        INTEGER roe_bps "ROE % * 100"
        INTEGER der_x100 "DER * 100"
        INTEGER eps_growth_bps "EPS growth % * 100"
        INTEGER target_per_x100 "Target P/E * 100"
        INTEGER target_pbv_x100 "Target P/B * 100"
        INTEGER discount_rate_bps "default 1200 (12%)"
        INTEGER projection_years "default 5"
        INTEGER terminal_growth_bps "default 400 (4%)"
        INTEGER dividend_growth_bps "Nullable % * 100"
        INTEGER fqs_metrics_19_cols "19 FQS & liquidity columns"
        INTEGER updated_at "Unix ms"
    }

    idx_stocks {
        TEXT ticker PK "4-letter IDX ticker"
        TEXT company_name "Company name"
        TEXT sector "IDX-IC sector enum"
        INTEGER current_price "IDR >= 1"
        INTEGER open_price "Intraday open IDR"
        INTEGER daily_change "Intraday change IDR"
        INTEGER daily_change_bps "Daily change % * 100"
        TEXT period_label "TTM label"
        INTEGER core_valuation_cols "eps, bvps, dps, roe_bps, der_x100, eps_growth_bps, target_per/pbv"
        INTEGER fqs_metrics_19_cols "19 FQS & liquidity columns"
        TEXT source "default tradingview"
        INTEGER synced_at "Unix ms"
    }

    custom_watchlists {
        TEXT id PK "UUID v4"
        TEXT user_id FK "-> users.id"
        TEXT name "max 60 chars, unique per user (CI)"
        TEXT description "Nullable max 200 chars"
        INTEGER created_at "Unix ms"
        INTEGER updated_at "Unix ms"
        INTEGER deleted_at "Nullable Unix ms (soft delete)"
    }

    custom_watchlist_stocks {
        TEXT watchlist_id PK_FK "-> custom_watchlists.id"
        TEXT ticker PK "4-letter IDX ticker"
        INTEGER added_at "Unix ms"
    }
```

---

## 2. Storage & Scaling Conventions

To avoid IEEE-754 floating-point drift in SQLite (`REAL`), Stock-Mate v2 stores **all monetary amounts, ratios, percentages, booleans, and timestamps as exact `INTEGER` values**:

| Column Suffix / Type | Scaling Formula | Example (API → DB) | Conversion Helpers |
| :--- | :--- | :--- | :--- |
| Plain price / IDR (`current_price`, `eps`, `bvps`, `dps`, `*_idr`) | `1 : 1` integer Rupiah | `Rp 9,000 → 9000` | `Math.round()` |
| `*_bps` (basis points) | `percentage × 100` (`1% = 100`) | `12.50% → 1250` | `toBps()` / `fromBps()` |
| `*_x100` (fixed-point ratio/price) | `value × 100` (`1.00 = 100`) | `2.50x → 250`, `Rp 4,825.67 → 482567` | `toX100()` / `fromX100()` |
| `*_positive` (nullable boolean) | `1 = true`, `0 = false`, `NULL = unknown` | `true → 1` | `toBoolInt()` / `fromBoolInt()` |
| `*_at` timestamps | Unix epoch milliseconds (`INTEGER`) | `Date.now()` | `new Date(ms).toISOString()` |

---

## 3. Table Definitions

### `users`
Stores investor accounts. Supports soft deletion (`deleted_at`).
- `id` (`TEXT PRIMARY KEY`), `email` (`TEXT NOT NULL UNIQUE`), `name` (`TEXT NOT NULL`), `password_hash` (`TEXT NOT NULL`), `created_at` (`INTEGER NOT NULL`), `updated_at` (`INTEGER NOT NULL`), `deleted_at` (`INTEGER`).

### `sessions`
Stores active revocable 7-day authentication sessions. Raw session tokens are **never** stored; only their SHA-256 hex digest (`token_hash`) is persisted.
- `id` (`TEXT PRIMARY KEY`), `user_id` (`TEXT NOT NULL REFERENCES users(id)`), `token_hash` (`TEXT NOT NULL UNIQUE`), `expires_at` (`INTEGER NOT NULL`), `created_at` (`INTEGER NOT NULL`).

### `watchlist_items`
Stores user-specific tracked stocks, owned lot positions, multi-entry holding tranches, target buy prices, and investment theses.
- Constraints: `CHECK (current_price >= 1)`, `CHECK (target_buy_price IS NULL OR target_buy_price >= 1)`, `CHECK (owned_lots >= 0)`, `CHECK (avg_buy_price IS NULL OR avg_buy_price >= 1)`, `CHECK (avg_buy_price_x100 IS NULL OR avg_buy_price_x100 >= 100)`.
- `avg_buy_price_x100` (added in migration `0004`) is the authoritative 2-decimal average buy price; `avg_buy_price` is retained for backwards compatibility.
- `holding_tranches_json` stores serialized JSON array `Array<{ lots: number, buyPrice: number }>`.

### `stock_fundamentals`
1:1 companion table to `watchlist_items` (`watchlist_item_id UNIQUE REFERENCES watchlist_items(id)`). Stores user-customizable Core-3 valuation inputs and the 19 extended FQS/liquidity columns:
- Core valuation: `period_label`, `eps`, `bvps`, `dps` (`>= 0`), `roe_bps`, `der_x100` (`>= 0`), `eps_growth_bps`, `target_per_x100` (`> 0`), `target_pbv_x100` (`> 0`), `discount_rate_bps` (default `1200`), `projection_years` (default `5`), `terminal_growth_bps` (default `400`), `dividend_growth_bps`.
- Extended 19 FQS & liquidity columns (added in migration `0006`): `market_cap_idr`, `adtv_idr`, `roa_bps`, `roic_bps`, `operating_margin_bps`, `net_margin_bps`, `revenue_growth_bps`, `net_income_growth_bps`, `current_ratio_x100`, `net_debt_to_ebitda_x100`, `equity_to_assets_bps`, `wholesale_der_x100`, `cfo_to_ni_x100`, `fcf_margin_bps`, `fcf_yield_bps`, `cfo_positive`, `fcf_positive`, `piotroski_f_score`, `altman_z_x100`.

### `idx_stocks`
Global shared catalog of active IHSG common stocks (~900 rows), keyed by `ticker` (`TEXT PRIMARY KEY`). Populated by Cloudflare Cron Triggers via `TradingViewIdxProvider.fetchAllIdxStocks()` and stale-pruned using `synced_at < pruneBeforeMs`.
- Contains the same core valuation and 19 extended FQS columns as `stock_fundamentals`, plus intraday fields (`open_price`, `daily_change`, `daily_change_bps` added in migration `0007`), `source` (default `'tradingview'`), and `synced_at`.

### `custom_watchlists` & `custom_watchlist_stocks`
- `custom_watchlists`: User-owned named lists (`id`, `user_id`, `name`, `description`, `created_at`, `updated_at`, `deleted_at`).
- `custom_watchlist_stocks`: Join table with composite primary key `(watchlist_id, ticker)` and `added_at` ordering timestamp. Tickers reference `idx_stocks` logically (no FK constraint so users can bookmark tickers even if temporarily absent from `idx_stocks`).

---

## 4. Indexes & Query Plan Guarantees

| Index Name | Table | Columns & Predicate | Primary Query Served |
| :--- | :--- | :--- | :--- |
| `idx_users_email_active` | `users` | `(email) WHERE deleted_at IS NULL` | Login & duplicate-registration lookup |
| `idx_sessions_user_id` | `sessions` | `(user_id)` | Expired session cleanup & max-5 pruning |
| `idx_sessions_expires_at` | `sessions` | `(expires_at)` | Session expiry scans |
| `idx_watchlist_user_active` | `watchlist_items` | `(user_id, updated_at DESC) WHERE deleted_at IS NULL` | `D1WatchlistRepository.listByUser()` (verified via `EXPLAIN QUERY PLAN` in integration tests) |
| `uq_watchlist_user_ticker_active` | `watchlist_items` | `UNIQUE (user_id, ticker) WHERE deleted_at IS NULL` | Prevents duplicate active tickers per user while allowing re-add after soft delete |
| `idx_fundamentals_watchlist_item_id` | `stock_fundamentals` | `(watchlist_item_id)` | Single-query `LEFT JOIN` (zero N+1) |
| `idx_idx_stocks_sector` | `idx_stocks` | `(sector)` | Sector filtering |
| `idx_idx_stocks_synced_at` | `idx_stocks` | `(synced_at DESC)` | `getLatestSyncedAt()` and stale pruning |
| `idx_custom_watchlists_user_active` | `custom_watchlists` | `(user_id, created_at ASC) WHERE deleted_at IS NULL` | Listing user custom watchlists |
| `uq_custom_watchlists_user_name_active` | `custom_watchlists` | `UNIQUE (user_id, lower(name)) WHERE deleted_at IS NULL` | Case-insensitive unique list names per user |
| `idx_custom_watchlist_stocks_ticker` | `custom_watchlist_stocks` | `(ticker)` | Reverse lookup by ticker |

---

## 5. Migration History

All migrations are plain SQL files under [`migrations/`](../migrations/), applied via `wrangler d1 migrations apply`:

| Migration File | Summary of Changes |
| :--- | :--- |
| [`0001_initial.sql`](../migrations/0001_initial.sql) | Created `users`, `sessions`, `watchlist_items`, `stock_fundamentals`, and core partial/unique indexes. |
| [`0002_add_position_holdings.sql`](../migrations/0002_add_position_holdings.sql) | Added `owned_lots` and `avg_buy_price` to `watchlist_items`. |
| [`0003_add_holding_tranches.sql`](../migrations/0003_add_holding_tranches.sql) | Added `holding_tranches_json` to `watchlist_items` for multi-entry buy tranches. |
| [`0004_decimal_avg_buy_price.sql`](../migrations/0004_decimal_avg_buy_price.sql) | Added `avg_buy_price_x100` to `watchlist_items` and backfilled existing rows (`avg_buy_price * 100`). |
| [`0005_idx_catalog_and_custom_watchlists.sql`](../migrations/0005_idx_catalog_and_custom_watchlists.sql) | Created `idx_stocks`, `custom_watchlists`, and `custom_watchlist_stocks` with indexes. |
| [`0006_fundamental_quality_metrics.sql`](../migrations/0006_fundamental_quality_metrics.sql) | Added 19 institutional FQS & liquidity columns to both `idx_stocks` and `stock_fundamentals`. |
| [`0007_add_intraday_price_fields.sql`](../migrations/0007_add_intraday_price_fields.sql) | Added `open_price`, `daily_change`, and `daily_change_bps` to `idx_stocks`. |

---

## 6. Cloudflare KV Key Schema

Namespace binding: `STOCK_MATE_KV` (configured in [`wrangler.jsonc`](../wrangler.jsonc)).

| Key Pattern | Value Format | TTL | Purpose | Source |
| :--- | :--- | :--- | :--- | :--- |
| `catalog:v3:latest` | JSON (`CatalogSnapshotPayload`) | `43,200s` (12h) | Precomputed IHSG catalog snapshot with valuations, FQS, summary, and weak ETag | [`catalog-snapshot-store.ts`](../src/server/modules/watchlist/infra/catalog-snapshot-store.ts) |
| `catalog:sync:lock` | Unix ms string | `240s` (4m) | Distributed guard preventing concurrent SWR background syncs | [`src/server/index.ts`](../src/server/index.ts) |
| `revoked:sid:<sessionId>` | `"1"` | `960s` (16m) | Denylist for logged-out or rotated short-lived 15m access tokens | [`session-token.ts`](../src/server/shared/http/session-token.ts) |
| `rl:<scope>:<clientId>:<windowBucket>` | Integer string | `max(60s, windowSec + 10s)` | Distributed fixed-window rate-limit counter | [`rate-limit-mw.ts`](../src/server/shared/http/rate-limit-mw.ts) |

---

## 7. Data Lifecycle, Soft Deletes & Atomicity

- **Soft Deletes:** `users`, `watchlist_items`, and `custom_watchlists` use `deleted_at` timestamps. Soft deletes execute atomically with ownership predicates via `UPDATE ... WHERE id = ? AND user_id = ? AND deleted_at IS NULL RETURNING id` (`D1WatchlistRepository.softDelete`, `D1CustomWatchlistRepository.softDelete`).
- **Hard Deletes (Ephemeral/Join Rows Only):** `sessions` rows are hard-deleted on logout, rotation, expiry cleanup, and >5 session pruning. `custom_watchlist_stocks` rows are hard-deleted when removed from a group. Stale `idx_stocks` rows (delisted/inactive tickers not present in the latest full TradingView scan) are hard-deleted when `synced_at < pruneBeforeMs`.
- **Atomic Batch Writes (`db.batch()`):**
  - Creating a watchlist item inserts `watchlist_items` + `stock_fundamentals` atomically.
  - Updating a watchlist item with fundamentals updates both tables atomically using an ownership subquery.
  - Batch syncing user market data chunks 25 items (50 statements) per `db.batch()`.
  - Global catalog upserts chunk 100 rows per `db.batch()`.
  - Creating a custom watchlist with initial tickers batches the group insert + up to 49 link inserts, followed by chunks of 50.
- **No N+1 Queries:** `D1WatchlistRepository.listByUser()` and `findByIdForUser()` perform a single `LEFT JOIN` with `stock_fundamentals`. `D1CustomWatchlistRepository.listByUser()` fetches all groups in 1 query and all ticker memberships via a single `IN (...)` query.
