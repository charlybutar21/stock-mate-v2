import { describe, expect, it } from 'vitest';
import {
  aggregateHoldingTranches,
  analyzePortfolioRisk,
  calculateGoalSeekAverageDown,
  calculatePositionSummary,
  planPyramidingAllocation,
  simulateForwardAverageDown,
  simulateTakeProfitLadder,
} from '../simulator';

describe('simulator engine', () => {
  it('matches Golden Case 3 — Average Down Forward + Stockbit Fees (without & with Bea Materai)', () => {
    const baseInput = {
      existingLots: 20,
      existingAvgPrice: 5000,
      plannedTranches: [{ lots: 30, buyPrice: 4000 }],
      targetSellPrice: 4800,
      buyFeePct: 0.15,
      sellFeePct: 0.25,
    };

    const withoutStamp = simulateForwardAverageDown({
      ...baseInput,
      includeStampDuty: false,
      fairValueModerate: 4200,
      referenceCurrentPrice: 4000,
    });
    expect(withoutStamp.valid).toBe(true);
    if (!withoutStamp.valid) return;

    expect(withoutStamp.totalShares).toBe(5000);
    expect(withoutStamp.totalGrossBuy).toBe(22_000_000);
    expect(withoutStamp.totalBuyFee).toBe(33_000);
    expect(withoutStamp.stampDutyBuy).toBe(0);
    expect(withoutStamp.totalCost).toBe(22_033_000);
    expect(withoutStamp.pureAvgPrice).toBe(4400);
    expect(withoutStamp.effectiveAvgPrice).toBe(4406.6);
    expect(withoutStamp.bepRaw).toBe(4417.64);
    expect(withoutStamp.bepIdxTick).toBe(4420);
    expect(withoutStamp.grossSell).toBe(24_000_000);
    expect(withoutStamp.sellFee).toBe(60_000);
    expect(withoutStamp.stampDutySell).toBe(0);
    expect(withoutStamp.netProceeds).toBe(23_940_000);
    expect(withoutStamp.netPnL).toBe(1_907_000);
    expect(withoutStamp.netPnLPct).toBe(8.66);
    expect(withoutStamp.guardrails).toEqual({
      isAboveFairValue: true,
      isAverageUp: false,
    });
    expect(withoutStamp.gainToBepBeforePct).toBeGreaterThan(withoutStamp.gainToBepAfterPct!);

    const withStamp = simulateForwardAverageDown({
      ...baseInput,
      includeStampDuty: true,
    });
    expect(withStamp.valid).toBe(true);
    if (!withStamp.valid) return;

    expect(withStamp.stampDutyBuy).toBe(10_000);
    expect(withStamp.stampDutySell).toBe(10_000);
    expect(withStamp.bepRaw).toBe(4421.65);
    expect(withStamp.bepIdxTick).toBe(4430);
    expect(withStamp.netPnL).toBe(1_887_000);
    expect(withStamp.netPnLPct).toBe(8.56);
    expect(withStamp.guardrails.isAboveFairValue).toBe(false);
  });

  it('matches Golden Case 4 — Goal-Seek Calculator (without & with Bea Materai)', () => {
    const noStamp = calculateGoalSeekAverageDown({
      existingLots: 20,
      existingAvgPrice: 5000,
      plannedBuyPrice: 4000,
      targetPureAvg: 4300,
      buyFeePct: 0.15,
      includeStampDuty: false,
    });
    expect(noStamp.valid).toBe(true);
    if (!noStamp.valid) return;
    expect(noStamp.lotsNeeded).toBe(47);
    expect(noStamp.sharesNeeded).toBe(4700);
    expect(noStamp.resultingPureAvg).toBe(4298.51);
    expect(noStamp.cashGross).toBe(18_800_000);
    expect(noStamp.cashBuyFee).toBe(28_200);
    expect(noStamp.cashStampDuty).toBe(0);
    expect(noStamp.totalCashRequired).toBe(18_828_200);

    const withStamp = calculateGoalSeekAverageDown({
      existingLots: 20,
      existingAvgPrice: 5000,
      plannedBuyPrice: 4000,
      targetPureAvg: 4300,
      includeStampDuty: true,
    });
    expect(withStamp.valid).toBe(true);
    if (!withStamp.valid) return;
    expect(withStamp.cashStampDuty).toBe(10_000);
    expect(withStamp.totalCashRequired).toBe(18_838_200);
  });

  it('handles average-up, small transactions below stamp threshold, and all validation errors', () => {
    // Average up & small gross (< 10M) with includeStampDuty = true
    const avgUp = simulateForwardAverageDown({
      existingLots: 1,
      existingAvgPrice: 100,
      plannedTranches: [{ lots: 1, buyPrice: 150 }],
      targetSellPrice: 160,
      includeStampDuty: true,
    });
    expect(avgUp.valid).toBe(true);
    if (avgUp.valid) {
      expect(avgUp.stampDutyBuy).toBe(0);
      expect(avgUp.stampDutySell).toBe(0);
      expect(avgUp.guardrails.isAverageUp).toBe(true);
    }

    // New position only (existingLots = 0)
    const freshOnly = simulateForwardAverageDown({
      existingLots: 0,
      existingAvgPrice: 0,
      plannedTranches: [{ lots: 10, buyPrice: 500 }],
      targetSellPrice: 600,
    });
    expect(freshOnly.valid).toBe(true);
    if (freshOnly.valid) {
      expect(freshOnly.gainToBepBeforePct).toBeNull();
      expect(freshOnly.gainToBepAfterPct).toBeNull();
    }

    // Validation error cases
    expect(
      simulateForwardAverageDown({
        existingLots: 10,
        existingAvgPrice: 1000,
        plannedTranches: [],
        targetSellPrice: 1100,
        buyFeePct: -1,
      }),
    ).toEqual({ valid: false, errorCode: 'INVALID_FEE_RATE' });

    expect(
      simulateForwardAverageDown({
        existingLots: -1,
        existingAvgPrice: 1000,
        plannedTranches: [],
        targetSellPrice: 1100,
      }),
    ).toEqual({ valid: false, errorCode: 'INVALID_POSITION' });

    expect(
      simulateForwardAverageDown({
        existingLots: 10,
        existingAvgPrice: 0,
        plannedTranches: [],
        targetSellPrice: 1100,
      }),
    ).toEqual({ valid: false, errorCode: 'INVALID_EXISTING_PRICE' });

    expect(
      simulateForwardAverageDown({
        existingLots: 10,
        existingAvgPrice: 1000,
        plannedTranches: [],
        targetSellPrice: 0,
      }),
    ).toEqual({ valid: false, errorCode: 'INVALID_TARGET_SELL_PRICE' });

    expect(
      simulateForwardAverageDown({
        existingLots: 0,
        existingAvgPrice: 0,
        plannedTranches: [
          { lots: 1, buyPrice: 100 },
          { lots: 1, buyPrice: 100 },
          { lots: 1, buyPrice: 100 },
          { lots: 1, buyPrice: 100 },
          { lots: 1, buyPrice: 100 },
          { lots: 1, buyPrice: 100 },
        ],
        targetSellPrice: 100,
      }),
    ).toEqual({ valid: false, errorCode: 'INVALID_TRANCHE' });

    expect(
      simulateForwardAverageDown({
        existingLots: 0,
        existingAvgPrice: 0,
        plannedTranches: [{ lots: 0, buyPrice: 100 }],
        targetSellPrice: 100,
      }),
    ).toEqual({ valid: false, errorCode: 'INVALID_TRANCHE' });

    expect(
      simulateForwardAverageDown({
        existingLots: 0,
        existingAvgPrice: 0,
        plannedTranches: [],
        targetSellPrice: 100,
      }),
    ).toEqual({ valid: false, errorCode: 'INVALID_POSITION' });

    expect(
      calculateGoalSeekAverageDown({
        existingLots: 10,
        existingAvgPrice: 5000,
        plannedBuyPrice: 4000,
        targetPureAvg: 4500,
        buyFeePct: -0.5,
      }),
    ).toEqual({ valid: false, errorCode: 'INVALID_FEE_RATE' });

    expect(
      calculateGoalSeekAverageDown({
        existingLots: 10,
        existingAvgPrice: 5000,
        plannedBuyPrice: 4500,
        targetPureAvg: 4500,
      }),
    ).toEqual({ valid: false, errorCode: 'INVALID_GOAL_SEEK_BOUNDS' });
  });

  it('aggregates multiple holding tranches & computes Net Market Value after Stockbit sell fee + stamp duty', () => {
    expect(aggregateHoldingTranches([])).toEqual({ ownedLots: 0, avgBuyPrice: null });
    expect(
      aggregateHoldingTranches([
        { lots: 10, buyPrice: 1200 },
        { lots: 20, buyPrice: 1050 },
        { lots: 0, buyPrice: 900 }, // ignored
      ]),
    ).toEqual({ ownedLots: 30, avgBuyPrice: 1100 });

    // Preserves 2-decimal precision on weighted average & decimal buy prices (e.g. Stockbit Avg)
    expect(
      aggregateHoldingTranches([
        { lots: 3, buyPrice: 5000 },
        { lots: 4, buyPrice: 4550 },
      ]),
    ).toEqual({ ownedLots: 7, avgBuyPrice: 4742.86 });

    const decimalPos = calculatePositionSummary(10, 4825.67, 2860);
    expect(decimalPos.grossCostBasis).toBe(4_825_670);
    expect(decimalPos.avgBuyPrice).toBe(4825.67);

    expect(calculatePositionSummary(0, 5000, 5500)).toEqual({
      ownedLots: 0,
      ownedShares: 0,
      avgBuyPrice: null,
      grossCostBasis: 0,
      estimatedBuyFee: 0,
      costBasis: 0,
      grossMarketValue: 0,
      estimatedSellFee: 0,
      estimatedSellStampDuty: 0,
      marketValue: 0,
      unrealizedPnL: null,
      unrealizedPnLPct: null,
    });

    // Under Rp 10M: 10 lots @ Rp 5,500 = 5,500,000 gross -> sellFee 0.25% = 13,750, stamp = 0 -> net = 5,486,250
    expect(calculatePositionSummary(10, null, 5500)).toEqual({
      ownedLots: 10,
      ownedShares: 1000,
      avgBuyPrice: null,
      grossCostBasis: 0,
      estimatedBuyFee: 0,
      costBasis: 0,
      grossMarketValue: 5_500_000,
      estimatedSellFee: 13_750,
      estimatedSellStampDuty: 0,
      marketValue: 5_486_250,
      unrealizedPnL: null,
      unrealizedPnLPct: null,
    });

    // Over Rp 10M default (includeStampDuty = false): 20 lots @ avg 5000, current 5500
    // grossMV 11,000,000 -> sellFee 27,500, stamp = 0 -> netMV 10,972,500
    // grossCost 10,000,000 + buyFee 15,000 = 10,015,000 -> netPnL = +957,500 (+9.56%)
    expect(calculatePositionSummary(20, 5000, 5500)).toEqual({
      ownedLots: 20,
      ownedShares: 2000,
      avgBuyPrice: 5000,
      grossCostBasis: 10_000_000,
      estimatedBuyFee: 15_000,
      costBasis: 10_015_000,
      grossMarketValue: 11_000_000,
      estimatedSellFee: 27_500,
      estimatedSellStampDuty: 0,
      marketValue: 10_972_500,
      unrealizedPnL: 957_500,
      unrealizedPnLPct: 9.56,
    });

    // Over Rp 10M with explicit includeStampDuty = true -> deducts Rp 10,000 stamp duty -> netMV 10,962,500 (+9.46%)
    expect(
      calculatePositionSummary(20, 5000, 5500, 0.15, 0.25, 'NET_AFTER_FEES', true),
    ).toEqual({
      ownedLots: 20,
      ownedShares: 2000,
      avgBuyPrice: 5000,
      grossCostBasis: 10_000_000,
      estimatedBuyFee: 15_000,
      costBasis: 10_015_000,
      grossMarketValue: 11_000_000,
      estimatedSellFee: 27_500,
      estimatedSellStampDuty: 10_000,
      marketValue: 10_962_500,
      unrealizedPnL: 947_500,
      unrealizedPnLPct: 9.46,
    });

    // BROKER_GROSS mode (Stockbit-style): no extra buy fee, no sell fee, no stamp duty
    expect(calculatePositionSummary(20, 5000, 5500, 0.15, 0.25, 'BROKER_GROSS')).toEqual({
      ownedLots: 20,
      ownedShares: 2000,
      avgBuyPrice: 5000,
      grossCostBasis: 10_000_000,
      estimatedBuyFee: 0,
      costBasis: 10_000_000,
      grossMarketValue: 11_000_000,
      estimatedSellFee: 0,
      estimatedSellStampDuty: 0,
      marketValue: 11_000_000,
      unrealizedPnL: 1_000_000,
      unrealizedPnLPct: 10,
    });

    // Exact 2-decimal Stockbit-style loss match: avg 4825.67, current 2857 -> -40.80%
    const stockbitMatch = calculatePositionSummary(10, 4825.67, 2857, 0.15, 0.25, 'BROKER_GROSS');
    expect(stockbitMatch.unrealizedPnLPct).toBe(-40.8);
  });

  it('analyzes Portfolio Risk & Sector X-Ray weights and concentration alerts (Use Case 1)', () => {
    expect(
      analyzePortfolioRisk([
        {
          ticker: 'BBCA',
          companyName: 'Bank Central Asia',
          sector: 'FINANCIALS',
          ownedLots: 0,
          avgBuyPrice: null,
          currentPrice: 9000,
        },
      ]),
    ).toEqual({
      activeHoldingsCount: 0,
      totalInvestedCapital: 0,
      totalNetMarketValue: 0,
      totalUnrealizedPnL: 0,
      totalUnrealizedPnLPct: 0,
      stockWeights: [],
      sectorWeights: [],
      alerts: [],
    });

    const risk = analyzePortfolioRisk([
      {
        ticker: 'BBCA',
        companyName: 'Bank Central Asia',
        sector: 'FINANCIALS',
        ownedLots: 10,
        avgBuyPrice: 8000,
        currentPrice: 9000, // ~9M
      },
      {
        ticker: 'BBRI',
        companyName: 'Bank Rakyat Indonesia',
        sector: 'FINANCIALS',
        ownedLots: 10,
        avgBuyPrice: 4000,
        currentPrice: 4500, // ~4.5M
      },
      {
        ticker: 'ICBP',
        companyName: 'Indofood CBP',
        sector: 'CONSUMER_NON_CYCLICALS',
        ownedLots: 2,
        avgBuyPrice: 10000,
        currentPrice: 10000, // ~2M
      },
    ]);

    expect(risk.activeHoldingsCount).toBe(3);
    expect(risk.stockWeights).toHaveLength(3);
    expect(risk.stockWeights[0]?.ticker).toBe('BBCA');
    expect(risk.stockWeights[0]?.isOverweight).toBe(true);
    expect(risk.sectorWeights).toHaveLength(2);
    expect(risk.sectorWeights[0]?.sector).toBe('FINANCIALS');
    expect(risk.sectorWeights[0]?.isOverconcentrated).toBe(true);
    expect(risk.alerts.map((a) => a.code)).toEqual([
      'SINGLE_STOCK_CONCENTRATION',
      'SINGLE_STOCK_CONCENTRATION',
      'SECTOR_CONCENTRATION',
    ]);

    const grossRisk = analyzePortfolioRisk(
      [
        {
          ticker: 'BBCA',
          companyName: 'Bank Central Asia',
          sector: 'FINANCIALS',
          ownedLots: 10,
          avgBuyPrice: 8000,
          currentPrice: 9000,
        },
      ],
      'BROKER_GROSS',
    );
    expect(grossRisk.totalInvestedCapital).toBe(8_000_000);
    expect(grossRisk.totalNetMarketValue).toBe(9_000_000);
    expect(grossRisk.totalUnrealizedPnL).toBe(1_000_000);
    expect(grossRisk.totalUnrealizedPnLPct).toBe(12.5);
  });

  it('plans Pyramiding Buy Allocation across 3 IDX tick-aligned stages (Use Case 3)', () => {
    const plan = planPyramidingAllocation({
      existingLots: 10,
      existingAvgPrice: 5000,
      totalCashBudget: 20_000_000,
      referencePrice: 4500,
      stepDiscountPct: 5,
      strategy: 'PYRAMID_20_30_50',
      targetSellPrice: 5000,
    });
    expect(plan.valid).toBe(true);
    if (plan.valid) {
      expect(plan.stages).toHaveLength(3);
      expect(plan.stages[0]?.allocationWeightPct).toBe(20);
      expect(plan.stages[1]?.allocationWeightPct).toBe(30);
      expect(plan.stages[2]?.allocationWeightPct).toBe(50);
      expect(plan.plannedTranches.length).toBeGreaterThan(0);
      expect(plan.totalCashUsed).toBeLessThanOrEqual(20_000_000);
      expect(plan.simulation.valid).toBe(true);
    }

    // Fresh position (existingLots = 0) with tiny stage 1 budget (0 lots in stage 1)
    const freshSmallStage1 = planPyramidingAllocation({
      existingLots: 0,
      existingAvgPrice: 0,
      totalCashBudget: 1_500_000,
      referencePrice: 4000, // 1 lot = ~400,600 -> stage 1 (15% = 225,000) gets 0 lots, stage 2 & 3 get lots
      stepDiscountPct: 5,
      strategy: 'AGGRESSIVE_15_35_50',
      targetSellPrice: 4400,
    });
    expect(freshSmallStage1.valid).toBe(true);
    if (freshSmallStage1.valid) {
      expect(freshSmallStage1.stages[0]?.lots).toBe(0);
      expect(freshSmallStage1.stages[0]?.cumulativePureAvg).toBe(0);
      expect(freshSmallStage1.stages[2]?.lots).toBeGreaterThan(0);
    }

    // Validation errors for Pyramiding Planner
    expect(
      planPyramidingAllocation({
        existingLots: 0,
        existingAvgPrice: 0,
        totalCashBudget: 10_000_000,
        referencePrice: 1000,
        stepDiscountPct: 5,
        strategy: 'EQUAL_33_33_34',
        targetSellPrice: 1200,
        buyFeePct: -1,
      }),
    ).toEqual({ valid: false, errorCode: 'INVALID_FEE_RATE' });

    expect(
      planPyramidingAllocation({
        existingLots: -1,
        existingAvgPrice: 0,
        totalCashBudget: 10_000_000,
        referencePrice: 1000,
        stepDiscountPct: 5,
        strategy: 'EQUAL_33_33_34',
        targetSellPrice: 1200,
      }),
    ).toEqual({ valid: false, errorCode: 'INVALID_POSITION' });

    expect(
      planPyramidingAllocation({
        existingLots: 5,
        existingAvgPrice: 0,
        totalCashBudget: 10_000_000,
        referencePrice: 1000,
        stepDiscountPct: 5,
        strategy: 'EQUAL_33_33_34',
        targetSellPrice: 1200,
      }),
    ).toEqual({ valid: false, errorCode: 'INVALID_EXISTING_PRICE' });

    expect(
      planPyramidingAllocation({
        existingLots: 0,
        existingAvgPrice: 0,
        totalCashBudget: 0,
        referencePrice: 1000,
        stepDiscountPct: 5,
        strategy: 'EQUAL_33_33_34',
        targetSellPrice: 1200,
      }),
    ).toEqual({ valid: false, errorCode: 'INVALID_TRANCHE' });

    expect(
      planPyramidingAllocation({
        existingLots: 0,
        existingAvgPrice: 0,
        totalCashBudget: 10_000_000,
        referencePrice: 1000,
        stepDiscountPct: 5,
        strategy: 'EQUAL_33_33_34',
        targetSellPrice: 0,
      }),
    ).toEqual({ valid: false, errorCode: 'INVALID_TARGET_SELL_PRICE' });

    // Budget too small to buy even 1 lot across all stages
    expect(
      planPyramidingAllocation({
        existingLots: 0,
        existingAvgPrice: 0,
        totalCashBudget: 10_000,
        referencePrice: 5000,
        stepDiscountPct: 5,
        strategy: 'EQUAL_33_33_34',
        targetSellPrice: 5500,
      }),
    ).toEqual({ valid: false, errorCode: 'INVALID_TRANCHE' });
  });

  it('simulates Take-Profit Ladder & Free-Ride remaining position (Use Case 4)', () => {
    // Partial exit where net proceeds exceed total initial cost basis -> Free-Ride Shares!
    const partialFreeRide = simulateTakeProfitLadder({
      totalOwnedLots: 20,
      avgBuyPrice: 5000, // total initial cost = 10,000,000 + 15,000 = 10,015,000
      rungs: [
        { lotsToSell: 8, targetSellPrice: 6500 }, // 5.2M gross
        { lotsToSell: 8, targetSellPrice: 7500 }, // 6.0M gross -> total net proceeds > 10.015M
      ],
      includeStampDuty: true,
    });
    expect(partialFreeRide.valid).toBe(true);
    if (partialFreeRide.valid) {
      expect(partialFreeRide.totalLotsSold).toBe(16);
      expect(partialFreeRide.remainingLots).toBe(4);
      expect(partialFreeRide.unrecoveredCapital).toBe(0);
      expect(partialFreeRide.remainingEffectiveCostPerShare).toBe(0);
      expect(partialFreeRide.isFreeRidePosition).toBe(true);
      expect(partialFreeRide.totalRealizedNetPnL).toBeGreaterThan(0);
    }

    // Full exit with > Rp 10M single rung (triggers stamp duty)
    const fullExit = simulateTakeProfitLadder({
      totalOwnedLots: 20,
      avgBuyPrice: 5000,
      rungs: [{ lotsToSell: 20, targetSellPrice: 5500 }], // 11M gross -> stampDuty 10,000
      includeStampDuty: true,
    });
    expect(fullExit.valid).toBe(true);
    if (fullExit.valid) {
      expect(fullExit.remainingLots).toBe(0);
      expect(fullExit.remainingEffectiveCostPerShare).toBe(0);
      expect(fullExit.isFreeRidePosition).toBe(false);
      expect(fullExit.rungs[0]?.stampDuty).toBe(10_000);
    }

    // Validation error branches
    expect(
      simulateTakeProfitLadder({
        totalOwnedLots: 10,
        avgBuyPrice: 1000,
        rungs: [{ lotsToSell: 5, targetSellPrice: 1200 }],
        sellFeePct: -1,
      }),
    ).toEqual({ valid: false, errorCode: 'INVALID_FEE_RATE' });

    expect(
      simulateTakeProfitLadder({
        totalOwnedLots: 0,
        avgBuyPrice: 1000,
        rungs: [{ lotsToSell: 1, targetSellPrice: 1200 }],
      }),
    ).toEqual({ valid: false, errorCode: 'INVALID_POSITION' });

    expect(
      simulateTakeProfitLadder({
        totalOwnedLots: 10,
        avgBuyPrice: 0,
        rungs: [{ lotsToSell: 1, targetSellPrice: 1200 }],
      }),
    ).toEqual({ valid: false, errorCode: 'INVALID_EXISTING_PRICE' });

    expect(
      simulateTakeProfitLadder({
        totalOwnedLots: 10,
        avgBuyPrice: 1000,
        rungs: [],
      }),
    ).toEqual({ valid: false, errorCode: 'INVALID_TRANCHE' });

    expect(
      simulateTakeProfitLadder({
        totalOwnedLots: 10,
        avgBuyPrice: 1000,
        rungs: [{ lotsToSell: 0, targetSellPrice: 1200 }],
      }),
    ).toEqual({ valid: false, errorCode: 'INVALID_TRANCHE' });

    expect(
      simulateTakeProfitLadder({
        totalOwnedLots: 10,
        avgBuyPrice: 1000,
        rungs: [{ lotsToSell: 11, targetSellPrice: 1200 }],
      }),
    ).toEqual({ valid: false, errorCode: 'INVALID_TRANCHE' });
  });
});
