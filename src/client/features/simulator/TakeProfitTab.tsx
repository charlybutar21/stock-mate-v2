import { Plus, Sparkles, Trash2, Trophy } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { WatchlistItemDto } from '@/shared/contracts';
import {
  ceilToIdxTick,
  simulateTakeProfitLadder,
  type TakeProfitRungInput,
} from '@/shared/domain';
import { Badge, Button, Card, Field, Input } from '@/client/components/ui/primitives';
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
}

export function TakeProfitTab({
  linkedStock,
  buyFeePct,
  sellFeePct,
  includeStampDuty,
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
    });
  }, [totalOwnedLots, avgBuyPrice, rungs, buyFeePct, sellFeePct, includeStampDuty]);

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
      {/* Left: Owned Position & Sell Rungs */}
      <Card className="space-y-4 lg:col-span-5">
        <div>
          <h3 className="text-sm font-bold text-ink">{t.simulator.takeProfit.title}</h3>
          <p className="mt-1 text-xs text-muted">{t.simulator.takeProfit.subtitle}</p>
        </div>

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
            <Input
              id="tp-avg-buy"
              type="number"
              min={1}
              step={1}
              value={avgBuyPrice}
              onChange={(e) => setAvgBuyPrice(e.target.value)}
              className="font-mono tabular-nums"
            />
          </Field>
        </div>

        <div className="border-t border-border pt-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="text-xs font-semibold text-ink">
              {t.simulator.takeProfit.rungsTitle}
            </h4>
            <div className="flex items-center gap-1.5">
              <Button variant="secondary" size="sm" onClick={handleAutoFillFairValue}>
                <Sparkles className="h-3.5 w-3.5 text-brand-600" />
                {t.simulator.takeProfit.autoFillFairValue}
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={addRung}
                disabled={rungs.length >= 5}
              >
                <Plus className="h-3.5 w-3.5" />
                {t.simulator.takeProfit.addRung}
              </Button>
            </div>
          </div>

          <div className="mt-3 space-y-2.5">
            {rungs.map((row, idx) => (
              <div key={row.id} className="flex items-end gap-2">
                <div className="flex h-9 w-7 shrink-0 items-center justify-center rounded-md bg-subtle font-mono text-xs font-medium text-muted">
                  #{idx + 1}
                </div>
                <div className="flex-1">
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
                      className="font-mono tabular-nums"
                    />
                  </Field>
                </div>
                <div className="flex-1">
                  <Field
                    label={t.simulator.takeProfit.rungPrice}
                    htmlFor={`tp-price-${row.id}`}
                  >
                    <Input
                      id={`tp-price-${row.id}`}
                      type="number"
                      min={1}
                      step={1}
                      value={row.targetSellPrice}
                      onChange={(e) => updateRung(row.id, 'targetSellPrice', e.target.value)}
                      className="font-mono tabular-nums"
                    />
                  </Field>
                </div>
                <button
                  type="button"
                  onClick={() => removeRung(row.id)}
                  aria-label="Remove sell rung"
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted transition-colors hover:bg-negative-50 hover:text-negative-600 cursor-pointer"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        </div>
      </Card>

      {/* Right: Realized Profit & Remaining Free-Ride Position */}
      <div className="space-y-4 lg:col-span-7">
        {!result.valid ? (
          <Card className="p-8 text-center text-sm text-muted">
            {t.simulator.invalidInputs}
          </Card>
        ) : (
          <>
            {result.isFreeRidePosition && (
              <div className="flex items-start gap-3 rounded-xl border border-positive-600/30 bg-positive-50 p-4 text-positive-700 animate-fade-up">
                <Trophy className="mt-0.5 h-5 w-5 shrink-0 text-positive-600" />
                <div className="text-xs leading-relaxed">
                  <div className="font-bold">{t.simulator.takeProfit.freeRideBadge}</div>
                  <p className="mt-0.5">{t.simulator.takeProfit.freeRideBody}</p>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-3 animate-fade-up">
              <Card interactive className="border-t-2 border-t-brand-700 p-4">
                <div className="text-xs text-muted">
                  {t.simulator.takeProfit.totalRealizedPnL}
                </div>
                <div
                  className={`mt-1.5 font-mono text-xl font-bold tabular-nums ${
                    result.totalRealizedNetPnL >= 0
                      ? 'text-positive-600'
                      : 'text-negative-600'
                  }`}
                >
                  {result.totalRealizedNetPnL >= 0 ? '+' : ''}
                  {formatIdr(result.totalRealizedNetPnL)}
                </div>
                <div className="mt-0.5 font-mono text-xs font-semibold text-muted tabular-nums">
                  {formatPercent(result.totalRealizedPnLPct, true)}
                </div>
              </Card>

              <Card interactive className="p-4">
                <div className="text-xs text-muted">
                  {t.simulator.takeProfit.totalNetProceeds}
                </div>
                <div className="mt-1.5 font-mono text-xl font-bold text-ink tabular-nums">
                  {formatIdr(result.totalNetProceeds)}
                </div>
                <div className="mt-0.5 font-mono text-[11px] text-muted tabular-nums">
                  {formatNumber(result.totalLotsSold)} / {formatNumber(result.totalOwnedLots)}{' '}
                  {t.common.lots}
                </div>
              </Card>

              <Card interactive className="p-4">
                <div className="text-xs text-muted">
                  {t.simulator.takeProfit.remainingLotsLabel}
                </div>
                <div className="mt-1.5 font-mono text-xl font-bold text-ink tabular-nums">
                  {formatNumber(result.remainingLots)} {t.common.lots}
                </div>
                <div className="mt-0.5 font-mono text-[11px] text-muted tabular-nums">
                  {t.simulator.takeProfit.effectiveRemainingCostLabel}:{' '}
                  {formatIdr(result.remainingEffectiveCostPerShare)}
                </div>
              </Card>
            </div>

            <Card className="overflow-hidden p-0">
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-left text-xs">
                  <thead>
                    <tr className="border-b border-border bg-surface/80 font-semibold text-muted">
                      <th className="py-3 pr-2 pl-4">{t.simulator.takeProfit.rungCol}</th>
                      <th className="px-2 py-3 text-right">
                        {t.simulator.takeProfit.lotsShareCol}
                      </th>
                      <th className="px-2 py-3 text-right">
                        {t.simulator.takeProfit.targetPriceCol}
                      </th>
                      <th className="px-2 py-3 text-right">
                        {t.simulator.takeProfit.netProceedsCol}
                      </th>
                      <th className="py-3 pr-4 pl-2 text-right">
                        {t.simulator.takeProfit.realizedProfitCol}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/80 font-mono tabular-nums">
                    {result.rungs.map((r) => (
                      <tr key={r.rungNumber} className="hover:bg-brand-50/30">
                        <td className="py-3 pr-2 pl-4 font-sans font-semibold text-ink">
                          #{r.rungNumber}
                        </td>
                        <td className="px-2 py-3 text-right">
                          <span className="font-bold text-ink">
                            {formatNumber(r.lotsSold)} {t.common.lots}
                          </span>{' '}
                          <span className="text-muted">({formatPercent(r.sellPctOfTotal)})</span>
                        </td>
                        <td className="px-2 py-3 text-right font-bold text-brand-700">
                          {formatIdr(r.targetSellPrice)}
                        </td>
                        <td className="px-2 py-3 text-right text-ink">
                          {formatIdr(r.netProceeds)}
                        </td>
                        <td className="py-3 pr-4 pl-2 text-right">
                          <span
                            className={`font-bold ${
                              r.realizedNetPnL >= 0
                                ? 'text-positive-600'
                                : 'text-negative-600'
                            }`}
                          >
                            {r.realizedNetPnL >= 0 ? '+' : ''}
                            {formatIdr(r.realizedNetPnL)}
                          </span>{' '}
                          <Badge tone={r.realizedPnLPct >= 0 ? 'positive' : 'negative'}>
                            {formatPercent(r.realizedPnLPct, true)}
                          </Badge>
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
