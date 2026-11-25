import { Plus, Trash2 } from 'lucide-react';
import {
  aggregateHoldingTranches,
  calculatePositionSummary,
} from '@/shared/domain';
import { Button, Input, TermTooltip } from '@/client/components/ui/primitives';
import { useI18n } from '@/client/i18n/useI18n';
import { formatIdr, formatNumber, formatPercent } from '@/client/lib/formatters';

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

  const parsedTranches = rows
    .map((r) => ({
      lots: r.lots.trim() ? Math.round(Number(r.lots)) : 0,
      buyPrice: r.buyPrice.trim() ? Math.round(Number(r.buyPrice)) : 0,
    }))
    .filter((r) => r.lots >= 1 && r.buyPrice >= 1);

  const agg = aggregateHoldingTranches(parsedTranches);
  const pos = calculatePositionSummary(
    agg.ownedLots,
    agg.avgBuyPrice,
    currentPrice >= 1 ? currentPrice : 0,
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
    <div className="space-y-3 rounded-lg border border-border bg-surface/70 p-3.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-[11px] font-semibold tracking-wider text-muted uppercase">
          {t.watchlist.form.positionSection}
        </span>
        <Button
          variant="outlineBrand"
          size="sm"
          onClick={addRow}
          disabled={rows.length >= 20}
          className="h-7 px-2.5 text-xs"
        >
          <Plus className="h-3.5 w-3.5" />
          {t.watchlist.form.addBuyEntry}
        </Button>
      </div>

      {rows.length === 0 ? (
        <p className="py-1 text-xs text-muted">{t.watchlist.form.noHoldingsYet}</p>
      ) : (
        <div className="space-y-2">
          {rows.map((row, idx) => (
            <div key={row.id} className="flex items-end gap-2">
              <div className="flex h-9 w-7 shrink-0 items-center justify-center rounded-md border border-border bg-panel font-mono text-[11px] font-semibold text-muted">
                #{idx + 1}
              </div>
              <div className="flex-1">
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
                  className="font-mono tabular-nums"
                />
              </div>
              <div className="flex-1">
                {idx === 0 && (
                  <label className="mb-1 block text-[11px] font-medium text-muted">
                    {t.watchlist.form.buyEntryPrice}
                  </label>
                )}
                <Input
                  type="number"
                  min={1}
                  step={1}
                  placeholder={currentPrice >= 1 ? String(currentPrice) : '1000'}
                  value={row.buyPrice}
                  onChange={(e) => updateRow(row.id, 'buyPrice', e.target.value)}
                  className="font-mono tabular-nums"
                />
              </div>
              <button
                type="button"
                onClick={() => removeRow(row.id)}
                aria-label="Remove buy entry"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-muted transition-colors hover:bg-negative-50 hover:text-negative-600 cursor-pointer"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      {pos.ownedLots > 0 && (
        <div className="grid grid-cols-1 gap-2.5 border-t border-border pt-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-lg border border-border bg-panel px-3 py-2.5">
            <div className="text-[11px] font-medium text-muted">
              {t.watchlist.form.combinedSummary}
            </div>
            <div className="mt-0.5 font-mono text-xs font-bold text-ink tabular-nums">
              {formatNumber(pos.ownedLots)} {t.common.lots} · {formatIdr(pos.avgBuyPrice)}
            </div>
            <div className="font-mono text-[10px] text-muted tabular-nums">
              {formatNumber(pos.ownedShares)} {t.common.shares}
            </div>
          </div>

          <div className="rounded-lg border border-border bg-panel px-3 py-2.5">
            <div className="text-[11px] font-medium text-muted">
              <TermTooltip
                label={t.watchlist.form.totalInvestedLabel}
                definition={t.glossary.totalInvested}
              />
            </div>
            <div className="mt-0.5 font-mono text-xs font-bold text-ink tabular-nums">
              {formatIdr(pos.costBasis)}
            </div>
            <div className="font-mono text-[10px] text-muted tabular-nums">
              +{formatIdr(pos.estimatedBuyFee)} ({t.watchlist.form.stockbitBuyFeeNote})
            </div>
          </div>

          <div className="rounded-lg border border-brand-600/25 bg-brand-50/60 px-3 py-2.5">
            <div className="text-[11px] font-medium text-brand-700">
              <TermTooltip
                label={t.watchlist.form.netMarketValueLabel}
                definition={t.glossary.netMarketValue}
              />
            </div>
            <div className="mt-0.5 font-mono text-xs font-bold text-brand-900 tabular-nums">
              {formatIdr(pos.marketValue)}
            </div>
            <div className="font-mono text-[10px] text-brand-700/80 tabular-nums">
              -{formatIdr(pos.estimatedSellFee)}
              {pos.estimatedSellStampDuty > 0
                ? ` ${t.watchlist.form.stampDutyShort}`
                : ` (${t.watchlist.form.stockbitSellFeeNote})`}
            </div>
          </div>

          <div className="rounded-lg border border-border bg-panel px-3 py-2.5">
            <div className="text-[11px] font-medium text-muted">
              <TermTooltip
                label={t.detail.unrealizedPnL}
                definition={t.glossary.unrealizedPnL}
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
                ? `${pos.unrealizedPnL >= 0 ? '+' : ''}${formatIdr(pos.unrealizedPnL)}`
                : '—'}
            </div>
            <div className="font-mono text-[10px] text-muted tabular-nums">
              {formatPercent(pos.unrealizedPnLPct, true)}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
