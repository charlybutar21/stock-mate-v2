import { round2, type IdxSector } from './idx-rules';

export type ValuationMethodKey =
  | 'grahamNumber'
  | 'relativePer'
  | 'relativePbv'
  | 'peterLynch'
  | 'simpleDcf'
  | 'ddmGordon';

export type ValuationMethodReasonCode =
  | 'REQUIRES_POSITIVE_EPS_AND_BVPS'
  | 'REQUIRES_POSITIVE_EPS_AND_TARGET_PER'
  | 'REQUIRES_POSITIVE_BVPS_AND_TARGET_PBV'
  | 'REQUIRES_POSITIVE_EPS_AND_GROWTH'
  | 'REQUIRES_POSITIVE_EPS_AND_VALID_DCF_RATES'
  | 'REQUIRES_POSITIVE_DPS_AND_VALID_DDM_RATES';

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
  assumptionsUsed: {
    discountRatePct: number;
    projectionYears: number;
    terminalGrowthPct: number;
    effectiveDividendGrowthPct: number;
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
  const effectiveDividendGrowthPct =
    input.dividendGrowthPct !== null && input.dividendGrowthPct !== undefined
      ? input.dividendGrowthPct
      : Math.min(Math.max(epsGrowthPct ?? 0, 0), 8.0);

  // Actual Ratios
  const currentPer = eps !== null && eps > 0 ? round2(input.currentPrice / eps) : null;
  const currentPbv = bvps !== null && bvps > 0 ? round2(input.currentPrice / bvps) : null;
  const rawDivYieldPct = dps !== null && dps > 0 ? (dps / input.currentPrice) * 100 : 0;
  const dividendYieldPct = dps !== null && dps > 0 ? round2(rawDivYieldPct) : 0;
  const pegRatio =
    currentPer !== null && epsGrowthPct !== null && epsGrowthPct > 0
      ? round2(currentPer / epsGrowthPct)
      : null;

  // 1. Graham Number
  const grahamNumber: ValuationMethodResult =
    eps !== null && eps > 0 && bvps !== null && bvps > 0
      ? {
          method: 'grahamNumber',
          fairValue: Math.round(Math.sqrt(22.5 * eps * bvps)),
          status: 'VALID',
        }
      : {
          method: 'grahamNumber',
          fairValue: null,
          status: 'NA',
          reasonCode: 'REQUIRES_POSITIVE_EPS_AND_BVPS',
        };

  // 2. Relative PER
  const relativePer: ValuationMethodResult =
    eps !== null && eps > 0 && targetPer !== null && targetPer > 0
      ? {
          method: 'relativePer',
          fairValue: Math.round(eps * targetPer),
          status: 'VALID',
        }
      : {
          method: 'relativePer',
          fairValue: null,
          status: 'NA',
          reasonCode: 'REQUIRES_POSITIVE_EPS_AND_TARGET_PER',
        };

  // 3. Relative PBV
  const relativePbv: ValuationMethodResult =
    bvps !== null && bvps > 0 && targetPbv !== null && targetPbv > 0
      ? {
          method: 'relativePbv',
          fairValue: Math.round(bvps * targetPbv),
          status: 'VALID',
        }
      : {
          method: 'relativePbv',
          fairValue: null,
          status: 'NA',
          reasonCode: 'REQUIRES_POSITIVE_BVPS_AND_TARGET_PBV',
        };

  // 4. Peter Lynch / PEG
  const peterLynch: ValuationMethodResult =
    eps !== null && eps > 0 && epsGrowthPct !== null && epsGrowthPct > 0
      ? {
          method: 'peterLynch',
          fairValue: Math.round(eps * Math.min(epsGrowthPct + rawDivYieldPct, 25)),
          status: 'VALID',
        }
      : {
          method: 'peterLynch',
          fairValue: null,
          status: 'NA',
          reasonCode: 'REQUIRES_POSITIVE_EPS_AND_GROWTH',
        };

  // 5. Simple DCF (Discounted EPS)
  const r = discountRatePct / 100;
  const gt = terminalGrowthPct / 100;
  let simpleDcf: ValuationMethodResult;
  if (eps !== null && eps > 0 && epsGrowthPct !== null && r > gt && projectionYears >= 1) {
    const gEff = Math.min(epsGrowthPct / 100, 0.2);
    let pvCashFlows = 0;
    for (let t = 1; t <= projectionYears; t++) {
      pvCashFlows += (eps * Math.pow(1 + gEff, t)) / Math.pow(1 + r, t);
    }
    const terminalEps = eps * Math.pow(1 + gEff, projectionYears);
    const pvTerminal = (terminalEps * (1 + gt)) / ((r - gt) * Math.pow(1 + r, projectionYears));
    simpleDcf = {
      method: 'simpleDcf',
      fairValue: Math.round(pvCashFlows + pvTerminal),
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

  // 6. DDM (Gordon Growth)
  const gd = effectiveDividendGrowthPct / 100;
  const ddmGordon: ValuationMethodResult =
    dps !== null && dps > 0 && r > gd
      ? {
          method: 'ddmGordon',
          fairValue: Math.round((dps * (1 + gd)) / (r - gd)),
          status: 'VALID',
        }
      : {
          method: 'ddmGordon',
          fairValue: null,
          status: 'NA',
          reasonCode: 'REQUIRES_POSITIVE_DPS_AND_VALID_DDM_RATES',
        };

  const methods: ValuationMethodResult[] = [
    grahamNumber,
    relativePer,
    relativePbv,
    peterLynch,
    simpleDcf,
    ddmGordon,
  ];

  const validValues = methods
    .filter((m): m is ValuationMethodResult & { fairValue: number } => m.status === 'VALID' && m.fairValue !== null)
    .map((m) => m.fairValue)
    .sort((a, b) => a - b);

  let conservative: number | null = null;
  let moderate: number | null = null;
  let optimistic: number | null = null;
  let mosPct: number | null = null;
  let valuationStatus: ValuationStatus = 'INSUFFICIENT_DATA';

  if (validValues.length > 0) {
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
    assumptionsUsed: {
      discountRatePct,
      projectionYears,
      terminalGrowthPct,
      effectiveDividendGrowthPct,
    },
  };
}
