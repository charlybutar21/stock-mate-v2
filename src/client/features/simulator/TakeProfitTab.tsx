import { Plus, Sparkles, Trash2, Trophy } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { WatchlistItemDto } from '@/shared/contracts';
import {
  ceilToIdxTick,
  simulateTakeProfitLadder,
  type TakeProfitRungInput,
} from '@/shared/domain';
import {
  Badge,
  Button,
  Card,
  Field,
  IdxPriceInput,
  Input,
  RolePill,
} from '@/client/components/ui/primitives';
import { useI18n } from '@/client/i18n/useI18n';
import { formatIdr, formatNumber, formatPercent } from '@/client/lib/formatters';

interface RungRow {
  id: string;
  lotsToSell: string;
  targetSellPrice: string;
}

interface TakeProfitTabProps {
  linkedStock: WatchlistItemDto;
  buyFeePct: number;
  sellFeePct: number;
  includeStampDuty: boolean;
  existingAvgIncludesBuyFee: boolean;
}

export function TakeProfitTab({
  linkedStock,
  buyFeePct,
  sellFeePct,
  includeStampDuty,
  existingAvgIncludesBuyFee,
}: TakeProfitTabProps) {
  const { t } = useI18n();

  const initialOwnedLots = linkedStock.ownedLots > 0 ? linkedStock.ownedLots : 30;
  const initialAvgBuy =
    linkedStock.avgBuyPrice && linkedStock.avgBuyPrice >= 1
      ? linkedStock.avgBuyPrice
      : linkedStock.currentPrice;

  const [totalOwnedLots, setTotalOwnedLots] = useState(String(initialOwnedLots));
  const [avgBuyPrice, setAvgBuyPrice] = useState(String(initialAvgBuy));

  const buildDefaultRungs = (lotsNum: number, basePrice: number): RungRow[] => {
    const fv = linkedStock.valuation.fairValue;
    const p1 =
      fv.conservative && fv.conservative > basePrice
        ? fv.conservative
        : ceilToIdxTick(basePrice * 1.1);
    const p2 =
      fv.moderate && fv.moderate > p1 ? fv.moderate : ceilToIdxTick(basePrice * 1.2);
    const p3 =
      fv.optimistic && fv.optimistic > p2
        ? fv.optimistic
        : ceilToIdxTick(basePrice * 1.35);

    const l1 = Math.max(1, Math.floor(lotsNum * 0.3));
    const l2 = Math.max(1, Math.floor(lotsNum * 0.4));
    const l3 = Math.max(1, lotsNum - l1 - l2);

    if (lotsNum < 3) {
      return [{ id: 'r1', lotsToSell: String(lotsNum), targetSellPrice: String(p2) }];
    }

    return [
      { id: 'r1', lotsToSell: String(l1), targetSellPrice: String(p1) },
      { id: 'r2', lotsToSell: String(l2), targetSellPrice: String(p2) },
      { id: 'r3', lotsToSell: String(l3), targetSellPrice: String(p3) },
    ];
  };

  const [rungs, setRungs] = useState<RungRow[]>(() =>
    buildDefaultRungs(initialOwnedLots, initialAvgBuy),
  );

  const handleAutoFillFairValue = () => {
    const lotsNum = Math.max(1, Math.floor(Number(totalOwnedLots || 30)));
    const basePrice = Math.max(1, Math.floor(Number(avgBuyPrice || linkedStock.currentPrice)));
    setRungs(buildDefaultRungs(lotsNum, basePrice));
  };

  const addRung = () => {
    if (rungs.length >= 5) return;
    setRungs((prev) => [
      ...prev,
      {
        id: `r_${Date.now()}_${prev.length}`,
        lotsToSell: '5',
        targetSellPrice: String(ceilToIdxTick(linkedStock.currentPrice * 1.25)),
      },
    ]);
  };

  const removeRung = (id: string) => {
    setRungs((prev) => prev.filter((r) => r.id !== id));
  };

  const updateRung = (id: string, field: 'lotsToSell' | 'targetSellPrice', val: string) => {
    setRungs((prev) => prev.map((r) => (r.id === id ? { ...r, [field]: val } : r)));
  };

  const result = useMemo(() => {
    const parsedRungs: TakeProfitRungInput[] = rungs
      .filter((r) => r.lotsToSell.trim() !== '' || r.targetSellPrice.trim() !== '')
      .map((r) => ({
        lotsToSell: Number(r.lotsToSell),
        targetSellPrice: Number(r.targetSellPrice),
      }));

    return simulateTakeProfitLadder({
      totalOwnedLots: Number(totalOwnedLots || 0),
      avgBuyPrice: Number(avgBuyPrice || 0),
      rungs: parsedRungs,
      buyFeePct,
      sellFeePct,
      includeStampDuty,
      existingAvgIncludesBuyFee,
    });
  }, [
    totalOwnedLots,
    avgBuyPrice,
    rungs,
    buyFeePct,
    sellFeePct,
    includeStampDuty,
    existingAvgIncludesBuyFee,
  ]);

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
      {/* LEFT: Editable Owned Position & Sell Rungs */}
      <Card variant="editable" className="overflow-hidden p-0 lg:col-span-5">
        <div className="flex items-center justify-between gap-2 border-b border-border bg-editable-header px-5 py-3.5">
          <h2 className="font-display text-sm font-bold text-ink">
            {t.simulator.takeProfit.title}
          </h2>
          <RolePill role="editable" label={t.common.editableTag} />
        </div>

        <div className="space-y-4 p-5">
          <p className="text-xs text-muted">{t.simulator.takeProfit.subtitle}</p>

          <div className="grid grid-cols-2 gap-3 border-t border-border pt-3">
            <Field label={t.simulator.takeProfit.totalOwnedLots} htmlFor="tp-owned-lots">
              <Input
                id="tp-owned-lots"
                type="number"
                min={1}
                step={1}
                value={totalOwnedLots}
                onChange={(e) => setTotalOwnedLots(e.target.value)}
                className="font-mono tabular-nums"
              />
            </Field>
            <Field label={t.simulator.takeProfit.avgBuyPrice} htmlFor="tp-avg-buy">
              <IdxPriceInput
                id="tp-avg-buy"
                allowDecimals
                value={avgBuyPrice}
                onValueChange={setAvgBuyPrice}
                tickHintLabel={t.common.tickStepLabel}
                stepDownLabel={t.common.stepDown}
                stepUpLabel={t.common.stepUp}
              />
            </Field>
          </div>

          <div className="border-t border-border pt-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-xs font-bold tracking-wide text-muted uppercase">
                {t.simulator.takeProfit.rungsTitle}
              </h3>
              <div className="flex items-center gap-1.5">
                <Button variant="secondary" size="sm" onClick={handleAutoFillFairValue} className="h-7 px-2 text-xs">
                  <Sparkles className="h-3 w-3 text-brand-600" aria-hidden="true" />
                  {t.simulator.takeProfit.autoFillFairValue}
                </Button>
                <Button
                  variant="outlineBrand"
                  size="sm"
                  onClick={addRung}
                  disabled={rungs.length >= 5}
                  className="h-7 px-2 text-xs"
                >
                  <Plus className="h-3 w-3" aria-hidden="true" />
                  {t.simulator.takeProfit.addRung}
                </Button>
              </div>
            </div>

            <div className="mt-3 space-y-2.5">
              {rungs.map((row, idx) => (
                <div key={row.id} className="flex min-w-0 items-end gap-1.5">
                  <div className="flex h-9 w-6 shrink-0 items-center justify-center rounded-md bg-subtle font-mono text-[11px] font-semibold text-muted">
                    #{idx + 1}
                  </div>
                  <div className="w-20 shrink-0">
                    <Field
                      label={t.simulator.takeProfit.rungLots}
                      htmlFor={`tp-lots-${row.id}`}
                    >
                      <Input
                        id={`tp-lots-${row.id}`}
                        type="number"
                        min={1}
                        step={1}
                        value={row.lotsToSell}
                        onChange={(e) => updateRung(row.id, 'lotsToSell', e.target.value)}
                        className="px-2 font-mono tabular-nums"
                      />
                    </Field>
                  </div>
                  <div className="min-w-0 flex-1">
                    <Field
                      label={t.simulator.takeProfit.rungPrice}
                      htmlFor={`tp-price-${row.id}`}
                    >
                      <IdxPriceInput
                        id={`tp-price-${row.id}`}
                        value={row.targetSellPrice}
                        onValueChange={(val) => updateRung(row.id, 'targetSellPrice', val)}
                        tickHintLabel={t.common.tickStepLabel}
                        stepDownLabel={t.common.stepDown}
                        stepUpLabel={t.common.stepUp}
                      />
                    </Field>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeRung(row.id)}
                    aria-label="Remove sell rung"
                    className="flex h-9 w-8 shrink-0 items-center justify-center rounded-lg text-muted transition-colors hover:bg-negative-50 hover:text-negative-600 cursor-pointer"
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Card>

      {/* RIGHT: Auto-Calculated Realized Profit & Remaining Free-Ride Position */}
      <div className="space-y-4 lg:col-span-7">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-display text-sm font-bold text-ink">{t.simulator.sectionOutput}</h2>
          <RolePill role="calculated" label={t.common.calculatedTag} />
        </div>

        {!result.valid ? (
          <Card variant="display" className="p-8 text-center text-sm text-muted">
            {t.simulator.invalidInputs}
          </Card>
        ) : (
          <>
            {result.isFreeRidePosition && (
              <div className="flex items-start gap-3 rounded-xl border border-positive-600/30 bg-positive-50 p-4 text-positive-700 animate-fade-up">
                <Trophy className="mt-0.5 h-5 w-5 shrink-0 text-positive-600" aria-hidden="true" />
                <div className="text-xs leading-relaxed">
                  <div className="font-bold">{t.simulator.takeProfit.freeRideBadge}</div>
                  <p className="mt-0.5">{t.simulator.takeProfit.freeRideBody}</p>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-3 animate-fade-up">
              <Card variant="highlight" className="border-t-2 border-t-brand-600 p-4">
                <div className="text-xs font-medium text-brand-700">
                  {t.simulator.takeProfit.totalRealizedPnL}
                </div>
                <div
                  className={`mt-1.5 font-mono text-lg font-bold tabular-nums whitespace-nowrap xl:text-xl ${
                    result.totalRealizedNetPnL >= 0
                      ? 'text-positive-600'
                      : 'text-negative-600'
                  }`}
                >
                  {result.totalRealizedNetPnL >= 0 ? '+' : ''}
                  {formatIdr(result.totalRealizedNetPnL)}
                </div>
                <div className="mt-1 font-mono text-xs font-semibold text-brand-900/80 tabular-nums whitespace-nowrap">
                  {formatPercent(result.totalRealizedPnLPct, true)}
                </div>
              </Card>

              <Card variant="display" className="p-4">
                <div className="text-xs text-muted">
                  {t.simulator.takeProfit.totalNetProceeds}
                </div>
                <div className="mt-1.5 font-mono text-lg font-bold text-ink tabular-nums whitespace-nowrap xl:text-xl">
                  {formatIdr(result.totalNetProceeds)}
                </div>
                <div className="mt-1.5 flex items-center justify-between gap-2 border-t border-border/70 pt-1.5 text-[11px] text-muted">
                  <span>{t.simulator.takeProfit.lotsSoldSummary}</span>
                  <span className="font-mono font-medium text-ink tabular-nums whitespace-nowrap">
                    {formatNumber(result.totalLotsSold)} / {formatNumber(result.totalOwnedLots)}{' '}
                    {t.common.lots}
                  </span>
                </div>
              </Card>

              <Card variant="display" className="p-4">
                <div className="text-xs text-muted">
                  {t.simulator.takeProfit.remainingLotsLabel}
                </div>
                <div className="mt-1.5 font-mono text-lg font-bold text-ink tabular-nums whitespace-nowrap xl:text-xl">
                  {formatNumber(result.remainingLots)} {t.common.lots}
                </div>
                <div className="mt-1.5 flex items-center justify-between gap-2 border-t border-border/70 pt-1.5 text-[11px] text-muted">
                  <span>{t.simulator.takeProfit.effectiveRemainingCostLabel}</span>
                  <span className="font-mono font-medium text-ink tabular-nums whitespace-nowrap">
                    {formatIdr(result.remainingEffectiveCostPerShare)}
                  </span>
                </div>
              </Card>
            </div>

            <Card variant="display" className="overflow-hidden p-0">
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-left text-xs">
                  <thead>
                    <tr className="border-b border-border bg-subtle/70 font-semibold text-muted">
                      <th className="py-3 pr-2 pl-4 whitespace-nowrap">
                        {t.simulator.takeProfit.rungCol}
                      </th>
                      <th className="px-2 py-3 text-right whitespace-nowrap">
                        {t.simulator.takeProfit.lotsShareCol}
                      </th>
                      <th className="px-2 py-3 text-right whitespace-nowrap">
                        {t.simulator.takeProfit.targetPriceCol}
                      </th>
                      <th className="px-2 py-3 text-right whitespace-nowrap">
                        {t.simulator.takeProfit.netProceedsCol}
                      </th>
                      <th className="py-3 pr-4 pl-2 text-right whitespace-nowrap">
                        {t.simulator.takeProfit.realizedProfitCol}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/80 bg-panel/60 font-mono tabular-nums">
                    {result.rungs.map((r) => (
                      <tr key={r.rungNumber} className="hover:bg-brand-50/35">
                        <td className="py-3 pr-2 pl-4 font-sans font-semibold text-ink whitespace-nowrap">
                          #{r.rungNumber}
                        </td>
                        <td className="px-2 py-3 text-right whitespace-nowrap">
                          <span className="font-bold text-ink">
                            {formatNumber(r.lotsSold)} {t.common.lots}
                          </span>{' '}
                          <span className="text-muted">({formatPercent(r.sellPctOfTotal)})</span>
                        </td>
                        <td className="px-2 py-3 text-right font-bold text-brand-700 whitespace-nowrap">
                          {formatIdr(r.targetSellPrice)}
                        </td>
                        <td className="px-2 py-3 text-right text-ink whitespace-nowrap">
                          {formatIdr(r.netProceeds)}
                        </td>
                        <td className="py-3 pr-4 pl-2 text-right whitespace-nowrap">
                          <div className="inline-flex items-center justify-end gap-1.5">
                            <span
                              className={`font-bold ${
                                r.realizedNetPnL >= 0
                                  ? 'text-positive-600'
                                  : 'text-negative-600'
                              }`}
                            >
                              {r.realizedNetPnL >= 0 ? '+' : ''}
                              {formatIdr(r.realizedNetPnL)}
                            </span>
                            <Badge tone={r.realizedPnLPct >= 0 ? 'positive' : 'negative'}>
                              {formatPercent(r.realizedPnLPct, true)}
                            </Badge>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}
