import { useMemo, useState } from 'react';
import type { WatchlistItemDto } from '@/shared/contracts';
import { calculateGoalSeekAverageDown } from '@/shared/domain';
import { Card, Field, Input } from '@/client/components/ui/primitives';
import { useI18n } from '@/client/i18n/useI18n';
import { formatIdr, formatNumber } from '@/client/lib/formatters';

interface GoalSeekTabProps {
  linkedStock: WatchlistItemDto;
  buyFeePct: number;
  includeStampDuty: boolean;
}

export function GoalSeekTab({
  linkedStock,
  buyFeePct,
  includeStampDuty,
}: GoalSeekTabProps) {
  const { t } = useI18n();

  const defaultLots = linkedStock.ownedLots > 0 ? String(linkedStock.ownedLots) : '20';
  const defaultAvg =
    linkedStock.avgBuyPrice && linkedStock.avgBuyPrice > linkedStock.currentPrice
      ? linkedStock.avgBuyPrice
      : Math.max(3, Math.round(linkedStock.currentPrice * 1.25));
  const defaultTarget = Math.max(
    linkedStock.currentPrice + 1,
    Math.round((defaultAvg + linkedStock.currentPrice) / 2),
  );

  const [existingLots, setExistingLots] = useState(defaultLots);
  const [existingAvgPrice, setExistingAvgPrice] = useState(String(defaultAvg));
  const [plannedBuyPrice, setPlannedBuyPrice] = useState(String(linkedStock.currentPrice));
  const [targetPureAvg, setTargetPureAvg] = useState(String(defaultTarget));

  const result = useMemo(
    () =>
      calculateGoalSeekAverageDown({
        existingLots: Number(existingLots || 0),
        existingAvgPrice: Number(existingAvgPrice || 0),
        plannedBuyPrice: Number(plannedBuyPrice || 0),
        targetPureAvg: Number(targetPureAvg || 0),
        buyFeePct,
        includeStampDuty,
      }),
    [existingLots, existingAvgPrice, plannedBuyPrice, targetPureAvg, buyFeePct, includeStampDuty],
  );

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
      <Card className="space-y-4 lg:col-span-5">
        <h3 className="text-sm font-semibold text-ink">{t.simulator.goalSeekInputs}</h3>

        <div className="grid grid-cols-2 gap-3">
          <Field label={t.simulator.existingLots} htmlFor="gs-lots">
            <Input
              id="gs-lots"
              type="number"
              min={1}
              step={1}
              value={existingLots}
              onChange={(e) => setExistingLots(e.target.value)}
              className="font-mono tabular-nums"
            />
          </Field>
          <Field label={t.simulator.existingAvgPrice} htmlFor="gs-ex-avg">
            <Input
              id="gs-ex-avg"
              type="number"
              min={1}
              step={1}
              value={existingAvgPrice}
              onChange={(e) => setExistingAvgPrice(e.target.value)}
              className="font-mono tabular-nums"
            />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label={t.simulator.plannedBuyPrice} htmlFor="gs-buy">
            <Input
              id="gs-buy"
              type="number"
              min={1}
              step={1}
              value={plannedBuyPrice}
              onChange={(e) => setPlannedBuyPrice(e.target.value)}
              className="font-mono tabular-nums"
            />
          </Field>
          <Field label={t.simulator.targetPureAvg} htmlFor="gs-target">
            <Input
              id="gs-target"
              type="number"
              min={1}
              step={1}
              value={targetPureAvg}
              onChange={(e) => setTargetPureAvg(e.target.value)}
              className="font-mono tabular-nums"
            />
          </Field>
        </div>

        <p className="text-xs text-muted">{t.simulator.goalSeekHint}</p>
      </Card>

      <div className="lg:col-span-7">
        {!result.valid ? (
          <Card className="p-8 text-center text-sm text-muted">
            {t.simulator.goalSeekHint}
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 animate-fade-up">
            <Card interactive className="border-t-2 border-t-brand-700 bg-brand-50/60 p-5">
              <div className="text-xs font-medium text-brand-700">{t.simulator.lotsNeeded}</div>
              <div className="mt-1 font-mono text-3xl font-bold text-brand-900 tabular-nums">
                {formatNumber(result.lotsNeeded)}
              </div>
              <div className="mt-1 font-mono text-xs text-brand-700/80 tabular-nums">
                {formatNumber(result.sharesNeeded)} {t.common.shares}
              </div>
            </Card>

            <Card interactive className="p-5">
              <div className="text-xs text-muted">{t.simulator.resultingPureAvg}</div>
              <div className="mt-1 font-mono text-2xl font-bold text-ink tabular-nums">
                {formatIdr(result.resultingPureAvg, true)}
              </div>
            </Card>

            <Card interactive className="p-5">
              <div className="text-xs text-muted">{t.simulator.cashRequired}</div>
              <div className="mt-1 font-mono text-xl font-bold text-ink tabular-nums">
                {formatIdr(result.totalCashRequired)}
              </div>
              <div className="mt-1 font-mono text-[11px] text-muted tabular-nums">
                Fee: {formatIdr(result.cashBuyFee)}
                {result.cashStampDuty > 0 ? ` + Materai ${formatIdr(result.cashStampDuty)}` : ''}
              </div>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
