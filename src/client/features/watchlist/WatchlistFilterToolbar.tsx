import { RotateCcw, Search, X } from 'lucide-react';
import type {
  CatalogSortOption,
  CatalogSummaryDto,
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
  mosPreset: MosPreset;
  onApplyMosPreset: (preset: MosPreset) => void;
  minMosInput: string;
  maxMosInput: string;
  onMinMosChange: (val: string) => void;
  onMaxMosChange: (val: string) => void;
  showValuationScreener: boolean;
  showCounts: boolean;
  summary: CatalogSummaryDto | undefined;
  hasActiveFilters: boolean;
  onResetFilters: () => void;
}

export function WatchlistFilterToolbar({
  search,
  onSearchChange,
  sector,
  onSectorChange,
  sort,
  onSortChange,
  valuationStatus,
  onValuationStatusChange,
  mosPreset,
  onApplyMosPreset,
  minMosInput,
  maxMosInput,
  onMinMosChange,
  onMaxMosChange,
  showValuationScreener,
  showCounts,
  summary,
  hasActiveFilters,
  onResetFilters,
}: WatchlistFilterToolbarProps) {
  const { t } = useI18n();

  return (
    <div className="space-y-3 rounded-xl border border-border bg-panel p-3.5 sm:px-4 surface-elevated">
      {/* Row 1: Search, Sector, Sort, Reset */}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:flex lg:items-center">
        <div className="relative flex h-10 sm:h-9 items-center sm:col-span-2 lg:min-w-0 lg:flex-1">
          <Search
            className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-muted"
            aria-hidden="true"
          />
          <Input
            placeholder={t.watchlist.searchPlaceholder}
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            className="h-10 sm:h-9 pl-8 text-xs"
          />
        </div>

        <Select
          value={sector}
          onChange={(e) => onSectorChange(e.target.value as IdxSector | '')}
          className={cn(
            'h-10 sm:h-9 text-xs lg:w-48',
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

        <Select
          value={sort}
          onChange={(e) => onSortChange(e.target.value as CatalogSortOption)}
          className="h-10 sm:h-9 text-xs lg:w-52"
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

        {hasActiveFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onResetFilters}
            className="h-10 sm:h-9 shrink-0 px-2.5 text-xs"
          >
            <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
            {t.watchlist.resetFilters}
          </Button>
        )}
      </div>

      {/* Row 2: Valuation Status + Discount (MoS %) Filter */}
      {showValuationScreener && (
        <div className="flex flex-col gap-3 border-t border-border/75 pt-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="mr-1 text-[11px] font-semibold text-muted">
              {t.watchlist.valuationFilterLabel}:
            </span>
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

          <div className="flex flex-wrap items-center gap-1.5">
            <span className="mr-1 text-[11px] font-semibold text-muted">
              {t.watchlist.mosFilterLabel}:
            </span>
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
                    'inline-flex h-8 sm:h-7 items-center rounded-md border px-2 text-[11px] font-semibold transition-colors cursor-pointer',
                    active
                      ? 'border-brand-600/50 bg-brand-50 text-brand-700'
                      : 'border-border bg-display text-muted hover:border-muted/60 hover:text-ink',
                  )}
                >
                  {label}
                </button>
              );
            })}

            <div className="ml-0.5 flex items-center gap-1">
              <Input
                type="number"
                step="1"
                aria-label="Minimum Margin of Safety percent"
                placeholder={t.watchlist.mosMinPlaceholder}
                value={minMosInput}
                onChange={(e) => onMinMosChange(e.target.value)}
                className="h-8 sm:h-7 w-20 px-2 font-mono text-xs tabular-nums"
              />
              <span className="text-xs text-muted">-</span>
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

      {/* Active Sector Quick-Clear Pill */}
      {sector && (
        <div className="flex flex-wrap items-center gap-2 border-t border-border/70 pt-2">
          <button
            type="button"
            onClick={() => onSectorChange('')}
            title={t.watchlist.clearSectorFilter}
            className="inline-flex h-8 sm:h-7 items-center gap-1 rounded-md border border-brand-600/40 bg-brand-50 px-2.5 text-[11px] font-semibold text-brand-700 transition-colors hover:bg-brand-100 cursor-pointer"
          >
            <span>
              {t.watchlist.colSector}: {t.sectors[sector]}
            </span>
            <X className="h-3 w-3" aria-hidden="true" />
          </button>
        </div>
      )}
    </div>
  );
}
