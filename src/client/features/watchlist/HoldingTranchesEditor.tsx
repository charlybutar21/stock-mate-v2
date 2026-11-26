import { Eye, EyeOff, Plus, Trash2 } from 'lucide-react';
import {
  aggregateHoldingTranches,
  calculatePositionSummary,
  DEFAULT_BUY_FEE_PCT,
  DEFAULT_SELL_FEE_PCT,
  round2,
} from '@/shared/domain';
import { CalcModeSwitcher } from '@/client/components/ui/CalcModeSwitcher';
import {
  Button,
  IdxPriceInput,
  Input,
  RolePill,
  TermTooltip,
} from '@/client/components/ui/primitives';
import { useI18n } from '@/client/i18n/useI18n';
import { formatIdr, formatNumber, formatPercent } from '@/client/lib/formatters';
import { useCalcMode } from '@/client/lib/useCalcMode';
import { MASKED_IDR, usePrivacy } from '@/client/lib/usePrivacy';

export interface EditableHoldingRow {
  id: string;
  lots: string;
  buyPrice: string;
}

interface HoldingTranchesEditorProps {
  rows: EditableHoldingRow[];
  onChange: (next: EditableHoldingRow[]) => void;
  currentPrice: number;
}

export function HoldingTranchesEditor({
  rows,
  onChange,
  currentPrice,
}: HoldingTranchesEditorProps) {
  const { t } = useI18n();
  const { hideBalances, toggleHideBalances } = usePrivacy();
  const { calcMode, isBrokerGross } = useCalcMode();

  const parsedTranches = rows
    .map((r) => ({
      lots: r.lots.trim() ? Math.round(Number(r.lots)) : 0,
      buyPrice: r.buyPrice.trim() ? round2(Number(r.buyPrice)) : 0,
    }))
    .filter((r) => r.lots >= 1 && r.buyPrice >= 1);

  const agg = aggregateHoldingTranches(parsedTranches);
  const pos = calculatePositionSummary(
    agg.ownedLots,
    agg.avgBuyPrice,
    currentPrice >= 1 ? currentPrice : 0,
    DEFAULT_BUY_FEE_PCT,
    DEFAULT_SELL_FEE_PCT,
    calcMode,
  );

  const addRow = () => {
    onChange([
      ...rows,
      {
        id: `h_${Date.now()}_${rows.length}`,
        lots: '10',
        buyPrice: currentPrice >= 1 ? String(currentPrice) : '',
      },
    ]);
  };

  const updateRow = (id: string, field: 'lots' | 'buyPrice', value: string) => {
    onChange(rows.map((r) => (r.id === id ? { ...r, [field]: value } : r)));
  };

  const removeRow = (id: string) => {
    onChange(rows.filter((r) => r.id !== id));
  };

  return (
    <div className="space-y-4">
      {/* Editable Tranche Rows Box */}
      <div className="space-y-3 rounded-lg border border-editable-border/70 bg-surface/50 p-3.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-ink">
              {t.watchlist.form.positionSection}
            </span>
            <RolePill role="editable" label={t.common.editableTag} />
          </div>
          <Button
            variant="outlineBrand"
            size="sm"
            onClick={addRow}
            disabled={rows.length >= 20}
            className="h-7 px-2.5 text-xs"
          >
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            {t.watchlist.form.addBuyEntry}
          </Button>
        </div>

        {rows.length === 0 ? (
          <p className="py-1 text-xs text-muted">{t.watchlist.form.noHoldingsYet}</p>
        ) : (
          <div className="space-y-2">
            {rows.map((row, idx) => (
              <div key={row.id} className="flex min-w-0 items-end gap-1.5 sm:gap-2">
                <div className="flex h-9 w-6 shrink-0 items-center justify-center rounded-md border border-border bg-panel font-mono text-[11px] font-semibold text-muted">
                  #{idx + 1}
                </div>
                <div className="w-20 shrink-0 sm:w-24">
                  {idx === 0 && (
                    <label className="mb-1 block text-[11px] font-medium text-muted">
                      {t.watchlist.form.buyEntryLots}
                    </label>
                  )}
                  <Input
                    type="number"
                    min={1}
                    step={1}
                    placeholder="10"
                    value={row.lots}
                    onChange={(e) => updateRow(row.id, 'lots', e.target.value)}
                    className="px-2 font-mono tabular-nums"
                  />
                </div>
                <div className="min-w-0 flex-1">
                  {idx === 0 && (
                    <label className="mb-1 block text-[11px] font-medium text-muted">
                      {t.watchlist.form.buyEntryPrice}
                    </label>
                  )}
                  <IdxPriceInput
                    allowDecimals
                    placeholder={currentPrice >= 1 ? String(currentPrice) : '1000'}
                    value={row.buyPrice}
                    onValueChange={(val) => updateRow(row.id, 'buyPrice', val)}
                    tickHintLabel={t.common.tickStepLabel}
                    stepDownLabel={t.common.stepDown}
                    stepUpLabel={t.common.stepUp}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => removeRow(row.id)}
                  aria-label="Remove buy entry"
                  className="flex h-9 w-8 shrink-0 items-center justify-center rounded-md text-muted transition-colors hover:bg-negative-50 hover:text-negative-600 cursor-pointer"
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Auto-Calculated Position Display Summary */}
      {pos.ownedLots > 0 && (
        <div className="space-y-2.5 rounded-lg border border-border bg-display p-3.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-semibold text-muted">
                {t.watchlist.form.combinedSummary}
              </span>
              <RolePill role="calculated" label={t.common.calculatedTag} />
            </div>
            <div className="flex items-center gap-2">
              <CalcModeSwitcher compact showLabel={false} />
              <button
                type="button"
                onClick={toggleHideBalances}
                title={hideBalances ? t.watchlist.showBalances : t.watchlist.hideBalances}
                aria-label={hideBalances ? t.watchlist.showBalances : t.watchlist.hideBalances}
                className="inline-flex h-6 w-6 items-center justify-center rounded-md text-muted transition-colors hover:bg-subtle hover:text-ink cursor-pointer"
              >
                {hideBalances ? (
                  <EyeOff className="h-3.5 w-3.5" aria-hidden="true" />
                ) : (
                  <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                )}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-lg border border-border bg-panel/70 px-3 py-2.5">
              <div className="text-[11px] font-medium text-muted">
                {t.watchlist.form.combinedSummary}
              </div>
              <div className="mt-0.5 font-mono text-xs font-bold text-ink tabular-nums">
                {formatNumber(pos.ownedLots)} {t.common.lots} ·{' '}
                {formatIdr(
                  pos.avgBuyPrice,
                  pos.avgBuyPrice !== null && !Number.isInteger(pos.avgBuyPrice),
                )}
              </div>
              <div className="font-mono text-[10px] text-muted tabular-nums">
                {formatNumber(pos.ownedShares)} {t.common.shares}
              </div>
            </div>

            <div className="rounded-lg border border-border bg-panel/70 px-3 py-2.5">
              <div className="text-[11px] font-medium text-muted">
                <TermTooltip
                  label={
                    isBrokerGross
                      ? t.watchlist.kpiInvestedGross
                      : t.watchlist.form.totalInvestedLabel
                  }
                  definition={
                    isBrokerGross ? t.glossary.grossTotalInvested : t.glossary.totalInvested
                  }
                />
              </div>
              <div className="mt-0.5 font-mono text-xs font-bold text-ink tabular-nums">
                {hideBalances ? MASKED_IDR : formatIdr(pos.costBasis)}
              </div>
              <div className="font-mono text-[10px] text-muted tabular-nums">
                {isBrokerGross
                  ? t.watchlist.form.brokerGrossBuyNote
                  : hideBalances
                    ? t.watchlist.form.stockbitBuyFeeNote
                    : `+${formatIdr(pos.estimatedBuyFee)} (${t.watchlist.form.stockbitBuyFeeNote})`}
              </div>
            </div>

            <div className="rounded-lg border border-brand-600/30 bg-brand-50/75 px-3 py-2.5">
              <div className="text-[11px] font-medium text-brand-700">
                <TermTooltip
                  label={
                    isBrokerGross
                      ? t.watchlist.form.grossMarketValueLabel
                      : t.watchlist.form.netMarketValueLabel
                  }
                  definition={
                    isBrokerGross ? t.glossary.grossMarketValue : t.glossary.netMarketValue
                  }
                />
              </div>
              <div className="mt-0.5 font-mono text-xs font-bold text-brand-900 tabular-nums">
                {hideBalances ? MASKED_IDR : formatIdr(pos.marketValue)}
              </div>
              <div className="font-mono text-[10px] text-brand-700/90 tabular-nums">
                {isBrokerGross
                  ? t.watchlist.form.brokerGrossSellNote
                  : hideBalances
                    ? t.watchlist.form.stockbitSellFeeNote
                    : `-${formatIdr(pos.estimatedSellFee)}${
                        pos.estimatedSellStampDuty > 0
                          ? ` ${t.watchlist.form.stampDutyShort}`
                          : ` (${t.watchlist.form.stockbitSellFeeNote})`
                      }`}
              </div>
            </div>

            <div className="rounded-lg border border-border bg-panel/70 px-3 py-2.5">
              <div className="text-[11px] font-medium text-muted">
                <TermTooltip
                  label={t.detail.unrealizedPnL}
                  definition={
                    isBrokerGross ? t.glossary.grossUnrealizedPnL : t.glossary.unrealizedPnL
                  }
                />
              </div>
              <div
                className={`mt-0.5 font-mono text-xs font-bold tabular-nums ${
                  pos.unrealizedPnL === null
                    ? 'text-muted'
                    : pos.unrealizedPnL >= 0
                      ? 'text-positive-600'
                      : 'text-negative-600'
                }`}
              >
                {pos.unrealizedPnL !== null
                  ? hideBalances
                    ? MASKED_IDR
                    : `${pos.unrealizedPnL >= 0 ? '+' : ''}${formatIdr(pos.unrealizedPnL)}`
                  : '-'}
              </div>
              <div className="font-mono text-[10px] text-muted tabular-nums">
                {formatPercent(pos.unrealizedPnLPct, true)}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
