import {
  ceilToIdxTick,
  DEFAULT_BUY_FEE_PCT,
  DEFAULT_SELL_FEE_PCT,
  MIN_IDX_PRICE,
  round2,
  SHARES_PER_LOT,
  STAMP_DUTY_IDR,
  STAMP_DUTY_THRESHOLD_IDR,
} from './idx-rules';

export interface PlannedTranche {
  lots: number;
  buyPrice: number;
}

export interface ForwardSimulationInput {
  existingLots: number;
  existingAvgPrice: number;
  plannedTranches: PlannedTranche[];
  targetSellPrice: number;
  buyFeePct?: number;
  sellFeePct?: number;
  includeStampDuty?: boolean;
  fairValueModerate?: number | null;
  referenceCurrentPrice?: number | null;
}

export interface ForwardSimulationResult {
  valid: true;
  existingShares: number;
  plannedShares: number;
  totalShares: number;
  totalLots: number;
  existingGross: number;
  plannedGross: number;
  totalGrossBuy: number;
  totalBuyFee: number;
  plannedBuyFee: number;
  stampDutyBuy: number;
  totalCost: number;
  plannedCashRequired: number;
  pureAvgPrice: number;
  effectiveAvgPrice: number;
  bepRaw: number;
  bepIdxTick: number;
  grossSell: number;
  sellFee: number;
  stampDutySell: number;
  netProceeds: number;
  netPnL: number;
  netPnLPct: number;
  gainToBepBeforePct: number | null;
  gainToBepAfterPct: number | null;
  guardrails: {
    isAboveFairValue: boolean;
    isAverageUp: boolean;
  };
}

export interface SimulationInvalidResult {
  valid: false;
  errorCode:
    | 'INVALID_POSITION'
    | 'INVALID_EXISTING_PRICE'
    | 'INVALID_TRANCHE'
    | 'INVALID_TARGET_SELL_PRICE'
    | 'INVALID_FEE_RATE'
    | 'INVALID_GOAL_SEEK_BOUNDS';
}

export type ForwardSimulationOutput = ForwardSimulationResult | SimulationInvalidResult;

export interface GoalSeekInput {
  existingLots: number;
  existingAvgPrice: number;
  plannedBuyPrice: number;
  targetPureAvg: number;
  buyFeePct?: number;
  includeStampDuty?: boolean;
}

export interface GoalSeekResult {
  valid: true;
  lotsNeeded: number;
  sharesNeeded: number;
  resultingPureAvg: number;
  cashGross: number;
  cashBuyFee: number;
  cashStampDuty: number;
  totalCashRequired: number;
}

export type GoalSeekOutput = GoalSeekResult | SimulationInvalidResult;

function computeBepRaw(
  totalCost: number,
  totalShares: number,
  sellFeeRate: number,
  includeStampDuty: boolean,
): number {
  const denom = totalShares * (1 - sellFeeRate);
  const bepBase = totalCost / denom;
  if (includeStampDuty && totalShares * bepBase > STAMP_DUTY_THRESHOLD_IDR) {
    return (totalCost + STAMP_DUTY_IDR) / denom;
  }
  return bepBase;
}

export function simulateForwardAverageDown(input: ForwardSimulationInput): ForwardSimulationOutput {
  const buyFeePct = input.buyFeePct ?? DEFAULT_BUY_FEE_PCT;
  const sellFeePct = input.sellFeePct ?? DEFAULT_SELL_FEE_PCT;
  const includeStampDuty = input.includeStampDuty ?? false;

  if (buyFeePct < 0 || sellFeePct < 0 || sellFeePct >= 100) {
    return { valid: false, errorCode: 'INVALID_FEE_RATE' };
  }

  if (input.existingLots < 0 || !Number.isInteger(input.existingLots)) {
    return { valid: false, errorCode: 'INVALID_POSITION' };
  }

  if (input.existingLots > 0 && input.existingAvgPrice < MIN_IDX_PRICE) {
    return { valid: false, errorCode: 'INVALID_EXISTING_PRICE' };
  }

  if (input.targetSellPrice < MIN_IDX_PRICE) {
    return { valid: false, errorCode: 'INVALID_TARGET_SELL_PRICE' };
  }

  if (input.plannedTranches.length > 5) {
    return { valid: false, errorCode: 'INVALID_TRANCHE' };
  }

  for (const tranche of input.plannedTranches) {
    if (
      !Number.isInteger(tranche.lots) ||
      tranche.lots < 1 ||
      tranche.buyPrice < MIN_IDX_PRICE
    ) {
      return { valid: false, errorCode: 'INVALID_TRANCHE' };
    }
  }

  const existingShares = input.existingLots * SHARES_PER_LOT;
  const plannedShares = input.plannedTranches.reduce(
    (sum, t) => sum + t.lots * SHARES_PER_LOT,
    0,
  );
  const totalShares = existingShares + plannedShares;

  if (totalShares <= 0) {
    return { valid: false, errorCode: 'INVALID_POSITION' };
  }

  const existingGross = existingShares * input.existingAvgPrice;
  const plannedGross = input.plannedTranches.reduce(
    (sum, t) => sum + t.lots * SHARES_PER_LOT * t.buyPrice,
    0,
  );
  const totalGrossBuy = existingGross + plannedGross;

  const fBuy = buyFeePct / 100;
  const fSell = sellFeePct / 100;

  const totalBuyFee = Math.round(totalGrossBuy * fBuy);
  const plannedBuyFee = Math.round(plannedGross * fBuy);
  const stampDutyBuy =
    includeStampDuty && plannedGross > STAMP_DUTY_THRESHOLD_IDR ? STAMP_DUTY_IDR : 0;

  const totalCost = totalGrossBuy + totalBuyFee + stampDutyBuy;
  const plannedCashRequired = plannedGross + plannedBuyFee + stampDutyBuy;

  const pureAvgPrice = round2(totalGrossBuy / totalShares);
  const effectiveAvgPrice = round2(totalCost / totalShares);

  const bepRawExact = computeBepRaw(totalCost, totalShares, fSell, includeStampDuty);
  const bepRaw = round2(bepRawExact);
  const bepIdxTick = ceilToIdxTick(bepRawExact);

  const grossSell = totalShares * input.targetSellPrice;
  const sellFee = Math.round(grossSell * fSell);
  const stampDutySell =
    includeStampDuty && grossSell > STAMP_DUTY_THRESHOLD_IDR ? STAMP_DUTY_IDR : 0;
  const netProceeds = grossSell - sellFee - stampDutySell;
  const netPnL = netProceeds - totalCost;
  const netPnLPct = round2((netPnL / totalCost) * 100);

  let gainToBepBeforePct: number | null = null;
  let gainToBepAfterPct: number | null = null;
  if (input.existingLots > 0 && input.plannedTranches.length > 0) {
    const lastTranchePrice = input.plannedTranches[input.plannedTranches.length - 1]!.buyPrice;
    const baseRefPrice =
      input.referenceCurrentPrice && input.referenceCurrentPrice >= MIN_IDX_PRICE
        ? input.referenceCurrentPrice
        : lastTranchePrice;

    const existingCost = existingGross + Math.round(existingGross * fBuy);
    const existingBepRaw = computeBepRaw(existingCost, existingShares, fSell, includeStampDuty);
    const existingBepTick = ceilToIdxTick(existingBepRaw);

    gainToBepBeforePct = round2(((existingBepTick - baseRefPrice) / baseRefPrice) * 100);
    gainToBepAfterPct = round2(((bepIdxTick - baseRefPrice) / baseRefPrice) * 100);
  }

  const fairValueModerate = input.fairValueModerate ?? null;
  const isAboveFairValue =
    fairValueModerate !== null && effectiveAvgPrice > fairValueModerate;
  const isAverageUp =
    input.existingLots > 0 &&
    plannedGross > 0 &&
    plannedGross / plannedShares > input.existingAvgPrice;

  return {
    valid: true,
    existingShares,
    plannedShares,
    totalShares,
    totalLots: totalShares / SHARES_PER_LOT,
    existingGross,
    plannedGross,
    totalGrossBuy,
    totalBuyFee,
    plannedBuyFee,
    stampDutyBuy,
    totalCost,
    plannedCashRequired,
    pureAvgPrice,
    effectiveAvgPrice,
    bepRaw,
    bepIdxTick,
    grossSell,
    sellFee,
    stampDutySell,
    netProceeds,
    netPnL,
    netPnLPct,
    gainToBepBeforePct,
    gainToBepAfterPct,
    guardrails: {
      isAboveFairValue,
      isAverageUp,
    },
  };
}

export interface PositionSummary {
  ownedLots: number;
  ownedShares: number;
  avgBuyPrice: number | null;
  grossCostBasis: number;
  estimatedBuyFee: number;
  costBasis: number;
  grossMarketValue: number;
  estimatedSellFee: number;
  estimatedSellStampDuty: number;
  marketValue: number;
  unrealizedPnL: number | null;
  unrealizedPnLPct: number | null;
}

export function aggregateHoldingTranches(tranches: PlannedTranche[]): {
  ownedLots: number;
  avgBuyPrice: number | null;
} {
  let totalLots = 0;
  let totalWeighted = 0;
  for (const t of tranches) {
    if (Number.isInteger(t.lots) && t.lots > 0 && t.buyPrice >= MIN_IDX_PRICE) {
      totalLots += t.lots;
      totalWeighted += t.lots * t.buyPrice;
    }
  }
  if (totalLots === 0) {
    return { ownedLots: 0, avgBuyPrice: null };
  }
  return {
    ownedLots: totalLots,
    avgBuyPrice: Math.round(totalWeighted / totalLots),
  };
}

/**
 * Computes net holding position value after all Stockbit fees:
 * - Net Market Value = Gross Market Value - Sell Fee (0.25%) - Stamp Duty (Rp 10,000 if > Rp 10,000,000)
 * - Total Cost Basis = Gross Cost + Buy Fee (0.15%)
 * - Net Unrealized P/L = Net Market Value - Total Cost Basis
 */
export function calculatePositionSummary(
  ownedLots: number,
  avgBuyPrice: number | null,
  currentPrice: number,
  buyFeePct: number = DEFAULT_BUY_FEE_PCT,
  sellFeePct: number = DEFAULT_SELL_FEE_PCT,
): PositionSummary {
  const safeLots = Math.max(0, Math.floor(ownedLots));
  const ownedShares = safeLots * SHARES_PER_LOT;
  const grossMarketValue = ownedShares * currentPrice;
  const estimatedSellFee = Math.round(grossMarketValue * (sellFeePct / 100));
  const estimatedSellStampDuty =
    grossMarketValue > STAMP_DUTY_THRESHOLD_IDR ? STAMP_DUTY_IDR : 0;
  const marketValue = Math.max(
    0,
    grossMarketValue - estimatedSellFee - estimatedSellStampDuty,
  );

  if (safeLots === 0 || avgBuyPrice === null || avgBuyPrice < MIN_IDX_PRICE) {
    return {
      ownedLots: safeLots,
      ownedShares,
      avgBuyPrice: safeLots > 0 ? avgBuyPrice : null,
      grossCostBasis: 0,
      estimatedBuyFee: 0,
      costBasis: 0,
      grossMarketValue,
      estimatedSellFee,
      estimatedSellStampDuty,
      marketValue,
      unrealizedPnL: null,
      unrealizedPnLPct: null,
    };
  }

  const grossCostBasis = ownedShares * avgBuyPrice;
  const estimatedBuyFee = Math.round(grossCostBasis * (buyFeePct / 100));
  const costBasis = grossCostBasis + estimatedBuyFee;
  const unrealizedPnL = marketValue - costBasis;
  const unrealizedPnLPct = round2((unrealizedPnL / costBasis) * 100);

  return {
    ownedLots: safeLots,
    ownedShares,
    avgBuyPrice,
    grossCostBasis,
    estimatedBuyFee,
    costBasis,
    grossMarketValue,
    estimatedSellFee,
    estimatedSellStampDuty,
    marketValue,
    unrealizedPnL,
    unrealizedPnLPct,
  };
}

export function calculateGoalSeekAverageDown(input: GoalSeekInput): GoalSeekOutput {
  const buyFeePct = input.buyFeePct ?? DEFAULT_BUY_FEE_PCT;
  const includeStampDuty = input.includeStampDuty ?? false;

  if (buyFeePct < 0) {
    return { valid: false, errorCode: 'INVALID_FEE_RATE' };
  }

  if (
    !Number.isInteger(input.existingLots) ||
    input.existingLots <= 0 ||
    input.plannedBuyPrice < MIN_IDX_PRICE ||
    !(input.plannedBuyPrice < input.targetPureAvg && input.targetPureAvg < input.existingAvgPrice)
  ) {
    return { valid: false, errorCode: 'INVALID_GOAL_SEEK_BOUNDS' };
  }

  const lotsNeeded = Math.ceil(
    (input.existingLots * (input.existingAvgPrice - input.targetPureAvg)) /
      (input.targetPureAvg - input.plannedBuyPrice),
  );
  const resultingPureAvg = round2(
    (input.existingLots * input.existingAvgPrice + lotsNeeded * input.plannedBuyPrice) /
      (input.existingLots + lotsNeeded),
  );
  const sharesNeeded = lotsNeeded * SHARES_PER_LOT;
  const cashGross = sharesNeeded * input.plannedBuyPrice;
  const cashBuyFee = Math.round(cashGross * (buyFeePct / 100));
  const cashStampDuty =
    includeStampDuty && cashGross > STAMP_DUTY_THRESHOLD_IDR ? STAMP_DUTY_IDR : 0;
  const totalCashRequired = cashGross + cashBuyFee + cashStampDuty;

  return {
    valid: true,
    lotsNeeded,
    sharesNeeded,
    resultingPureAvg,
    cashGross,
    cashBuyFee,
    cashStampDuty,
    totalCashRequired,
  };
}
