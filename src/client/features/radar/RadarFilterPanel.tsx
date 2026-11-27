import { Filter, RotateCcw, Search, SlidersHorizontal, X } from 'lucide-react';
import type {
  CatalogPaginationDto,
  CatalogSortOption,
  QarpQuadrantFilter,
  QualityGradeFilter,
  ValuationStatusFilter,
} from '@/shared/contracts';
import { IDX_SECTORS, type IdxSector } from '@/shared/domain';
import {
  Badge,
  Button,
  Card,
  cn,
  Input,
  Select,
  TermTooltip,
} from '@/client/components/ui/primitives';
import { useI18n } from '@/client/i18n/useI18n';

export type RadarPresetId = 'all' | 'prime' | 'compounders' | 'fortress' | 'garp' | 'custom';

export interface RadarFilterState {
  search: string;
  sector: IdxSector | '';
  valuationStatus: ValuationStatusFilter | '';
  qualityGrade: QualityGradeFilter | '';
  qarpQuadrant: QarpQuadrantFilter | '';
  minMos: string;
  minFqs: string;
  minProfitability: string;
  minGrowth: string;
  minHealth: string;
  minCashFlow: string;
  minAdtvBillion: string;
  minPiotroski: string;
  excludeHighRiskTrap: boolean;
  sort: CatalogSortOption;
}

interface RadarFilterPanelProps {
  preset: RadarPresetId;
  filters: RadarFilterState;
  advancedOpen: boolean;
  activeAdvancedCount: number;
  hasAnyFilter: boolean;
  pagination: CatalogPaginationDto | undefined;
  startItem: number;
  endItem: number;
  onApplyPreset: (id: Exclude<RadarPresetId, 'custom'>) => void;
  onPatchFilters: (patch: Partial<RadarFilterState>) => void;
  onToggleAdvanced: () => void;
  onResetAll: () => void;
}

const GRADE_PILLS: Array<{ value: QualityGradeFilter | ''; label: string }> = [
  { value: '', label: '' },
  { value: 'A', label: 'A (80+)' },
  { value: 'B', label: 'B (65–79)' },
  { value: 'C', label: 'C (50–64)' },
  { value: 'D', label: 'D (<50)' },
];

export function RadarFilterPanel({
  preset,
  filters,
  advancedOpen,
  activeAdvancedCount,
  hasAnyFilter,
  pagination,
  startItem,
  endItem,
  onApplyPreset,
  onPatchFilters,
  onToggleAdvanced,
  onResetAll,
}: RadarFilterPanelProps) {
  const { t } = useI18n();

  return (
    <Card className="space-y-4 p-4">
      {/* Row 1: 1-Click Smart Presets */}
      <div className="space-y-2">
        <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold tracking-wide text-muted uppercase">
          <Filter className="h-3.5 w-3.5" aria-hidden="true" />
          {t.radar.presetsLabel}
        </span>
        <div className="flex flex-wrap items-center gap-2">
          {(
            [
              ['all', t.radar.presetAll],
              ['prime', t.radar.presetPrime],
              ['compounders', t.radar.presetCompounders],
              ['fortress', t.radar.presetFortress],
              ['garp', t.radar.presetGarp],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              aria-pressed={preset === id}
              onClick={() => onApplyPreset(id)}
              className={cn(
                'inline-flex h-8 sm:h-7 items-center rounded-full border px-3 text-xs font-semibold transition-all cursor-pointer',
                preset === id
                  ? 'border-brand-600 bg-brand-solid text-white shadow-2xs'
                  : 'border-border bg-subtle/70 text-ink hover:border-brand-600/45 hover:bg-brand-50/60 hover:text-brand-700',
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Row 2: Clean 12-Col Primary Search / Sector / Sort Bar */}
      <div className="grid grid-cols-1 gap-2.5 border-t border-border/75 pt-3.5 sm:grid-cols-2 lg:grid-cols-12">
        <div className="relative sm:col-span-2 lg:col-span-5">
          <Search
            className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted"
            aria-hidden="true"
          />
          <Input
            value={filters.search}
            onChange={(e) => onPatchFilters({ search: e.target.value })}
            placeholder={t.watchlist.searchPlaceholder}
            className="h-10 sm:h-9 pl-9 pr-8 text-xs"
            aria-label={t.watchlist.searchPlaceholder}
          />
          {filters.search && (
            <button
              type="button"
              onClick={() => onPatchFilters({ search: '' })}
              aria-label="Clear search"
              className="absolute top-1/2 right-2 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded text-muted hover:text-ink cursor-pointer"
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          )}
        </div>

        <div className="lg:col-span-3">
          <Select
            value={filters.sector}
            onChange={(e) => onPatchFilters({ sector: e.target.value as IdxSector | '' })}
            aria-label={t.watchlist.colSector}
            className={cn(
              'h-10 sm:h-9 text-xs',
              filters.sector && 'border-brand-600/55 font-medium text-brand-700',
            )}
          >
            <option value="">{t.watchlist.allSectors}</option>
            {IDX_SECTORS.map((sec) => (
              <option key={sec} value={sec}>
                {t.sectors[sec]}
              </option>
            ))}
          </Select>
        </div>

        <div className="lg:col-span-4">
          <Select
            value={filters.sort}
            onChange={(e) => onPatchFilters({ sort: e.target.value as CatalogSortOption })}
            aria-label="Sort order"
            className="h-10 sm:h-9 text-xs"
          >
            <option value="fqs_desc">{t.radar.sortFqsDesc}</option>
            <option value="qarp_desc">{t.radar.sortQarpDesc}</option>
            <option value="mos_desc">{t.radar.sortMosDesc}</option>
            <option value="profitability_desc">{t.radar.sortProfitDesc}</option>
            <option value="growth_desc">{t.radar.sortGrowthDesc}</option>
            <option value="health_desc">{t.radar.sortHealthDesc}</option>
            <option value="cashflow_desc">{t.radar.sortCashFlowDesc}</option>
            <option value="adtv_desc">{t.radar.sortAdtvDesc}</option>
            <option value="fqs_asc">{t.radar.sortFqsAsc}</option>
          </Select>
        </div>
      </div>

      {/* Row 3: Two Dedicated Non-Colliding Quick Filter Blocks (Quality Score FQS | Valuation & Discount) */}
      <div className="grid grid-cols-1 gap-3.5 border-t border-border/75 pt-3.5 lg:grid-cols-2 lg:gap-5">
        {/* Quality Score (FQS) Quick Filter */}
        <div className="space-y-1.5">
          <span className="block text-[11px] font-semibold tracking-wide text-muted uppercase">
            {t.watchlist.qualityFilterLabel}
          </span>
          <div className="flex flex-wrap items-center gap-1.5">
            {GRADE_PILLS.map((opt) => {
              const active = filters.qualityGrade === opt.value;
              const label = opt.value === '' ? t.watchlist.qualityAll : opt.label;
              return (
                <button
                  key={opt.value || 'all'}
                  type="button"
                  aria-pressed={active}
                  onClick={() => onPatchFilters({ qualityGrade: opt.value })}
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
            <Input
              type="number"
              min={0}
              max={100}
              value={filters.minFqs}
              onChange={(e) => onPatchFilters({ minFqs: e.target.value })}
              placeholder={t.radar.filterMinFqs}
              title={t.radar.filterMinFqs}
              aria-label={t.radar.filterMinFqs}
              className="h-8 sm:h-7 w-24 px-2 font-mono text-xs tabular-nums"
            />
          </div>
        </div>

        {/* Valuation Status & Min Discount Quick Filter */}
        <div className="space-y-1.5">
          <span className="block text-[11px] font-semibold tracking-wide text-muted uppercase">
            {t.watchlist.valuationFilterLabel} &amp; {t.watchlist.mosFilterLabel}
          </span>
          <div className="flex flex-wrap items-center gap-1.5">
            {(
              [
                { value: '', label: t.watchlist.valuationAll },
                { value: 'UNDERVALUED', label: t.valuationStatus.UNDERVALUED },
                { value: 'FAIRLY_VALUED', label: t.valuationStatus.FAIRLY_VALUED },
                { value: 'OVERVALUED', label: t.valuationStatus.OVERVALUED },
              ] as const
            ).map((opt) => {
              const active = filters.valuationStatus === opt.value;
              return (
                <button
                  key={opt.value || 'all'}
                  type="button"
                  aria-pressed={active}
                  onClick={() => onPatchFilters({ valuationStatus: opt.value })}
                  className={cn(
                    'inline-flex h-8 sm:h-7 items-center rounded-md border px-2.5 text-xs font-semibold transition-colors cursor-pointer',
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
                  {opt.label}
                </button>
              );
            })}
            <Input
              type="number"
              min={-100}
              max={100}
              value={filters.minMos}
              onChange={(e) => onPatchFilters({ minMos: e.target.value })}
              placeholder={t.radar.filterMinMos}
              title={t.radar.filterMinMos}
              aria-label={t.radar.filterMinMos}
              className="h-8 sm:h-7 w-28 px-2 font-mono text-xs tabular-nums"
            />
          </div>
        </div>
      </div>

      {/* Row 4: Advanced Pillar Filters Toggle + Summary Count */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/80 pt-3">
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant={advancedOpen || activeAdvancedCount > 0 ? 'outlineBrand' : 'secondary'}
            size="sm"
            onClick={onToggleAdvanced}
            aria-expanded={advancedOpen}
          >
            <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden="true" />
            {t.radar.advancedFilters}
            {activeAdvancedCount > 0 && (
              <span className="ml-0.5 rounded-full bg-brand-solid px-1.5 py-0 text-[10px] font-bold text-white">
                {activeAdvancedCount}
              </span>
            )}
          </Button>

          {filters.qarpQuadrant && (
            <Badge tone="positive">
              {t.radar.quadrantLabels[filters.qarpQuadrant]}
              <button
                type="button"
                onClick={() => onPatchFilters({ qarpQuadrant: '' })}
                aria-label="Clear quadrant filter"
                className="ml-1 hover:text-ink cursor-pointer"
              >
                <X className="h-3 w-3" aria-hidden="true" />
              </button>
            </Badge>
          )}

          {hasAnyFilter && (
            <Button variant="ghost" size="sm" onClick={onResetAll}>
              <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
              {t.watchlist.resetFilters}
            </Button>
          )}
        </div>

        <div className="text-xs text-muted">
          {pagination ? (
            <>
              {t.watchlist.paginationShowing}{' '}
              <strong className="font-mono text-ink tabular-nums">
                {startItem}–{endItem}
              </strong>{' '}
              {t.watchlist.paginationOf}{' '}
              <strong className="font-mono text-ink tabular-nums">{pagination.totalItems}</strong>{' '}
              {t.watchlist.paginationStocks}
            </>
          ) : null}
        </div>
      </div>

      {/* Collapsible Pillar & Institutional Filters */}
      {advancedOpen && (
        <div className="grid grid-cols-1 gap-3 rounded-xl border border-border bg-subtle/40 p-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1">
            <label htmlFor="radar-min-prof" className="text-xs font-medium text-ink">
              {t.radar.pillarNames.profitability} (Min 0–100)
            </label>
            <Input
              id="radar-min-prof"
              type="number"
              min={0}
              max={100}
              value={filters.minProfitability}
              onChange={(e) => onPatchFilters({ minProfitability: e.target.value })}
              placeholder="e.g. 65"
              className="font-mono tabular-nums"
            />
          </div>

          <div className="space-y-1">
            <label htmlFor="radar-min-growth" className="text-xs font-medium text-ink">
              {t.radar.pillarNames.growth} (Min 0–100)
            </label>
            <Input
              id="radar-min-growth"
              type="number"
              min={0}
              max={100}
              value={filters.minGrowth}
              onChange={(e) => onPatchFilters({ minGrowth: e.target.value })}
              placeholder="e.g. 60"
              className="font-mono tabular-nums"
            />
          </div>

          <div className="space-y-1">
            <label htmlFor="radar-min-health" className="text-xs font-medium text-ink">
              {t.radar.pillarNames.financialHealth} (Min 0–100)
            </label>
            <Input
              id="radar-min-health"
              type="number"
              min={0}
              max={100}
              value={filters.minHealth}
              onChange={(e) => onPatchFilters({ minHealth: e.target.value })}
              placeholder="e.g. 65"
              className="font-mono tabular-nums"
            />
          </div>

          <div className="space-y-1">
            <label htmlFor="radar-min-cf" className="text-xs font-medium text-ink">
              {t.radar.pillarNames.cashFlow} (Min 0–100)
            </label>
            <Input
              id="radar-min-cf"
              type="number"
              min={0}
              max={100}
              value={filters.minCashFlow}
              onChange={(e) => onPatchFilters({ minCashFlow: e.target.value })}
              placeholder="e.g. 60"
              className="font-mono tabular-nums"
            />
          </div>

          <div className="space-y-1">
            <label htmlFor="radar-adtv" className="text-xs font-medium text-ink">
              <TermTooltip label={t.radar.filterAdtvLabel} definition={t.glossary.adtv} />
            </label>
            <Select
              id="radar-adtv"
              value={filters.minAdtvBillion}
              onChange={(e) => onPatchFilters({ minAdtvBillion: e.target.value })}
            >
              <option value="">{t.radar.adtvAny}</option>
              <option value="0.5">{t.radar.adtv500m}</option>
              <option value="1">{t.radar.adtv1b}</option>
              <option value="5">{t.radar.adtv5b}</option>
              <option value="10">{t.radar.adtv10b}</option>
            </Select>
          </div>

          <div className="space-y-1">
            <label htmlFor="radar-piotroski" className="text-xs font-medium text-ink">
              <TermTooltip
                label={t.radar.filterPiotroskiLabel}
                definition={t.glossary.piotroski}
              />
            </label>
            <Select
              id="radar-piotroski"
              value={filters.minPiotroski}
              onChange={(e) => onPatchFilters({ minPiotroski: e.target.value })}
            >
              <option value="">{t.radar.piotroskiAny}</option>
              <option value="5">≥ 5 / 9</option>
              <option value="6">≥ 6 / 9</option>
              <option value="7">≥ 7 / 9 (Strong)</option>
              <option value="8">≥ 8 / 9 (Elite)</option>
            </Select>
          </div>

          <div className="flex items-end pb-1 sm:col-span-2">
            <label className="flex items-center gap-2 text-xs font-medium text-ink cursor-pointer">
              <input
                type="checkbox"
                checked={filters.excludeHighRiskTrap}
                onChange={(e) => onPatchFilters({ excludeHighRiskTrap: e.target.checked })}
                className="h-4 w-4 rounded border-border accent-brand-600 cursor-pointer"
              />
              <span>{t.radar.excludeHighRiskTrap}</span>
            </label>
          </div>
        </div>
      )}
    </Card>
  );
}
