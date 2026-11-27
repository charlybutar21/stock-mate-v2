import { round2, type IdxSector } from './idx-rules';
import type { ValueTrapRiskLevel } from './valuation';

export type QualityTrack =
  | 'FINANCIALS'
  | 'CYCLICALS'
  | 'PROPERTY_INFRA'
  | 'NON_FINANCIALS';

export type QualityGrade = 'S' | 'A' | 'B' | 'C' | 'D' | 'E' | 'INSUFFICIENT_DATA';

export type QualityPillarKey = 'profitability' | 'growth' | 'financialHealth' | 'cashFlow';

export type QualityCapReasonCode =
  | 'LOSS_MAKING_OR_WEAK_PROFITABILITY'
  | 'WEAK_FINANCIAL_HEALTH'
  | 'FINANCIAL_DISTRESS_ALTMAN_Z'
  | 'WEAK_CASH_FLOW_QUALITY'
  | 'HIGH_RISK_VALUE_TRAP'
  | 'INCOMPLETE_PILLAR_COVERAGE'
  | 'LOW_ROE_OR_REVENUE_CONTRACTION';

export type QarpQuadrant =
  | 'PRIME_OPPORTUNITY'
  | 'QUALITY_FAIR_PRICE'
  | 'DEEP_VALUE_TURNAROUND'
  | 'VALUE_TRAP_RISK'
  | 'OVERVALUED_OR_UNRATED';

export interface FundamentalQualityInput {
  sector: IdxSector;
  currentPrice: number;
  eps?: number | null;
  dps?: number | null;
  roePct?: number | null;
  roaPct?: number | null;
  roicPct?: number | null;
  operatingMarginPct?: number | null;
  netMarginPct?: number | null;
  revenueGrowthPct?: number | null;
  epsGrowthPct?: number | null;
  netIncomeGrowthPct?: number | null;
  der?: number | null;
  wholesaleDer?: number | null;
  currentRatio?: number | null;
  netDebtToEbitda?: number | null;
  equityToAssetsPct?: number | null;
  cfoToNetIncome?: number | null;
  fcfMarginPct?: number | null;
  fcfYieldPct?: number | null;
  cfoPositive?: boolean | null;
  fcfPositive?: boolean | null;
  piotroskiFScore?: number | null;
  altmanZScore?: number | null;
  marketCapIdr?: number | null;
  adtvIdr?: number | null;
  mosPct?: number | null;
  valueTrapRiskLevel?: ValueTrapRiskLevel | null;
}

export interface QualityPillarResult {
  score: number | null;
  weightPct: number;
  availableMetrics: number;
  totalMetrics: number;
}

export interface FundamentalQualitySummary {
  score: number | null;
  rawCompositeScore: number | null;
  grade: QualityGrade;
  track: QualityTrack;
  availablePillars: number;
  appliedCaps: QualityCapReasonCode[];
  qarpQuadrant: QarpQuadrant;
  pillars: Record<QualityPillarKey, QualityPillarResult>;
}

type Breakpoint = readonly [value: number, score: number];

interface WeightedMetric {
  score: number | null;
  weight: number;
}

export const MISSING_PILLAR_FALLBACK_SCORE = 35;
export const MIN_PILLARS_FOR_SCORE = 2;

const TRACK_WEIGHTS: Record<QualityTrack, Record<QualityPillarKey, number>> = {
  FINANCIALS: {
    profitability: 35,
    growth: 20,
    financialHealth: 30,
    cashFlow: 15,
  },
  CYCLICALS: {
    profitability: 25,
    growth: 15,
    financialHealth: 35,
    cashFlow: 25,
  },
  PROPERTY_INFRA: {
    profitability: 25,
    growth: 20,
    financialHealth: 30,
    cashFlow: 25,
  },
  NON_FINANCIALS: {
    profitability: 30,
    growth: 25,
    financialHealth: 25,
    cashFlow: 20,
  },
};

export function resolveQualityTrack(sector: IdxSector): QualityTrack {
  if (sector === 'FINANCIALS') return 'FINANCIALS';
  if (sector === 'ENERGY' || sector === 'BASIC_MATERIALS') return 'CYCLICALS';
  if (sector === 'PROPERTY_REAL_ESTATE' || sector === 'INFRASTRUCTURE') return 'PROPERTY_INFRA';
  return 'NON_FINANCIALS';
}

/**
 * Piecewise linear interpolation across sorted ascending breakpoints.
 * Eliminates cliff effects between thresholds while remaining fully transparent.
 */
export function interpolateAscending(
  value: number | null | undefined,
  points: readonly Breakpoint[],
): number | null {
  if (value === null || value === undefined || !Number.isFinite(value)) return null;
  const first = points[0]!;
  if (value <= first[0]) return first[1];
  const last = points[points.length - 1]!;
  if (value >= last[0]) return last[1];

  let idx = 0;
  while (idx < points.length - 2 && value > points[idx + 1]![0]) {
    idx += 1;
  }
  const [x0, y0] = points[idx]!;
  const [x1, y1] = points[idx + 1]!;
  const ratio = (value - x0) / (x1 - x0);
  return round2(y0 + ratio * (y1 - y0));
}

export function interpolateDescending(
  value: number | null | undefined,
  points: readonly Breakpoint[],
): number | null {
  return interpolateAscending(value, points);
}

function aggregatePillar(
  metrics: WeightedMetric[],
  weightPct: number,
): QualityPillarResult {
  let weightedSum = 0;
  let availableWeight = 0;
  let availableMetrics = 0;

  for (const m of metrics) {
    if (m.score !== null) {
      weightedSum += m.score * m.weight;
      availableWeight += m.weight;
      availableMetrics += 1;
    }
  }

  return {
    score: availableWeight > 0 ? Math.round(weightedSum / availableWeight) : null,
    weightPct,
    availableMetrics,
    totalMetrics: metrics.length,
  };
}

function scoreOperatingLeverage(
  revGrowth: number | null,
  epsGrowth: number | null,
): number | null {
  if (revGrowth === null || epsGrowth === null) return null;
  if (revGrowth > 0 && epsGrowth >= revGrowth) return 100;
  if (revGrowth > 0 && epsGrowth > 0) return 65;
  if (revGrowth > 0 || epsGrowth > 0) return 25;
  return 0;
}

/**
 * Strict 6-tier institutional grading scale:
 * S (>=88) Elite · A (76-87) Very Strong · B (64-75) Good · C (50-63) Average · D (35-49) Weak · E (<35) Critical
 */
export function evaluateGrade(score: number | null): QualityGrade {
  if (score === null) return 'INSUFFICIENT_DATA';
  if (score >= 88) return 'S';
  if (score >= 76) return 'A';
  if (score >= 64) return 'B';
  if (score >= 50) return 'C';
  if (score >= 35) return 'D';
  return 'E';
}

function evaluateQarpQuadrant(params: {
  score: number | null;
  mosPct: number | null;
  valueTrapRiskLevel: ValueTrapRiskLevel | null;
}): QarpQuadrant {
  const { score, mosPct, valueTrapRiskLevel } = params;
  if (score === null || mosPct === null) return 'OVERVALUED_OR_UNRATED';

  if (mosPct >= 20 && score >= 76 && valueTrapRiskLevel !== 'HIGH_RISK') {
    return 'PRIME_OPPORTUNITY';
  }
  if (mosPct >= 0 && mosPct < 20 && score >= 76) {
    return 'QUALITY_FAIR_PRICE';
  }
  if (mosPct >= 20 && score < 50) {
    return 'VALUE_TRAP_RISK';
  }
  if (mosPct >= 20 && score >= 50) {
    return 'DEEP_VALUE_TURNAROUND';
  }
  return 'OVERVALUED_OR_UNRATED';
}

/**
 * 4-Track Institutional Fundamental Quality Score (FQS v2, 0-100, S/A/B/C/D/E):
 * - Separates Financials/Banking, Cyclical Commodities, Property/Infrastructure, and General Non-Financials.
 * - Eliminates ROA double-counting and overly generous binary cash-flow scoring in Financials.
 * - Enforces 7 strict institutional Weak-Link caps (loss-making, distress Altman Z < 1.8, weak health,
 *   weak cash flow, HIGH_RISK value trap, incomplete pillars, and low bank ROE / shrinking revenue).
 */
export function calculateFundamentalQuality(
  input: FundamentalQualityInput,
): FundamentalQualitySummary {
  const track = resolveQualityTrack(input.sector);
  const isFinancials = track === 'FINANCIALS';
  const isPropertyInfra = track === 'PROPERTY_INFRA';
  const weights = TRACK_WEIGHTS[track];

  const eps = input.eps ?? null;
  const dps = input.dps ?? null;
  const roePct = input.roePct ?? null;
  const roaPct = input.roaPct ?? null;
  const roicPct = input.roicPct ?? null;
  const opmPct = input.operatingMarginPct ?? null;
  const npmPct = input.netMarginPct ?? null;
  const revGrowth = input.revenueGrowthPct ?? null;
  const bottomLineGrowth = input.epsGrowthPct ?? input.netIncomeGrowthPct ?? null;
  const der = input.der ?? null;
  const wholesaleDer = input.wholesaleDer ?? null;
  const currentRatio = input.currentRatio ?? null;
  const netDebtToEbitda = input.netDebtToEbitda ?? null;
  const equityToAssetsPct = input.equityToAssetsPct ?? null;
  const cfoToNetIncome = input.cfoToNetIncome ?? null;
  const fcfMarginPct = input.fcfMarginPct ?? null;
  const fcfYieldPct = input.fcfYieldPct ?? null;
  const cfoPositive = input.cfoPositive ?? null;
  const fcfPositive = input.fcfPositive ?? null;
  const altmanZScore = input.altmanZScore ?? null;

  // 1. Profitability Pillar
  const profitability = isFinancials
    ? aggregatePillar(
        [
          {
            score: interpolateAscending(roePct, [
              [0, 0],
              [10, 40],
              [16, 80],
              [22, 100],
            ]),
            weight: 45,
          },
          {
            score: interpolateAscending(roaPct, [
              [0, 0],
              [1.0, 40],
              [2.0, 80],
              [3.2, 100],
            ]),
            weight: 35,
          },
          {
            score: interpolateAscending(npmPct, [
              [0, 0],
              [12, 40],
              [24, 80],
              [38, 100],
            ]),
            weight: 20,
          },
        ],
        weights.profitability,
      )
    : aggregatePillar(
        [
          {
            score: interpolateAscending(roePct, [
              [0, 0],
              [8, 35],
              [15, 78],
              [24, 100],
            ]),
            weight: 30,
          },
          {
            score: interpolateAscending(roicPct, [
              [0, 0],
              [6, 35],
              [13, 78],
              [20, 100],
            ]),
            weight: 30,
          },
          {
            score: interpolateAscending(opmPct, [
              [0, 0],
              [8, 40],
              [16, 78],
              [26, 100],
            ]),
            weight: 20,
          },
          {
            score: interpolateAscending(npmPct, [
              [0, 0],
              [5, 40],
              [13, 78],
              [22, 100],
            ]),
            weight: 20,
          },
        ],
        weights.profitability,
      );

  // 2. Growth Pillar
  const growth = aggregatePillar(
    [
      {
        score: interpolateAscending(revGrowth, [
          [-10, 0],
          [0, 22],
          [8, 62],
          [16, 85],
          [28, 100],
        ]),
        weight: 40,
      },
      {
        score: interpolateAscending(bottomLineGrowth, [
          [-15, 0],
          [0, 22],
          [10, 62],
          [22, 86],
          [35, 100],
        ]),
        weight: 45,
      },
      {
        score: scoreOperatingLeverage(revGrowth, bottomLineGrowth),
        weight: 15,
      },
    ],
    weights.growth,
  );

  // 3. Financial Health Pillar (Track-Calibrated, Zero ROA Double-Counting)
  const financialHealth = isFinancials
    ? aggregatePillar(
        [
          {
            score: interpolateAscending(equityToAssetsPct, [
              [5, 0],
              [8, 35],
              [11, 68],
              [14, 88],
              [18, 100],
            ]),
            weight: 55,
          },
          {
            score: interpolateDescending(wholesaleDer, [
              [0.3, 100],
              [0.9, 80],
              [1.8, 48],
              [3.5, 0],
            ]),
            weight: 45,
          },
        ],
        weights.financialHealth,
      )
    : isPropertyInfra
      ? aggregatePillar(
          [
            {
              score: interpolateDescending(der, [
                [0.4, 100],
                [1.0, 75],
                [1.8, 45],
                [2.8, 15],
                [4.0, 0],
              ]),
              weight: 35,
            },
            {
              score: interpolateDescending(netDebtToEbitda, [
                [0, 100],
                [1.8, 78],
                [3.2, 48],
                [5.0, 15],
                [7.0, 0],
              ]),
              weight: 35,
            },
            {
              score: interpolateAscending(currentRatio, [
                [0.7, 0],
                [1.0, 30],
                [1.3, 60],
                [1.8, 85],
                [2.4, 100],
              ]),
              weight: 30,
            },
          ],
          weights.financialHealth,
        )
      : aggregatePillar(
          [
            {
              score: interpolateDescending(der, [
                [0.25, 100],
                [0.65, 78],
                [1.1, 48],
                [1.8, 18],
                [2.8, 0],
              ]),
              weight: 35,
            },
            {
              score: interpolateDescending(netDebtToEbitda, [
                [0, 100],
                [1.0, 82],
                [2.0, 55],
                [3.2, 22],
                [4.5, 0],
              ]),
              weight: 35,
            },
            {
              score: interpolateAscending(currentRatio, [
                [0.7, 0],
                [1.0, 30],
                [1.3, 58],
                [1.6, 82],
                [2.2, 100],
              ]),
              weight: 30,
            },
          ],
          weights.financialHealth,
        );

  // 4. Cash Flow Quality Pillar
  const divYieldPct =
    dps !== null && dps >= 0 && input.currentPrice > 0
      ? round2((dps / input.currentPrice) * 100)
      : null;

  const isLossMaking = eps !== null && eps <= 0;
  let ccrScore: number | null;
  if (cfoToNetIncome !== null) {
    ccrScore = interpolateAscending(cfoToNetIncome, [
      [0, 0],
      [0.45, 25],
      [0.75, 58],
      [0.95, 82],
      [1.15, 100],
    ]);
  } else if (isLossMaking && cfoPositive !== null) {
    ccrScore = cfoPositive ? 25 : 0;
  } else {
    ccrScore = null;
  }

  const cashFlow = isFinancials
    ? aggregatePillar(
        [
          {
            score:
              ccrScore !== null
                ? ccrScore
                : cfoPositive === null
                  ? null
                  : cfoPositive
                    ? 65
                    : 15,
            weight: 40,
          },
          {
            score: fcfPositive === null ? null : fcfPositive ? 80 : 20,
            weight: 20,
          },
          {
            score: interpolateAscending(divYieldPct, [
              [0, 0],
              [1.0, 30],
              [2.5, 60],
              [4.0, 84],
              [6.0, 100],
            ]),
            weight: 40,
          },
        ],
        weights.cashFlow,
      )
    : aggregatePillar(
        [
          {
            score: ccrScore,
            weight: 40,
          },
          {
            score: interpolateAscending(fcfMarginPct, [
              [0, 0],
              [1.5, 30],
              [6, 62],
              [11, 84],
              [16, 100],
            ]),
            weight: 30,
          },
          {
            score: interpolateAscending(fcfYieldPct, [
              [0, 0],
              [1.5, 30],
              [3.5, 60],
              [6, 84],
              [9, 100],
            ]),
            weight: 30,
          },
        ],
        weights.cashFlow,
      );

  const pillars: Record<QualityPillarKey, QualityPillarResult> = {
    profitability,
    growth,
    financialHealth,
    cashFlow,
  };

  const pillarList = [profitability, growth, financialHealth, cashFlow];
  const availablePillars = pillarList.filter((p) => p.score !== null).length;

  let rawCompositeScore: number | null = null;
  let score: number | null = null;
  const appliedCaps: QualityCapReasonCode[] = [];

  if (availablePillars >= MIN_PILLARS_FOR_SCORE) {
    const totalWeighted =
      (profitability.score ?? MISSING_PILLAR_FALLBACK_SCORE) * profitability.weightPct +
      (growth.score ?? MISSING_PILLAR_FALLBACK_SCORE) * growth.weightPct +
      (financialHealth.score ?? MISSING_PILLAR_FALLBACK_SCORE) * financialHealth.weightPct +
      (cashFlow.score ?? MISSING_PILLAR_FALLBACK_SCORE) * cashFlow.weightPct;

    rawCompositeScore = Math.round(totalWeighted / 100);
    let capped = rawCompositeScore;

    const applyCap = (limit: number, reason: QualityCapReasonCode) => {
      if (capped > limit) {
        capped = limit;
        appliedCaps.push(reason);
      }
    };

    // 7 Strict Institutional Guardrails (Weak-Link Caps)
    if (isLossMaking || (profitability.score !== null && profitability.score < 25)) {
      applyCap(45, 'LOSS_MAKING_OR_WEAK_PROFITABILITY');
    }
    if (financialHealth.score !== null && financialHealth.score < 30) {
      applyCap(50, 'WEAK_FINANCIAL_HEALTH');
    }
    if (!isFinancials && altmanZScore !== null && altmanZScore < 1.8) {
      applyCap(55, 'FINANCIAL_DISTRESS_ALTMAN_Z');
    }
    if (!isFinancials && cashFlow.score !== null && cashFlow.score < 25) {
      applyCap(58, 'WEAK_CASH_FLOW_QUALITY');
    }
    if (input.valueTrapRiskLevel === 'HIGH_RISK') {
      applyCap(68, 'HIGH_RISK_VALUE_TRAP');
    }
    if (availablePillars < 4) {
      applyCap(74, 'INCOMPLETE_PILLAR_COVERAGE');
    }
    if ((isFinancials && roePct !== null && roePct < 10) || (revGrowth !== null && revGrowth < -5)) {
      applyCap(74, 'LOW_ROE_OR_REVENUE_CONTRACTION');
    }

    score = capped;
  }

  return {
    score,
    rawCompositeScore,
    grade: evaluateGrade(score),
    track,
    availablePillars,
    appliedCaps,
    qarpQuadrant: evaluateQarpQuadrant({
      score,
      mosPct: input.mosPct ?? null,
      valueTrapRiskLevel: input.valueTrapRiskLevel ?? null,
    }),
    pillars,
  };
}

/**
 * Combined QARP ranking score used for "Best Value + Quality" sort:
 * Rewards high Fundamental Quality Score + attractive Margin of Safety (capped at 60% MoS
 * so extreme statistical outliers do not dominate quality), while penalizing High-Risk Value Traps.
 */
export function computeQarpRankScore(params: {
  fqs: number | null;
  mosPct: number | null;
  valueTrapRiskLevel: ValueTrapRiskLevel;
}): number {
  if (params.fqs === null) return Number.NEGATIVE_INFINITY;
  const mosComponent =
    params.mosPct === null
      ? 25
      : Math.max(0, Math.min(100, ((params.mosPct + 20) / 80) * 100));
  const trapPenalty =
    params.valueTrapRiskLevel === 'HIGH_RISK'
      ? 25
      : params.valueTrapRiskLevel === 'WATCH'
        ? 5
        : 0;
  return round2(params.fqs * 0.6 + mosComponent * 0.4 - trapPenalty);
}
