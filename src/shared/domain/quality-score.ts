import { round2, type IdxSector } from './idx-rules';
import type { ValueTrapRiskLevel } from './valuation';

export type QualityTrack = 'NON_FINANCIALS' | 'FINANCIALS';

export type QualityGrade = 'A' | 'B' | 'C' | 'D' | 'INSUFFICIENT_DATA';

export type QualityPillarKey = 'profitability' | 'growth' | 'financialHealth' | 'cashFlow';

export type QualityCapReasonCode =
  | 'LOSS_MAKING_OR_WEAK_PROFITABILITY'
  | 'WEAK_FINANCIAL_HEALTH'
  | 'WEAK_CASH_FLOW_QUALITY';

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

export const MISSING_PILLAR_FALLBACK_SCORE = 40;
export const MIN_PILLARS_FOR_SCORE = 2;

const NON_FIN_WEIGHTS: Record<QualityPillarKey, number> = {
  profitability: 30,
  growth: 25,
  financialHealth: 25,
  cashFlow: 20,
};

const FIN_WEIGHTS: Record<QualityPillarKey, number> = {
  profitability: 35,
  growth: 25,
  financialHealth: 25,
  cashFlow: 15,
};

/**
 * Piecewise linear interpolation across sorted ascending breakpoints (higher metric = higher score).
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

/**
 * Piecewise linear interpolation across sorted ascending breakpoints (lower metric = higher score).
 */
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

function evaluateGrade(score: number | null): QualityGrade {
  if (score === null) return 'INSUFFICIENT_DATA';
  if (score >= 80) return 'A';
  if (score >= 65) return 'B';
  if (score >= 50) return 'C';
  return 'D';
}

function evaluateQarpQuadrant(params: {
  score: number | null;
  mosPct: number | null;
  valueTrapRiskLevel: ValueTrapRiskLevel | null;
}): QarpQuadrant {
  const { score, mosPct, valueTrapRiskLevel } = params;
  if (score === null || mosPct === null) return 'OVERVALUED_OR_UNRATED';

  if (mosPct >= 20 && score >= 70 && valueTrapRiskLevel !== 'HIGH_RISK') {
    return 'PRIME_OPPORTUNITY';
  }
  if (mosPct >= 0 && mosPct < 20 && score >= 75) {
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
 * Dual-Track Institutional Fundamental Quality Score (FQS 0-100):
 * - Separates Financials/Banking from Non-Financials so deposit liabilities do not distort Health/CF.
 * - Uses piecewise linear scoring across 4 pillars: Profitability, Growth, Financial Health, Cash Flow Quality.
 * - Applies Weak-Link Caps & conservative missing-pillar fallback to prevent loss-making/IPO false positives.
 */
export function calculateFundamentalQuality(
  input: FundamentalQualityInput,
): FundamentalQualitySummary {
  const isFinancials = input.sector === 'FINANCIALS';
  const track: QualityTrack = isFinancials ? 'FINANCIALS' : 'NON_FINANCIALS';
  const weights = isFinancials ? FIN_WEIGHTS : NON_FIN_WEIGHTS;

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

  // 1. Profitability Pillar
  const profitability = isFinancials
    ? aggregatePillar(
        [
          {
            score: interpolateAscending(roePct, [
              [0, 0],
              [10, 45],
              [15, 80],
              [20, 100],
            ]),
            weight: 40,
          },
          {
            score: interpolateAscending(roaPct, [
              [0, 0],
              [1.0, 45],
              [1.8, 80],
              [2.8, 100],
            ]),
            weight: 35,
          },
          {
            score: interpolateAscending(npmPct, [
              [0, 0],
              [12, 45],
              [22, 80],
              [35, 100],
            ]),
            weight: 25,
          },
        ],
        weights.profitability,
      )
    : aggregatePillar(
        [
          {
            score: interpolateAscending(roePct, [
              [0, 0],
              [8, 40],
              [15, 80],
              [22, 100],
            ]),
            weight: 30,
          },
          {
            score: interpolateAscending(roicPct, [
              [0, 0],
              [6, 40],
              [12, 80],
              [18, 100],
            ]),
            weight: 30,
          },
          {
            score: interpolateAscending(opmPct, [
              [0, 0],
              [8, 45],
              [15, 80],
              [25, 100],
            ]),
            weight: 20,
          },
          {
            score: interpolateAscending(npmPct, [
              [0, 0],
              [5, 45],
              [12, 80],
              [20, 100],
            ]),
            weight: 20,
          },
        ],
        weights.profitability,
      );

  // 2. Growth Pillar (all sectors)
  const growth = aggregatePillar(
    [
      {
        score: interpolateAscending(revGrowth, [
          [-10, 0],
          [0, 25],
          [8, 65],
          [15, 85],
          [25, 100],
        ]),
        weight: 40,
      },
      {
        score: interpolateAscending(bottomLineGrowth, [
          [-15, 0],
          [0, 25],
          [10, 65],
          [20, 88],
          [30, 100],
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

  // 3. Financial Health Pillar
  const financialHealth = isFinancials
    ? aggregatePillar(
        [
          {
            score: interpolateAscending(equityToAssetsPct, [
              [5, 0],
              [7, 30],
              [9, 60],
              [12, 85],
              [16, 100],
            ]),
            weight: 45,
          },
          {
            score: interpolateDescending(wholesaleDer, [
              [0.4, 100],
              [1.0, 80],
              [2.0, 50],
              [4.0, 0],
            ]),
            weight: 35,
          },
          {
            score: interpolateAscending(roaPct, [
              [0.2, 0],
              [0.8, 40],
              [1.5, 75],
              [2.2, 100],
            ]),
            weight: 20,
          },
        ],
        weights.financialHealth,
      )
    : aggregatePillar(
        [
          {
            score: interpolateDescending(der, [
              [0.3, 100],
              [0.7, 80],
              [1.2, 50],
              [2.0, 20],
              [3.0, 0],
            ]),
            weight: 35,
          },
          {
            score: interpolateDescending(netDebtToEbitda, [
              [0, 100],
              [1.0, 85],
              [2.0, 60],
              [3.5, 25],
              [5.0, 0],
            ]),
            weight: 35,
          },
          {
            score: interpolateAscending(currentRatio, [
              [0.7, 0],
              [1.0, 30],
              [1.2, 55],
              [1.5, 80],
              [2.0, 100],
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
      [0.4, 25],
      [0.7, 58],
      [0.9, 82],
      [1.1, 100],
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
            score: cfoPositive === null ? null : cfoPositive ? 100 : 25,
            weight: 40,
          },
          {
            score: fcfPositive === null ? null : fcfPositive ? 100 : 25,
            weight: 30,
          },
          {
            score: interpolateAscending(divYieldPct, [
              [0, 0],
              [0.5, 25],
              [2.0, 55],
              [3.5, 80],
              [5.0, 100],
            ]),
            weight: 30,
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
              [1, 30],
              [5, 60],
              [10, 82],
              [15, 100],
            ]),
            weight: 30,
          },
          {
            score: interpolateAscending(fcfYieldPct, [
              [0, 0],
              [1, 30],
              [3, 60],
              [5, 82],
              [8, 100],
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
    // Missing pillars use a conservative fallback so IPO/partial-data stocks cannot artificially score 95+
    const totalWeighted =
      (profitability.score ?? MISSING_PILLAR_FALLBACK_SCORE) * profitability.weightPct +
      (growth.score ?? MISSING_PILLAR_FALLBACK_SCORE) * growth.weightPct +
      (financialHealth.score ?? MISSING_PILLAR_FALLBACK_SCORE) * financialHealth.weightPct +
      (cashFlow.score ?? MISSING_PILLAR_FALLBACK_SCORE) * cashFlow.weightPct;

    rawCompositeScore = Math.round(totalWeighted / 100);
    let capped = rawCompositeScore;

    // Weak-Link Institutional Guardrails
    if (isLossMaking || (profitability.score !== null && profitability.score < 25)) {
      if (capped > 50) {
        capped = 50;
        appliedCaps.push('LOSS_MAKING_OR_WEAK_PROFITABILITY');
      }
    }
    if (financialHealth.score !== null && financialHealth.score < 30) {
      if (capped > 55) {
        capped = 55;
        appliedCaps.push('WEAK_FINANCIAL_HEALTH');
      }
    }
    if (!isFinancials && cashFlow.score !== null && cashFlow.score < 25) {
      if (capped > 60) {
        capped = 60;
        appliedCaps.push('WEAK_CASH_FLOW_QUALITY');
      }
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
