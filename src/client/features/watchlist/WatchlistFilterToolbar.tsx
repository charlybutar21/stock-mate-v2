import { Droplets, RotateCcw, Search, ShieldCheck, SlidersHorizontal, X } from 'lucide-react';
import { useState } from 'react';
import type {
  CatalogSortOption,
  CatalogSummaryDto,
  QualityGradeFilter,
  ValuationStatusFilter,
} from '@/shared/contracts';
import { IDX_SECTORS, type IdxSector } from '@/shared/domain';
import { Button, cn, Input, Select } from '@/client/components/ui/primitives';
import { useI18n } from '@/client/i18n/useI18n';

export type MosPreset = 'any' | 'gte50' | 'gte30' | 'gte15' | 'fair0to30' | 'lt0' | 'custom';

interface WatchlistFilterToolbarProps {
  search: string;
  onSearchChange: (val: string) => void;
  sector: IdxSector | '';
  onSectorChange: (val: IdxSector | '') => void;
  sort: CatalogSortOption;
  onSortChange: (val: CatalogSortOption) => void;
  valuationStatus: ValuationStatusFilter | '';
  onValuationStatusChange: (val: ValuationStatusFilter | '') => void;
  qualityGrade: QualityGradeFilter | '';
  onQualityGradeChange: (val: QualityGradeFilter | '') => void;
  onlyLiquid: boolean;
  onToggleOnlyLiquid: () => void;
  excludeHighRiskTrap: boolean;
  onToggleExcludeTrap: () => void;
  mosPreset: MosPreset;
  onApplyMosPreset: (preset: MosPreset) => void;
  minMosInput: string;
  maxMosInput: string;
  onMinMosChange: (val: string) => void;
  onMaxMosChange: (val: string) => void;
  showCounts: boolean;
  summary: CatalogSummaryDto | undefined;
  hasActiveFilters: boolean;
  onResetFilters: () => void;
}

const GRADE_PILLS: Array<{ value: QualityGradeFilter | ''; label: string; hint: string }> = [
  { value: '', label: '', hint: '' },
  { value: 'S', label: 'S', hint: '≥ 88' },
  { value: 'A', label: 'A', hint: '76–87' },
  { value: 'B', label: 'B', hint: '64–75' },
  { value: 'C', label: 'C', hint: '50–63' },
  { value: 'D', label: 'D', hint: '35–49' },
  { value: 'E', label: 'E', hint: '< 35' },
];

export function WatchlistFilterToolbar({
  search,
  onSearchChange,
  sector,
  onSectorChange,
  sort,
  onSortChange,
  valuationStatus,
  onValuationStatusChange,
  qualityGrade,
  onQualityGradeChange,
  onlyLiquid,
  onToggleOnlyLiquid,
  excludeHighRiskTrap,
  onToggleExcludeTrap,
  mosPreset,
  onApplyMosPreset,
  minMosInput,
  maxMosInput,
  onMinMosChange,
  onMaxMosChange,
  showCounts,
  summary,
  hasActiveFilters,
  onResetFilters,
}: WatchlistFilterToolbarProps) {
  const { t } = useI18n();
  const [discountOpen, setDiscountOpen] = useState(false);

  const activeMosCount = [minMosInput.trim(), maxMosInput.trim()].filter(Boolean).length;
  const isDiscountExpanded = discountOpen || activeMosCount > 0;

  return (
    <div className="space-y-3.5 rounded-xl border border-border bg-panel p-4 surface-elevated">
      {/* Row 1: Primary Search / Sector / Sort (12-Col Grid, Zero Collisions) */}
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-12">
        <div className="relative flex items-center sm:col-span-2 lg:col-span-5">
          <Search
            className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted"
            aria-hidden="true"
          />
          <Input
            placeholder={t.watchlist.searchPlaceholder}
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            aria-label={t.watchlist.searchPlaceholder}
            className="h-10 sm:h-9 pl-9 pr-8 text-xs"
          />
          {search && (
            <button
              type="button"
              onClick={() => onSearchChange('')}
              aria-label="Clear search"
              className="absolute top-1/2 right-2 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded text-muted hover:text-ink cursor-pointer"
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          )}
        </div>

        <div className="lg:col-span-3">
          <Select
            value={sector}
            onChange={(e) => onSectorChange(e.target.value as IdxSector | '')}
            className={cn(
              'h-10 sm:h-9 text-xs',
              sector && 'border-brand-600/55 font-medium text-brand-700',
            )}
            aria-label={t.watchlist.allSectors}
          >
            <option value="">{t.watchlist.allSectors}</option>
            {IDX_SECTORS.map((s) => (
              <option key={s} value={s}>
                {t.sectors[s]}
              </option>
            ))}
          </Select>
        </div>

        <div className="lg:col-span-4">
          <Select
            value={sort}
            onChange={(e) => onSortChange(e.target.value as CatalogSortOption)}
            className="h-10 sm:h-9 text-xs"
            aria-label="Sort stocks"
          >
            <option value="mos_desc">{t.watchlist.sortMosDesc}</option>
            <option value="fqs_desc">{t.radar.sortFqsDesc}</option>
            <option value="qarp_desc">{t.radar.sortQarpDesc}</option>
            <option value="mos_asc">{t.watchlist.sortMosAsc}</option>
            <option value="ticker_asc">{t.watchlist.sortTickerAsc}</option>
            <option value="ticker_desc">{t.watchlist.sortTickerDesc}</option>
            <option value="price_asc">{t.watchlist.sortPriceAsc}</option>
            <option value="price_desc">{t.watchlist.sortPriceDesc}</option>
            <option value="fair_value_desc">{t.watchlist.sortFairValueDesc}</option>
          </Select>
        </div>
      </div>

      {/* Row 2: One Single Control per Dimension (Valuation | Quality Grade S-E) */}
      <div className="grid grid-cols-1 gap-3 border-t border-border/75 pt-3 lg:grid-cols-2 lg:gap-4">
        {/* Valuation Status */}
        <div className="space-y-1.5">
          <span className="block text-[11px] font-semibold tracking-wide text-muted uppercase">
            {t.watchlist.valuationFilterLabel}
          </span>
          <div className="flex flex-wrap items-center gap-1.5">
            {(
              [
                { value: '', label: t.watchlist.valuationAll, count: summary?.totalStocks },
                {
                  value: 'UNDERVALUED',
                  label: t.valuationStatus.UNDERVALUED,
                  count: summary?.undervalued,
                },
                {
                  value: 'FAIRLY_VALUED',
                  label: t.valuationStatus.FAIRLY_VALUED,
                  count: summary?.fairlyValued,
                },
                {
                  value: 'OVERVALUED',
                  label: t.valuationStatus.OVERVALUED,
                  count: summary?.overvalued,
                },
              ] as const
            ).map((opt) => {
              const active = valuationStatus === opt.value;
              return (
                <button
                  key={opt.value || 'all'}
                  type="button"
                  aria-pressed={active}
                  onClick={() => onValuationStatusChange(opt.value)}
                  className={cn(
                    'inline-flex h-8 sm:h-7 items-center gap-1.5 rounded-md border px-2.5 text-xs font-semibold transition-colors cursor-pointer',
                    active && opt.value === 'UNDERVALUED'
                      ? 'border-positive-600/50 bg-positive-50 text-positive-700'
                      : active && opt.value === 'FAIRLY_VALUED'
                        ? 'border-warning-600/50 bg-warning-50 text-warning-700'
                        : active && opt.value === 'OVERVALUED'
                          ? 'border-negative-600/50 bg-negative-50 text-negative-700'
                          : active
                            ? 'border-brand-600/50 bg-brand-50 text-brand-700'
                            : 'border-border bg-display text-muted hover:border-muted/60 hover:text-ink',
                  )}
                >
                  <span>{opt.label}</span>
                  {showCounts && opt.count !== undefined && (
                    <span className="font-mono text-[10px] opacity-80 tabular-nums">
                      {opt.count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Quality Grade S / A / B / C / D / E (Single Authoritative Control) */}
        <div className="space-y-1.5">
          <span className="block text-[11px] font-semibold tracking-wide text-muted uppercase">
            {t.watchlist.qualityFilterLabel}
          </span>
          <div className="flex flex-wrap items-center gap-1.5">
            {GRADE_PILLS.map((opt) => {
              const active = qualityGrade === opt.value;
              const label = opt.value === '' ? t.watchlist.qualityAll : opt.label;
              const title = opt.value
                ? `Grade ${opt.value} (${opt.hint}) · ${t.radar.gradeLabels[opt.value]}`
                : t.watchlist.qualityAll;
              return (
                <button
                  key={opt.value || 'all'}
                  type="button"
                  title={title}
                  aria-pressed={active}
                  onClick={() => onQualityGradeChange(opt.value)}
                  className={cn(
                    'inline-flex h-8 sm:h-7 min-w-[34px] items-center justify-center rounded-md border px-2.5 font-mono text-xs font-bold transition-colors cursor-pointer',
                    opt.value === '' && 'font-sans font-semibold',
                    active && (opt.value === 'S' || opt.value === 'A')
                      ? 'border-positive-600/55 bg-positive-50 text-positive-700'
                      : active && opt.value === 'B'
                        ? 'border-brand-600/50 bg-brand-50 text-brand-700'
                        : active && opt.value === 'C'
                          ? 'border-warning-600/50 bg-warning-50 text-warning-700'
                          : active && (opt.value === 'D' || opt.value === 'E')
                            ? 'border-negative-600/50 bg-negative-50 text-negative-700'
                            : active
                              ? 'border-brand-600/50 bg-brand-50 text-brand-700'
                              : 'border-border bg-display text-muted hover:border-muted/60 hover:text-ink',
                  )}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Row 3: 1-Click Guardrail Toggles + Optional Discount Range + Reset */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/75 pt-3">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            aria-pressed={onlyLiquid}
            onClick={onToggleOnlyLiquid}
            className={cn(
              'inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-semibold transition-colors cursor-pointer',
              onlyLiquid
                ? 'border-brand-600/50 bg-brand-50 text-brand-700'
                : 'border-border bg-display text-muted hover:text-ink',
            )}
          >
            <Droplets className="h-3.5 w-3.5" aria-hidden="true" />
            {t.watchlist.liquidToggle}
          </button>

          <button
            type="button"
            aria-pressed={excludeHighRiskTrap}
            onClick={onToggleExcludeTrap}
            className={cn(
              'inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-semibold transition-colors cursor-pointer',
              excludeHighRiskTrap
                ? 'border-positive-600/50 bg-positive-50 text-positive-700'
                : 'border-border bg-display text-muted hover:text-ink',
            )}
          >
            <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
            {t.watchlist.safeTrapToggle}
          </button>

          <Button
            variant={isDiscountExpanded ? 'outlineBrand' : 'secondary'}
            size="sm"
            onClick={() => setDiscountOpen((v) => !v)}
            aria-expanded={isDiscountExpanded}
            className="h-8 text-xs"
          >
            <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden="true" />
            {t.watchlist.moreNumericFilters}
            {activeMosCount > 0 && (
              <span className="ml-0.5 rounded-full bg-brand-solid px-1.5 py-0 text-[10px] font-bold text-white">
                {activeMosCount}
              </span>
            )}
          </Button>

          {sector && (
            <button
              type="button"
              onClick={() => onSectorChange('')}
              title={t.watchlist.clearSectorFilter}
              className="inline-flex h-8 items-center gap-1 rounded-md border border-brand-600/40 bg-brand-50 px-2.5 text-xs font-semibold text-brand-700 transition-colors hover:bg-brand-100 cursor-pointer"
            >
              <span>
                {t.watchlist.colSector}: {t.sectors[sector]}
              </span>
              <X className="h-3 w-3" aria-hidden="true" />
            </button>
          )}
        </div>

        {hasActiveFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onResetFilters}
            className="h-8 shrink-0 px-2.5 text-xs"
          >
            <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
            {t.watchlist.resetFilters}
          </Button>
        )}
      </div>

      {/* Collapsible Discount Range (MoS % only — zero FQS duplication) */}
      {isDiscountExpanded && (
        <div className="space-y-2 rounded-lg border border-border bg-subtle/40 p-3.5">
          <span className="block text-[11px] font-semibold text-muted">
            {t.watchlist.mosFilterLabel} (%)
          </span>
          <div className="flex flex-wrap items-center gap-1.5">
            {(
              [
                ['any', t.watchlist.mosPresetAny],
                ['gte50', t.watchlist.mosPreset50],
                ['gte30', t.watchlist.mosPreset30],
                ['gte15', t.watchlist.mosPreset15],
                ['fair0to30', t.watchlist.mosPresetFair],
                ['lt0', t.watchlist.mosPresetOver],
              ] as const
            ).map(([presetKey, label]) => {
              const active = mosPreset === presetKey;
              return (
                <button
                  key={presetKey}
                  type="button"
                  aria-pressed={active}
                  onClick={() => onApplyMosPreset(presetKey)}
                  className={cn(
                    'inline-flex h-8 sm:h-7 items-center rounded-md border px-2.5 text-[11px] font-semibold transition-colors cursor-pointer',
                    active
                      ? 'border-brand-600/50 bg-brand-50 text-brand-700'
                      : 'border-border bg-panel text-muted hover:border-muted/60 hover:text-ink',
                  )}
                >
                  {label}
                </button>
              );
            })}

            <div className="flex items-center gap-1.5 pt-1 sm:pt-0">
              <Input
                type="number"
                step="1"
                aria-label="Minimum Margin of Safety percent"
                placeholder={t.watchlist.mosMinPlaceholder}
                value={minMosInput}
                onChange={(e) => onMinMosChange(e.target.value)}
                className="h-8 sm:h-7 w-20 px-2 font-mono text-xs tabular-nums"
              />
              <span className="text-xs text-muted">–</span>
              <Input
                type="number"
                step="1"
                aria-label="Maximum Margin of Safety percent"
                placeholder={t.watchlist.mosMaxPlaceholder}
                value={maxMosInput}
                onChange={(e) => onMaxMosChange(e.target.value)}
                className="h-8 sm:h-7 w-20 px-2 font-mono text-xs tabular-nums"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
