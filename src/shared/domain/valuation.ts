import { round2, type IdxSector } from './idx-rules';

/**
 * Core-3 2026 Institutional Valuation Methods for IDX:
 * 1. Relative P/E (Earnings Multiple)
 * 2. Relative P/B (Book Value Multiple — primary anchor for Financials/Banking)
 * 3. Simple DCF (5-Year Projected EPS + Terminal Value)
 */
export type ValuationMethodKey = 'relativePer' | 'relativePbv' | 'simpleDcf';

export type ValuationMethodReasonCode =
  | 'REQUIRES_POSITIVE_EPS_AND_TARGET_PER'
  | 'REQUIRES_POSITIVE_BVPS_AND_TARGET_PBV'
  | 'REQUIRES_POSITIVE_EPS_AND_VALID_DCF_RATES'
  | 'NOT_APPLICABLE_FOR_BANKING';

export interface ValuationMethodResult {
  method: ValuationMethodKey;
  fairValue: number | null;
  status: 'VALID' | 'NA';
  reasonCode?: ValuationMethodReasonCode;
}

export type ValuationStatus =
  | 'UNDERVALUED'
  | 'FAIRLY_VALUED'
  | 'OVERVALUED'
  | 'INSUFFICIENT_DATA';

export type RoeQualityFlag = 'STRONG' | 'MODERATE' | 'WEAK' | 'UNKNOWN';

export type DerQualityFlag =
  | 'HEALTHY'
  | 'MODERATE'
  | 'HIGH_LEVERAGE'
  | 'NOT_APPLICABLE_BANKING'
  | 'UNKNOWN';

export type ValueTrapRiskLevel = 'CLEAR' | 'WATCH' | 'HIGH_RISK';

export type ValueTrapWarningCode =
  | 'CYCLICAL_PEAK_WARNING'
  | 'SHRINKING_EARNINGS_TRAP'
  | 'LOW_ROE_VALUE_TRAP'
  | 'HIGH_LEVERAGE_TRAP';

export interface ValueTrapShield {
  riskLevel: ValueTrapRiskLevel;
  warnings: ValueTrapWarningCode[];
}

export interface ValuationInput {
  sector: IdxSector;
  currentPrice: number;
  eps?: number | null;
  bvps?: number | null;
  dps?: number | null;
  roePct?: number | null;
  der?: number | null;
  epsGrowthPct?: number | null;
  targetPer?: number | null;
  targetPbv?: number | null;
  discountRatePct?: number | null;
  projectionYears?: number | null;
  terminalGrowthPct?: number | null;
  dividendGrowthPct?: number | null;
}

export interface ValuationSummary {
  ratios: {
    currentPer: number | null;
    currentPbv: number | null;
    dividendYieldPct: number;
    pegRatio: number | null;
  };
  methods: ValuationMethodResult[];
  fairValue: {
    conservative: number | null;
    moderate: number | null;
    optimistic: number | null;
    validCount: number;
  };
  mosPct: number | null;
  valuationStatus: ValuationStatus;
  qualityFlags: {
    roeFlag: RoeQualityFlag;
    derFlag: DerQualityFlag;
  };
  valueTrapShield: ValueTrapShield;
  assumptionsUsed: {
    discountRatePct: number;
    projectionYears: number;
    terminalGrowthPct: number;
  };
}

export const DEFAULT_DISCOUNT_RATE_PCT = 12.0;
export const DEFAULT_PROJECTION_YEARS = 5;
export const DEFAULT_TERMINAL_GROWTH_PCT = 4.0;

function computeMedian(sortedValues: number[]): number {
  const count = sortedValues.length;
  const mid = Math.floor(count / 2);
  if (count % 2 === 1) {
    return sortedValues[mid]!;
  }
  return Math.round((sortedValues[mid - 1]! + sortedValues[mid]!) / 2);
}

function evaluateRoeFlag(roePct: number | null): RoeQualityFlag {
  if (roePct === null) return 'UNKNOWN';
  if (roePct >= 15) return 'STRONG';
  if (roePct >= 8) return 'MODERATE';
  return 'WEAK';
}

function evaluateDerFlag(sector: IdxSector, der: number | null): DerQualityFlag {
  if (sector === 'FINANCIALS') return 'NOT_APPLICABLE_BANKING';
  if (der === null) return 'UNKNOWN';
  if (der < 1.0) return 'HEALTHY';
  if (der <= 2.0) return 'MODERATE';
  return 'HIGH_LEVERAGE';
}

function evaluateValueTrapShield(params: {
  sector: IdxSector;
  eps: number | null;
  roePct: number | null;
  der: number | null;
  epsGrowthPct: number | null;
  currentPer: number | null;
  currentPbv: number | null;
  mosPct: number | null;
}): ValueTrapShield {
  const warnings: ValueTrapWarningCode[] = [];
  const isCyclicalSector =
    params.sector === 'ENERGY' || params.sector === 'BASIC_MATERIALS';
  const looksCheapOnPerOrMos =
    (params.currentPer !== null && params.currentPer <= 6) ||
    (params.mosPct !== null && params.mosPct >= 25);

  if (isCyclicalSector && looksCheapOnPerOrMos) {
    warnings.push('CYCLICAL_PEAK_WARNING');
  }

  const looksCheapOnMosOrPbv =
    (params.mosPct !== null && params.mosPct >= 0) ||
    (params.currentPbv !== null && params.currentPbv < 1);
  // Trigger shrinking-earnings trap on actual losses or material YoY contraction (<= -15%),
  // avoiding false-positive HIGH_RISK flags on minor single-digit cyclical dips.
  const hasShrinkingOrNegativeEarnings =
    (params.epsGrowthPct !== null && params.epsGrowthPct <= -15) ||
    (params.eps !== null && params.eps <= 0);

  if (looksCheapOnMosOrPbv && hasShrinkingOrNegativeEarnings) {
    warnings.push('SHRINKING_EARNINGS_TRAP');
  }

  // Property developers hold large historical landbanks with lower structural ROE (~6-10%),
  // so apply a 5% ROE floor for PROPERTY_REAL_ESTATE and 8% for all other sectors.
  const lowRoeFloorPct = params.sector === 'PROPERTY_REAL_ESTATE' ? 5 : 8;
  if (
    params.mosPct !== null &&
    params.mosPct >= 15 &&
    params.roePct !== null &&
    params.roePct < lowRoeFloorPct
  ) {
    warnings.push('LOW_ROE_VALUE_TRAP');
  }

  if (
    params.sector !== 'FINANCIALS' &&
    params.der !== null &&
    params.der > 1.5 &&
    params.mosPct !== null &&
    params.mosPct >= 0
  ) {
    warnings.push('HIGH_LEVERAGE_TRAP');
  }

  if (warnings.length === 0) {
    return { riskLevel: 'CLEAR', warnings };
  }

  const isHighRisk =
    warnings.length >= 2 ||
    warnings.includes('SHRINKING_EARNINGS_TRAP') ||
    warnings.includes('HIGH_LEVERAGE_TRAP');

  return {
    riskLevel: isHighRisk ? 'HIGH_RISK' : 'WATCH',
    warnings,
  };
}

export function calculateValuation(input: ValuationInput): ValuationSummary {
  const eps = input.eps ?? null;
  const bvps = input.bvps ?? null;
  const dps = input.dps ?? null;
  const roePct = input.roePct ?? null;
  const der = input.der ?? null;
  const epsGrowthPct = input.epsGrowthPct ?? null;
  const targetPer = input.targetPer ?? null;
  const targetPbv = input.targetPbv ?? null;

  const discountRatePct = input.discountRatePct ?? DEFAULT_DISCOUNT_RATE_PCT;
  const projectionYears = input.projectionYears ?? DEFAULT_PROJECTION_YEARS;
  const terminalGrowthPct = input.terminalGrowthPct ?? DEFAULT_TERMINAL_GROWTH_PCT;

  // Actual Market Ratios
  const currentPer = eps !== null && eps > 0 ? round2(input.currentPrice / eps) : null;
  const currentPbv = bvps !== null && bvps > 0 ? round2(input.currentPrice / bvps) : null;
  const dividendYieldPct =
    dps !== null && dps > 0 ? round2((dps / input.currentPrice) * 100) : 0;
  const pegRatio =
    currentPer !== null && epsGrowthPct !== null && epsGrowthPct > 0
      ? round2(currentPer / epsGrowthPct)
      : null;

  // 1. Relative P/E (Earnings Multiple)
  const relativePer: ValuationMethodResult =
    eps !== null && eps > 0 && targetPer !== null && targetPer > 0
      ? {
          method: 'relativePer',
          fairValue: Math.max(1, Math.round(eps * targetPer)),
          status: 'VALID',
        }
      : {
          method: 'relativePer',
          fairValue: null,
          status: 'NA',
          reasonCode: 'REQUIRES_POSITIVE_EPS_AND_TARGET_PER',
        };

  // 2. Relative P/B (Book Value Multiple)
  const relativePbv: ValuationMethodResult =
    bvps !== null && bvps > 0 && targetPbv !== null && targetPbv > 0
      ? {
          method: 'relativePbv',
          fairValue: Math.max(1, Math.round(bvps * targetPbv)),
          status: 'VALID',
        }
      : {
          method: 'relativePbv',
          fairValue: null,
          status: 'NA',
          reasonCode: 'REQUIRES_POSITIVE_BVPS_AND_TARGET_PBV',
        };

  // 3. Simple DCF (5-Year Reinvestment-Adjusted FCFE Proxy + Terminal Value)
  // Disabled for FINANCIALS (banks require CAR retention; P/B & P/E are authoritative)
  // and disabled when earnings are collapsing (<= -25% YoY) to avoid unrealistic perpetual recovery.
  const r = discountRatePct / 100;
  const gt = terminalGrowthPct / 100;
  let simpleDcf: ValuationMethodResult;
  if (input.sector === 'FINANCIALS') {
    simpleDcf = {
      method: 'simpleDcf',
      fairValue: null,
      status: 'NA',
      reasonCode: 'NOT_APPLICABLE_FOR_BANKING',
    };
  } else if (
    eps !== null &&
    eps > 0 &&
    epsGrowthPct !== null &&
    epsGrowthPct > -25 &&
    r > gt &&
    projectionYears >= 1
  ) {
    // Clamp effective growth to [-20%, +20%]
    const gEff = Math.max(-0.2, Math.min(epsGrowthPct / 100, 0.2));
    // Reinvestment adjustment (b = g / ROE) prevents double-counting retained earnings.
    // When ROE is unavailable and growth is positive, apply a conservative 35% retention proxy.
    const explicitRetention =
      gEff <= 0
        ? 0
        : roePct !== null && roePct > 0
          ? Math.min(0.75, Math.max(0, (gEff * 100) / roePct))
          : 0.35;
    const terminalRetention =
      roePct !== null && roePct > 0 ? Math.min(0.5, Math.max(0, (gt * 100) / roePct)) : 0.25;
    const explicitPayout = 1 - explicitRetention;
    const terminalPayout = 1 - terminalRetention;

    let pvCashFlows = 0;
    for (let t = 1; t <= projectionYears; t++) {
      pvCashFlows += (eps * Math.pow(1 + gEff, t) * explicitPayout) / Math.pow(1 + r, t);
    }
    const terminalEps = eps * Math.pow(1 + gEff, projectionYears);
    const pvTerminal =
      (terminalEps * (1 + gt) * terminalPayout) / ((r - gt) * Math.pow(1 + r, projectionYears));
    simpleDcf = {
      method: 'simpleDcf',
      fairValue: Math.max(1, Math.round(pvCashFlows + pvTerminal)),
      status: 'VALID',
    };
  } else {
    simpleDcf = {
      method: 'simpleDcf',
      fairValue: null,
      status: 'NA',
      reasonCode: 'REQUIRES_POSITIVE_EPS_AND_VALID_DCF_RATES',
    };
  }

  const methods: ValuationMethodResult[] = [relativePer, relativePbv, simpleDcf];

  const validValues = methods
    .filter(
      (m): m is ValuationMethodResult & { fairValue: number } =>
        m.status === 'VALID' && m.fairValue !== null,
    )
    .map((m) => m.fairValue)
    .sort((a, b) => a - b);

  const isLossMaking = eps !== null && eps <= 0;
  const hasNegativeRoe = roePct !== null && roePct < 0;

  let conservative: number | null = null;
  let moderate: number | null = null;
  let optimistic: number | null = null;
  let mosPct: number | null = null;
  let valuationStatus: ValuationStatus = 'INSUFFICIENT_DATA';

  // Guard against false-positive UNDERVALUED on loss-making/distressed stocks (EPS <= 0 or ROE < 0):
  // Individual method outputs (e.g. Relative P/B asset reference) remain visible in `methods`,
  // while composite Fair Value & MoS are withheld so bankrupt/FCA stocks cannot top `mos_desc` screens.
  if (validValues.length > 0 && !isLossMaking && !hasNegativeRoe) {
    conservative = validValues[0]!;
    moderate = computeMedian(validValues);
    optimistic = validValues[validValues.length - 1]!;
    mosPct = round2(((moderate - input.currentPrice) / moderate) * 100);
    if (mosPct >= 30) {
      valuationStatus = 'UNDERVALUED';
    } else if (mosPct >= 0) {
      valuationStatus = 'FAIRLY_VALUED';
    } else {
      valuationStatus = 'OVERVALUED';
    }
  }

  return {
    ratios: {
      currentPer,
      currentPbv,
      dividendYieldPct,
      pegRatio,
    },
    methods,
    fairValue: {
      conservative,
      moderate,
      optimistic,
      validCount: validValues.length,
    },
    mosPct,
    valuationStatus,
    qualityFlags: {
      roeFlag: evaluateRoeFlag(roePct),
      derFlag: evaluateDerFlag(input.sector, der),
    },
    valueTrapShield: evaluateValueTrapShield({
      sector: input.sector,
      eps,
      roePct,
      der,
      epsGrowthPct,
      currentPer,
      currentPbv,
      mosPct,
    }),
    assumptionsUsed: {
      discountRatePct,
      projectionYears,
      terminalGrowthPct,
    },
  };
}
