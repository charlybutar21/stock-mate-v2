# Stock-Mate v2

> **IDX Fair Value Valuation Engine & Real-Time Stockbit Average Down Simulator**  
> Built for Indonesian Stock Exchange (**IDX / BEI**) retail investors — zero-cost serverless architecture on **Cloudflare Workers + D1**.

🌐 **Live Production App:** https://stock-mate-v2.charlymicolas21.workers.dev  
📋 **PRD & Technical Spec:** [Issue #1 — Stock-Mate v2 MVP v1.0](https://github.com/charlybutar21/stock-mate-v2/issues/1)

---

## Key Features

### 1. Public Authentication & Strict Data Isolation
- **Email + Password** registration and login with zero third-party auth fees.
- **Cloudflare 10ms-safe password hashing:** Native Web Crypto API (`PBKDF2-SHA256`, 100,000 iterations) with constant-time XOR verification.
- **DB-backed sessions:** Raw 32-byte token stored only in `HttpOnly; Secure; SameSite=Lax` cookie (`sm_session`); only `SHA-256(token)` is persisted in Cloudflare D1.
- **Anti-IDOR isolation:** Every watchlist read/write enforces `user_id` ownership and returns `404` for unauthorized IDs.

### 2. IDX Watchlist Management + 1-Click Auto-Fetch
- **Quick Auto-Add (1-Click):** Enter any 4-letter IDX ticker (e.g. `BBCA`, `BBRI`, `ICBP`, `TLKM`, `ASII`) to automatically fetch delayed price, company name, IDX sector, TTM fundamentals (`EPS`, `BVPS`, `DPS`, `ROE`, `DER`, `EPS Growth`), and sector-benchmark Target PER/PBV via Yahoo Finance (`.JK`).
- **Auto-Fill & Sync Data:** Preview/edit auto-fetched fundamentals in the Add/Edit modal, or refresh existing stocks in 1 click from the Stock Detail page.
- **Manual Override:** All values remain 100% editable to match Stockbit Keystats or official IDX filings.
- **BEI 2026 Compliant:** Supports stock prices down to **`Rp 1`** (BEI rule effective 28 Sep 2026), soft-delete (`deleted_at`), 14-day staleness badge, search, sector filter, and sorting by Margin of Safety (MoS).

### 3. Multi-Method Fair Value Analysis (5 Methods / 6 Outputs)
Computes intrinsic value transparently with graceful `N/A` reasons when inputs are negative or missing:
1. **Graham Number:** $\sqrt{22.5 \times \text{EPS} \times \text{BVPS}}$
2. **Relative PER:** $\text{EPS} \times \text{Target PER}$
3. **Relative PBV:** $\text{BVPS} \times \text{Target PBV}$ *(highlighted as primary reference for `FINANCIALS`)*
4. **Peter Lynch / PEG:** $\text{EPS} \times \min(\text{EPS Growth \%} + \text{Div Yield \%},\ 25)$
5. **Simple DCF (Discounted EPS):** Multi-year projected EPS + terminal value (growth capped at 20%)
6. **DDM (Gordon Growth):** $\frac{\text{DPS} \times (1 + g_d)}{r - g_d}$

Includes:
- **Fair Value Range Bar:** Conservative (Min) / **Moderate (Median)** / Optimistic (Max) vs Current Price.
- **Margin of Safety (MoS %):** `≥ 30%` Undervalued · `0–29.99%` Fairly Valued · `< 0%` Overvalued.
- **Sector-Aware Quality Flags:** ROE strength and DER health (with banking-aware `NOT_APPLICABLE_BANKING` badge for `FINANCIALS`).
- **Interactive What-If Tuning:** Adjust Target PER/PBV, Discount Rate, Projection Years, Terminal Growth, and Dividend Growth in real time, with Save/Reset controls.

### 4. Real-Time Average Down & Stockbit Simulator
Linked directly to your Watchlist stocks (client-side < 50ms recalculation via shared pure domain engine):
- **Mode 1 — Multi-Tranche Forward:** Existing position + up to 5 planned buy tranches + target sell price → outputs Pure Avg, Effective Avg (incl. buy fee), **Real BEP rounded up to IDX Tick Size (`ceilToIdxTick`)**, Additional Cash Required, Total Capital, Projected Net P/L (`Rp` & `%`), and Before/After Gain-to-BEP comparison.
- **Mode 2 — Goal-Seek Target Average:** Calculates exact **Lots Needed** and **Total Cash Required** to reach a desired average price.
- **Stockbit 2026 Fee Defaults:** `0.15%` Buy / `0.25%` Sell (customizable) + optional **Bea Materai `Rp 10.000`** toggle for gross transactions `> Rp 10.000.000`.
- **Investment Guardrails:** Automatic warning banners if simulated average still exceeds Watchlist Moderate Fair Value or if planned tranches result in an Average Up.

### 5. Bilingual UI & UX Resilience
- **English (`en`)** default with instant **Bahasa Indonesia (`id`)** header switcher (strict compile-time dictionary parity).
- Responsive layout, Skeleton loaders, and React Error Boundaries.

---

## Tech Stack & Architecture

| Layer | Technology |
| :--- | :--- |
| **Runtime & Hosting** | Cloudflare Workers + Static Assets (`@cloudflare/vite-plugin`, `wrangler.jsonc`) |
| **Backend** | TypeScript + Hono (Clean Architecture / Pragmatic DDD Modular Monolith) |
| **Database & ORM** | Cloudflare D1 (SQLite) + Drizzle ORM + Versioned SQL Migrations |
| **Frontend** | React 19 + Vite 7 + TypeScript + Tailwind CSS v4 (`@theme`) + TanStack Query + React Router 7 |
| **Validation** | Zod v4 (`z.email()`, `z.flattenError()`) shared across server & client |
| **Testing** | Vitest + V8 Coverage (100% coverage on `src/shared/domain/` + real SQLite API integration tests) |
| **Observability** | Structured JSON logs with `correlationId` + PII redaction + RFC 7807 `application/problem+json` errors |

### Project Structure

```text
stock-mate-v2/
├── wrangler.jsonc                   # Cloudflare Workers + D1 binding + SPA Static Assets
├── vite.config.ts                   # @cloudflare/vite-plugin + React + Tailwind CSS v4
├── drizzle.config.ts                # Drizzle Kit SQLite config
├── migrations/
│   └── 0001_initial.sql             # Indexed D1 schema (users, sessions, watchlist_items, stock_fundamentals)
├── src/
│   ├── shared/
│   │   ├── domain/                  # Pure TS financial math (0 framework deps, 100% test coverage)
│   │   │   ├── idx-rules.ts         # LOT=100, MIN_PRICE=1, IDX tick brackets, Stockbit fees
│   │   │   ├── valuation.ts         # 6 valuation methods, MoS, median range, quality flags
│   │   │   ├── simulator.ts         # Forward multi-tranche, Goal-Seek, BEP, guardrails
│   │   │   └── __tests__/           # Golden Test Cases 1–5
│   │   └── contracts/               # Shared Zod v4 DTOs (auth, watchlist, market-data, RFC 7807)
│   ├── server/                      # Hono Worker API
│   │   ├── index.ts                 # App assembly, DI, correlationId, RFC 7807 global error handler
│   │   ├── modules/
│   │   │   ├── auth/                # Domain, UseCases, D1AuthRepository, WebCryptoHasher, routes
│   │   │   ├── watchlist/           # Domain, UseCases, D1WatchlistRepository (single LEFT JOIN), routes
│   │   │   └── market-data/         # IdxMarketDataProvider port, YahooFinanceIdxProvider, routes
│   │   ├── shared/                  # Drizzle schema, RFC 7807 helper, auth middleware, JSON logger
│   │   └── __tests__/               # Integration tests (auth, IDOR, soft-delete, EXPLAIN QUERY PLAN)
│   └── client/                      # React + Vite + Tailwind v4 SPA
│       ├── i18n/                    # en.ts (default), id.ts (strictly typed), useI18n.tsx
│       ├── components/ui/           # Presentational primitives, AppShell, Skeleton, ErrorBoundary
│       ├── features/                # auth/, watchlist/, simulator/
│       └── lib/                     # apiClient (credentials: 'include'), IDR/percent formatters
└── .github/workflows/ci.yml         # CI/CD: typecheck -> lint -> test:coverage -> build -> D1 migrate -> deploy
```

---

## REST API Endpoints

Base path: `/api/v1` (all errors follow **RFC 7807 `application/problem+json`**).

| Method | Path | Auth | Description |
| :--- | :--- | :---: | :--- |
| `GET` | `/api/v1/health` | Public | Liveness & D1 readiness check |
| `POST` | `/api/v1/auth/register` | Public | Register account & issue `HttpOnly` session cookie |
| `POST` | `/api/v1/auth/login` | Public | Verify PBKDF2-SHA256 password & issue session cookie |
| `POST` | `/api/v1/auth/logout` | Cookie | Revoke D1 session & clear cookie |
| `GET` | `/api/v1/auth/me` | Cookie | Return current authenticated user |
| `GET` | `/api/v1/watchlist` | Cookie | List active watchlist (`?search=&sector=&sort=mos_desc\|updated_desc\|ticker_asc`) |
| `POST` | `/api/v1/watchlist` | Cookie | Create watchlist item + fundamentals atomically |
| `GET` | `/api/v1/watchlist/:id` | Cookie | Get single item + full 6-method valuation breakdown |
| `PATCH` | `/api/v1/watchlist/:id` | Cookie | Partial update of price, thesis, or fundamentals |
| `DELETE` | `/api/v1/watchlist/:id` | Cookie | Soft delete (`deleted_at`) |
| `GET` | `/api/v1/market-data/idx/:ticker` | Cookie | Auto-fetch delayed IDX quote & TTM fundamentals (cached 15m) |

---

## Local Development

### Prerequisites
- **Node.js 24+** (required for built-in `node:sqlite` used in API integration tests)
- **npm 10+**

### Setup & Run
```bash
# 1. Clone repository
git clone https://github.com/charlybutar21/stock-mate-v2.git
cd stock-mate-v2

# 2. Install dependencies
npm install

# 3. Apply local Cloudflare D1 migration
npm run db:migrate:local

# 4. Start local dev server (Vite SPA + Cloudflare Worker + Local D1)
npm run dev
```

Open **http://localhost:5173** in your browser.

### Verification Commands
```bash
npm run typecheck      # TypeScript strict check (tsc --noEmit)
npm run lint           # ESLint (TypeScript + React Hooks rules)
npm run test:coverage  # Vitest (100% coverage on src/shared/domain/ + API integration tests)
npm run build          # Production build (Worker + Client SPA)
```

---

## CI/CD Pipeline (GitHub Actions → Cloudflare Workers)

The workflow in [`.github/workflows/ci.yml`](.github/workflows/ci.yml) runs automatically on every **Pull Request** and **Push to `main`**:

1. **CI Verification Job (`verify`):**
   - `npm ci`
   - `npm run typecheck`
   - `npm run lint`
   - `npm run test:coverage` (enforces 100% coverage on `src/shared/domain/` + `EXPLAIN QUERY PLAN` zero table-scan check)
   - `npm run build`
2. **CD Deployment Job (`deploy` — on push to `main`):**
   - Applies versioned D1 migrations (`npx wrangler d1 migrations apply stock-mate-db --remote`)
   - Builds and deploys to Cloudflare Workers (`npm run deploy`)
   - Verifies production readiness via `GET /api/v1/health`

### Enabling Automatic CD in GitHub
Add the following **Repository Secrets** under **Settings → Secrets and variables → Actions**:
- `CLOUDFLARE_API_TOKEN` — Cloudflare API token with **Workers Scripts: Edit** and **D1: Edit** permissions.
- `CLOUDFLARE_ACCOUNT_ID` — Your Cloudflare Account ID.

*(Without these secrets, CI verification still runs and passes cleanly, while the deploy step safely skips with a notice).*

### Manual Production Deploy
```bash
npm run db:migrate:remote
npm run deploy
```

---

## License

MIT
