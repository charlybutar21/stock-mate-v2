import { Layers } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { WatchlistItemDto } from '@/shared/contracts';
import {
  planPyramidingAllocation,
  type PyramidingStrategy,
} from '@/shared/domain';
import { Badge, Card, Field, Input, Select, TermTooltip } from '@/client/components/ui/primitives';
import { useI18n } from '@/client/i18n/useI18n';
import { formatIdr, formatNumber, formatPercent } from '@/client/lib/formatters';

interface PyramidingTabProps {
  linkedStock: WatchlistItemDto;
  buyFeePct: number;
  sellFeePct: number;
  includeStampDuty: boolean;
}

export function PyramidingTab({
  linkedStock,
  buyFeePct,
  sellFeePct,
  includeStampDuty,
}: PyramidingTabProps) {
  const { t } = useI18n();

  const defaultLots = linkedStock.ownedLots > 0 ? String(linkedStock.ownedLots) : '0';
  const defaultAvgPrice =
    linkedStock.avgBuyPrice && linkedStock.avgBuyPrice >= 1
      ? String(linkedStock.avgBuyPrice)
      : String(Math.max(1, Math.round(linkedStock.currentPrice * 1.1)));
  const defaultBudget = String(
    Math.max(10_000_000, linkedStock.currentPrice * 100 * 30),
  );

  const [existingLots, setExistingLots] = useState(defaultLots);
  const [existingAvgPrice, setExistingAvgPrice] = useState(defaultAvgPrice);
  const [totalCashBudget, setTotalCashBudget] = useState(defaultBudget);
  const [referencePrice, setReferencePrice] = useState(String(linkedStock.currentPrice));
  const [stepDiscountPct, setStepDiscountPct] = useState('5');
  const [strategy, setStrategy] = useState<PyramidingStrategy>('PYRAMID_20_30_50');
  const [targetSellPrice, setTargetSellPrice] = useState(
    String(
      linkedStock.valuation.fairValue.moderate ??
        Math.round(linkedStock.currentPrice * 1.15),
    ),
  );

  const result = useMemo(
    () =>
      planPyramidingAllocation({
        existingLots: Number(existingLots || 0),
        existingAvgPrice: Number(existingAvgPrice || 0),
        totalCashBudget: Number(totalCashBudget || 0),
        referencePrice: Number(referencePrice || 0),
        stepDiscountPct: Number(stepDiscountPct || 0),
        strategy,
        targetSellPrice: Number(targetSellPrice || 0),
        buyFeePct,
        sellFeePct,
        includeStampDuty,
        fairValueModerate: linkedStock.valuation.fairValue.moderate,
      }),
    [
      existingLots,
      existingAvgPrice,
      totalCashBudget,
      referencePrice,
      stepDiscountPct,
      strategy,
      targetSellPrice,
      buyFeePct,
      sellFeePct,
      includeStampDuty,
      linkedStock.valuation.fairValue.moderate,
    ],
  );

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
      {/* Left: Pyramiding Controls */}
      <Card className="space-y-4 lg:col-span-5">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
              <Layers className="h-4 w-4" />
            </span>
            <h3 className="text-sm font-bold text-ink">{t.simulator.pyramiding.title}</h3>
          </div>
          <p className="mt-1 text-xs text-muted">{t.simulator.pyramiding.subtitle}</p>
        </div>

        <div className="grid grid-cols-2 gap-3 border-t border-border pt-3">
          <Field label={t.simulator.existingLots} htmlFor="pyr-ex-lots">
            <Input
              id="pyr-ex-lots"
              type="number"
              min={0}
              step={1}
              value={existingLots}
              onChange={(e) => setExistingLots(e.target.value)}
              className="font-mono tabular-nums"
            />
          </Field>
          <Field label={t.simulator.existingAvgPrice} htmlFor="pyr-ex-avg">
            <Input
              id="pyr-ex-avg"
              type="number"
              min={1}
              step={1}
              value={existingAvgPrice}
              onChange={(e) => setExistingAvgPrice(e.target.value)}
              className="font-mono tabular-nums"
            />
          </Field>
        </div>

        <Field label={t.simulator.pyramiding.totalBudget} htmlFor="pyr-budget">
          <Input
            id="pyr-budget"
            type="number"
            min={100000}
            step={500000}
            value={totalCashBudget}
            onChange={(e) => setTotalCashBudget(e.target.value)}
            className="font-mono tabular-nums"
          />
        </Field>

        <Field label={t.simulator.pyramiding.strategyLabel} htmlFor="pyr-strategy">
          <Select
            id="pyr-strategy"
            value={strategy}
            onChange={(e) => setStrategy(e.target.value as PyramidingStrategy)}
          >
            <option value="PYRAMID_20_30_50">
              {t.simulator.pyramiding.strategies.PYRAMID_20_30_50}
            </option>
            <option value="EQUAL_33_33_34">
              {t.simulator.pyramiding.strategies.EQUAL_33_33_34}
            </option>
            <option value="AGGRESSIVE_15_35_50">
              {t.simulator.pyramiding.strategies.AGGRESSIVE_15_35_50}
            </option>
          </Select>
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label={t.simulator.pyramiding.referencePrice} htmlFor="pyr-ref">
            <Input
              id="pyr-ref"
              type="number"
              min={1}
              step={1}
              value={referencePrice}
              onChange={(e) => setReferencePrice(e.target.value)}
              className="font-mono tabular-nums"
            />
          </Field>
          <Field label={t.simulator.pyramiding.stepDiscountPct} htmlFor="pyr-step">
            <Input
              id="pyr-step"
              type="number"
              min={1}
              max={30}
              step={1}
              value={stepDiscountPct}
              onChange={(e) => setStepDiscountPct(e.target.value)}
              className="font-mono tabular-nums"
            />
          </Field>
        </div>

        <Field label={t.simulator.targetSellPrice} htmlFor="pyr-target-sell">
          <Input
            id="pyr-target-sell"
            type="number"
            min={1}
            step={1}
            value={targetSellPrice}
            onChange={(e) => setTargetSellPrice(e.target.value)}
            className="font-mono tabular-nums"
          />
        </Field>
      </Card>

      {/* Right: 3-Stage Pyramiding Schedule & Summary */}
      <div className="space-y-4 lg:col-span-7">
        {!result.valid ? (
          <Card className="p-8 text-center text-sm text-muted">
            {t.simulator.invalidInputs}
          </Card>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-3 animate-fade-up">
              <Card interactive className="p-4">
                <div className="text-xs text-muted">
                  {t.simulator.pyramiding.totalDeployed}
                </div>
                <div className="mt-1.5 font-mono text-xl font-bold text-ink tabular-nums">
                  {formatIdr(result.totalCashUsed)}
                </div>
                <div className="mt-0.5 font-mono text-[11px] text-muted tabular-nums">
                  {t.simulator.pyramiding.idleCash}: {formatIdr(result.remainingIdleCash)}
                </div>
              </Card>

              <Card interactive className="border-t-2 border-t-brand-700 bg-brand-50/70 p-4">
                <div className="text-xs font-medium text-brand-700">
                  <TermTooltip
                    label={t.simulator.pyramiding.resultingBep}
                    definition={t.glossary.realBepTick}
                  />
                </div>
                <div className="mt-1.5 font-mono text-xl font-bold text-brand-900 tabular-nums">
                  {formatIdr(result.simulation.bepIdxTick)}
                </div>
                <div className="mt-0.5 font-mono text-[11px] text-brand-700/80 tabular-nums">
                  {t.simulator.pureAvg}: {formatIdr(result.simulation.pureAvgPrice, true)}
                </div>
              </Card>

              <Card interactive className="p-4">
                <div className="text-xs text-muted">
                  <TermTooltip
                    label={t.simulator.pyramiding.projectedNetPnL}
                    definition={t.glossary.netPnL}
                  />
                </div>
                <div
                  className={`mt-1.5 font-mono text-xl font-bold tabular-nums ${
                    result.simulation.netPnL >= 0 ? 'text-positive-600' : 'text-negative-600'
                  }`}
                >
                  {result.simulation.netPnL >= 0 ? '+' : ''}
                  {formatIdr(result.simulation.netPnL)}
                </div>
                <div className="mt-0.5 font-mono text-xs font-semibold text-muted tabular-nums">
                  {formatPercent(result.simulation.netPnLPct, true)} ·{' '}
                  {formatNumber(result.simulation.totalLots)} {t.common.lots}
                </div>
              </Card>
            </div>

            <Card className="overflow-hidden p-0">
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-left text-xs">
                  <thead>
                    <tr className="border-b border-border bg-surface/80 font-semibold text-muted">
                      <th className="py-3 pr-2 pl-4">{t.simulator.pyramiding.stageCol}</th>
                      <th className="px-2 py-3 text-right">{t.simulator.pyramiding.weightCol}</th>
                      <th className="px-2 py-3 text-right">
                        {t.simulator.pyramiding.triggerPriceCol}
                      </th>
                      <th className="px-2 py-3 text-right">{t.simulator.pyramiding.lotsCol}</th>
                      <th className="px-2 py-3 text-right">
                        {t.simulator.pyramiding.cashUsedCol}
                      </th>
                      <th className="py-3 pr-4 pl-2 text-right">
                        {t.simulator.pyramiding.cumAvgCol}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/80 font-mono tabular-nums">
                    {result.stages.map((st) => (
                      <tr key={st.stageNumber} className="hover:bg-brand-50/30">
                        <td className="py-3 pr-2 pl-4 font-sans font-semibold text-ink">
                          #{st.stageNumber}
                        </td>
                        <td className="px-2 py-3 text-right">
                          <Badge tone="info">{st.allocationWeightPct}%</Badge>
                        </td>
                        <td className="px-2 py-3 text-right font-bold text-brand-700">
                          {formatIdr(st.triggerPrice)}
                        </td>
                        <td className="px-2 py-3 text-right font-bold text-ink">
                          {formatNumber(st.lots)} {t.common.lots}
                        </td>
                        <td className="px-2 py-3 text-right text-ink">
                          {formatIdr(st.cashUsed)}
                        </td>
                        <td className="py-3 pr-4 pl-2 text-right font-semibold text-ink">
                          {st.cumulativePureAvg > 0
                            ? formatIdr(st.cumulativePureAvg, true)
                            : '—'}
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
