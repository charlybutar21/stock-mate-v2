# Operational Runbook — Stock-Mate v2

> **Document Type:** As-Built Operations, Monitoring & Troubleshooting Guide  
> **Parent Document:** [README.md](../README.md)  
> **Related Docs:** [deployment-guide.md](deployment-guide.md) · [architecture.md](architecture.md)

---

## Table of Contents

1. [Health Probes & Service Level Objectives (SLOs)](#1-health-probes--service-level-objectives-slos)
2. [Structured Logging & PII Redaction](#2-structured-logging--pii-redaction)
3. [Scheduled Background Jobs (Cron Triggers)](#3-scheduled-background-jobs-cron-triggers)
4. [Manual Operations & Admin Procedures](#4-manual-operations--admin-procedures)
5. [Troubleshooting Playbooks](#5-troubleshooting-playbooks)
6. [Load Testing & Capacity Validation](#6-load-testing--capacity-validation)
7. [Security Incident Response Procedures](#7-security-incident-response-procedures)

---

## 1. Health Probes & Service Level Objectives (SLOs)

### Health Endpoints

| Endpoint | Probe Type | Checks Performed | Expected Response |
| :--- | :--- | :--- | :--- |
| `GET /api/v1/health/live` | Liveness | Worker isolate execution only (0 D1 hits) | `200` `{"status":"ok"}` |
| `GET /api/v1/health/ready` (alias `/api/v1/health`) | Readiness | Executes `SELECT 1` against Cloudflare D1 | `200` `{"status":"ok","db":"ok"}` or `503` RFC 7807 |

### Target SLOs (per [ADR-001](ADR-001-100k-scaling-architecture.md) & [`scripts/load-test.k6.js`](../scripts/load-test.k6.js))

| Metric | Target |
| :--- | :--- |
| Availability / Error Rate | `99.9%` (`app_error_rate < 0.1%`, `http_req_failed < 0.1%`) |
| Edge Catalog Snapshot Latency | `p95 < 200 ms`, `p99 < 400 ms` |
| Authenticated Read Latency | `p95 < 250 ms`, `p99 < 500 ms` |
| Client Initial Entry Bundle | `<= 250 kB` raw |

---

## 2. Structured Logging & PII Redaction

Implemented in [`src/server/shared/logger.ts`](../src/server/shared/logger.ts) with Cloudflare Workers Observability enabled in [`wrangler.jsonc`](../wrangler.jsonc).

Every log line is emitted as JSON to `console.info` / `console.warn` / `console.error`:

```json
{
  "timestamp": "2026-11-27T08:15:02.123Z",
  "level": "info",
  "correlationId": "req_a1b2c3d4e5f60718",
  "message": "http_request",
  "meta": {
    "method": "GET",
    "path": "/api/v1/watchlist",
    "status": 200,
    "durationMs": 14
  }
}
```

### Standard Log Events

| Event `message` | Level | Emitted By | Metadata Fields |
| :--- | :---: | :--- | :--- |
| `http_request` | `info` | Request middleware ([`src/server/index.ts`](../src/server/index.ts)) | `method`, `path`, `status`, `durationMs` |
| `app_error` | `error` | Global error handler (status `>= 500`) | `status`, `type` |
| `unhandled_error` | `error` | Global error handler (unexpected exceptions) | `errorName` |
| `cron_catalog_sync_completed` | `info` | `runScheduledCatalogSync` | `syncedCount`, `durationMs`, `kvEnabled` |
| `cron_catalog_sync_failed` | `error` | `runScheduledCatalogSync` | `errorName`, `errorMessage` (truncated 160 chars), `durationMs` |

### Viewing Live Logs

```bash
npx wrangler tail
```

> **PII Safety:** `sanitizeMeta()` recursively redacts 22 sensitive keys (`password`, `email`, `sm_session`, `__host-sm_session`, `sm_at`, `__host-sm_at`, `cookie`, `authorization`, `token`, `api_key`, `jwt_secret`, `catalog_sync_secret`, `cf-connecting-ip`, `ip`, etc.) to `"[REDACTED]"`. Incoming `x-correlation-id` headers are regex-sanitized (`/^[A-Za-z0-9_-]{1,64}$/`) to prevent log injection.

---

## 3. Scheduled Background Jobs (Cron Triggers)

Configured in [`wrangler.jsonc`](../wrangler.jsonc) and handled by `scheduled()` → `runScheduledCatalogSync()` in [`src/server/index.ts`](../src/server/index.ts):

| Cron Expression (UTC) | Indonesia Time (WIB, UTC+7) | Frequency | Purpose |
| :--- | :--- | :--- | :--- |
| `*/5 1-10 * * 1-5` | `08:00 – 17:55 WIB`, Mon–Fri | Every 5 minutes | Keeps IHSG intraday prices (`current_price`, `open_price`, `daily_change`, `daily_change_bps`) and fundamentals fresh during IDX trading hours. |
| `0 15 * * *` | `22:00 WIB`, Daily | Nightly | End-of-day reconciliation and fundamentals refresh. |

Additionally, `GET /api/v1/catalog/snapshot` triggers a KV-locked (`catalog:sync:lock`, 240s TTL) background sync via `ctx.waitUntil()` if the snapshot is `>= 5 minutes` old or missing intraday/sector fields.

---

## 4. Manual Operations & Admin Procedures

### Force Manual IHSG Catalog Refresh

When `CATALOG_SYNC_SECRET` is configured in production, authenticate first to obtain a session cookie, then invoke:

```bash
curl -X POST https://stock-mate-v2.charlymicolas21.workers.dev/api/v1/watchlist/catalog/sync \
  -H "Authorization: Bearer $CATALOG_SYNC_SECRET" \
  -H "X-Requested-With: StockMate" \
  -b "cookies.txt"
```

### Inspecting D1 State Safely (Read-Only)

```bash
# Check latest catalog sync timestamp and row count
npx wrangler d1 execute stock-mate-db --remote \
  --command "SELECT COUNT(*) AS total_stocks, MAX(synced_at) AS latest_synced_at FROM idx_stocks;"

# Check active vs expired sessions
npx wrangler d1 execute stock-mate-db --remote \
  --command "SELECT COUNT(*) AS total_sessions FROM sessions;"
```

### Inspecting KV Snapshot Key

```bash
npx wrangler kv key list --binding STOCK_MATE_KV
```

---

## 5. Troubleshooting Playbooks

### Playbook 1: `503 Service Unavailable` on `/api/v1/health/ready`
- **Symptom:** Readiness probe fails with `Database readiness check failed.`
- **Root Cause:** Cloudflare D1 binding outage, misconfigured `database_id` in `wrangler.jsonc`, or unapplied initial schema.
- **Remediation:**
  1. Check Cloudflare Status page for D1 regional incidents.
  2. Verify `wrangler d1 info stock-mate-db` and run `npm run db:migrate:remote` if setting up a fresh environment.
  3. Inspect `npx wrangler tail` for `unhandled_error` / `app_error` entries using the `correlationId` from the `503` response.

### Playbook 2: Empty or Stale IHSG Catalog (`X-Catalog-Cache: EMPTY` or old `lastSyncedAt`)
- **Symptom:** Radar or All IHSG Stocks returns 0 rows or prices are >15 minutes stale during IDX hours.
- **Root Cause:** Cron trigger failed (`cron_catalog_sync_failed`), TradingView scanner temporarily blocked/timed out (`15s` timeout) opening `tvCircuitBreaker` (60s cooldown), or `catalog:sync:lock` is still active.
- **Remediation:**
  1. Check `npx wrangler tail` for `cron_catalog_sync_failed` logs.
  2. Wait 60 seconds if circuit breaker opened, then trigger a manual sync via `POST /api/v1/watchlist/catalog/sync` or hit `GET /api/v1/catalog/snapshot` after the 240s KV lock expires.
  3. Confirm TradingView scanner accessibility (`POST https://scanner.tradingview.com/indonesia/scan`).

### Playbook 3: `502` or `503` (`upstream-circuit-open`) on `GET /api/v1/market-data/idx/:ticker`
- **Symptom:** Auto-fetch button in Add/Edit Stock modal fails for a ticker not present in D1 `idx_stocks`.
- **Root Cause:** TradingView failed 3 consecutive requests (triggering 60s circuit breaker cooldown) and the requested ticker does not have a cached fallback row in D1 `idx_stocks`.
- **Remediation:**
  1. Wait 60 seconds for circuit breaker cooldown to reset automatically.
  2. For tickers already present in `idx_stocks`, the endpoint automatically serves the latest Cron-synced D1 fallback (`source: 'idx_catalog'`).
  3. Users can still add/edit stock fundamentals manually in the UI while TradingView recovers.

### Playbook 4: `403 Forbidden` on Authenticated Mutating Requests
- **Symptom:** `POST`/`PATCH`/`DELETE` fails with `Missing same-origin verification header` or `Cross-origin state-changing request blocked`.
- **Root Cause:** Direct API caller (e.g., `curl`, Postman, k6) omitted `X-Requested-With: StockMate` or sent a mismatched `Origin`/`Referer`.
- **Remediation:** Include `-H "X-Requested-With: StockMate"` (or matching same-origin `Origin` header) on all mutating calls carrying session cookies.

### Playbook 5: Users Repeatedly Logged Out Across Requests
- **Symptom:** `GET /api/v1/auth/me` works briefly then returns `401` or triggers extra D1 lookups.
- **Root Cause:** `JWT_SECRET` not set in production (so each Cloudflare Worker isolate generates a different ephemeral fallback HMAC key, causing `__Host-sm_at` verification misses across PoPs, though D1 session fallback should still succeed) **or** user exceeded 5 concurrent device logins (oldest session pruned).
- **Remediation:** Set a persistent `JWT_SECRET` via `npx wrangler secret put JWT_SECRET` and redeploy.

### Playbook 6: `429 Too Many Requests`
- **Symptom:** Client receives `429` with `Retry-After` header.
- **Root Cause:** Exceeded fixed-window limits (`15/min` auth per IP, `6/min` sync-all, `4/min` catalog sync, `60/min` market-data lookup). Note that shared corporate/NAT IPs share the auth IP bucket.
- **Remediation:** Respect `Retry-After` seconds; verify legitimate traffic is not looping retries.

---

## 6. Load Testing & Capacity Validation

Run the repository's staged k6 load test ([`scripts/load-test.k6.js`](../scripts/load-test.k6.js)):

```bash
# Safe smoke check (20 VUs, 40s)
k6 run -e BASE_URL=https://stock-mate-v2.charlymicolas21.workers.dev scripts/load-test.k6.js

# Staging 10k VU stress profile
k6 run -e BASE_URL=https://stock-mate-v2.charlymicolas21.workers.dev \
  -e LOAD_PROFILE=stress_10k scripts/load-test.k6.js

# Distributed 100k VU target profile (requires k6 Cloud or multi-node k6 Operator)
k6 run -e BASE_URL=https://stock-mate-v2.charlymicolas21.workers.dev \
  -e LOAD_PROFILE=scale_100k \
  -e TEST_EMAIL=<test-account> -e TEST_PASSWORD=<test-password> \
  scripts/load-test.k6.js
```

Traffic mix tested: **80%** public Edge-cached `GET /api/v1/catalog/snapshot` (+ `If-None-Match` `304` revalidation) and **20%** authenticated `GET /api/v1/auth/me` + `GET /api/v1/watchlist`.

---

## 7. Security Incident Response Procedures

- **Rotate Compromised `JWT_SECRET`:** Run `npx wrangler secret put JWT_SECRET`. All existing 15m `__Host-sm_at` tokens immediately fail HMAC verification and seamlessly re-validate against authoritative D1 `sessions` on next request.
- **Force Global Logout (All Users):** Delete rows from `sessions` table in D1 and rotate `JWT_SECRET` so neither refresh sessions nor 15m access tokens remain valid.
- **Rotate `CATALOG_SYNC_SECRET`:** Run `npx wrangler secret put CATALOG_SYNC_SECRET` (takes effect immediately on Cloudflare Workers without code changes).
- **Dependency Vulnerabilities:** CI runs `npm audit --omit=dev --audit-level=high` on every PR and push; patch vulnerable production packages promptly via `npm update` / `npm install`.
