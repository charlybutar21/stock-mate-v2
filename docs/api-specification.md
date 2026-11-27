# REST API Specification — Stock-Mate v2

> **Document Type:** As-Built API Contract Reference  
> **Parent Document:** [README.md](../README.md)  
> **Base Path:** `/api/v1`  
> **Schemas Source:** [`src/shared/contracts/`](../src/shared/contracts/) · Route Handlers: [`src/server/index.ts`](../src/server/index.ts), [`auth-routes.ts`](../src/server/modules/auth/infra/auth-routes.ts), [`watchlist-routes.ts`](../src/server/modules/watchlist/infra/watchlist-routes.ts), [`market-data-routes.ts`](../src/server/modules/market-data/infra/market-data-routes.ts)

---

## Table of Contents

1. [Conventions, Headers & Security Requirements](#1-conventions-headers--security-requirements)
2. [Error Format (RFC 7807 Problem Details)](#2-error-format-rfc-7807-problem-details)
3. [Rate Limits Summary](#3-rate-limits-summary)
4. [Health & Public Snapshot Endpoints](#4-health--public-snapshot-endpoints)
5. [Authentication Endpoints (`/api/v1/auth`)](#5-authentication-endpoints-apiv1auth)
6. [Personal Watchlist & Portfolio Endpoints (`/api/v1/watchlist`)](#6-personal-watchlist--portfolio-endpoints-apiv1watchlist)
7. [Shared IHSG Catalog Endpoints (`/api/v1/watchlist/catalog`)](#7-shared-ihsg-catalog-endpoints-apiv1watchlistcatalog)
8. [Custom Watchlist Group Endpoints (`/api/v1/watchlist/groups`)](#8-custom-watchlist-group-endpoints-apiv1watchlistgroups)
9. [On-Demand Market Data Endpoints (`/api/v1/market-data`)](#9-on-demand-market-data-endpoints-apiv1market-data)

---

## 1. Conventions, Headers & Security Requirements

- **Content-Type:** All `POST`, `PUT`, and `PATCH` endpoints require `Content-Type: application/json`, **except** body-free routes: `POST /api/v1/auth/logout`, `POST /api/v1/watchlist/sync-all`, and `POST /api/v1/watchlist/catalog/sync`.
- **Payload Size Cap:** Maximum JSON body size is **64 KB** (`65,536 bytes`); larger payloads return `413 Payload Too Large`.
- **Correlation ID:** Clients may pass `x-correlation-id` matching `/^[A-Za-z0-9_-]{1,64}$/`; otherwise the Worker generates `req_<16-hex>`. Returned on every response header and error body.
- **Cache-Control:** Default `/api/*` header is `no-store, no-cache, must-revalidate, private` (overridden only on `GET /api/v1/catalog/snapshot`).
- **Authentication Cookies:**
  - Over HTTPS: `__Host-sm_session` (7-day revocable token) and `__Host-sm_at` (15-minute HS256 JWT fast-path token).
  - Over HTTP (local dev/tests): `sm_session` and `sm_at`.
  - Cookie attributes: `HttpOnly; SameSite=Lax; Path=/` (`Secure` on HTTPS).
- **CSRF Guard on Mutating Requests (`POST`/`PUT`/`PATCH`/`DELETE`):**
  - Cross-origin `Origin`, cross-origin `Referer`, or `Sec-Fetch-Site` other than `same-origin`/`none` are rejected with `403`.
  - Cookie-authenticated mutating requests **must** carry at least one same-origin proof: matching `Origin`, matching `Referer`, `Sec-Fetch-Site: same-origin`, or `X-Requested-With: StockMate` (the SPA client always sends `X-Requested-With: StockMate`).

---

## 2. Error Format (RFC 7807 Problem Details)

All `4xx` and `5xx` API responses return `Content-Type: application/problem+json` conforming to [`ProblemDetails`](../src/shared/contracts/problem.ts):

```json
{
  "type": "https://stock-mate-v2/errors/validation-error",
  "title": "Validation Failed",
  "status": 400,
  "detail": "One or more fields are invalid.",
  "instance": "/api/v1/watchlist",
  "correlationId": "req_a1b2c3d4e5f60718",
  "errors": {
    "ticker": ["Must be a 4-letter IDX ticker (e.g. BBCA)"]
  }
}
```

### Standard Error Types

| HTTP Status | `type` URI | When Returned |
| :-: | :--- | :--- |
| `400` | `https://stock-mate-v2/errors/validation-error` | Zod schema failure, malformed JSON, quota exceeded (200 stocks / 30 lists / 100 tickers), or neutral duplicate-email registration failure. |
| `401` | `https://stock-mate-v2/errors/unauthorized` | Missing/invalid/expired auth cookies or invalid login credentials. |
| `403` | `https://stock-mate-v2/errors/forbidden` | CSRF / Fetch Metadata violation, or missing/invalid `CATALOG_SYNC_SECRET` bearer token on catalog sync. |
| `404` | `https://stock-mate-v2/errors/not-found` | Unknown route, invalid ID/ticker param format, missing resource, or resource owned by another user (anti-IDOR). |
| `409` | `https://stock-mate-v2/errors/conflict` | Duplicate active ticker in watchlist, duplicate custom watchlist name (case-insensitive), or ticker already in group. |
| `413` | `https://stock-mate-v2/errors/payload-too-large` | Body exceeds `64 KB`. |
| `415` | `https://stock-mate-v2/errors/unsupported-media-type` | Missing `application/json` `Content-Type` on JSON-body mutating endpoints. |
| `429` | `https://stock-mate-v2/errors/rate-limit-exceeded` | Rate limit exceeded (`Retry-After`, `X-RateLimit-Limit`, `X-RateLimit-Remaining` headers included). |
| `502` | `https://stock-mate-v2/errors/upstream-unavailable` | Upstream market-data provider returned non-2xx or invalid session. |
| `503` | `https://stock-mate-v2/errors/service-unavailable` / `upstream-circuit-open` | D1 readiness failure or upstream circuit breaker open. |
| `500` | `https://stock-mate-v2/errors/internal-server-error` | Unhandled server error (no stack trace leaked). |

---

## 3. Rate Limits Summary

Enforced by [`createRateLimitMiddleware`](../src/server/shared/http/rate-limit-mw.ts) (backed by `STOCK_MATE_KV` with local fallback):

| Route(s) | Limit | Window | Key Strategy |
| :--- | :---: | :---: | :--- |
| `POST /api/v1/auth/register`, `POST /api/v1/auth/login` | `15` req | `60s` | Per client IP (`cf-connecting-ip`) |
| `POST /api/v1/watchlist/sync-all` | `6` req | `60s` | Per `userId` (fallback IP) |
| `POST /api/v1/watchlist/catalog/sync` | `4` req | `60s` | Per `userId` (fallback IP) |
| `GET /api/v1/market-data/idx/:ticker` | `60` req | `60s` | Per `userId` (fallback IP) |

All rate-limited responses include `X-RateLimit-Limit` and `X-RateLimit-Remaining`; `429` responses also include `Retry-After` (seconds).

---

## 4. Health & Public Snapshot Endpoints

### `GET /api/v1/health/live`
- **Auth:** Public · **D1 Queries:** `0`
- **Response (`200`):** `{ "status": "ok" }`

### `GET /api/v1/health` & `GET /api/v1/health/ready`
- **Auth:** Public · **D1 Queries:** `SELECT 1`
- **Response (`200`):** `{ "status": "ok", "db": "ok" }`
- **Response (`503`):** RFC 7807 `service-unavailable`.

### `GET /api/v1/catalog/snapshot`
- **Auth:** Public · **Caching:** `Cache-Control: public, max-age=60, s-maxage=120, stale-while-revalidate=300` (when populated) or `public, max-age=15, s-maxage=30` (when empty).
- **Request Header (Optional):** `If-None-Match: W/"cat-<syncedAtMs>-<count>"`
- **Response Headers:** `ETag`, `X-Catalog-Cache` (`EDGE-HIT`, `HOT`, `KV`, `D1`, `EMPTY`, or `*-304`).
- **Response (`304`):** Empty body when `If-None-Match` matches current snapshot ETag.
- **Response (`200`):**
```json
{
  "version": 1,
  "syncedAtMs": 1764230400000,
  "syncedAt": "2026-11-27T08:00:00.000Z",
  "etag": "W/\"cat-1764230400000-900\"",
  "summary": {
    "totalStocks": 900,
    "undervalued": 180,
    "fairlyValued": 240,
    "overvalued": 390,
    "insufficientData": 90,
    "qualityScored": 820,
    "eliteQuality": 24,
    "strongQuality": 95,
    "primeOpportunities": 18,
    "lastSyncedAt": "2026-11-27T08:00:00.000Z"
  },
  "items": [ /* MarketStockDto[] */ ]
}
```

---

## 5. Authentication Endpoints (`/api/v1/auth`)

| Method & Path | Auth | Request Body | Success Response | Notes |
| :--- | :---: | :--- | :--- | :--- |
| `POST /api/v1/auth/register` | Public | `{ "email": string, "name": string, "password": string }` | `201` `{ "user": AuthUserDto }` + `Set-Cookie` | Rate limited (`15/min`). Rotates/revokes prior cookies. Duplicate email returns neutral `400`. |
| `POST /api/v1/auth/login` | Public | `{ "email": string, "password": string }` | `200` `{ "user": AuthUserDto }` + `Set-Cookie` | Rate limited (`15/min`). Prunes expired + enforces max 5 active sessions. |
| `POST /api/v1/auth/logout` | Public (Idempotent) | *(none)* | `204 No Content` + clears cookies | Revokes active `sid` in KV/local denylist and deletes D1 session if valid cookie present. Requires same-origin proof if auth cookie sent. |
| `GET /api/v1/auth/me` | Cookie | — | `200` `{ "user": { "id", "email", "name" } }` | 0 D1 hits on valid `__Host-sm_at` fast-path. |

---

## 6. Personal Watchlist & Portfolio Endpoints (`/api/v1/watchlist`)

All endpoints require valid authentication cookies.

### `GET /api/v1/watchlist`
- **Query Parameters:**
  - `search` (`string`, max 60): Case-insensitive substring match on ticker or companyName.
  - `sector` (`IdxSector` enum): Exact IDX-IC sector filter.
  - `sort`: `updated_desc` (default) | `mos_desc` | `fqs_desc` | `ticker_asc`.
- **Response (`200`):** `{ "items": WatchlistItemDto[] }` (enriched with intraday `openPrice`/`dailyChange`/`dailyChangePct` and FQS fallbacks from `idx_stocks`).

### `POST /api/v1/watchlist`
- **Request Body (`createWatchlistSchema`):**
```json
{
  "ticker": "BBCA",
  "companyName": "Bank Central Asia Tbk",
  "sector": "FINANCIALS",
  "currentPrice": 9800,
  "ownedLots": 20,
  "avgBuyPrice": 9250.5,
  "holdingTranches": [
    { "lots": 10, "buyPrice": 9500 },
    { "lots": 10, "buyPrice": 9001 }
  ],
  "targetBuyPrice": 9000,
  "investmentThesis": "Core compounder bank",
  "fundamentals": {
    "periodLabel": "TTM (TradingView)",
    "eps": 445,
    "bvps": 2150,
    "dps": 270,
    "roePct": 21.5,
    "der": null,
    "epsGrowthPct": 11.2,
    "targetPer": 15,
    "targetPbv": 2.5,
    "discountRatePct": 12,
    "projectionYears": 5,
    "terminalGrowthPct": 4
  }
}
```
- **Response (`201`):** `{ "item": WatchlistItemDto }`
- **Errors:** `400` (validation or >200 active items), `409` (duplicate active ticker).

### `GET /api/v1/watchlist/:id`
- **Path Param:** `id` matching `/^[A-Za-z0-9_-]{1,64}$/`
- **Response (`200`):** `{ "item": WatchlistItemDto }` · **Errors:** `404` if missing or owned by another user.

### `PATCH /api/v1/watchlist/:id`
- **Request Body (`updateWatchlistSchema`):** Partial update of top-level fields, `holdingTranches` (recomputes `ownedLots`, `avgBuyPrice`, `avgBuyPriceX100`), and/or `fundamentals` (`fundamentalsPatchSchema`).
- **Response (`200`):** `{ "item": WatchlistItemDto }` · **Errors:** `400`, `404`, `409`.

### `DELETE /api/v1/watchlist/:id`
- **Behavior:** Atomic soft delete (`deleted_at = now`).
- **Response (`204`):** Empty body · **Errors:** `404`.

### `POST /api/v1/watchlist/ensure`
- **Request Body:** `{ "ticker": "BBCA" }`
- **Behavior:** Idempotently returns existing personal item (`200`) or creates one from `idx_stocks` / live quote fallback (`201`).
- **Response (`200` / `201`):** `{ "item": WatchlistItemDto }`.

### `POST /api/v1/watchlist/sync-all`
- **Auth:** Cookie · **Rate Limit:** `6/min` per user · **Body:** None
- **Behavior:** Refreshes prices & fundamentals of all active personal items from `idx_stocks` (with batch provider fallback for missing tickers) using `db.batch()`.
- **Response (`200`):** `{ "updatedCount": 12 }`.

---

## 7. Shared IHSG Catalog Endpoints (`/api/v1/watchlist/catalog`)

### `GET /api/v1/watchlist/catalog`
- **Auth:** Cookie
- **Behavior:** Reads precomputed IHSG snapshot from `CatalogSnapshotStore` (hot cache → KV → D1; cold-bootstraps once if empty), overlays current user's personal positions/custom benchmarks and custom watchlist memberships, applies filters/sorting/pagination.
- **Query Parameters (`catalogQuerySchema`):**

| Parameter | Type / Range | Default | Description |
| :--- | :--- | :---: | :--- |
| `search` | `string` (max 60) | — | Ticker or company name substring |
| `sector` | `IdxSector` | — | Exact IDX-IC sector |
| `valuationStatus` | `UNDERVALUED` \| `FAIRLY_VALUED` \| `OVERVALUED` \| `INSUFFICIENT_DATA` | — | Valuation status |
| `minMos` / `maxMos` | `number` (`-1000..1000`) | — | Margin of Safety % bounds |
| `qualityGrade` | `S` \| `A` \| `B` \| `C` \| `D` \| `E` | — | Exact FQS grade |
| `qarpQuadrant` | `PRIME_OPPORTUNITY` \| `QUALITY_FAIR_PRICE` \| `DEEP_VALUE_TURNAROUND` \| `VALUE_TRAP_RISK` \| `OVERVALUED_OR_UNRATED` | — | QARP quadrant |
| `minFqs` / `maxFqs` | `number` (`0..100`) | — | Composite FQS score bounds |
| `minProfitability` / `minGrowth` / `minHealth` / `minCashFlow` | `number` (`0..100`) | — | Individual FQS pillar minimums |
| `minAdtvBillion` | `number` (`0..100000`) | — | Minimum 30d ADTV in IDR billions |
| `minPiotroski` | `number` (`0..9`) | — | Minimum Piotroski F-Score |
| `excludeHighRiskTrap` | `boolean` (`true`/`false`/`1`/`0`) | — | Excludes `HIGH_RISK` value traps |
| `sort` | `fqs_desc`, `fqs_asc`, `qarp_desc`, `mos_desc`, `mos_asc`, `profitability_desc`, `growth_desc`, `health_desc`, `cashflow_desc`, `adtv_desc`, `ticker_asc`, `ticker_desc`, `price_asc`, `price_desc`, `fair_value_desc` | `mos_desc` | Sort order |
| `page` | `int` (`1..500`) | `1` | Page number (clamped to `totalPages`) |
| `pageSize` | `int` (`10..100`) | `10` | Items per page |

- **Response (`200`):** `{ "items": MarketStockDto[], "pagination": { page, pageSize, totalItems, totalPages }, "summary": CatalogSummaryDto }`.

### `POST /api/v1/watchlist/catalog/sync`
- **Auth:** Cookie + (when `CATALOG_SYNC_SECRET` env var is set) `Authorization: Bearer <CATALOG_SYNC_SECRET>`
- **Rate Limit:** `4/min` per user · **Body:** None
- **Behavior:** Fetches full active IHSG universe via `TradingViewIdxProvider.fetchAllIdxStocks()`, upserts & prunes `idx_stocks`, publishes new snapshot to `STOCK_MATE_KV`, and batch-updates caller's personal watchlist items.
- **Response (`200`):** `{ "syncedCount": 900, "updatedUserItemsCount": 5, "syncedAt": "..." }`.

---

## 8. Custom Watchlist Group Endpoints (`/api/v1/watchlist/groups`)

| Method & Path | Request Body / Query | Success Response | Error Codes |
| :--- | :--- | :--- | :--- |
| `GET /api/v1/watchlist/groups` | — | `200` `{ "groups": CustomWatchlistGroupDto[] }` | `401` |
| `POST /api/v1/watchlist/groups` | `{ "name": string (1-60), "description"?: string (max 200) \| null, "tickers"?: string[] (max 100) }` | `201` `{ "group": CustomWatchlistGroupDto }` | `400` (>30 groups or invalid), `404` (unknown ticker), `409` (duplicate name) |
| `PATCH /api/v1/watchlist/groups/:groupId` | `{ "name"?: string, "description"?: string \| null }` | `200` `{ "group": CustomWatchlistGroupDto }` | `400`, `404`, `409` |
| `DELETE /api/v1/watchlist/groups/:groupId` | — | `204 No Content` (soft delete) | `404` |
| `GET /api/v1/watchlist/groups/:groupId/stocks` | Filter query params (`search`, `sector`, `valuationStatus`, `qualityGrade`, `minFqs`, `maxFqs`, `minMos`, `maxMos`, `minAdtvBillion`, `excludeHighRiskTrap`, `sort`) | `200` `{ "group": CustomWatchlistGroupDto, "items": MarketStockDto[] }` | `400`, `404` |
| `POST /api/v1/watchlist/groups/:groupId/stocks` | `{ "ticker": "BBCA" }` | `201` `{ "item": MarketStockDto }` | `400` (>100 tickers), `404`, `409` (already in group) |
| `DELETE /api/v1/watchlist/groups/:groupId/stocks/:ticker` | — | `204 No Content` | `404` |

---

## 9. On-Demand Market Data Endpoints (`/api/v1/market-data`)

### `GET /api/v1/market-data/idx/:ticker`
- **Auth:** Cookie · **Rate Limit:** `60/min` per user
- **Path Param:** `ticker` — 4-letter IDX ticker (`/^[A-Z]{4}$/`, case-insensitive input normalized uppercase).
- **Behavior:** Queries `GetIdxQuoteUseCase` — fetches live quote from `TradingViewIdxProvider` (`source: 'tradingview'`) and automatically falls back to the D1 `idx_stocks` catalog (`source: 'idx_catalog'`, refreshed every 5m by Cron) if TradingView fails or its circuit breaker is open.
- **Response (`200`):** `{ "quote": IdxMarketQuoteDto }`
- **Errors:** `400` (invalid ticker format), `404` (ticker not found), `429` (rate limit), `502` (upstream error), `503` (circuit breaker open).
