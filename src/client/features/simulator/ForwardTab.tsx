import { AlertTriangle, Plus, Trash2, TrendingUp } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { WatchlistItemDto } from '@/shared/contracts';
import { simulateForwardAverageDown, type PlannedTranche } from '@/shared/domain';
import {
  Button,
  Card,
  Field,
  IdxPriceInput,
  Input,
  RolePill,
  TermTooltip,
} from '@/client/components/ui/primitives';
import { useI18n } from '@/client/i18n/useI18n';
import { formatIdr, formatNumber, formatPercent } from '@/client/lib/formatters';

interface TrancheRow {
  id: string;
  lots: string;
  buyPrice: string;
}

interface ForwardTabProps {
  linkedStock: WatchlistItemDto;
  buyFeePct: number;
  sellFeePct: number;
  includeStampDuty: boolean;
}

export function ForwardTab({
  linkedStock,
  buyFeePct,
  sellFeePct,
  includeStampDuty,
}: ForwardTabProps) {
  const { t } = useI18n();

  const defaultLots = linkedStock.ownedLots > 0 ? String(linkedStock.ownedLots) : '0';
  const defaultAvgPrice =
    linkedStock.avgBuyPrice && linkedStock.avgBuyPrice >= 1
      ? String(linkedStock.avgBuyPrice)
      : String(Math.max(1, Math.round(linkedStock.currentPrice * 1.1)));

  const [existingLots, setExistingLots] = useState(defaultLots);
  const [existingAvgPrice, setExistingAvgPrice] = useState(defaultAvgPrice);
  const [tranches, setTranches] = useState<TrancheRow[]>([
    { id: 't1', lots: '10', buyPrice: String(linkedStock.currentPrice) },
  ]);
  const [targetSellPrice, setTargetSellPrice] = useState(
    String(linkedStock.valuation.fairValue.moderate ?? linkedStock.currentPrice),
  );

  const addTranche = () => {
    if (tranches.length >= 5) return;
    setTranches((prev) => [
      ...prev,
      {
        id: `t_${Date.now()}_${prev.length}`,
        lots: '10',
        buyPrice: String(linkedStock.currentPrice),
      },
    ]);
  };

  const removeTranche = (id: string) => {
    setTranches((prev) => prev.filter((row) => row.id !== id));
  };

  const updateTranche = (id: string, field: 'lots' | 'buyPrice', value: string) => {
    setTranches((prev) =>
      prev.map((row) => (row.id === id ? { ...row, [field]: value } : row)),
    );
  };

  const result = useMemo(() => {
    const parsedTranches: PlannedTranche[] = tranches
      .filter((row) => row.lots.trim() !== '' || row.buyPrice.trim() !== '')
      .map((row) => ({
        lots: Number(row.lots),
        buyPrice: Number(row.buyPrice),
      }));

    return simulateForwardAverageDown({
      existingLots: Number(existingLots || 0),
      existingAvgPrice: Number(existingAvgPrice || 0),
      plannedTranches: parsedTranches,
      targetSellPrice: Number(targetSellPrice || 0),
      buyFeePct,
      sellFeePct,
      includeStampDuty,
      fairValueModerate: linkedStock.valuation.fairValue.moderate,
      referenceCurrentPrice: linkedStock.currentPrice,
    });
  }, [
    existingLots,
    existingAvgPrice,
    tranches,
    targetSellPrice,
    buyFeePct,
    sellFeePct,
    includeStampDuty,
    linkedStock.valuation.fairValue.moderate,
    linkedStock.currentPrice,
  ]);

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
      {/* LEFT COLUMN: Editable Inputs Card */}
      <Card variant="editable" className="overflow-hidden p-0 lg:col-span-5">
        <div className="flex items-center justify-between gap-2 border-b border-border bg-editable-header px-5 py-3.5">
          <h2 className="font-display text-sm font-bold text-ink">{t.simulator.sectionInputs}</h2>
          <RolePill role="editable" label={t.common.editableTag} />
        </div>

        <div className="space-y-5 p-5">
          {/* Sub-group 1: Current Position */}
          <div>
            <h3 className="text-xs font-bold tracking-wide text-muted uppercase">
              {t.simulator.existingPosition}
            </h3>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <Field label={t.simulator.existingLots} htmlFor="sim-ex-lots">
                <Input
                  id="sim-ex-lots"
                  type="number"
                  min={0}
                  step={1}
                  value={existingLots}
                  onChange={(e) => setExistingLots(e.target.value)}
                  className="font-mono tabular-nums"
                />
              </Field>
              <Field label={t.simulator.existingAvgPrice} htmlFor="sim-ex-avg">
                <IdxPriceInput
                  id="sim-ex-avg"
                  value={existingAvgPrice}
                  onValueChange={setExistingAvgPrice}
                  tickHintLabel={t.common.tickStepLabel}
                  stepDownLabel={t.common.stepDown}
                  stepUpLabel={t.common.stepUp}
                />
              </Field>
            </div>
          </div>

          {/* Sub-group 2: Planned Tranches */}
          <div className="border-t border-border pt-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold tracking-wide text-muted uppercase">
                {t.simulator.plannedTranches}
              </h3>
              <Button
                variant="outlineBrand"
                size="sm"
                onClick={addTranche}
                disabled={tranches.length >= 5}
                className="h-7 px-2.5 text-xs"
              >
                <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                {t.simulator.addTranche}
              </Button>
            </div>

            <div className="mt-3 space-y-2.5">
              {tranches.map((row, idx) => (
                <div key={row.id} className="flex min-w-0 items-end gap-1.5">
                  <div className="flex h-9 w-6 shrink-0 items-center justify-center rounded-md bg-subtle font-mono text-[11px] font-semibold text-muted">
                    #{idx + 1}
                  </div>
                  <div className="w-20 shrink-0">
                    <Field label={t.simulator.trancheLots} htmlFor={`lots-${row.id}`}>
                      <Input
                        id={`lots-${row.id}`}
                        type="number"
                        min={1}
                        step={1}
                        value={row.lots}
                        onChange={(e) => updateTranche(row.id, 'lots', e.target.value)}
                        className="px-2 font-mono tabular-nums"
                      />
                    </Field>
                  </div>
                  <div className="min-w-0 flex-1">
                    <Field label={t.simulator.tranchePrice} htmlFor={`price-${row.id}`}>
                      <IdxPriceInput
                        id={`price-${row.id}`}
                        value={row.buyPrice}
                        onValueChange={(val) => updateTranche(row.id, 'buyPrice', val)}
                        tickHintLabel={t.common.tickStepLabel}
                        stepDownLabel={t.common.stepDown}
                        stepUpLabel={t.common.stepUp}
                      />
                    </Field>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeTranche(row.id)}
                    aria-label="Remove tranche"
                    className="flex h-9 w-8 shrink-0 items-center justify-center rounded-lg text-muted transition-colors hover:bg-negative-50 hover:text-negative-600 cursor-pointer"
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Sub-group 3: Target Sell Price with IDX Tick Stepper */}
          <div className="border-t border-border pt-4">
            <Field label={t.simulator.targetSellPrice} htmlFor="sim-target-sell">
              <IdxPriceInput
                id="sim-target-sell"
                value={targetSellPrice}
                onValueChange={setTargetSellPrice}
                showTickHint
                tickHintLabel={t.common.tickStepLabel}
                stepDownLabel={t.common.stepDown}
                stepUpLabel={t.common.stepUp}
              />
            </Field>
          </div>
        </div>
      </Card>

      {/* RIGHT COLUMN: Auto-Calculated Results (Display Cards) */}
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
            {/* Guardrail Alerts */}
            {result.guardrails.isAboveFairValue && (
              <div
                role="alert"
                className="flex items-start gap-3 rounded-xl border border-warning-600/30 bg-warning-50 p-4 text-warning-700"
              >
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
                <div className="text-xs leading-relaxed">
                  <div className="font-semibold">{t.simulator.guardrailAboveFvTitle}</div>
                  <p className="mt-0.5">{t.simulator.guardrailAboveFvBody}</p>
                  <div className="mt-1.5 font-mono font-semibold tabular-nums">
                    {t.simulator.effectiveAvg}: {formatIdr(result.effectiveAvgPrice, true)} vs{' '}
                    {t.simulator.linkedFairValue}:{' '}
                    {formatIdr(linkedStock.valuation.fairValue.moderate)}
                  </div>
                </div>
              </div>
            )}

            {result.guardrails.isAverageUp && (
              <div
                role="status"
                className="flex items-start gap-3 rounded-xl border border-brand-600/25 bg-brand-50 p-4 text-brand-700"
              >
                <TrendingUp className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
                <div className="text-xs leading-relaxed">
                  <div className="font-semibold">{t.simulator.guardrailAvgUpTitle}</div>
                  <p className="mt-0.5">{t.simulator.guardrailAvgUpBody}</p>
                </div>
              </div>
            )}

            {/* Primary Output Grid (Display vs Highlight) */}
            <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-3 animate-fade-up">
              <Card variant="display" className="p-4">
                <div className="text-xs text-muted">
                  <TermTooltip label={t.simulator.pureAvg} definition={t.glossary.pureAvg} />
                </div>
                <div className="mt-1.5 font-mono text-xl font-bold text-ink tabular-nums">
                  {formatIdr(result.pureAvgPrice, true)}
                </div>
              </Card>
              <Card variant="display" className="p-4">
                <div className="text-xs text-muted">
                  <TermTooltip
                    label={t.simulator.effectiveAvg}
                    definition={t.glossary.effectiveAvg}
                  />
                </div>
                <div className="mt-1.5 font-mono text-xl font-bold text-ink tabular-nums">
                  {formatIdr(result.effectiveAvgPrice, true)}
                </div>
              </Card>
              <Card variant="highlight" className="border-t-2 border-t-brand-600 p-4">
                <div className="text-xs font-medium text-brand-700">
                  <TermTooltip
                    label={t.simulator.realBepTick}
                    definition={t.glossary.realBepTick}
                  />
                </div>
                <div className="mt-1.5 font-mono text-xl font-bold text-brand-900 tabular-nums">
                  {formatIdr(result.bepIdxTick)}
                </div>
                <div className="mt-0.5 font-mono text-[11px] text-brand-700/90 tabular-nums">
                  {t.simulator.bepRawHint}: {formatIdr(result.bepRaw, true)}
                </div>
              </Card>
            </div>

            {/* Net P/L & Capital Summary (Display Card) */}
            <Card variant="display" className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
                <div>
                  <div className="text-xs text-muted">
                    <TermTooltip label={t.simulator.netPnL} definition={t.glossary.netPnL} />
                  </div>
                  <div
                    className={`mt-0.5 font-mono text-2xl font-bold tabular-nums ${
                      result.netPnL >= 0 ? 'text-positive-600' : 'text-negative-600'
                    }`}
                  >
                    {result.netPnL >= 0 ? '+' : ''}
                    {formatIdr(result.netPnL)}{' '}
                    <span className="text-base font-semibold">
                      ({formatPercent(result.netPnLPct, true)})
                    </span>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-xs text-muted">{t.simulator.totalLots}</div>
                  <div className="font-mono text-base font-semibold text-ink tabular-nums">
                    {formatNumber(result.totalLots)} {t.common.lots} (
                    {formatNumber(result.totalShares)} {t.common.shares})
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
                <div className="flex items-center justify-between rounded-lg border border-border/70 bg-panel/70 px-3 py-2">
                  <span className="text-xs text-muted">{t.simulator.plannedCash}</span>
                  <span className="font-mono font-semibold text-ink tabular-nums">
                    {formatIdr(result.plannedCashRequired)}
                  </span>
                </div>
                <div className="flex items-center justify-between rounded-lg border border-border/70 bg-panel/70 px-3 py-2">
                  <span className="text-xs text-muted">{t.simulator.totalCapital}</span>
                  <span className="font-mono font-semibold text-ink tabular-nums">
                    {formatIdr(result.totalCost)}
                  </span>
                </div>
                <div className="flex items-center justify-between rounded-lg border border-border/70 bg-panel/70 px-3 py-2">
                  <span className="text-xs text-muted">{t.simulator.netProceeds}</span>
                  <span className="font-mono font-semibold text-ink tabular-nums">
                    {formatIdr(result.netProceeds)}
                  </span>
                </div>
                <div className="flex items-center justify-between rounded-lg border border-border/70 bg-panel/70 px-3 py-2">
                  <span className="text-xs text-muted">{t.simulator.feesBreakdown}</span>
                  <span className="font-mono text-xs font-medium text-ink tabular-nums">
                    {formatIdr(result.totalBuyFee)} / {formatIdr(result.sellFee)} /{' '}
                    {formatIdr(result.stampDutyBuy + result.stampDutySell)}
                  </span>
                </div>
              </div>

              {result.gainToBepBeforePct !== null && result.gainToBepAfterPct !== null && (
                <div className="rounded-lg border border-border bg-panel/70 px-4 py-3">
                  <div className="text-xs font-medium text-muted">
                    {t.simulator.bepGainCompare}
                  </div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-6 font-mono text-sm tabular-nums">
                    <div>
                      <span className="text-xs text-muted">{t.simulator.beforeAvgDown}: </span>
                      <span className="font-semibold text-ink">
                        {formatPercent(result.gainToBepBeforePct, true)}
                      </span>
                    </div>
                    <div>
                      <span className="text-xs text-muted">{t.simulator.afterAvgDown}: </span>
                      <span className="font-semibold text-positive-600">
                        {formatPercent(result.gainToBepAfterPct, true)}
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </Card>
          </>
        )}
      </div>
    </div>
  );
}
