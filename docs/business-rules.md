# Business Logic and Business Rules — Stock-Mate v2

> **Document Type:** As-Built Business Rules & Formula Specification  
> **Parent Document:** [README.md](../README.md)  
> **Source of Truth:** [`src/shared/domain/`](../src/shared/domain/)

All business rules documented below are directly verified against the production TypeScript domain modules and server use cases.

---

## Table of Contents

1. [IDX / BEI Market Rules & Constants](#1-idx--bei-market-rules--constants)
2. [Core-3 Intrinsic Valuation Engine](#2-core-3-intrinsic-valuation-engine)
3. [IHSG Value Trap Shield & Quality Flags](#3-ihsg-value-trap-shield--quality-flags)
4. [4-Track Fundamental Quality Score (FQS v2)](#4-4-track-fundamental-quality-score-fqs-v2)
5. [QARP Quadrant Classification & Ranking](#5-qarp-quadrant-classification--ranking)
6. [Position Valuation & Portfolio Risk X-Ray](#6-position-valuation--portfolio-risk-xray)
7. [Simulation Engines (Forward, Pyramiding, Take-Profit, Goal-Seek)](#7-simulation-engines-forward-pyramiding-take-profit-goal-seek)
8. [Sector Classification & Benchmark Multiples](#8-sector-classification--benchmark-multiples)
9. [Account, Quotas & Data Integrity Rules](#9-account-quotas--data-integrity-rules)

---

## 1. IDX / BEI Market Rules & Constants

Source: [`src/shared/domain/idx-rules.ts`](../src/shared/domain/idx-rules.ts)

| Constant / Rule | Exact Value | Notes |
| :--- | :--- | :--- |
| `SHARES_PER_LOT` | `100` shares | Standard IDX lot size. |
| `MIN_IDX_PRICE` | `Rp 1` | Supports FCA / watchboard sub-50 stocks down to Rp 1. |
| `MAX_IDX_PRICE` | `Rp 100,000,000` | Input contract ceiling ([`watchlist.ts`](../src/shared/contracts/watchlist.ts)). |
| `DEFAULT_BUY_FEE_PCT` | `0.15%` | Standard Indonesian retail broker buy commission + exchange levy. |
| `DEFAULT_SELL_FEE_PCT` | `0.25%` | Standard retail sell commission + exchange levy + `0.1%` Final Income Tax (PPh Final). |
| `STAMP_DUTY_THRESHOLD_IDR` | `Rp 10,000,000` | Bea Materai applies strictly when gross value `> Rp 10,000,000` (not `>=`). |
| `STAMP_DUTY_IDR` | `Rp 10,000` | Optional toggle (defaults to `false` because IDX applies stamp duty per daily Trade Confirmation rather than per holding). |
| `STALE_THRESHOLD_MS` | `14 days` (`1,209,600,000 ms`) | Flags stocks whose `updatedAt` / `syncedAt` is older than 14 days (`isStale = true`). |

### Official IDX Price Tick Fractions (`getIdxTickSize`)

| Price Range (IDR) | Tick Size (IDR) | `ceilToIdxTick` Example | `floorToIdxTick` Example | `stepIdxPrice(..., 'down')` Boundary |
| :--- | :---: | :--- | :--- | :--- |
| `< 200` | `1` | `199.1 → 200` | `199.9 → 199` | `200 → 199` |
| `200 – 499` | `2` | `201 → 202` | `201 → 200` | `500 → 498` |
| `500 – 1,999` | `5` | `501 → 505` | `504 → 500` | `2000 → 1995` |
| `2,000 – 4,999` | `10` | `2001 → 2010` | `2009 → 2000` | `5000 → 4990` |
| `≥ 5,000` | `25` | `5001 → 5025` | `5024 → 5000` | `5025 → 5000` |

---

## 2. Core-3 Intrinsic Valuation Engine

Source: [`src/shared/domain/valuation.ts`](../src/shared/domain/valuation.ts)

### Market Ratios

- **Current P/E (`currentPer`):** `round2(currentPrice / eps)` if `eps > 0`, else `null`.
- **Current P/B (`currentPbv`):** `round2(currentPrice / bvps)` if `bvps > 0`, else `null`.
- **Dividend Yield (`dividendYieldPct`):** `round2((dps / currentPrice) * 100)` if `dps > 0`, else `0`.
- **PEG Ratio (`pegRatio`):** `round2(currentPer / epsGrowthPct)` if `currentPer != null` and `epsGrowthPct > 0`, else `null`.

### Three Valuation Methods

Default DCF assumptions: `discountRatePct = 12.0%`, `projectionYears = 5`, `terminalGrowthPct = 4.0%`.

1. **Relative P/E (`relativePer`):**
   - Valid when `eps > 0` and `targetPer > 0`.
   - Formula: $\text{FV}_{\text{PER}} = \max(1, \text{round}(\text{EPS} \times \text{TargetPER}))$
   - Invalid reason code: `REQUIRES_POSITIVE_EPS_AND_TARGET_PER`.
2. **Relative P/B (`relativePbv`):**
   - Valid when `bvps > 0` and `targetPbv > 0`.
   - Formula: $\text{FV}_{\text{PBV}} = \max(1, \text{round}(\text{BVPS} \times \text{TargetPBV}))$
   - Invalid reason code: `REQUIRES_POSITIVE_BVPS_AND_TARGET_PBV`.
3. **5-Year Simple DCF (`simpleDcf`):**
   - Valid when `eps > 0`, `epsGrowthPct > -100`, `r > gt` (where $r = \text{discountRatePct}/100$, $g_t = \text{terminalGrowthPct}/100$), and `projectionYears >= 1`.
   - Effective growth clamped to $[-20\%, +20\%]$: $g_{\text{eff}} = \text{clamp}(\text{epsGrowthPct}/100, -0.20, +0.20)$ to prevent extreme earnings swings from inverting DCF signs.
   - Formula:
     $$\text{FV}_{\text{DCF}} = \max\left(1, \text{round}\left(\sum_{t=1}^{N} \frac{\text{EPS}(1+g_{\text{eff}})^t}{(1+r)^t} + \frac{\text{EPS}(1+g_{\text{eff}})^N (1+g_t)}{(r - g_t)(1+r)^N}\right)\right)$$
   - Invalid reason code: `REQUIRES_POSITIVE_EPS_AND_VALID_DCF_RATES`.

### Fair Value Range, Margin of Safety & Status

From the sorted array of valid method fair values `validValues`:
- **Conservative:** `validValues[0]` (minimum)
- **Moderate:** Median (`validValues[mid]` if odd count; `Math.round((v[mid-1] + v[mid]) / 2)` if even count)
- **Optimistic:** `validValues[validValues.length - 1]` (maximum)
- **Margin of Safety (`mosPct`):**
  $$\text{MoS\%} = \text{round2}\left(\frac{\text{FV}_{\text{moderate}} - \text{currentPrice}}{\text{FV}_{\text{moderate}}} \times 100\right)$$

| Valuation Status | Condition |
| :--- | :--- |
| `UNDERVALUED` | `validCount > 0` and `mosPct >= 30%` |
| `FAIRLY_VALUED` | `validCount > 0` and `0% <= mosPct < 30%` |
| `OVERVALUED` | `validCount > 0` and `mosPct < 0%` |
| `INSUFFICIENT_DATA` | `validCount === 0` |

---

## 3. IHSG Value Trap Shield & Quality Flags

Source: [`src/shared/domain/valuation.ts`](../src/shared/domain/valuation.ts#L109-L188)

### ROE & DER Flags

| Flag | Rule |
| :--- | :--- |
| **ROE Flag** | `null → UNKNOWN`; `>= 15% → STRONG`; `>= 8% → MODERATE`; `< 8% → WEAK`. |
| **DER Flag** | `sector === 'FINANCIALS' → NOT_APPLICABLE_BANKING`; `null → UNKNOWN`; `< 1.0 → HEALTHY`; `<= 2.0 → MODERATE`; `> 2.0 → HIGH_LEVERAGE`. |

### Value Trap Warning Rules

| Warning Code | Trigger Condition |
| :--- | :--- |
| `CYCLICAL_PEAK_WARNING` | Sector is `ENERGY` or `BASIC_MATERIALS` **AND** (`currentPer <= 6` **OR** `mosPct >= 25%`). |
| `SHRINKING_EARNINGS_TRAP` | (`mosPct >= 0%` **OR** `currentPbv < 1`) **AND** (`epsGrowthPct < 0%` **OR** `eps <= 0`). |
| `LOW_ROE_VALUE_TRAP` | `mosPct >= 15%` **AND** `roePct < 8%`. |
| `HIGH_LEVERAGE_TRAP` | `sector !== 'FINANCIALS'` **AND** `der > 1.5` **AND** `mosPct >= 0%`. |

### Risk Level Escalation

- **`CLEAR`:** 0 warnings.
- **`HIGH_RISK`:** `warnings.length >= 2`, **OR** warnings include `SHRINKING_EARNINGS_TRAP`, **OR** warnings include `HIGH_LEVERAGE_TRAP`.
- **`WATCH`:** Exactly 1 warning that is neither `SHRINKING_EARNINGS_TRAP` nor `HIGH_LEVERAGE_TRAP` (i.e., `CYCLICAL_PEAK_WARNING` or `LOW_ROE_VALUE_TRAP` alone).

---

## 4. 4-Track Fundamental Quality Score (FQS v2)

Source: [`src/shared/domain/quality-score.ts`](../src/shared/domain/quality-score.ts)

### Accounting Tracks & Pillar Weights

| Quality Track | Mapped IDX Sectors | Profitability | Growth | Financial Health | Cash Flow |
| :--- | :--- | :---: | :---: | :---: | :---: |
| **`FINANCIALS`** | `FINANCIALS` | **35%** | **20%** | **30%** | **15%** |
| **`CYCLICALS`** | `ENERGY`, `BASIC_MATERIALS` | **25%** | **15%** | **35%** | **25%** |
| **`PROPERTY_INFRA`** | `PROPERTY_REAL_ESTATE`, `INFRASTRUCTURE` | **25%** | **20%** | **30%** | **25%** |
| **`NON_FINANCIALS`** | `CONSUMER_NON_CYCLICALS`, `CONSUMER_CYCLICALS`, `HEALTHCARE`, `TECHNOLOGY`, `INDUSTRIALS`, `TRANSPORTATION_LOGISTICS` | **30%** | **25%** | **25%** | **20%** |

### Pillar Sub-Metrics & Piecewise Linear Breakpoints

Metrics are scored `0–100` via piecewise linear interpolation (`interpolateAscending` / `interpolateDescending`), then averaged by weight across available metrics within each pillar.

#### Pillar 1: Profitability
- **`FINANCIALS`:**
  - `roePct` (weight 45): `0→0, 10→40, 16→80, 22→100`
  - `roaPct` (weight 35): `0→0, 1.0→40, 2.0→80, 3.2→100`
  - `netMarginPct` (weight 20): `0→0, 12→40, 24→80, 38→100`
- **All Other Tracks:**
  - `roePct` (weight 30): `0→0, 8→35, 15→78, 24→100`
  - `roicPct` (weight 30): `0→0, 6→35, 13→78, 20→100`
  - `operatingMarginPct` (weight 20): `0→0, 8→40, 16→78, 26→100`
  - `netMarginPct` (weight 20): `0→0, 5→40, 13→78, 22→100`

#### Pillar 2: Growth (All Tracks)
- `revenueGrowthPct` (weight 40): `-10→0, 0→22, 8→62, 16→85, 28→100`
- `bottomLineGrowth` (`epsGrowthPct ?? netIncomeGrowthPct`, weight 45): `-15→0, 0→22, 10→62, 22→86, 35→100`
- Operating Leverage (`scoreOperatingLeverage`, weight 15):
  - `revGrowth > 0 && bottomLineGrowth >= revGrowth → 100`
  - `revGrowth > 0 && bottomLineGrowth > 0 → 65`
  - `revGrowth > 0 || bottomLineGrowth > 0 → 25`
  - Both `<= 0 → 0`; either `null → null`

#### Pillar 3: Financial Health
- **`FINANCIALS`** (zero ROA double-counting):
  - `equityToAssetsPct` (weight 55): `5→0, 8→35, 11→68, 14→88, 18→100`
  - `wholesaleDer` (weight 45, descending): `0.3→100, 0.9→80, 1.8→48, 3.5→0`
- **`PROPERTY_INFRA`** (capital-intensive calibrated):
  - `der` (weight 35, descending): `0.4→100, 1.0→75, 1.8→45, 2.8→15, 4.0→0`
  - `netDebtToEbitda` (weight 35, descending): `0→100, 1.8→78, 3.2→48, 5.0→15, 7.0→0`
  - `currentRatio` (weight 30): `0.7→0, 1.0→30, 1.3→60, 1.8→85, 2.4→100`
- **`NON_FINANCIALS` & `CYCLICALS`:**
  - `der` (weight 35, descending): `0.25→100, 0.65→78, 1.1→48, 1.8→18, 2.8→0`
  - `netDebtToEbitda` (weight 35, descending): `0→100, 1.0→82, 2.0→55, 3.2→22, 4.5→0`
  - `currentRatio` (weight 30): `0.7→0, 1.0→30, 1.3→58, 1.6→82, 2.2→100`

#### Pillar 4: Cash Flow Quality
- Cash Conversion Ratio (`ccrScore`):
  - If `cfoToNetIncome != null`: `0→0, 0.45→25, 0.75→58, 0.95→82, 1.15→100`
  - Else if `eps <= 0` and `cfoPositive != null`: `cfoPositive ? 25 : 0`
  - Else `null`
- **`FINANCIALS`:**
  - `ccrScore ?? (cfoPositive == null ? null : cfoPositive ? 65 : 15)` (weight 40)
  - `fcfPositive` (`true→80`, `false→20`, `null→null`) (weight 20)
  - Dividend Yield (`(dps / currentPrice) * 100`, weight 40): `0→0, 1.0→30, 2.5→60, 4.0→84, 6.0→100`
- **All Other Tracks:**
  - `ccrScore` (weight 40)
  - `fcfMarginPct` (weight 30): `0→0, 1.5→30, 6→62, 11→84, 16→100`
  - `fcfYieldPct` (weight 30): `0→0, 1.5→30, 3.5→60, 6→84, 9→100`

### Composite Aggregation & 7 Weak-Link Caps

- Requires at least **`MIN_PILLARS_FOR_SCORE = 2`** scored pillars; otherwise `score = null`, `grade = 'INSUFFICIENT_DATA'`.
- Any missing pillar (when 2–3 pillars exist) substitutes `MISSING_PILLAR_FALLBACK_SCORE = 35` into the weighted average (`rawCompositeScore`).
- Next, **7 sequential Weak-Link caps** clamp the composite score if exceeded:

| # | Cap Code | Trigger Condition | Score Cap |
| :-: | :--- | :--- | :---: |
| 1 | `LOSS_MAKING_OR_WEAK_PROFITABILITY` | `eps <= 0` **OR** `profitability.score < 25` | **45** |
| 2 | `WEAK_FINANCIAL_HEALTH` | `financialHealth.score < 30` | **50** |
| 3 | `FINANCIAL_DISTRESS_ALTMAN_Z` | Non-Financials **AND** `altmanZScore < 1.8` | **55** |
| 4 | `WEAK_CASH_FLOW_QUALITY` | Non-Financials **AND** `cashFlow.score < 25` | **58** |
| 5 | `HIGH_RISK_VALUE_TRAP` | `valueTrapRiskLevel === 'HIGH_RISK'` | **68** |
| 6 | `INCOMPLETE_PILLAR_COVERAGE` | `availablePillars < 4` | **74** |
| 7 | `LOW_ROE_OR_REVENUE_CONTRACTION` | (`FINANCIALS` & `roePct < 10%`) **OR** `revenueGrowthPct < -5%` | **74** |

### Strict 6-Tier Grade Scale (`evaluateGrade`)

| Grade | Score Range | Interpretation |
| :---: | :---: | :--- |
| **`S`** | `88 – 100` | Elite Institutional Compounder |
| **`A`** | `76 – 87` | Very Strong Quality |
| **`B`** | `64 – 75` | Good Quality |
| **`C`** | `50 – 63` | Average Quality |
| **`D`** | `35 – 49` | Weak Quality |
| **`E`** | `0 – 34` | Critical / Distressed |
| **`INSUFFICIENT_DATA`** | `null` | Fewer than 2 scored pillars |

---

## 5. QARP Quadrant Classification & Ranking

Source: [`src/shared/domain/quality-score.ts`](../src/shared/domain/quality-score.ts#L203-L224) and [`L628-L645`](../src/shared/domain/quality-score.ts#L628-L645)

| QARP Quadrant | Exact Condition |
| :--- | :--- |
| `PRIME_OPPORTUNITY` | `mosPct >= 20%` **AND** `score >= 76` **AND** `valueTrapRiskLevel !== 'HIGH_RISK'` |
| `QUALITY_FAIR_PRICE` | `0% <= mosPct < 20%` **AND** `score >= 76` |
| `VALUE_TRAP_RISK` | `mosPct >= 20%` **AND** `score < 50` |
| `DEEP_VALUE_TURNAROUND` | `mosPct >= 20%` **AND** `score >= 50` (not qualifying as Prime Opportunity) |
| `OVERVALUED_OR_UNRATED` | All other cases (including `score === null`, `mosPct === null`, or `mosPct < 0%`) |

### QARP Composite Rank Score (`computeQarpRankScore`, used by `sort=qarp_desc`)

- If `fqs === null`, returns `-Infinity`.
- $\text{mosComponent} = \text{mosPct} === \text{null} \ ? \ 25 : \text{clamp}\left(\frac{\text{mosPct} + 20}{80} \times 100, 0, 100\right)$ (caps MoS reward at `+60%` so statistical outliers do not override quality).
- $\text{trapPenalty} = 25 \text{ (HIGH\_RISK)}, \ 5 \text{ (WATCH)}, \ 0 \text{ (CLEAR)}$.
- $\text{QarpRank} = \text{round2}(\text{FQS} \times 0.6 + \text{mosComponent} \times 0.4 - \text{trapPenalty})$.

---

## 6. Position Valuation & Portfolio Risk X-Ray

Source: [`src/shared/domain/simulator.ts`](../src/shared/domain/simulator.ts#L249-L582)

### Multi-Tranche Aggregation (`aggregateHoldingTranches`)
- Valid tranches have integer `lots > 0` and `buyPrice >= 1` (rounded to 2 decimals via Zod `round2`).
- Weighted average: `avgBuyPrice = round2(sum(lots * buyPrice) / sum(lots))`.
- Persisted with fixed-point integer precision (`avg_buy_price_x100 = Math.round(avgBuyPrice * 100)`), eliminating float drift.

### Calculation Modes (`calculatePositionSummary`)
- **`BROKER_GROSS`** (UI default in [`useCalcMode.tsx`](../src/client/lib/useCalcMode.tsx)): Sets effective buy/sell fees and stamp duty to `0` so displayed return % matches Stockbit gross portfolio screens.
- **`NET_AFTER_FEES`** (domain function default):
  - `grossCostBasis = Math.round(ownedShares * avgBuyPrice)`
  - `estimatedBuyFee = Math.round(grossCostBasis * buyFeePct / 100)`
  - `costBasis = grossCostBasis + estimatedBuyFee`
  - `estimatedSellFee = Math.round(grossMarketValue * sellFeePct / 100)`
  - `estimatedSellStampDuty = includeStampDuty && grossMarketValue > 10_000_000 ? 10_000 : 0`
  - `marketValue = Math.max(0, grossMarketValue - estimatedSellFee - estimatedSellStampDuty)`
  - `unrealizedPnL = marketValue - costBasis`, `unrealizedPnLPct = round2((unrealizedPnL / costBasis) * 100)`.

### Portfolio Concentration Thresholds (`analyzePortfolioRisk`)
- Concentration alerts fire **only when `activeHoldingsCount >= 2`** (prevents false alarms for a beginner's first single stock):
  - `SINGLE_STOCK_CONCENTRATION`: Stock `weightPct > 25%` (`MAX_SINGLE_STOCK_WEIGHT_PCT`).
  - `SECTOR_CONCENTRATION`: Sector `weightPct > 40%` (`MAX_SECTOR_WEIGHT_PCT`).

---

## 7. Simulation Engines (Forward, Pyramiding, Take-Profit, Goal-Seek)

Source: [`src/shared/domain/simulator.ts`](../src/shared/domain/simulator.ts)

| Engine | Core Formulas & Validation Constraints |
| :--- | :--- |
| **Forward Average Down** | Max 5 planned tranches. `totalCost = totalGrossBuy + Math.round(totalGrossBuy * fBuy) + stampDutyBuy`. Exact BEP: `bepBase = totalCost / (totalShares * (1 - fSell))`; if `includeStampDuty && totalShares * bepBase > 10_000_000`, `bepRaw = (totalCost + 10_000) / (totalShares * (1 - fSell))`. Official tick BEP: `bepIdxTick = ceilToIdxTick(bepRaw)`. |
| **Pyramiding Buy Planner** | 3 stages with `stepDiscountPct` in `[1, 30]`. Strategies: `PYRAMID_20_30_50`, `EQUAL_33_33_34`, `AGGRESSIVE_15_35_50`. Reserves `Rp 10,000` stamp duty upfront if `includeStampDuty && totalCashBudget > 10_000_000`. Stage $i \in \{0,1,2\}$ trigger price = `floorToIdxTick(referencePrice * (1 - i * stepDiscountPct / 100))`. Reconciles final total cash via `simulateForwardAverageDown`. |
| **Take-Profit Ladder** | 1–5 exit rungs; `sum(lotsToSell) <= totalOwnedLots`. Each rung computes gross proceeds, sell fee, optional per-rung stamp duty (`> Rp 10M`), net proceeds, and pro-rata allocated cost basis. `unrecoveredCapital = max(0, totalInitialCostBasis - totalNetProceeds)`. **`isFreeRidePosition = remainingLots > 0 && unrecoveredCapital === 0`**. |
| **Goal-Seek** | Requires `plannedBuyPrice < targetPureAvg < existingAvgPrice`. Formula: $\text{lotsNeeded} = \left\lceil \frac{\text{existingLots} \times (\text{existingAvg} - \text{targetAvg})}{\text{targetAvg} - \text{plannedBuyPrice}} \right\rceil$. |

---

## 8. Sector Classification & Benchmark Multiples

Source: [`src/server/modules/market-data/domain/market-data.types.ts`](../src/server/modules/market-data/domain/market-data.types.ts)

| IDX-IC Sector | Default `targetPer` | Default `targetPbv` | Special Mapping Notes |
| :--- | :---: | :---: | :--- |
| `FINANCIALS` | `15.0x` | `2.5x` | `der` & `currentRatio` stored as `null`; `wholesaleDer` populated separately. |
| `CONSUMER_NON_CYCLICALS` | `18.0x` | `3.5x` | Consumer defensive / non-durables / staples. |
| `CONSUMER_CYCLICALS` | `14.0x` | `2.0x` | Consumer discretionary / durables / services / retail. |
| `ENERGY` | `8.0x` | `1.5x` | Cyclicals FQS track + Value Trap cyclical peak warning. |
| `BASIC_MATERIALS` | `12.0x` | `1.5x` | Non-energy minerals / process industries; Cyclicals track. |
| `INFRASTRUCTURE` | `16.0x` | `2.2x` | Communications / utilities; Property/Infra FQS track. |
| `HEALTHCARE` | `22.0x` | `3.5x` | Non-Financials FQS track. |
| `TECHNOLOGY` | `20.0x` | `2.5x` | Non-Financials FQS track. |
| `PROPERTY_REAL_ESTATE` | `12.0x` | `1.0x` | Checked **before** `FINANCIALS` in `mapYahooSectorToIdx` because TradingView nests Real Estate under Finance. |
| `INDUSTRIALS` | `12.0x` | `1.8x` | Default fallback sector when upstream taxonomy is unrecognized. |
| `TRANSPORTATION_LOGISTICS` | `12.0x` | `1.5x` | Matches shipping, airlines, logistics, trucking, marine industries. |

---

## 9. Account, Quotas & Data Integrity Rules

| Entity / Rule | Limit / Constraint | Enforced In |
| :--- | :--- | :--- |
| **IDX Ticker Format** | Strictly 4 uppercase ASCII letters (`/^[A-Z]{4}$/`), excluding warrants, rights, bonds, and ETFs. | [`watchlist.ts`](../src/shared/contracts/watchlist.ts), [`tradingview-provider.ts`](../src/server/modules/market-data/infra/tradingview-provider.ts) |
| **Active Watchlist Items per User** | Max **200** active items (`deleted_at IS NULL`). Unique `(user_id, ticker)` among active rows (soft-deleted tickers can be re-added). | [`watchlist-use-cases.ts`](../src/server/modules/watchlist/application/watchlist-use-cases.ts), [`0001_initial.sql`](../migrations/0001_initial.sql) |
| **Holding Tranches per Stock** | Max **20** tranches (`lots`: `1..100,000,000`; `buyPrice`: `1..100,000,000`, 2 decimals). | [`watchlist.ts`](../src/shared/contracts/watchlist.ts) |
| **Custom Watchlists per User** | Max **30** active groups; unique case-insensitive name per user (`uq_custom_watchlists_user_name_active`). | [`custom-watchlist-use-cases.ts`](../src/server/modules/watchlist/application/custom-watchlist-use-cases.ts), [`0005_idx_catalog_and_custom_watchlists.sql`](../migrations/0005_idx_catalog_and_custom_watchlists.sql) |
| **Tickers per Custom Watchlist** | Max **100** unique tickers per group. | [`custom-watchlist-use-cases.ts`](../src/server/modules/watchlist/application/custom-watchlist-use-cases.ts) |
| **Active Sessions per User** | Max **5** concurrent DB sessions; oldest excess pruned automatically on login. | [`auth-use-cases.ts`](../src/server/modules/auth/application/auth-use-cases.ts) |
| **Request JSON Payload Size** | Max **64 KB** (`65,536 bytes`) enforced via both `Content-Length` header and buffered `ArrayBuffer` byte count. | [`json-body.ts`](../src/server/shared/http/json-body.ts) |
