import {
  ceilToIdxTick,
  DEFAULT_BUY_FEE_PCT,
  DEFAULT_SELL_FEE_PCT,
  floorToIdxTick,
  MIN_IDX_PRICE,
  round2,
  SHARES_PER_LOT,
  STAMP_DUTY_IDR,
  STAMP_DUTY_THRESHOLD_IDR,
  type IdxSector,
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

export type PositionCalcMode = 'NET_AFTER_FEES' | 'BROKER_GROSS';

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
    avgBuyPrice: round2(totalWeighted / totalLots),
  };
}

/**
 * Computes holding position summary in either:
 * - NET_AFTER_FEES (default): adds buy fee (0.15% broker + exchange fee) to cost basis and
 *   deducts sell fee (0.25% broker + exchange fee + PPh Final 0.1%). Optional stamp duty
 *   (Rp 10,000 if > Rp 10M) defaults to false because IDX stamp duty applies per daily Trade
 *   Confirmation rather than per stock holding.
 * - BROKER_GROSS: compares current price directly against entered average price without adding
 *   extra buy fee or deducting sell fee (matches standard Stockbit portfolio return %).
 */
export function calculatePositionSummary(
  ownedLots: number,
  avgBuyPrice: number | null,
  currentPrice: number,
  buyFeePct: number = DEFAULT_BUY_FEE_PCT,
  sellFeePct: number = DEFAULT_SELL_FEE_PCT,
  mode: PositionCalcMode = 'NET_AFTER_FEES',
  includeStampDuty: boolean = false,
): PositionSummary {
  const isGrossMode = mode === 'BROKER_GROSS';
  const effectiveBuyFeePct = isGrossMode ? 0 : buyFeePct;
  const effectiveSellFeePct = isGrossMode ? 0 : sellFeePct;
  const safeLots = Math.max(0, Math.floor(ownedLots));
  const ownedShares = safeLots * SHARES_PER_LOT;
  const grossMarketValue = ownedShares * currentPrice;
  const estimatedSellFee = Math.round(grossMarketValue * (effectiveSellFeePct / 100));
  const estimatedSellStampDuty =
    !isGrossMode && includeStampDuty && grossMarketValue > STAMP_DUTY_THRESHOLD_IDR
      ? STAMP_DUTY_IDR
      : 0;
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

  const grossCostBasis = Math.round(ownedShares * avgBuyPrice);
  const estimatedBuyFee = Math.round(grossCostBasis * (effectiveBuyFeePct / 100));
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

export const MAX_SINGLE_STOCK_WEIGHT_PCT = 25;
export const MAX_SECTOR_WEIGHT_PCT = 40;

export interface PortfolioHoldingInput {
  ticker: string;
  companyName: string;
  sector: IdxSector;
  ownedLots: number;
  avgBuyPrice: number | null;
  currentPrice: number;
}

export interface PortfolioStockWeight {
  ticker: string;
  companyName: string;
  sector: IdxSector;
  ownedLots: number;
  investedCapital: number;
  netMarketValue: number;
  unrealizedPnL: number;
  unrealizedPnLPct: number;
  weightPct: number;
  isOverweight: boolean;
}

export interface PortfolioSectorWeight {
  sector: IdxSector;
  stockCount: number;
  investedCapital: number;
  netMarketValue: number;
  weightPct: number;
  isOverconcentrated: boolean;
}

export type PortfolioRiskAlertCode =
  | 'SINGLE_STOCK_CONCENTRATION'
  | 'SECTOR_CONCENTRATION';

export interface PortfolioRiskAlert {
  code: PortfolioRiskAlertCode;
  target: string;
  weightPct: number;
  thresholdPct: number;
}

export interface PortfolioRiskSummary {
  activeHoldingsCount: number;
  totalInvestedCapital: number;
  totalNetMarketValue: number;
  totalUnrealizedPnL: number;
  totalUnrealizedPnLPct: number;
  stockWeights: PortfolioStockWeight[];
  sectorWeights: PortfolioSectorWeight[];
  alerts: PortfolioRiskAlert[];
}

export function analyzePortfolioRisk(
  holdings: PortfolioHoldingInput[],
  mode: PositionCalcMode = 'NET_AFTER_FEES',
): PortfolioRiskSummary {
  const active = holdings
    .map((h) => ({
      holding: h,
      summary: calculatePositionSummary(
        h.ownedLots,
        h.avgBuyPrice,
        h.currentPrice,
        DEFAULT_BUY_FEE_PCT,
        DEFAULT_SELL_FEE_PCT,
        mode,
      ),
    }))
    .filter((entry) => entry.summary.ownedLots > 0 && entry.summary.costBasis > 0);

  if (active.length === 0) {
    return {
      activeHoldingsCount: 0,
      totalInvestedCapital: 0,
      totalNetMarketValue: 0,
      totalUnrealizedPnL: 0,
      totalUnrealizedPnLPct: 0,
      stockWeights: [],
      sectorWeights: [],
      alerts: [],
    };
  }

  const totalInvestedCapital = active.reduce((sum, e) => sum + e.summary.costBasis, 0);
  const totalNetMarketValue = active.reduce((sum, e) => sum + e.summary.marketValue, 0);
  const totalUnrealizedPnL = totalNetMarketValue - totalInvestedCapital;
  const totalUnrealizedPnLPct = round2((totalUnrealizedPnL / totalInvestedCapital) * 100);

  const hasMultipleHoldings = active.length >= 2;
  const alerts: PortfolioRiskAlert[] = [];

  const stockWeights: PortfolioStockWeight[] = active
    .map(({ holding, summary }) => {
      const weightPct = round2((summary.marketValue / totalNetMarketValue) * 100);
      const isOverweight = hasMultipleHoldings && weightPct > MAX_SINGLE_STOCK_WEIGHT_PCT;
      if (isOverweight) {
        alerts.push({
          code: 'SINGLE_STOCK_CONCENTRATION',
          target: holding.ticker,
          weightPct,
          thresholdPct: MAX_SINGLE_STOCK_WEIGHT_PCT,
        });
      }
      return {
        ticker: holding.ticker,
        companyName: holding.companyName,
        sector: holding.sector,
        ownedLots: summary.ownedLots,
        investedCapital: summary.costBasis,
        netMarketValue: summary.marketValue,
        unrealizedPnL: summary.unrealizedPnL!,
        unrealizedPnLPct: summary.unrealizedPnLPct!,
        weightPct,
        isOverweight,
      };
    })
    .sort((a, b) => b.netMarketValue - a.netMarketValue);

  const sectorMap = new Map<
    IdxSector,
    { stockCount: number; investedCapital: number; netMarketValue: number }
  >();
  for (const item of stockWeights) {
    const existing = sectorMap.get(item.sector);
    if (existing) {
      existing.stockCount += 1;
      existing.investedCapital += item.investedCapital;
      existing.netMarketValue += item.netMarketValue;
    } else {
      sectorMap.set(item.sector, {
        stockCount: 1,
        investedCapital: item.investedCapital,
        netMarketValue: item.netMarketValue,
      });
    }
  }

  const sectorWeights: PortfolioSectorWeight[] = Array.from(sectorMap.entries())
    .map(([sector, data]) => {
      const weightPct = round2((data.netMarketValue / totalNetMarketValue) * 100);
      const isOverconcentrated = hasMultipleHoldings && weightPct > MAX_SECTOR_WEIGHT_PCT;
      if (isOverconcentrated) {
        alerts.push({
          code: 'SECTOR_CONCENTRATION',
          target: sector,
          weightPct,
          thresholdPct: MAX_SECTOR_WEIGHT_PCT,
        });
      }
      return {
        sector,
        stockCount: data.stockCount,
        investedCapital: data.investedCapital,
        netMarketValue: data.netMarketValue,
        weightPct,
        isOverconcentrated,
      };
    })
    .sort((a, b) => b.netMarketValue - a.netMarketValue);

  return {
    activeHoldingsCount: active.length,
    totalInvestedCapital,
    totalNetMarketValue,
    totalUnrealizedPnL,
    totalUnrealizedPnLPct,
    stockWeights,
    sectorWeights,
    alerts,
  };
}

export type PyramidingStrategy =
  | 'PYRAMID_20_30_50'
  | 'EQUAL_33_33_34'
  | 'AGGRESSIVE_15_35_50';

export interface PyramidingPlanInput {
  existingLots: number;
  existingAvgPrice: number;
  totalCashBudget: number;
  referencePrice: number;
  stepDiscountPct: number;
  strategy: PyramidingStrategy;
  targetSellPrice: number;
  buyFeePct?: number;
  sellFeePct?: number;
  includeStampDuty?: boolean;
  fairValueModerate?: number | null;
}

export interface PyramidingStage {
  stageNumber: number;
  allocationWeightPct: number;
  allocatedBudget: number;
  triggerPrice: number;
  lots: number;
  shares: number;
  grossCost: number;
  buyFee: number;
  cashUsed: number;
  unusedCash: number;
  cumulativeLots: number;
  cumulativePureAvg: number;
}

export interface PyramidingPlanResult {
  valid: true;
  strategy: PyramidingStrategy;
  totalCashBudget: number;
  totalCashUsed: number;
  remainingIdleCash: number;
  stages: PyramidingStage[];
  plannedTranches: PlannedTranche[];
  simulation: ForwardSimulationResult;
}

export type PyramidingPlanOutput = PyramidingPlanResult | SimulationInvalidResult;

const PYRAMID_WEIGHTS: Record<PyramidingStrategy, readonly [number, number, number]> = {
  PYRAMID_20_30_50: [20, 30, 50],
  EQUAL_33_33_34: [33, 33, 34],
  AGGRESSIVE_15_35_50: [15, 35, 50],
};

export function planPyramidingAllocation(
  input: PyramidingPlanInput,
): PyramidingPlanOutput {
  const buyFeePct = input.buyFeePct ?? DEFAULT_BUY_FEE_PCT;
  const sellFeePct = input.sellFeePct ?? DEFAULT_SELL_FEE_PCT;
  const includeStampDuty = input.includeStampDuty ?? false;

  if (buyFeePct < 0 || sellFeePct < 0 || sellFeePct >= 100) {
    return { valid: false, errorCode: 'INVALID_FEE_RATE' };
  }

  if (!Number.isInteger(input.existingLots) || input.existingLots < 0) {
    return { valid: false, errorCode: 'INVALID_POSITION' };
  }

  if (input.existingLots > 0 && input.existingAvgPrice < MIN_IDX_PRICE) {
    return { valid: false, errorCode: 'INVALID_EXISTING_PRICE' };
  }

  if (
    input.totalCashBudget <= 0 ||
    input.referencePrice < MIN_IDX_PRICE ||
    input.stepDiscountPct < 1 ||
    input.stepDiscountPct > 30
  ) {
    return { valid: false, errorCode: 'INVALID_TRANCHE' };
  }

  if (input.targetSellPrice < MIN_IDX_PRICE) {
    return { valid: false, errorCode: 'INVALID_TARGET_SELL_PRICE' };
  }

  const weights = PYRAMID_WEIGHTS[input.strategy];
  const fBuy = buyFeePct / 100;

  let runningLots = input.existingLots;
  let runningGross =
    input.existingLots > 0
      ? input.existingLots * SHARES_PER_LOT * input.existingAvgPrice
      : 0;
  let totalCashUsed = 0;

  const stages: PyramidingStage[] = [];
  const plannedTranches: PlannedTranche[] = [];

  for (let i = 0; i < weights.length; i++) {
    const weightPct = weights[i]!;
    const allocatedBudget = Math.floor((input.totalCashBudget * weightPct) / 100);
    const rawTrigger = input.referencePrice * (1 - (i * input.stepDiscountPct) / 100);
    const triggerPrice = floorToIdxTick(rawTrigger);
    const costPerLotWithFee = triggerPrice * SHARES_PER_LOT * (1 + fBuy);
    const lots = Math.max(0, Math.floor(allocatedBudget / costPerLotWithFee));
    const shares = lots * SHARES_PER_LOT;
    const grossCost = shares * triggerPrice;
    const buyFee = Math.round(grossCost * fBuy);
    const cashUsed = grossCost + buyFee;
    const unusedCash = Math.max(0, allocatedBudget - cashUsed);

    if (lots > 0) {
      runningLots += lots;
      runningGross += grossCost;
      totalCashUsed += cashUsed;
      plannedTranches.push({ lots, buyPrice: triggerPrice });
    }

    const cumulativePureAvg =
      runningLots > 0 ? round2(runningGross / (runningLots * SHARES_PER_LOT)) : 0;

    stages.push({
      stageNumber: i + 1,
      allocationWeightPct: weightPct,
      allocatedBudget,
      triggerPrice,
      lots,
      shares,
      grossCost,
      buyFee,
      cashUsed,
      unusedCash,
      cumulativeLots: runningLots,
      cumulativePureAvg,
    });
  }

  if (plannedTranches.length === 0) {
    return { valid: false, errorCode: 'INVALID_TRANCHE' };
  }

  const simOut = simulateForwardAverageDown({
    existingLots: input.existingLots,
    existingAvgPrice: input.existingAvgPrice,
    plannedTranches,
    targetSellPrice: input.targetSellPrice,
    buyFeePct,
    sellFeePct,
    includeStampDuty,
    fairValueModerate: input.fairValueModerate,
    referenceCurrentPrice: input.referencePrice,
  }) as ForwardSimulationResult;

  return {
    valid: true,
    strategy: input.strategy,
    totalCashBudget: input.totalCashBudget,
    totalCashUsed,
    remainingIdleCash: Math.max(0, input.totalCashBudget - totalCashUsed),
    stages,
    plannedTranches,
    simulation: simOut,
  };
}

export interface TakeProfitRungInput {
  lotsToSell: number;
  targetSellPrice: number;
}

export interface TakeProfitLadderInput {
  totalOwnedLots: number;
  avgBuyPrice: number;
  rungs: TakeProfitRungInput[];
  buyFeePct?: number;
  sellFeePct?: number;
  includeStampDuty?: boolean;
}

export interface TakeProfitRungResult {
  rungNumber: number;
  lotsSold: number;
  sharesSold: number;
  sellPctOfTotal: number;
  targetSellPrice: number;
  grossProceeds: number;
  sellFee: number;
  stampDuty: number;
  netProceeds: number;
  allocatedCostBasis: number;
  realizedNetPnL: number;
  realizedPnLPct: number;
}

export interface TakeProfitLadderResult {
  valid: true;
  totalOwnedLots: number;
  totalLotsSold: number;
  remainingLots: number;
  totalInitialCostBasis: number;
  totalAllocatedCostBasis: number;
  totalNetProceeds: number;
  totalRealizedNetPnL: number;
  totalRealizedPnLPct: number;
  unrecoveredCapital: number;
  remainingEffectiveCostPerShare: number;
  isFreeRidePosition: boolean;
  rungs: TakeProfitRungResult[];
}

export type TakeProfitLadderOutput = TakeProfitLadderResult | SimulationInvalidResult;

export function simulateTakeProfitLadder(
  input: TakeProfitLadderInput,
): TakeProfitLadderOutput {
  const buyFeePct = input.buyFeePct ?? DEFAULT_BUY_FEE_PCT;
  const sellFeePct = input.sellFeePct ?? DEFAULT_SELL_FEE_PCT;
  const includeStampDuty = input.includeStampDuty ?? false;

  if (buyFeePct < 0 || sellFeePct < 0 || sellFeePct >= 100) {
    return { valid: false, errorCode: 'INVALID_FEE_RATE' };
  }

  if (!Number.isInteger(input.totalOwnedLots) || input.totalOwnedLots < 1) {
    return { valid: false, errorCode: 'INVALID_POSITION' };
  }

  if (input.avgBuyPrice < MIN_IDX_PRICE) {
    return { valid: false, errorCode: 'INVALID_EXISTING_PRICE' };
  }

  if (input.rungs.length < 1 || input.rungs.length > 5) {
    return { valid: false, errorCode: 'INVALID_TRANCHE' };
  }

  let totalLotsSold = 0;
  for (const rung of input.rungs) {
    if (
      !Number.isInteger(rung.lotsToSell) ||
      rung.lotsToSell < 1 ||
      rung.targetSellPrice < MIN_IDX_PRICE
    ) {
      return { valid: false, errorCode: 'INVALID_TRANCHE' };
    }
    totalLotsSold += rung.lotsToSell;
  }

  if (totalLotsSold > input.totalOwnedLots) {
    return { valid: false, errorCode: 'INVALID_TRANCHE' };
  }

  const fBuy = buyFeePct / 100;
  const fSell = sellFeePct / 100;

  const totalOwnedShares = input.totalOwnedLots * SHARES_PER_LOT;
  const totalInitialGross = totalOwnedShares * input.avgBuyPrice;
  const totalInitialCostBasis = totalInitialGross + Math.round(totalInitialGross * fBuy);

  let totalAllocatedCostBasis = 0;
  let totalNetProceeds = 0;

  const rungs: TakeProfitRungResult[] = input.rungs.map((rung, idx) => {
    const sharesSold = rung.lotsToSell * SHARES_PER_LOT;
    const sellPctOfTotal = round2((rung.lotsToSell / input.totalOwnedLots) * 100);
    const grossProceeds = sharesSold * rung.targetSellPrice;
    const sellFee = Math.round(grossProceeds * fSell);
    const stampDuty =
      includeStampDuty && grossProceeds > STAMP_DUTY_THRESHOLD_IDR ? STAMP_DUTY_IDR : 0;
    const netProceeds = grossProceeds - sellFee - stampDuty;

    const rungGrossCost = sharesSold * input.avgBuyPrice;
    const allocatedCostBasis = rungGrossCost + Math.round(rungGrossCost * fBuy);
    const realizedNetPnL = netProceeds - allocatedCostBasis;
    const realizedPnLPct = round2((realizedNetPnL / allocatedCostBasis) * 100);

    totalAllocatedCostBasis += allocatedCostBasis;
    totalNetProceeds += netProceeds;

    return {
      rungNumber: idx + 1,
      lotsSold: rung.lotsToSell,
      sharesSold,
      sellPctOfTotal,
      targetSellPrice: rung.targetSellPrice,
      grossProceeds,
      sellFee,
      stampDuty,
      netProceeds,
      allocatedCostBasis,
      realizedNetPnL,
      realizedPnLPct,
    };
  });

  const totalRealizedNetPnL = totalNetProceeds - totalAllocatedCostBasis;
  const totalRealizedPnLPct = round2(
    (totalRealizedNetPnL / totalAllocatedCostBasis) * 100,
  );
  const remainingLots = input.totalOwnedLots - totalLotsSold;
  const unrecoveredCapital = Math.max(0, totalInitialCostBasis - totalNetProceeds);
  const remainingEffectiveCostPerShare =
    remainingLots > 0
      ? Math.round(unrecoveredCapital / (remainingLots * SHARES_PER_LOT))
      : 0;
  const isFreeRidePosition = remainingLots > 0 && unrecoveredCapital === 0;

  return {
    valid: true,
    totalOwnedLots: input.totalOwnedLots,
    totalLotsSold,
    remainingLots,
    totalInitialCostBasis,
    totalAllocatedCostBasis,
    totalNetProceeds,
    totalRealizedNetPnL,
    totalRealizedPnLPct,
    unrecoveredCapital,
    remainingEffectiveCostPerShare,
    isFreeRidePosition,
    rungs,
  };
}
