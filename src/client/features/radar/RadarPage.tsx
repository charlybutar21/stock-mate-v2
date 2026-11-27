import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  Calculator,
  ChevronLeft,
  ChevronRight,
  Clock,
  Filter,
  Radar as RadarIcon,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldAlert,
  SlidersHorizontal,
  Sparkles,
  X,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import type {
  CatalogQuery,
  CatalogSortOption,
  MarketStockDto,
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
  Modal,
  Select,
  Skeleton,
  TermTooltip,
} from '@/client/components/ui/primitives';
import { useI18n } from '@/client/i18n/useI18n';
import {
  formatCompactIdr,
  formatIdr,
  formatMultiple,
  formatPercent,
  formatShortDate,
} from '@/client/lib/formatters';
import { AddToWatchlistMenu } from '@/client/features/watchlist/AddToWatchlistMenu';
import { CustomWatchlistModal } from '@/client/features/watchlist/CustomWatchlistModal';
import { statusTone } from '@/client/features/watchlist/WatchlistPage';
import {
  useCustomWatchlists,
  useEnsureWatchlistItem,
  useIdxCatalog,
  useSyncIdxCatalog,
} from '@/client/features/watchlist/useWatchlist';
import { QualityBreakdownCard } from './QualityBreakdownCard';
import { PillarMiniGrid, QualityScoreBadge } from './QualityScoreBadge';

type RadarPresetId = 'all' | 'prime' | 'compounders' | 'fortress' | 'garp' | 'custom';

interface RadarFilterState {
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

const DEFAULT_RADAR_FILTERS: RadarFilterState = {
  search: '',
  sector: '',
  valuationStatus: '',
  qualityGrade: '',
  qarpQuadrant: '',
  minMos: '',
  minFqs: '',
  minProfitability: '',
  minGrowth: '',
  minHealth: '',
  minCashFlow: '',
  minAdtvBillion: '',
  minPiotroski: '',
  excludeHighRiskTrap: false,
  sort: 'fqs_desc',
};

const PRESET_FILTERS: Record<Exclude<RadarPresetId, 'custom'>, Partial<RadarFilterState>> = {
  all: { ...DEFAULT_RADAR_FILTERS },
  prime: {
    ...DEFAULT_RADAR_FILTERS,
    minMos: '20',
    minFqs: '70',
    minProfitability: '65',
    minHealth: '60',
    minAdtvBillion: '1',
    excludeHighRiskTrap: true,
    sort: 'qarp_desc',
  },
  compounders: {
    ...DEFAULT_RADAR_FILTERS,
    minFqs: '80',
    minProfitability: '75',
    minGrowth: '65',
    minCashFlow: '70',
    minAdtvBillion: '1',
    excludeHighRiskTrap: true,
    sort: 'fqs_desc',
  },
  fortress: {
    ...DEFAULT_RADAR_FILTERS,
    minMos: '15',
    minHealth: '80',
    minCashFlow: '80',
    minAdtvBillion: '1',
    excludeHighRiskTrap: true,
    sort: 'qarp_desc',
  },
  garp: {
    ...DEFAULT_RADAR_FILTERS,
    minMos: '15',
    minGrowth: '75',
    minProfitability: '60',
    minAdtvBillion: '1',
    excludeHighRiskTrap: true,
    sort: 'qarp_desc',
  },
};

function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}

function parseOptionalNumber(raw: string): number | undefined {
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  const num = Number(trimmed);
  return Number.isFinite(num) ? num : undefined;
}

export function RadarPage() {
  const { t, lang } = useI18n();
  const navigate = useNavigate();

  const [preset, setPreset] = useState<RadarPresetId>('all');
  const [filters, setFilters] = useState<RadarFilterState>(DEFAULT_RADAR_FILTERS);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [xrayStock, setXrayStock] = useState<MarketStockDto | null>(null);
  const [openingTicker, setOpeningTicker] = useState<string | null>(null);
  const [createGroupSeedTicker, setCreateGroupSeedTicker] = useState<string | null>(null);
  const [createGroupOpen, setCreateGroupOpen] = useState(false);

  const debouncedSearch = useDebouncedValue(filters.search, 250);

  const catalogQuery: Partial<CatalogQuery> = {
    search: debouncedSearch.trim() || undefined,
    sector: filters.sector || undefined,
    valuationStatus: filters.valuationStatus || undefined,
    qualityGrade: filters.qualityGrade || undefined,
    qarpQuadrant: filters.qarpQuadrant || undefined,
    minMos: parseOptionalNumber(filters.minMos),
    minFqs: parseOptionalNumber(filters.minFqs),
    minProfitability: parseOptionalNumber(filters.minProfitability),
    minGrowth: parseOptionalNumber(filters.minGrowth),
    minHealth: parseOptionalNumber(filters.minHealth),
    minCashFlow: parseOptionalNumber(filters.minCashFlow),
    minAdtvBillion: parseOptionalNumber(filters.minAdtvBillion),
    minPiotroski: parseOptionalNumber(filters.minPiotroski),
    excludeHighRiskTrap: filters.excludeHighRiskTrap || undefined,
    sort: filters.sort,
    page,
    pageSize,
  };

  const { data: catalogData, isLoading, isFetching, isError } = useIdxCatalog(catalogQuery, true);
  const { data: customGroups = [] } = useCustomWatchlists();
  const syncCatalog = useSyncIdxCatalog();
  const ensureWatchlistItem = useEnsureWatchlistItem();

  const applyPreset = (id: Exclude<RadarPresetId, 'custom'>) => {
    setPreset(id);
    setFilters({ ...DEFAULT_RADAR_FILTERS, ...PRESET_FILTERS[id] });
    setPage(1);
  };

  const patchFilters = (patch: Partial<RadarFilterState>) => {
    setPreset('custom');
    setFilters((prev) => ({ ...prev, ...patch }));
    setPage(1);
  };

  const resetAll = () => {
    applyPreset('all');
  };

  const activeAdvancedCount = [
    filters.qualityGrade,
    filters.minProfitability,
    filters.minGrowth,
    filters.minHealth,
    filters.minCashFlow,
    filters.minAdtvBillion,
    filters.minPiotroski,
    filters.excludeHighRiskTrap ? '1' : '',
  ].filter(Boolean).length;

  const hasAnyFilter =
    preset !== 'all' ||
    Boolean(
      filters.search ||
        filters.sector ||
        filters.valuationStatus ||
        filters.qarpQuadrant ||
        filters.minMos ||
        filters.minFqs ||
        activeAdvancedCount > 0,
    );

  const handleOpenDetail = async (stock: MarketStockDto) => {
    if (stock.watchlistItemId) {
      navigate(`/watchlist/${stock.watchlistItemId}`);
      return;
    }
    setOpeningTicker(stock.ticker);
    try {
      const ensured = await ensureWatchlistItem.mutateAsync(stock.ticker);
      navigate(`/watchlist/${ensured.id}`);
    } finally {
      setOpeningTicker(null);
    }
  };

  const handleOpenSimulator = async (stock: MarketStockDto) => {
    if (stock.watchlistItemId) {
      navigate(`/simulator?stockId=${stock.watchlistItemId}`);
      return;
    }
    setOpeningTicker(stock.ticker);
    try {
      const ensured = await ensureWatchlistItem.mutateAsync(stock.ticker);
      navigate(`/simulator?stockId=${ensured.id}`);
    } finally {
      setOpeningTicker(null);
    }
  };

  const summary = catalogData?.summary;
  const items = catalogData?.items ?? [];
  const pagination = catalogData?.pagination;
  const startItem = pagination && pagination.totalItems > 0 ? (pagination.page - 1) * pagination.pageSize + 1 : 0;
  const endItem = pagination ? Math.min(pagination.page * pagination.pageSize, pagination.totalItems) : 0;

  return (
    <div className="space-y-6 animate-fade-up">
      {/* Page Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-brand-600/30 bg-brand-50 text-brand-700">
              <RadarIcon className="h-4 w-4" aria-hidden="true" />
            </span>
            <h1 className="font-display text-2xl font-bold tracking-tight text-ink">
              {t.radar.title}
            </h1>
          </div>
          <p className="mt-1 text-sm text-muted">{t.radar.subtitle}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {summary?.lastSyncedAt && (
            <span className="inline-flex items-center gap-1 text-xs text-muted">
              <Clock className="h-3.5 w-3.5" aria-hidden="true" />
              {t.watchlist.lastSyncedPrefix}: {formatShortDate(summary.lastSyncedAt, lang)}
            </span>
          )}
          <Button
            variant="secondary"
            size="sm"
            onClick={() => syncCatalog.mutate()}
            disabled={syncCatalog.isPending}
          >
            <RefreshCw
              className={cn('h-3.5 w-3.5', syncCatalog.isPending && 'animate-spin')}
              aria-hidden="true"
            />
            {syncCatalog.isPending ? t.watchlist.syncingIhsg : t.watchlist.syncIhsgBtn}
          </Button>
        </div>
      </div>

      {/* KPI Quick-Filter Strip */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <button
          type="button"
          onClick={resetAll}
          className={cn(
            'rounded-xl border p-4 text-left transition-all cursor-pointer',
            !hasAnyFilter
              ? 'border-brand-600/50 bg-brand-50/60 shadow-xs'
              : 'border-border bg-panel hover:border-brand-600/35 hover:bg-subtle/40',
          )}
        >
          <div className="text-[11px] font-semibold tracking-wide text-muted uppercase">
            {t.radar.kpiTotal}
          </div>
          <div className="mt-1 font-mono text-2xl font-bold text-ink tabular-nums">
            {summary ? summary.totalStocks : '–'}
          </div>
          <div className="mt-1 text-[11px] text-muted">
            {summary ? `${summary.qualityScored} FQS` : ''}
          </div>
        </button>

        <button
          type="button"
          onClick={() => {
            setPreset('custom');
            setFilters({
              ...DEFAULT_RADAR_FILTERS,
              qarpQuadrant: 'PRIME_OPPORTUNITY',
              sort: 'qarp_desc',
            });
            setPage(1);
          }}
          className={cn(
            'rounded-xl border p-4 text-left transition-all cursor-pointer',
            filters.qarpQuadrant === 'PRIME_OPPORTUNITY'
              ? 'border-positive-600/50 bg-positive-50/70 shadow-xs'
              : 'border-border bg-panel hover:border-positive-600/40 hover:bg-positive-50/30',
          )}
        >
          <div className="flex items-center gap-1 text-[11px] font-semibold tracking-wide text-positive-700 uppercase">
            <Sparkles className="h-3 w-3" aria-hidden="true" />
            {t.radar.kpiPrime}
          </div>
          <div className="mt-1 font-mono text-2xl font-bold text-positive-700 tabular-nums">
            {summary ? summary.primeOpportunities : '–'}
          </div>
          <div className="mt-1 truncate text-[11px] text-muted">{t.radar.kpiPrimeHint}</div>
        </button>

        <button
          type="button"
          onClick={() => {
            setPreset('custom');
            setFilters({
              ...DEFAULT_RADAR_FILTERS,
              qualityGrade: 'A',
              sort: 'fqs_desc',
            });
            setPage(1);
          }}
          className={cn(
            'rounded-xl border p-4 text-left transition-all cursor-pointer',
            filters.qualityGrade === 'A'
              ? 'border-positive-600/50 bg-positive-50/60 shadow-xs'
              : 'border-border bg-panel hover:border-positive-600/35 hover:bg-subtle/40',
          )}
        >
          <div className="text-[11px] font-semibold tracking-wide text-muted uppercase">
            {t.radar.kpiElite}
          </div>
          <div className="mt-1 font-mono text-2xl font-bold text-ink tabular-nums">
            {summary ? summary.eliteQuality : '–'}
          </div>
          <div className="mt-1 text-[11px] text-muted">{t.radar.kpiEliteHint}</div>
        </button>

        <button
          type="button"
          onClick={() => {
            setPreset('custom');
            setFilters({
              ...DEFAULT_RADAR_FILTERS,
              qualityGrade: 'B',
              sort: 'fqs_desc',
            });
            setPage(1);
          }}
          className={cn(
            'rounded-xl border p-4 text-left transition-all cursor-pointer',
            filters.qualityGrade === 'B'
              ? 'border-brand-600/50 bg-brand-50/60 shadow-xs'
              : 'border-border bg-panel hover:border-brand-600/35 hover:bg-subtle/40',
          )}
        >
          <div className="text-[11px] font-semibold tracking-wide text-muted uppercase">
            {t.radar.kpiStrong}
          </div>
          <div className="mt-1 font-mono text-2xl font-bold text-ink tabular-nums">
            {summary ? summary.strongQuality : '–'}
          </div>
          <div className="mt-1 text-[11px] text-muted">{t.radar.kpiStrongHint}</div>
        </button>
      </div>

      {/* Smart Presets & Filter Bar Card */}
      <Card className="space-y-4 p-4">
        {/* 1-Click Smart Presets */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-muted">
            <Filter className="h-3.5 w-3.5" aria-hidden="true" />
            {t.radar.presetsLabel}:
          </span>
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
              onClick={() => applyPreset(id)}
              className={cn(
                'rounded-full border px-3 py-1 text-xs font-semibold transition-all cursor-pointer',
                preset === id
                  ? 'border-brand-600 bg-brand-solid text-white shadow-2xs'
                  : 'border-border bg-subtle/70 text-ink hover:border-brand-600/45 hover:bg-brand-50/60 hover:text-brand-700',
              )}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Primary Controls */}
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-12">
          <div className="relative lg:col-span-3">
            <Search
              className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted"
              aria-hidden="true"
            />
            <Input
              value={filters.search}
              onChange={(e) => patchFilters({ search: e.target.value })}
              placeholder={t.watchlist.searchPlaceholder}
              className="pl-9 pr-8"
              aria-label={t.watchlist.searchPlaceholder}
            />
            {filters.search && (
              <button
                type="button"
                onClick={() => patchFilters({ search: '' })}
                aria-label="Clear search"
                className="absolute top-1/2 right-2.5 -translate-y-1/2 text-muted hover:text-ink cursor-pointer"
              >
                <X className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            )}
          </div>

          <div className="lg:col-span-2">
            <Select
              value={filters.sector}
              onChange={(e) => patchFilters({ sector: e.target.value as IdxSector | '' })}
              aria-label={t.watchlist.colSector}
            >
              <option value="">{t.watchlist.allSectors}</option>
              {IDX_SECTORS.map((sec) => (
                <option key={sec} value={sec}>
                  {t.sectors[sec]}
                </option>
              ))}
            </Select>
          </div>

          <div className="lg:col-span-2">
            <Select
              value={filters.valuationStatus}
              onChange={(e) =>
                patchFilters({ valuationStatus: e.target.value as ValuationStatusFilter | '' })
              }
              aria-label={t.watchlist.valuationFilterLabel}
            >
              <option value="">
                {t.watchlist.valuationFilterLabel}: {t.watchlist.valuationAll}
              </option>
              <option value="UNDERVALUED">{t.valuationStatus.UNDERVALUED}</option>
              <option value="FAIRLY_VALUED">{t.valuationStatus.FAIRLY_VALUED}</option>
              <option value="OVERVALUED">{t.valuationStatus.OVERVALUED}</option>
            </Select>
          </div>

          <div className="lg:col-span-1">
            <Input
              type="number"
              min={-100}
              max={100}
              value={filters.minMos}
              onChange={(e) => patchFilters({ minMos: e.target.value })}
              placeholder={t.radar.filterMinMos}
              title={t.radar.filterMinMos}
              className="font-mono tabular-nums"
            />
          </div>

          <div className="lg:col-span-1">
            <Input
              type="number"
              min={0}
              max={100}
              value={filters.minFqs}
              onChange={(e) => patchFilters({ minFqs: e.target.value })}
              placeholder={t.radar.filterMinFqs}
              title={t.radar.filterMinFqs}
              className="font-mono tabular-nums"
            />
          </div>

          <div className="lg:col-span-3">
            <Select
              value={filters.sort}
              onChange={(e) => patchFilters({ sort: e.target.value as CatalogSortOption })}
              aria-label="Sort order"
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

        {/* Advanced Pillar & Guardrail Filters Toggle */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/80 pt-3">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant={advancedOpen || activeAdvancedCount > 0 ? 'outlineBrand' : 'secondary'}
              size="sm"
              onClick={() => setAdvancedOpen((v) => !v)}
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
                  onClick={() => patchFilters({ qarpQuadrant: '' })}
                  aria-label="Clear quadrant filter"
                  className="ml-1 hover:text-ink cursor-pointer"
                >
                  <X className="h-3 w-3" aria-hidden="true" />
                </button>
              </Badge>
            )}

            {hasAnyFilter && (
              <Button variant="ghost" size="sm" onClick={resetAll}>
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
                onChange={(e) => patchFilters({ minProfitability: e.target.value })}
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
                onChange={(e) => patchFilters({ minGrowth: e.target.value })}
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
                onChange={(e) => patchFilters({ minHealth: e.target.value })}
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
                onChange={(e) => patchFilters({ minCashFlow: e.target.value })}
                placeholder="e.g. 60"
                className="font-mono tabular-nums"
              />
            </div>

            <div className="space-y-1">
              <label htmlFor="radar-grade" className="text-xs font-medium text-ink">
                {t.radar.filterGradeLabel}
              </label>
              <Select
                id="radar-grade"
                value={filters.qualityGrade}
                onChange={(e) =>
                  patchFilters({ qualityGrade: e.target.value as QualityGradeFilter | '' })
                }
              >
                <option value="">{t.radar.filterGradeAll}</option>
                <option value="A">Grade A (80–100)</option>
                <option value="B">Grade B (65–79)</option>
                <option value="C">Grade C (50–64)</option>
                <option value="D">Grade D (&lt; 50)</option>
              </Select>
            </div>

            <div className="space-y-1">
              <label htmlFor="radar-adtv" className="text-xs font-medium text-ink">
                <TermTooltip label={t.radar.filterAdtvLabel} definition={t.glossary.adtv} />
              </label>
              <Select
                id="radar-adtv"
                value={filters.minAdtvBillion}
                onChange={(e) => patchFilters({ minAdtvBillion: e.target.value })}
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
                onChange={(e) => patchFilters({ minPiotroski: e.target.value })}
              >
                <option value="">{t.radar.piotroskiAny}</option>
                <option value="5">≥ 5 / 9</option>
                <option value="6">≥ 6 / 9</option>
                <option value="7">≥ 7 / 9 (Strong)</option>
                <option value="8">≥ 8 / 9 (Elite)</option>
              </Select>
            </div>

            <div className="flex items-end pb-1">
              <label className="flex items-center gap-2 text-xs font-medium text-ink cursor-pointer">
                <input
                  type="checkbox"
                  checked={filters.excludeHighRiskTrap}
                  onChange={(e) => patchFilters({ excludeHighRiskTrap: e.target.checked })}
                  className="h-4 w-4 rounded border-border accent-brand-600 cursor-pointer"
                />
                <span>{t.radar.excludeHighRiskTrap}</span>
              </label>
            </div>
          </div>
        )}
      </Card>

      {/* Main Radar Screener Table */}
      <Card className="overflow-hidden p-0">
        {isLoading ? (
          <div className="space-y-3 p-5">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : isError ? (
          <div className="p-8 text-center text-sm text-muted">{t.common.unexpectedError}</div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
            <RadarIcon className="h-10 w-10 text-muted/45" aria-hidden="true" />
            <h3 className="mt-3 font-display text-base font-bold text-ink">{t.radar.emptyTitle}</h3>
            <p className="mt-1 max-w-md text-xs text-muted">{t.radar.emptyBody}</p>
            <Button variant="secondary" size="sm" onClick={resetAll} className="mt-4">
              <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
              {t.watchlist.resetFilters}
            </Button>
          </div>
        ) : (
          <div className={cn('w-full overflow-x-auto', isFetching && 'opacity-75 transition-opacity')}>
            <table className="w-full min-w-[980px] table-fixed border-collapse text-left text-sm">
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
                            onClick={() => handleOpenDetail(item)}
                            className="font-mono text-sm font-bold tracking-tight text-ink transition-colors group-hover:text-brand-700 disabled:opacity-60 cursor-pointer"
                          >
                            {item.ticker}
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              patchFilters({
                                sector: filters.sector === item.sector ? '' : item.sector,
                              })
                            }
                            className="max-w-[120px] truncate rounded border border-border bg-subtle/75 px-1.5 py-0.5 text-[10px] font-medium text-muted hover:border-brand-600/40 hover:text-brand-700 cursor-pointer"
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
                        <div className="text-sm font-bold text-ink">
                          {formatIdr(item.currentPrice)}
                        </div>
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
                                  className="h-3.5 w-3.5 text-positive-600"
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
                                    ? 'text-positive-600'
                                    : mosVal >= 0
                                      ? 'text-warning-600'
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
                              {
                                t.valueTrapShield.shortBadges[
                                  item.valuation.valueTrapShield.riskLevel
                                ]
                              }
                            </span>
                          )}
                        </div>
                      </td>

                      {/* FQS Score Badge (clickable X-Ray) */}
                      <td className="px-3 py-3.5 text-center align-middle">
                        <div className="flex flex-col items-center gap-1">
                          <QualityScoreBadge
                            quality={item.quality}
                            onClick={() => setXrayStock(item)}
                          />
                          {item.quality.appliedCaps.length > 0 && (
                            <span className="text-[10px] font-semibold text-warning-700">
                              Capped
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
                            onClick={() => setXrayStock(item)}
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
                            onCreateWithTicker={(ticker) => {
                              setCreateGroupSeedTicker(ticker);
                              setCreateGroupOpen(true);
                            }}
                          />
                          <button
                            type="button"
                            disabled={isOpening}
                            onClick={() => handleOpenSimulator(item)}
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
        )}

        {/* Pagination Footer */}
        {pagination && pagination.totalItems > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border bg-subtle/40 px-5 py-3 text-xs">
            <div className="flex items-center gap-2 text-muted">
              <span>
                {t.watchlist.paginationShowing}{' '}
                <strong className="font-mono text-ink tabular-nums">
                  {startItem}–{endItem}
                </strong>{' '}
                {t.watchlist.paginationOf}{' '}
                <strong className="font-mono text-ink tabular-nums">{pagination.totalItems}</strong>{' '}
                {t.watchlist.paginationStocks}
              </span>
              <Select
                value={String(pageSize)}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setPage(1);
                }}
                className="h-7 w-auto py-0 text-xs"
                aria-label={t.watchlist.paginationPerPage}
              >
                <option value="25">25 / {t.watchlist.paginationPerPage}</option>
                <option value="50">50 / {t.watchlist.paginationPerPage}</option>
                <option value="100">100 / {t.watchlist.paginationPerPage}</option>
              </Select>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                disabled={pagination.page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
                {t.watchlist.paginationPrev}
              </Button>
              <span className="font-mono font-semibold text-ink tabular-nums">
                {pagination.page} / {pagination.totalPages}
              </span>
              <Button
                variant="secondary"
                size="sm"
                disabled={pagination.page >= pagination.totalPages}
                onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}
              >
                {t.watchlist.paginationNext}
                <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
              </Button>
            </div>
          </div>
        )}
      </Card>

      {/* Quality X-Ray Modal */}
      <Modal
        open={Boolean(xrayStock)}
        onClose={() => setXrayStock(null)}
        title={
          xrayStock
            ? `${xrayStock.ticker} — ${t.radar.xrayModalTitle}`
            : t.radar.xrayModalTitle
        }
        maxWidthClass="max-w-3xl"
      >
        {xrayStock && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-lg font-bold text-ink">{xrayStock.ticker}</span>
                  <Badge tone="neutral">{t.sectors[xrayStock.sector]}</Badge>
                  <Badge tone={statusTone(xrayStock.valuation.valuationStatus)}>
                    {t.valuationStatus[xrayStock.valuation.valuationStatus]}
                    {xrayStock.valuation.mosPct !== null
                      ? ` (${formatPercent(xrayStock.valuation.mosPct, true)})`
                      : ''}
                  </Badge>
                </div>
                <p className="mt-0.5 text-xs text-muted">{xrayStock.companyName}</p>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    const target = xrayStock;
                    setXrayStock(null);
                    void handleOpenDetail(target);
                  }}
                >
                  <BarChart3 className="h-3.5 w-3.5" aria-hidden="true" />
                  {t.radar.openDetail}
                </Button>
                <Button
                  size="sm"
                  onClick={() => {
                    const target = xrayStock;
                    setXrayStock(null);
                    void handleOpenSimulator(target);
                  }}
                >
                  <Calculator className="h-3.5 w-3.5" aria-hidden="true" />
                  {t.watchlist.simulate}
                </Button>
              </div>
            </div>

            <QualityBreakdownCard
              quality={xrayStock.quality}
              fundamentals={xrayStock.fundamentals}
              dividendYieldPct={xrayStock.valuation.ratios.dividendYieldPct}
              compact
            />
          </div>
        )}
      </Modal>

      <CustomWatchlistModal
        open={createGroupOpen}
        onClose={() => {
          setCreateGroupOpen(false);
          setCreateGroupSeedTicker(null);
        }}
        initialTicker={createGroupSeedTicker}
      />
    </div>
  );
}
