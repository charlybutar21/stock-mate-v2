import { describe, expect, it } from 'vitest';
import {
  calculateGoalSeekAverageDown,
  calculatePositionSummary,
  simulateForwardAverageDown,
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

  it('computes owned position summary (cost basis, market value, unrealized P/L)', () => {
    expect(calculatePositionSummary(0, 5000, 5500)).toEqual({
      ownedLots: 0,
      ownedShares: 0,
      avgBuyPrice: null,
      costBasis: 0,
      marketValue: 0,
      unrealizedPnL: null,
      unrealizedPnLPct: null,
    });

    expect(calculatePositionSummary(10, null, 5500)).toEqual({
      ownedLots: 10,
      ownedShares: 1000,
      avgBuyPrice: null,
      costBasis: 0,
      marketValue: 5_500_000,
      unrealizedPnL: null,
      unrealizedPnLPct: null,
    });

    expect(calculatePositionSummary(20, 5000, 5500)).toEqual({
      ownedLots: 20,
      ownedShares: 2000,
      avgBuyPrice: 5000,
      costBasis: 10_000_000,
      marketValue: 11_000_000,
      unrealizedPnL: 1_000_000,
      unrealizedPnLPct: 10,
    });
  });
});
