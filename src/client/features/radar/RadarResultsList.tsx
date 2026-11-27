import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  Calculator,
  ShieldAlert,
} from 'lucide-react';
import type { CustomWatchlistGroupDto, MarketStockDto } from '@/shared/contracts';
import type { IdxSector } from '@/shared/domain';
import { Badge, cn, TermTooltip } from '@/client/components/ui/primitives';
import { useI18n } from '@/client/i18n/useI18n';
import {
  formatCompactIdr,
  formatIdr,
  formatMultiple,
  formatPercent,
} from '@/client/lib/formatters';
import { statusTone } from '@/client/lib/valuationTone';
import { AddToWatchlistMenu } from '@/client/features/watchlist/AddToWatchlistMenu';
import { PillarMiniGrid, QualityScoreBadge } from './QualityScoreBadge';

interface RadarResultsListProps {
  items: MarketStockDto[];
  isFetching: boolean;
  activeSector: IdxSector | '';
  openingTicker: string | null;
  customGroups: CustomWatchlistGroupDto[];
  onToggleSector: (sector: IdxSector) => void;
  onOpenXray: (stock: MarketStockDto) => void;
  onOpenDetail: (stock: MarketStockDto) => void;
  onOpenSimulator: (stock: MarketStockDto) => void;
  onCreateWatchlistWithTicker: (ticker: string) => void;
}

export function RadarResultsList({
  items,
  isFetching,
  activeSector,
  openingTicker,
  customGroups,
  onToggleSector,
  onOpenXray,
  onOpenDetail,
  onOpenSimulator,
  onCreateWatchlistWithTicker,
}: RadarResultsListProps) {
  const { t, lang } = useI18n();

  return (
    <div className={cn(isFetching && 'opacity-75 transition-opacity')}>
      {/* Mobile Compact Radar Cards (zero horizontal scroll, >= 36px tap targets) */}
      <div className="divide-y divide-border/80 md:hidden">
        {items.map((item) => {
          const mosVal = item.valuation.mosPct;
          const isOpening = openingTicker === item.ticker;

          return (
            <article key={item.ticker} className="space-y-3 p-4 transition-colors hover:bg-brand-50/30">
              {/* Row 1: Ticker + Sector + MCap/ADTV | Price + Fair Value */}
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
                    <button
                      type="button"
                      onClick={() => onToggleSector(item.sector)}
                      className={cn(
                        'max-w-[140px] truncate rounded border px-1.5 py-0.5 text-[10px] font-medium cursor-pointer',
                        activeSector === item.sector
                          ? 'border-brand-600/45 bg-brand-50 text-brand-700'
                          : 'border-border bg-subtle/75 text-muted hover:text-ink',
                      )}
                    >
                      {t.sectors[item.sector]}
                    </button>
                  </div>
                  <div className="mt-0.5 truncate text-xs text-muted">{item.companyName}</div>
                  <div className="mt-1 flex flex-wrap items-center gap-2 font-mono text-[10px] text-muted tabular-nums">
                    <span>MCap {formatCompactIdr(item.fundamentals.marketCapIdr, lang)}</span>
                    <span>·</span>
                    <span>ADTV {formatCompactIdr(item.fundamentals.adtvIdr, lang)}</span>
                  </div>
                </div>

                <div className="shrink-0 text-right font-mono tabular-nums">
                  <div className="text-base font-bold text-ink">{formatIdr(item.currentPrice)}</div>
                  <div className="mt-0.5 text-[11px] text-muted">
                    FV {formatIdr(item.valuation.fairValue.moderate)}
                  </div>
                </div>
              </div>

              {/* Row 2: Valuation + Trap Badges | FQS Badge */}
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

                <div className="flex items-center gap-1.5">
                  <QualityScoreBadge quality={item.quality} onClick={() => onOpenXray(item)} />
                  {item.quality.appliedCaps.length > 0 && (
                    <span className="text-[10px] font-semibold text-warning-700">
                      {t.common.cappedBadge}
                    </span>
                  )}
                </div>
              </div>

              {/* Row 3: 4-Pillar Mini Bars */}
              <PillarMiniGrid quality={item.quality} />

              {/* Row 4: Action Bar */}
              <div className="flex items-center justify-between gap-2 pt-0.5">
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => onOpenXray(item)}
                    className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-panel px-2.5 text-xs font-semibold text-ink transition-colors hover:border-brand-600/45 hover:bg-brand-50 hover:text-brand-700 cursor-pointer"
                  >
                    <Activity className="h-3.5 w-3.5 text-brand-700" aria-hidden="true" />
                    <span>{t.radar.xrayBtn}</span>
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
                  <AddToWatchlistMenu
                    ticker={item.ticker}
                    memberGroupIds={item.customWatchlistIds}
                    groups={customGroups}
                    onCreateWithTicker={onCreateWatchlistWithTicker}
                  />
                  <button
                    type="button"
                    disabled={isOpening}
                    onClick={() => onOpenDetail(item)}
                    title={t.radar.openDetail}
                    aria-label={`${t.radar.openDetail} ${item.ticker}`}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-md text-muted transition-colors hover:bg-subtle hover:text-ink disabled:opacity-50 cursor-pointer"
                  >
                    <BarChart3 className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>
              </div>
            </article>
          );
        })}
      </div>

      {/* Desktop High-Density Table */}
      <div className="hidden w-full overflow-x-auto md:block">
        <table className="w-full min-w-[960px] table-fixed border-collapse text-left text-sm">
          <colgroup>
            <col className="w-[21%]" />
            <col className="w-[12%]" />
            <col className="w-[14%]" />
            <col className="w-[10%]" />
            <col className="w-[18%]" />
            <col className="w-[15%]" />
            <col className="w-[10%]" />
          </colgroup>
          <thead>
            <tr className="border-b border-border bg-subtle/70 text-xs font-semibold text-muted">
              <th className="py-3 pr-3 pl-5">{t.radar.colStock}</th>
              <th className="px-3 py-3 text-right">{t.radar.colPriceFv}</th>
              <th className="px-3 py-3 text-right">
                <TermTooltip
                  label={t.radar.colValuation}
                  definition={t.glossary.marginOfSafety}
                />
              </th>
              <th className="px-3 py-3 text-center">
                <TermTooltip label={t.radar.colFqs} definition={t.glossary.fqs} />
              </th>
              <th className="px-3 py-3">{t.radar.colPillars}</th>
              <th className="px-3 py-3">{t.radar.colHighlights}</th>
              <th className="py-3 pr-5 pl-2 text-right">{t.radar.colActions}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/80">
            {items.map((item) => {
              const mosVal = item.valuation.mosPct;
              const isOpening = openingTicker === item.ticker;
              const isFin = item.sector === 'FINANCIALS';

              return (
                <tr
                  key={item.ticker}
                  className="group transition-colors duration-150 hover:bg-brand-50/40"
                >
                  {/* Stock + Sector + Liquidity */}
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
                      <button
                        type="button"
                        onClick={() => onToggleSector(item.sector)}
                        className={cn(
                          'max-w-[120px] truncate rounded border px-1.5 py-0.5 text-[10px] font-medium cursor-pointer',
                          activeSector === item.sector
                            ? 'border-brand-600/45 bg-brand-50 text-brand-700'
                            : 'border-border bg-subtle/75 text-muted hover:border-brand-600/40 hover:text-brand-700',
                        )}
                        title={t.sectors[item.sector]}
                      >
                        {t.sectors[item.sector]}
                      </button>
                    </div>
                    <div className="mt-0.5 truncate text-xs text-muted" title={item.companyName}>
                      {item.companyName}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-2 font-mono text-[10px] text-muted tabular-nums">
                      <span>MCap {formatCompactIdr(item.fundamentals.marketCapIdr, lang)}</span>
                      <span>·</span>
                      <span>ADTV {formatCompactIdr(item.fundamentals.adtvIdr, lang)}</span>
                    </div>
                  </td>

                  {/* Price / Fair Value */}
                  <td className="px-3 py-3.5 text-right align-middle font-mono tabular-nums whitespace-nowrap">
                    <div className="text-sm font-bold text-ink">{formatIdr(item.currentPrice)}</div>
                    <div className="mt-0.5 text-[11px] text-muted">
                      FV {formatIdr(item.valuation.fairValue.moderate)}
                    </div>
                  </td>

                  {/* Margin of Safety & Value Trap */}
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

                  {/* FQS Score Badge (clickable X-Ray) */}
                  <td className="px-3 py-3.5 text-center align-middle">
                    <div className="flex flex-col items-center gap-1">
                      <QualityScoreBadge
                        quality={item.quality}
                        onClick={() => onOpenXray(item)}
                      />
                      {item.quality.appliedCaps.length > 0 && (
                        <span className="text-[10px] font-semibold text-warning-700">
                          {t.common.cappedBadge}
                        </span>
                      )}
                    </div>
                  </td>

                  {/* 4-Pillar Mini Bars */}
                  <td className="px-3 py-3.5 align-middle">
                    <PillarMiniGrid quality={item.quality} />
                  </td>

                  {/* Key Raw Metrics */}
                  <td className="px-3 py-3.5 align-middle">
                    <div className="grid grid-cols-2 gap-x-2 gap-y-1 font-mono text-[11px] tabular-nums">
                      <div className="truncate">
                        <span className="text-muted">ROE </span>
                        <span className="font-semibold text-ink">
                          {formatPercent(item.fundamentals.roePct)}
                        </span>
                      </div>
                      <div className="truncate">
                        <span className="text-muted">Rev </span>
                        <span
                          className={cn(
                            'font-semibold',
                            (item.fundamentals.revenueGrowthPct ?? 0) >= 0
                              ? 'text-positive-700'
                              : 'text-negative-600',
                          )}
                        >
                          {formatPercent(item.fundamentals.revenueGrowthPct, true)}
                        </span>
                      </div>
                      <div className="truncate">
                        {isFin ? (
                          <>
                            <span className="text-muted">Eq/A </span>
                            <span className="font-semibold text-ink">
                              {formatPercent(item.fundamentals.equityToAssetsPct)}
                            </span>
                          </>
                        ) : (
                          <>
                            <span className="text-muted">DER </span>
                            <span className="font-semibold text-ink">
                              {formatMultiple(item.fundamentals.der)}
                            </span>
                          </>
                        )}
                      </div>
                      <div className="truncate">
                        {isFin ? (
                          <>
                            <span className="text-muted">ROA </span>
                            <span className="font-semibold text-ink">
                              {formatPercent(item.fundamentals.roaPct)}
                            </span>
                          </>
                        ) : (
                          <>
                            <span className="text-muted">FCF </span>
                            <span className="font-semibold text-ink">
                              {formatPercent(item.fundamentals.fcfYieldPct)}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </td>

                  {/* Row Actions */}
                  <td className="py-3.5 pr-5 pl-2 align-middle">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        type="button"
                        onClick={() => onOpenXray(item)}
                        title={t.radar.xrayBtn}
                        aria-label={`${t.radar.xrayBtn} ${item.ticker}`}
                        className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-border bg-panel text-muted transition-colors hover:border-brand-600/45 hover:bg-brand-50 hover:text-brand-700 cursor-pointer"
                      >
                        <Activity className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>
                      <AddToWatchlistMenu
                        ticker={item.ticker}
                        memberGroupIds={item.customWatchlistIds}
                        groups={customGroups}
                        onCreateWithTicker={onCreateWatchlistWithTicker}
                      />
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
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
