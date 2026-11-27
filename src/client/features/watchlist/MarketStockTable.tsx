import {
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  Calculator,
  Clock,
  Pencil,
  Plus,
  ShieldAlert,
  Trash2,
  X,
} from 'lucide-react';
import type { CustomWatchlistGroupDto, MarketStockDto } from '@/shared/contracts';
import {
  calculatePositionSummary,
  DEFAULT_BUY_FEE_PCT,
  DEFAULT_SELL_FEE_PCT,
  type IdxSector,
} from '@/shared/domain';
import { Badge, cn, TermTooltip } from '@/client/components/ui/primitives';
import { useI18n } from '@/client/i18n/useI18n';
import { formatIdr, formatNumber, formatPercent } from '@/client/lib/formatters';
import { useCalcMode } from '@/client/lib/useCalcMode';
import { MASKED_IDR, MASKED_LOTS } from '@/client/lib/usePrivacy';
import { statusTone } from '@/client/lib/valuationTone';
import { QualityScoreBadge } from '@/client/features/radar/QualityScoreBadge';
import { AddToWatchlistMenu } from './AddToWatchlistMenu';

export interface MarketStockTableProps {
  items: MarketStockDto[];
  tabKind: 'all' | 'my_stocks' | 'custom';
  sector: IdxSector | '';
  onToggleSector: (next: IdxSector | '') => void;
  hideBalances: boolean;
  customGroups: CustomWatchlistGroupDto[];
  openingTicker: string | null;
  onOpenDetail: (stock: MarketStockDto) => void;
  onOpenSimulator: (stock: MarketStockDto) => void;
  onEdit: (stock: MarketStockDto) => void;
  onDeletePersonal?: (stock: MarketStockDto) => void;
  onRemoveFromCustom?: (ticker: string) => void;
  onCreateWatchlistWithTicker: (ticker: string) => void;
}

export function MarketStockTable({
  items,
  tabKind,
  sector,
  onToggleSector,
  hideBalances,
  customGroups,
  openingTicker,
  onOpenDetail,
  onOpenSimulator,
  onEdit,
  onDeletePersonal,
  onRemoveFromCustom,
  onCreateWatchlistWithTicker,
}: MarketStockTableProps) {
  const { t } = useI18n();
  const { calcMode, isBrokerGross } = useCalcMode();

  return (
    <>
      {/* Mobile Compact Card List (zero horizontal scroll, >= 36px tap targets) */}
      <div className="divide-y divide-border/80 md:hidden">
        {items.map((item) => {
          const pos = calculatePositionSummary(
            item.ownedLots,
            item.avgBuyPrice,
            item.currentPrice,
            DEFAULT_BUY_FEE_PCT,
            DEFAULT_SELL_FEE_PCT,
            calcMode,
          );
          const mosVal = item.valuation.mosPct;
          const isSectorActive = sector === item.sector;
          const isOpening = openingTicker === item.ticker;

          return (
            <article key={item.ticker} className="space-y-2.5 p-4 transition-colors hover:bg-brand-50/30">
              {/* Row 1: Ticker + Sector (left) | Price + Fair Value (right) */}
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <button
                      type="button"
                      disabled={isOpening}
                      onClick={() => onOpenDetail(item)}
                      className="font-mono text-base font-bold tracking-tight text-ink hover:text-brand-700 disabled:opacity-60 cursor-pointer"
                    >
                      {item.ticker}
                    </button>
                    {tabKind !== 'my_stocks' && item.ownedLots > 0 && (
                      <span className="rounded border border-brand-600/30 bg-brand-50 px-1.5 py-0.5 text-[10px] font-semibold text-brand-700">
                        {t.watchlist.ownedBadge}
                      </span>
                    )}
                    {item.isStale && (
                      <span
                        title={t.watchlist.staleBadge}
                        className="inline-flex items-center text-warning-700"
                      >
                        <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5 truncate text-xs text-muted">{item.companyName}</div>
                  <button
                    type="button"
                    onClick={() => onToggleSector(isSectorActive ? '' : item.sector)}
                    className={cn(
                      'mt-1.5 inline-flex max-w-full items-center rounded-md border px-2 py-0.5 text-[11px] font-medium transition-colors cursor-pointer',
                      isSectorActive
                        ? 'border-brand-600/45 bg-brand-50 text-brand-700'
                        : 'border-border bg-subtle/75 text-muted hover:text-ink',
                    )}
                  >
                    <span className="truncate">{t.sectors[item.sector]}</span>
                  </button>
                </div>

                <div className="shrink-0 text-right font-mono tabular-nums">
                  <div className="text-base font-bold text-ink">{formatIdr(item.currentPrice)}</div>
                  <div className="mt-0.5 text-[11px] text-muted">
                    {t.watchlist.colFairValue}:{' '}
                    <span className="font-semibold text-ink">
                      {formatIdr(item.valuation.fairValue.moderate)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Row 2: Discount (MoS) + Valuation & Trap Badges (left) | Quality Badge (right) */}
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/70 bg-subtle/40 px-3 py-2">
                <div className="flex flex-wrap items-center gap-1.5">
                  {mosVal !== null ? (
                    <span
                      className={cn(
                        'inline-flex items-center gap-0.5 font-mono text-xs font-bold tabular-nums',
                        mosVal >= 30
                          ? 'text-positive-700'
                          : mosVal >= 0
                            ? 'text-warning-700'
                            : 'text-negative-600',
                      )}
                    >
                      {mosVal >= 0 ? (
                        <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
                      ) : (
                        <ArrowDownRight className="h-3.5 w-3.5" aria-hidden="true" />
                      )}
                      {formatPercent(mosVal, true)}
                    </span>
                  ) : (
                    <span className="font-mono text-xs text-muted">-</span>
                  )}
                  <Badge tone={statusTone(item.valuation.valuationStatus)}>
                    {t.valuationStatus[item.valuation.valuationStatus]}
                  </Badge>
                  {item.valuation.valueTrapShield.riskLevel !== 'CLEAR' && (
                    <span
                      className={cn(
                        'inline-flex items-center gap-1 rounded-sm px-1.5 py-0.5 text-[10px] font-semibold',
                        item.valuation.valueTrapShield.riskLevel === 'HIGH_RISK'
                          ? 'bg-negative-50 text-negative-700'
                          : 'bg-warning-50 text-warning-700',
                      )}
                    >
                      <ShieldAlert className="h-3 w-3 shrink-0" aria-hidden="true" />
                      {t.valueTrapShield.shortBadges[item.valuation.valueTrapShield.riskLevel]}
                    </span>
                  )}
                </div>

                <QualityScoreBadge
                  quality={item.quality}
                  compact
                  onClick={() => onOpenDetail(item)}
                />
              </div>

              {/* Row 3: Owned Position or Target Buy (if present) */}
              {pos.ownedLots > 0 ? (
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <div className="font-mono tabular-nums text-ink">
                    <span className="font-bold">
                      {hideBalances ? MASKED_LOTS : formatNumber(pos.ownedLots)} {t.common.lots}
                    </span>
                    {pos.avgBuyPrice && (
                      <span className="ml-1 text-muted">
                        @{formatNumber(pos.avgBuyPrice, Number.isInteger(pos.avgBuyPrice) ? 0 : 2)}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 font-mono tabular-nums">
                    <span className="text-muted">
                      {hideBalances ? MASKED_IDR : formatIdr(pos.costBasis)}
                    </span>
                    {pos.unrealizedPnLPct !== null && (
                      <span
                        className={cn(
                          'rounded-sm px-1.5 py-0.5 text-[11px] font-bold',
                          pos.unrealizedPnLPct >= 0
                            ? 'bg-positive-50 text-positive-700'
                            : 'bg-negative-50 text-negative-700',
                        )}
                      >
                        {formatPercent(pos.unrealizedPnLPct, true)}
                      </span>
                    )}
                  </div>
                </div>
              ) : item.targetBuyPrice !== null ? (
                <div className="flex items-center justify-between text-xs text-muted">
                  <span>{t.watchlist.colTargetBuy}</span>
                  <span className="font-mono font-semibold text-brand-700 tabular-nums">
                    {formatIdr(item.targetBuyPrice)}
                  </span>
                </div>
              ) : null}

              {/* Row 4: Touch-Friendly Quick Action Bar */}
              <div className="flex items-center justify-between gap-2 pt-1">
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    disabled={isOpening}
                    onClick={() => onOpenDetail(item)}
                    className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-panel px-2.5 text-xs font-semibold text-ink transition-colors hover:bg-subtle disabled:opacity-50 cursor-pointer"
                  >
                    <BarChart3 className="h-3.5 w-3.5 text-muted" aria-hidden="true" />
                    <span>{t.watchlist.analyze}</span>
                  </button>
                  <button
                    type="button"
                    disabled={isOpening}
                    onClick={() => onOpenSimulator(item)}
                    className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-brand-600/35 bg-brand-50/70 px-2.5 text-xs font-semibold text-brand-700 transition-colors hover:bg-brand-solid hover:text-white disabled:opacity-50 cursor-pointer"
                  >
                    <Calculator className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>{t.watchlist.simulate}</span>
                  </button>
                </div>

                <div className="flex items-center gap-1">
                  {tabKind !== 'custom' && (
                    <AddToWatchlistMenu
                      ticker={item.ticker}
                      memberGroupIds={item.customWatchlistIds}
                      groups={customGroups}
                      onCreateWithTicker={onCreateWatchlistWithTicker}
                    />
                  )}
                  <button
                    type="button"
                    onClick={() => onEdit(item)}
                    title={t.common.edit}
                    aria-label={`${t.common.edit} ${item.ticker}`}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-md text-muted transition-colors hover:bg-subtle hover:text-ink cursor-pointer"
                  >
                    {pos.ownedLots > 0 ? (
                      <Pencil className="h-4 w-4" aria-hidden="true" />
                    ) : (
                      <Plus className="h-4 w-4" aria-hidden="true" />
                    )}
                  </button>
                  {tabKind === 'my_stocks' && onDeletePersonal && item.watchlistItemId && (
                    <button
                      type="button"
                      onClick={() => onDeletePersonal(item)}
                      title={t.common.delete}
                      aria-label={`${t.common.delete} ${item.ticker}`}
                      className="inline-flex h-9 w-9 items-center justify-center rounded-md text-muted transition-colors hover:bg-negative-50 hover:text-negative-600 cursor-pointer"
                    >
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </button>
                  )}
                  {tabKind === 'custom' && onRemoveFromCustom && (
                    <button
                      type="button"
                      onClick={() => onRemoveFromCustom(item.ticker)}
                      title={t.watchlist.removeFromWatchlist}
                      aria-label={`${t.watchlist.removeFromWatchlist} ${item.ticker}`}
                      className="inline-flex h-9 w-9 items-center justify-center rounded-md text-muted transition-colors hover:bg-negative-50 hover:text-negative-600 cursor-pointer"
                    >
                      <X className="h-4 w-4" aria-hidden="true" />
                    </button>
                  )}
                </div>
              </div>
            </article>
          );
        })}
      </div>

      {/* Desktop High-Density Table */}
      <div className="hidden w-full overflow-x-auto md:block">
        <table className="w-full min-w-[920px] table-fixed border-collapse text-left text-sm">
          <colgroup>
            <col className="w-[19%]" />
            <col className="w-[13%]" />
            <col className="w-[10%]" />
            <col className="w-[10%]" />
            <col className="w-[14%]" />
            <col className="w-[9%]" />
            <col className="w-[14%]" />
            <col className="w-[11%]" />
          </colgroup>
          <thead>
            <tr className="border-b border-border bg-subtle/70 text-xs font-semibold text-muted">
              <th className="py-3 pr-3 pl-5">{t.watchlist.colTicker}</th>
              <th className="px-3 py-3">{t.watchlist.colSector}</th>
              <th className="px-3 py-3 text-right">{t.watchlist.colPrice}</th>
              <th className="px-3 py-3 text-right">
                <TermTooltip
                  label={t.watchlist.colFairValue}
                  definition={t.glossary.fairValueMedian}
                />
              </th>
              <th className="px-3 py-3 text-right">
                <TermTooltip
                  label={t.watchlist.colMos}
                  definition={t.glossary.marginOfSafety}
                />
              </th>
              <th className="px-2 py-3 text-center">
                <TermTooltip label={t.watchlist.colQuality} definition={t.glossary.fqs} />
              </th>
              <th className="px-3 py-3 text-right">
                <TermTooltip
                  label={t.watchlist.colPosition}
                  definition={
                    isBrokerGross ? t.glossary.grossUnrealizedPnL : t.glossary.unrealizedPnL
                  }
                />
              </th>
              <th className="py-3 pr-5 pl-2 text-right">{t.watchlist.colActions}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/80">
            {items.map((item) => {
              const pos = calculatePositionSummary(
                item.ownedLots,
                item.avgBuyPrice,
                item.currentPrice,
                DEFAULT_BUY_FEE_PCT,
                DEFAULT_SELL_FEE_PCT,
                calcMode,
              );
              const mosVal = item.valuation.mosPct;
              const priceColor =
                mosVal === null
                  ? 'text-ink'
                  : mosVal >= 30
                    ? 'text-positive-700'
                    : mosVal < 0
                      ? 'text-negative-600'
                      : 'text-ink';
              const isSectorActive = sector === item.sector;
              const isOpening = openingTicker === item.ticker;

              return (
                <tr
                  key={item.ticker}
                  className="group transition-colors duration-150 hover:bg-brand-50/40"
                >
                  {/* Ticker + Company Name */}
                  <td className="py-3.5 pr-3 pl-5 align-middle">
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        disabled={isOpening}
                        onClick={() => onOpenDetail(item)}
                        className="font-mono text-sm font-bold tracking-tight text-ink transition-colors group-hover:text-brand-700 disabled:opacity-60 cursor-pointer"
                      >
                        {item.ticker}
                      </button>
                      {tabKind !== 'my_stocks' && item.ownedLots > 0 && (
                        <span className="rounded border border-brand-600/30 bg-brand-50 px-1.5 py-0.5 text-[10px] font-semibold text-brand-700">
                          {t.watchlist.ownedBadge}
                        </span>
                      )}
                      {item.isStale && (
                        <span
                          title={t.watchlist.staleBadge}
                          className="inline-flex items-center text-warning-700"
                        >
                          <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                        </span>
                      )}
                    </div>
                    <div className="mt-0.5 truncate text-xs text-muted" title={item.companyName}>
                      {item.companyName}
                    </div>
                  </td>

                  {/* IDX Sector Column (Clickable Quick Filter) */}
                  <td className="px-3 py-3.5 align-middle">
                    <button
                      type="button"
                      onClick={() => onToggleSector(isSectorActive ? '' : item.sector)}
                      title={
                        isSectorActive
                          ? t.watchlist.clearSectorFilter
                          : t.watchlist.filterSectorHint
                      }
                      className={cn(
                        'inline-flex max-w-full items-center rounded-md border px-2 py-0.5 text-[11px] font-medium transition-colors cursor-pointer',
                        isSectorActive
                          ? 'border-brand-600/45 bg-brand-50 text-brand-700'
                          : 'border-border bg-subtle/75 text-ink/85 hover:border-brand-600/40 hover:bg-brand-50/60 hover:text-brand-700',
                      )}
                    >
                      <span className="truncate">{t.sectors[item.sector]}</span>
                    </button>
                  </td>

                  {/* Current Price */}
                  <td
                    className={`px-3 py-3.5 text-right align-middle font-mono text-sm font-bold tabular-nums whitespace-nowrap ${priceColor}`}
                  >
                    {formatIdr(item.currentPrice)}
                  </td>

                  {/* Moderate Fair Value */}
                  <td className="px-3 py-3.5 text-right align-middle font-mono text-sm font-semibold text-ink tabular-nums whitespace-nowrap">
                    {formatIdr(item.valuation.fairValue.moderate)}
                  </td>

                  {/* Margin of Safety + Valuation Badge */}
                  <td className="px-3 py-3.5 text-right align-middle">
                    <div className="flex flex-col items-end gap-1">
                      {mosVal !== null ? (
                        <div className="inline-flex items-center gap-0.5 font-mono text-sm font-bold tabular-nums">
                          {mosVal >= 0 ? (
                            <ArrowUpRight
                              className="h-3.5 w-3.5 text-positive-700"
                              aria-hidden="true"
                            />
                          ) : (
                            <ArrowDownRight
                              className="h-3.5 w-3.5 text-negative-600"
                              aria-hidden="true"
                            />
                          )}
                          <span
                            className={
                              mosVal >= 30
                                ? 'text-positive-700'
                                : mosVal >= 0
                                  ? 'text-warning-700'
                                  : 'text-negative-600'
                            }
                          >
                            {formatPercent(mosVal, true)}
                          </span>
                        </div>
                      ) : (
                        <span className="font-mono text-xs text-muted">-</span>
                      )}
                      <Badge tone={statusTone(item.valuation.valuationStatus)}>
                        {t.valuationStatus[item.valuation.valuationStatus]}
                      </Badge>
                      {item.valuation.valueTrapShield.riskLevel !== 'CLEAR' && (
                        <span
                          title={item.valuation.valueTrapShield.warnings
                            .map((w) => t.valueTrapShield.warnings[w])
                            .join(' | ')}
                          className={cn(
                            'inline-flex items-center gap-1 rounded-sm px-1.5 py-0.5 text-[10px] font-semibold',
                            item.valuation.valueTrapShield.riskLevel === 'HIGH_RISK'
                              ? 'bg-negative-50 text-negative-700'
                              : 'bg-warning-50 text-warning-700',
                          )}
                        >
                          <ShieldAlert className="h-3 w-3 shrink-0" aria-hidden="true" />
                          {t.valueTrapShield.shortBadges[item.valuation.valueTrapShield.riskLevel]}
                        </span>
                      )}
                    </div>
                  </td>

                  {/* Fundamental Quality Score (FQS) */}
                  <td className="px-2 py-3.5 text-center align-middle">
                    <QualityScoreBadge
                      quality={item.quality}
                      compact
                      onClick={() => onOpenDetail(item)}
                    />
                  </td>

                  {/* Owned Position OR Target Buy + Quick Add Lots */}
                  <td className="px-3 py-3.5 text-right align-middle">
                    {pos.ownedLots > 0 ? (
                      <div className="flex flex-col items-end gap-1">
                        <div className="flex items-baseline gap-1.5 font-mono text-xs tabular-nums">
                          <span className="font-bold text-ink">
                            {hideBalances ? MASKED_LOTS : formatNumber(pos.ownedLots)}{' '}
                            {t.common.lots}
                          </span>
                          {pos.avgBuyPrice && (
                            <span className="text-[11px] text-muted">
                              @
                              {formatNumber(
                                pos.avgBuyPrice,
                                Number.isInteger(pos.avgBuyPrice) ? 0 : 2,
                              )}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono text-[11px] text-muted tabular-nums">
                            {hideBalances ? MASKED_IDR : formatIdr(pos.costBasis)}
                          </span>
                          {pos.unrealizedPnLPct !== null && (
                            <span
                              className={cn(
                                'rounded-sm px-1.5 py-0.5 font-mono text-[10px] font-bold tabular-nums',
                                pos.unrealizedPnLPct >= 0
                                  ? 'bg-positive-50 text-positive-700'
                                  : 'bg-negative-50 text-negative-700',
                              )}
                            >
                              {formatPercent(pos.unrealizedPnLPct, true)}
                            </span>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-col items-end gap-1">
                        {item.targetBuyPrice !== null && (
                          <span className="font-mono text-xs font-semibold text-brand-700 tabular-nums">
                            {formatIdr(item.targetBuyPrice)}
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={() => onEdit(item)}
                          className="inline-flex items-center gap-1 rounded-md border border-dashed border-editable-border px-2 py-1 text-[11px] font-medium text-muted transition-colors hover:border-brand-600 hover:bg-brand-50/60 hover:text-brand-700 cursor-pointer"
                        >
                          <Plus className="h-3 w-3" aria-hidden="true" />
                          {t.common.lots}
                        </button>
                      </div>
                    )}
                  </td>

                  {/* Contextual Actions */}
                  <td className="py-3.5 pr-5 pl-2 align-middle">
                    <div className="flex items-center justify-end gap-1">
                      {tabKind !== 'custom' && (
                        <AddToWatchlistMenu
                          ticker={item.ticker}
                          memberGroupIds={item.customWatchlistIds}
                          groups={customGroups}
                          onCreateWithTicker={onCreateWatchlistWithTicker}
                        />
                      )}
                      <button
                        type="button"
                        disabled={isOpening}
                        onClick={() => onOpenSimulator(item)}
                        title={t.watchlist.simulate}
                        aria-label={`${t.watchlist.simulate} ${item.ticker}`}
                        className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-brand-600/35 bg-brand-50/70 text-brand-700 transition-colors hover:border-brand-solid hover:bg-brand-solid hover:text-white disabled:opacity-50 cursor-pointer"
                      >
                        <Calculator className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        disabled={isOpening}
                        onClick={() => onOpenDetail(item)}
                        title={t.watchlist.analyze}
                        aria-label={`${t.watchlist.analyze} ${item.ticker}`}
                        className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted transition-colors hover:bg-subtle hover:text-ink disabled:opacity-50 cursor-pointer"
                      >
                        <BarChart3 className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        onClick={() => onEdit(item)}
                        title={t.common.edit}
                        aria-label={`${t.common.edit} ${item.ticker}`}
                        className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted transition-colors hover:bg-subtle hover:text-ink cursor-pointer"
                      >
                        <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>
                      {tabKind === 'my_stocks' && onDeletePersonal && item.watchlistItemId && (
                        <button
                          type="button"
                          onClick={() => onDeletePersonal(item)}
                          title={t.common.delete}
                          aria-label={`${t.common.delete} ${item.ticker}`}
                          className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted transition-colors hover:bg-negative-50 hover:text-negative-600 cursor-pointer"
                        >
                          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                        </button>
                      )}
                      {tabKind === 'custom' && onRemoveFromCustom && (
                        <button
                          type="button"
                          onClick={() => onRemoveFromCustom(item.ticker)}
                          title={t.watchlist.removeFromWatchlist}
                          aria-label={`${t.watchlist.removeFromWatchlist} ${item.ticker}`}
                          className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted transition-colors hover:bg-negative-50 hover:text-negative-600 cursor-pointer"
                        >
                          <X className="h-3.5 w-3.5" aria-hidden="true" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
