import { RotateCcw, Search, SlidersHorizontal, X } from 'lucide-react';
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
  minFqsInput: string;
  onMinFqsChange: (val: string) => void;
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

const QUALITY_GRADE_PILLS: Array<{ value: QualityGradeFilter | ''; short: string }> = [
  { value: '', short: '' },
  { value: 'A', short: 'A (80+)' },
  { value: 'B', short: 'B (65–79)' },
  { value: 'C', short: 'C (50–64)' },
  { value: 'D', short: 'D (<50)' },
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
  minFqsInput,
  onMinFqsChange,
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
  const [numericOpen, setNumericOpen] = useState(false);

  const activeNumericCount = [
    minMosInput.trim(),
    maxMosInput.trim(),
    minFqsInput.trim(),
  ].filter(Boolean).length;

  const isNumericExpanded = numericOpen || activeNumericCount > 0;

  return (
    <div className="space-y-3.5 rounded-xl border border-border bg-panel p-4 surface-elevated">
      {/* Row 1: Primary Controls — Structured 12-Col Grid (No Wrapping Collisions) */}
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

      {/* Row 2: Two Cleanly Separated Pill Groups (Valuation | Quality Score FQS) */}
      <div className="grid grid-cols-1 gap-3 border-t border-border/75 pt-3 lg:grid-cols-2 lg:gap-4">
        {/* Group A: Valuation Status */}
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

        {/* Group B: Fundamental Quality Score (FQS Grade) */}
        <div className="space-y-1.5">
          <span className="block text-[11px] font-semibold tracking-wide text-muted uppercase">
            {t.watchlist.qualityFilterLabel}
          </span>
          <div className="flex flex-wrap items-center gap-1.5">
            {QUALITY_GRADE_PILLS.map((opt) => {
              const active = qualityGrade === opt.value;
              const label = opt.value === '' ? t.watchlist.qualityAll : opt.short;
              return (
                <button
                  key={opt.value || 'all'}
                  type="button"
                  aria-pressed={active}
                  onClick={() => onQualityGradeChange(opt.value)}
                  className={cn(
                    'inline-flex h-8 sm:h-7 items-center rounded-md border px-2.5 text-xs font-semibold transition-colors cursor-pointer',
                    active && opt.value === 'A'
                      ? 'border-positive-600/50 bg-positive-50 text-positive-700'
                      : active && opt.value === 'B'
                        ? 'border-brand-600/50 bg-brand-50 text-brand-700'
                        : active && opt.value === 'C'
                          ? 'border-warning-600/50 bg-warning-50 text-warning-700'
                          : active && opt.value === 'D'
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

      {/* Row 3: Action Strip (Collapsible Numeric Range + Active Sector Chip + Reset) */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/75 pt-3">
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant={isNumericExpanded ? 'outlineBrand' : 'secondary'}
            size="sm"
            onClick={() => setNumericOpen((v) => !v)}
            aria-expanded={isNumericExpanded}
            className="h-8 text-xs"
          >
            <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden="true" />
            {t.watchlist.moreNumericFilters}
            {activeNumericCount > 0 && (
              <span className="ml-0.5 rounded-full bg-brand-solid px-1.5 py-0 text-[10px] font-bold text-white">
                {activeNumericCount}
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

      {/* Collapsible Numeric Range Panel (Margin of Safety Presets + Min/Max MoS + Min FQS) */}
      {isNumericExpanded && (
        <div className="grid grid-cols-1 gap-4 rounded-lg border border-border bg-subtle/40 p-3.5 lg:grid-cols-12">
          <div className="space-y-2 lg:col-span-8">
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

          <div className="space-y-2 border-t border-border/70 pt-3 lg:col-span-4 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-4">
            <label htmlFor="wl-min-fqs" className="block text-[11px] font-semibold text-muted">
              {t.watchlist.qualityFilterLabel} (Min 0–100)
            </label>
            <div className="flex items-center gap-1.5">
              <Input
                id="wl-min-fqs"
                type="number"
                min={0}
                max={100}
                step="5"
                placeholder={t.watchlist.minFqsPlaceholder}
                value={minFqsInput}
                onChange={(e) => onMinFqsChange(e.target.value)}
                className="h-8 sm:h-7 w-24 px-2 font-mono text-xs tabular-nums"
              />
              {(['65', '75', '80'] as const).map((presetScore) => (
                <button
                  key={presetScore}
                  type="button"
                  aria-pressed={minFqsInput === presetScore}
                  onClick={() => onMinFqsChange(minFqsInput === presetScore ? '' : presetScore)}
                  className={cn(
                    'inline-flex h-8 sm:h-7 items-center rounded-md border px-2 font-mono text-[11px] font-semibold transition-colors cursor-pointer',
                    minFqsInput === presetScore
                      ? 'border-brand-600/50 bg-brand-50 text-brand-700'
                      : 'border-border bg-panel text-muted hover:text-ink',
                  )}
                >
                  ≥{presetScore}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
