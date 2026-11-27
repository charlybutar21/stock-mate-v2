# Functional Specification — Stock-Mate v2

> **Document Type:** As-Built Functional Specification  
> **Parent Document:** [README.md](../README.md)  
> **Business Rules Reference:** [business-rules.md](business-rules.md)

---

## Table of Contents

1. [User Personas & Access Model](#1-user-personas--access-model)
2. [Navigation & Workspace Overview](#2-navigation--workspace-overview)
3. [Module 1: Authentication & Session Lifecycle](#3-module-1-authentication--session-lifecycle)
4. [Module 2: Portfolio, All IHSG Screener & Custom Watchlists](#4-module-2-portfolio-all-ihsg-screener--custom-watchlists)
5. [Module 3: Stock Detail, Valuation Workbench & Holding Ledger](#5-module-3-stock-detail-valuation-workbench--holding-ledger)
6. [Module 4: Radar — Quality & Value Screener](#6-module-4-radar--quality--value-screener)
7. [Module 5: Position-Linked IDX Simulator](#7-module-5-position-linked-idx-simulator)
8. [Cross-Cutting UX Capabilities](#8-cross-cutting-ux-capabilities)

---

## 1. User Personas & Access Model

| Role / Actor | Description | Access Scope |
| :--- | :--- | :--- |
| **Guest (Unauthenticated)** | Visitor accessing `/login`, `/register`, health checks, or public catalog snapshot. | `/login`, `/register`, `GET /api/v1/health/*`, `GET /api/v1/catalog/snapshot`, `POST /api/v1/auth/register`, `POST /api/v1/auth/login`, `POST /api/v1/auth/logout`. |
| **Authenticated Retail Investor** | Registered IDX investor with cookie-based session. | Full CRUD on own `watchlist_items` and `custom_watchlists`, read access to `/api/v1/watchlist/catalog`, on-demand `GET /api/v1/market-data/idx/:ticker`, and all SPA screens (`/watchlist`, `/watchlist/:id`, `/radar`, `/simulator`). Strictly isolated from other users' records (anti-IDOR `404`). |
| **Admin / Cron Sync Caller** | Cloudflare Cron Trigger or operator holding `CATALOG_SYNC_SECRET`. | Authorized to invoke `POST /api/v1/watchlist/catalog/sync` with `Authorization: Bearer <CATALOG_SYNC_SECRET>` when the secret is configured (plus authenticated cookie for HTTP route). |

---

## 2. Navigation & Workspace Overview

Authenticated users navigate across three primary sections via the sticky top header on desktop (`md:flex`) and a fixed 3-tab bottom bar on mobile (`md:hidden`) in [`AppShell.tsx`](../src/client/components/ui/AppShell.tsx):

| Route | Component | Primary Purpose |
| :--- | :--- | :--- |
| `/login` | [`LoginPage.tsx`](../src/client/features/auth/LoginPage.tsx) | Email + password sign-in with theme & language switchers. |
| `/register` | [`RegisterPage.tsx`](../src/client/features/auth/RegisterPage.tsx) | Account creation (name, email, password) with automatic login on success. |
| `/watchlist` | [`WatchlistPage.tsx`](../src/client/features/watchlist/WatchlistPage.tsx) | Unified workspace: **My Stocks / Portfolio** (default tab), **All IHSG Stocks** screener, and **Custom Watchlists**. |
| `/watchlist/:id` | [`StockDetailPage.tsx`](../src/client/features/watchlist/StockDetailPage.tsx) | Deep-dive valuation workbench, Core-3 Fair Value range, FQS breakdown, Value Trap Shield, multi-tranche holding editor, and live what-if assumptions. |
| `/radar` | [`RadarPage.tsx`](../src/client/features/radar/RadarPage.tsx) | Institutional 4-track FQS + QARP screener with 1-click smart presets, KPI quick-filters, pillar thresholds, and inline Quality X-Ray modal. |
| `/simulator` | [`SimulatorPage.tsx`](../src/client/features/simulator/SimulatorPage.tsx) | Position-linked IDX trade planner across 4 tabs: **Average Down (Forward)**, **Pyramiding Buy**, **Take-Profit Ladder**, and **Goal-Seek**. |

Unmatched routes (`*`) redirect to `/watchlist` (which redirects unauthenticated users to `/login`).

---

## 3. Module 1: Authentication & Session Lifecycle

Implemented across [`LoginPage.tsx`](../src/client/features/auth/LoginPage.tsx), [`RegisterPage.tsx`](../src/client/features/auth/RegisterPage.tsx), [`useAuth.ts`](../src/client/features/auth/useAuth.ts), and [`auth-routes.ts`](../src/server/modules/auth/infra/auth-routes.ts).

### Functional Requirements

| ID | Feature | Behavior |
| :--- | :--- | :--- |
| **FR-AUTH-01** | **Account Registration** | Accepts `name` (2–80 chars), `email` (trimmed, lowercased, max 254 chars, valid email), `password` (8–128 chars, ≥1 letter and ≥1 digit). On success, creates user + 7-day DB session, sets `HttpOnly` session + 15-minute access cookies, and redirects to `/watchlist`. Duplicate emails return a timing-equalized neutral `400` error to prevent account enumeration. |
| **FR-AUTH-02** | **Sign In** | Validates credentials against PBKDF2-SHA256 hash, rotates any prior session cookie, prunes expired sessions, enforces max 5 active sessions per user (deleting oldest excess), sets auth cookies, clears stale React Query watchlist caches, and enters `/watchlist`. |
| **FR-AUTH-03** | **Session Restoration** | `useMe()` calls `GET /api/v1/auth/me` (`staleTime: 60s`). `401` resolves cleanly to `null` (guest state). |
| **FR-AUTH-04** | **Idempotent Sign Out** | `POST /api/v1/auth/logout` revokes active access token `sid` in KV/local denylist, deletes DB session if valid cookie present, clears all auth cookies (`__Host-*` and non-prefixed), cancels/purges non-auth React Query caches, and immediately navigates to `/login`. |

---

## 4. Module 2: Portfolio, All IHSG Screener & Custom Watchlists

Implemented in [`WatchlistPage.tsx`](../src/client/features/watchlist/WatchlistPage.tsx) and subcomponents under `src/client/features/watchlist/`.

### Functional Requirements

| ID | Feature | Behavior |
| :--- | :--- | :--- |
| **FR-WL-01** | **Portfolio-First Default View (`my_stocks`)** | Opens directly on owned holdings (`ownedLots > 0`). Displays hero KPIs (`PortfolioOverviewSection.tsx`): Total Market Value, Total Invested Capital, Total Unrealized P/L (Rp & %), active stock count, Privacy Mask toggle, and `Broker Gross` vs `Net After Fees` switcher. Empty portfolios present beginner onboarding CTAs (*Explore Radar* / *Record Owned Stock*). |
| **FR-WL-02** | **Progressive Disclosure Allocation X-Ray** | Displays a compact 1-line concentration status bar (`Balanced` vs `Concentration Alert`) that expands into [`PortfolioRiskXrayCard.tsx`](../src/client/features/watchlist/PortfolioRiskXrayCard.tsx) showing interactive SVG donut charts for **Single-Stock Weight** (alert `> 25%`) and **Sector Weight** (alert `> 40%`), grouping overflow beyond 8 slices into "Others" with toggleable expansion. |
| **FR-WL-03** | **All IHSG Stocks Screener (`all`)** | Displays paginated active IHSG common stocks (`pageSize`: default `10`, selectable `10 / 50 / 100`) backed by `/api/v1/watchlist/catalog`. Shows ticker, company, sector, intraday `openPrice` / `dailyChange` / `dailyChangePct` (`IntradayPriceCell.tsx`), `currentPrice`, Fair Value Moderate, MoS %, FQS Grade badge, Value Trap badge, and user position/custom-list indicators. |
| **FR-WL-04** | **Unified Screener Filter Toolbar** | [`WatchlistFilterToolbar.tsx`](../src/client/features/watchlist/WatchlistFilterToolbar.tsx) supports debounced search (ticker/company, 220ms), IDX sector filter (11 sectors), Valuation Status filter, FQS Quality Grade (`S–E`), MoS preset/range (`minMos`/`maxMos`), Liquidity toggle (`ADTV ≥ Rp 1B`), Safe-from-High-Risk-Trap toggle, and sorting (`mos_desc`, `fqs_desc`, `qarp_desc`, etc.). |
| **FR-WL-05** | **Custom Watchlists (`custom`)** | Users can create up to **30** named custom watchlists (`CustomWatchlistModal.tsx`) with up to **100** tickers each, rename/edit descriptions, soft-delete lists, quick-add tickers via live catalog autocomplete (`CustomWatchlistQuickAdd.tsx`) or per-row menu (`AddToWatchlistMenu.tsx`), and remove tickers. |
| **FR-WL-06** | **Personal Stock CRUD & Auto-Fetch** | [`StockFormModal.tsx`](../src/client/features/watchlist/StockFormModal.tsx) allows adding/editing personal stocks (max **200** active per user) with 1-click live IDX data fetch (`GET /api/v1/market-data/idx/:ticker`), multi-tranche holding entry (`HoldingTranchesEditor.tsx`), target buy price, investment thesis, and custom valuation overrides. |
| **FR-WL-07** | **Seamless Catalog-to-Detail Ensure Flow** | Clicking any catalog stock not yet in the user's personal `watchlist_items` invokes `POST /api/v1/watchlist/ensure` to materialize a personal record seeded from `idx_stocks` (or live quote fallback) and navigates straight to `/watchlist/:id` or `/simulator?stockId=:id`. |
| **FR-WL-08** | **Batch Sync** | Users can sync all personal tracked items against the latest shared `idx_stocks` catalog (with upstream batch fallback for unlisted tickers) via `POST /api/v1/watchlist/sync-all`. |

---

## 5. Module 3: Stock Detail, Valuation Workbench & Holding Ledger

Implemented in [`StockDetailPage.tsx`](../src/client/features/watchlist/StockDetailPage.tsx).

| ID | Feature | Behavior |
| :--- | :--- | :--- |
| **FR-DET-01** | **Core-3 Fair Value Breakdown & Range Bar** | Displays actual market ratios (P/E, P/B, Dividend Yield, PEG), individual Fair Value cards for **Relative P/E**, **Relative P/B**, and **5-Year Simple DCF** (showing explicit `N/A` reason codes when inputs are invalid/missing), plus visual [`FairValueRangeBar.tsx`](../src/client/features/watchlist/FairValueRangeBar.tsx) plotting Current Price against Conservative, Moderate (median), and Optimistic bounds. |
| **FR-DET-02** | **Interactive What-If Assumptions Workbench** | Users can tweak `targetPer`, `targetPbv`, and `discountRatePct` in real time using client-side `calculateValuation()` without network latency, reset drafts, or persist customized benchmarks via `PATCH /api/v1/watchlist/:id`. |
| **FR-DET-03** | **Fundamental Quality X-Ray & Value Trap Shield** | Renders [`QualityBreakdownCard.tsx`](../src/client/features/radar/QualityBreakdownCard.tsx) (4 pillar scores, track label, grade S–E, applied weak-link caps, Piotroski F-Score, Altman Z-Score, ADTV) alongside ROE/DER quality flags and IHSG Value Trap Shield warnings (`CLEAR` / `WATCH` / `HIGH_RISK`). |
| **FR-DET-04** | **Multi-Entry Holding Tranches Ledger** | [`HoldingTranchesEditor.tsx`](../src/client/features/watchlist/HoldingTranchesEditor.tsx) lets users maintain up to **20** buy tranches (`{ lots, buyPrice }` with 2-decimal precision & Stockbit auto-formatting), automatically computing weighted average buy price, cost basis, market value, and unrealized P/L. |
| **FR-DET-05** | **On-Demand Single Stock Sync & Simulator Deep-Link** | One-click refresh fetches `GET /api/v1/market-data/idx/:ticker` and patches the stock's price + fundamentals. A prominent action links directly to `/simulator?stockId=:id`. |

---

## 6. Module 4: Radar — Quality & Value Screener

Implemented in [`RadarPage.tsx`](../src/client/features/radar/RadarPage.tsx), [`RadarFilterPanel.tsx`](../src/client/features/radar/RadarFilterPanel.tsx), and [`RadarResultsList.tsx`](../src/client/features/radar/RadarResultsList.tsx).

| ID | Feature | Behavior |
| :--- | :--- | :--- |
| **FR-RAD-01** | **KPI Quick-Filter Cards** | Interactive 4-card header strip displaying total IHSG stocks (with FQS-scored count), **Prime Opportunities** (`qarpQuadrant=PRIME_OPPORTUNITY`), **Elite/Strong Quality** (Grade S & A counts), and **Undervalued** count — clicking applies the corresponding filter immediately. |
| **FR-RAD-02** | **1-Click Smart Presets** | Five built-in presets in [`RadarPage.tsx`](../src/client/features/radar/RadarPage.tsx#L60-L100):<br/>• **All Stocks** (`fqs_desc`)<br/>• **Prime Opportunity** (`minMos=20`, `minFqs=76`, `minProfitability=65`, `minHealth=60`, `minAdtvBillion=1`, `excludeHighRiskTrap=true`, `sort=qarp_desc`)<br/>• **Compounders** (`minFqs=82`, `minProfitability=75`, `minGrowth=65`, `minCashFlow=70`, `minAdtvBillion=1`, `excludeHighRiskTrap=true`, `sort=fqs_desc`)<br/>• **Fortress Cash** (`minMos=15`, `minHealth=80`, `minCashFlow=80`, `minAdtvBillion=1`, `excludeHighRiskTrap=true`, `sort=qarp_desc`)<br/>• **GARP (Growth & Discount)** (`minMos=15`, `minGrowth=75`, `minProfitability=60`, `minAdtvBillion=1`, `excludeHighRiskTrap=true`, `sort=qarp_desc`) |
| **FR-RAD-03** | **1-Control-Per-Dimension & Collapsible Advanced Filters** | Primary filters cover search, sector, sort (9 sort orders), Grade pills (`S–E`), Valuation Status pills, Liquidity (`ADTV ≥ Rp 1B`), and Trap Shield toggle. Collapsible drawer exposes numeric thresholds for `minFqs`, `minMos`, all 4 individual pillars (`minProfitability`, `minGrowth`, `minHealth`, `minCashFlow`), `minAdtvBillion`, and `minPiotroski` (0–9). |
| **FR-RAD-04** | **Inline Quality X-Ray Modal & Actions** | Users can inspect any stock's full 4-pillar FQS breakdown in a modal without leaving Radar, add to custom watchlists, open Stock Detail, or jump to Simulator. |

---

## 7. Module 5: Position-Linked IDX Simulator

Implemented in [`SimulatorPage.tsx`](../src/client/features/simulator/SimulatorPage.tsx) and its 4 mode tabs. All calculations execute synchronously in the browser via [`src/shared/domain/simulator.ts`](../src/shared/domain/simulator.ts) with global configurable Buy Fee (default `0.15%`), Sell Fee (default `0.25%`), and optional Bea Materai (`Rp 10,000` when transaction `> Rp 10,000,000`).

| Tab | File | Inputs | Outputs & Guardrails |
| :--- | :--- | :--- | :--- |
| **1. Average Down (Forward)** | [`ForwardTab.tsx`](../src/client/features/simulator/ForwardTab.tsx) | Existing lots & avg buy price (auto-seeded from selected stock), up to **5** planned buy tranches (IDX tick-stepped price inputs), target sell price. | New total lots/shares, pure avg vs effective avg (with buy fee), exact `bepRaw` and **Real IDX Tick BEP** (`bepIdxTick`), gain-to-BEP before vs after %, planned cash required, projected net proceeds & net P/L. Guardrails warn if effective avg exceeds Moderate Fair Value (`isAboveFairValue`) or if averaging up (`isAverageUp`). |
| **2. Pyramiding Buy** | [`PyramidingTab.tsx`](../src/client/features/simulator/PyramidingTab.tsx) | Existing position, total IDR cash budget, reference price, step discount (`1%–30%`), strategy (`20/30/50`, `33/33/34`, `15/35/50`), target sell price. | 3 IDX tick-aligned limit buy stages (`floorToIdxTick`), per-stage lots/cash/unused cash, cumulative lots & average, reconciled total cash used (including stamp duty reserve if enabled), idle cash, and full forward simulation summary. |
| **3. Take-Profit Ladder** | [`TakeProfitTab.tsx`](../src/client/features/simulator/TakeProfitTab.tsx) | Owned lots, average buy price, 1–5 exit rungs (1-click auto-fill from Conservative / Moderate / Optimistic Fair Value in 30%/40%/30% split). | Per-rung gross/net proceeds, fees, allocated cost basis, realized net P/L (Rp & %), remaining lots, unrecovered capital, remaining effective cost/share, and **100% Free-Ride** status badge when initial capital is fully recovered. |
| **4. Goal-Seek** | [`GoalSeekTab.tsx`](../src/client/features/simulator/GoalSeekTab.tsx) | Existing lots, existing avg price, planned buy price, desired target pure average (`plannedBuyPrice < targetPureAvg < existingAvgPrice`). | Exact integer `lotsNeeded` (rounded up via `Math.ceil`), shares needed, resulting pure average, gross cash, buy fee, optional stamp duty, and total cash required. |

---

## 8. Cross-Cutting UX Capabilities

- **Bilingual Internationalization (EN / ID):** Full English ([`en.ts`](../src/client/i18n/en.ts)) and Bahasa Indonesia ([`id.ts`](../src/client/i18n/id.ts)) dictionaries loaded lazily; auto-detects `navigator.language` on first visit and persists in `localStorage` (`stockmate_lang`). Includes beginner-friendly glossary tooltips (`TermTooltip`) on financial terms.
- **Light & Dark Theme:** Stockbit-inspired Emerald light theme and Deep Slate dark trading terminal theme (`src/client/index.css`) with WCAG AA contrast and pre-paint initialization ([`public/theme-init.js`](../public/theme-init.js)) to prevent flash of unstyled content.
- **Privacy Mode (`usePrivacy.tsx`):** One-click eye toggle masks IDR monetary values (`Rp •••••••`) and lot counts (`•••`) for viewing portfolios in public.
- **Broker Gross vs Net Mode (`useCalcMode.tsx`):** Persisted toggle switching portfolio P&L display between `BROKER_GROSS` (default in UI, matches Stockbit gross portfolio display) and `NET_AFTER_FEES` (adds `0.15%` buy fee and deducts `0.25%` sell fee).
- **Stockbit-Standard Number Parsing & Formatting (`formatters.ts`):** Formats IDR with comma thousands and dot decimals (`Rp 4,825.67`) using non-breaking spaces (`\u00A0`) to prevent line breaks; parses both US/Stockbit (`4,825.67`) and Indonesian (`4.825,67`) pasted inputs cleanly.
- **IDX Price Tick Steppers (`IdxPriceInput`):** Up/down buttons step prices accurately across all 5 official IDX price tick brackets, including exact boundary transitions (e.g., `200` down → `199`, `5000` down → `4990`).
- **Responsive Zero-Horizontal-Scroll Layout:** Dedicated card layouts on mobile (`md:hidden`) and compact tabular views on desktop (`hidden md:block`).
