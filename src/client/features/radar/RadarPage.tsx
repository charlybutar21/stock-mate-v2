import {
  BarChart3,
  Calculator,
  ChevronLeft,
  ChevronRight,
  Clock,
  Radar as RadarIcon,
  RotateCcw,
  Sparkles,
} from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import type { CatalogQuery, MarketStockDto } from '@/shared/contracts';
import {
  Badge,
  Button,
  Card,
  cn,
  Modal,
  Select,
  Skeleton,
} from '@/client/components/ui/primitives';
import { useI18n } from '@/client/i18n/useI18n';
import { formatPercent, formatShortDate } from '@/client/lib/formatters';
import { useDebouncedValue } from '@/client/lib/useDebouncedValue';
import { useToast } from '@/client/lib/useToast';
import { statusTone } from '@/client/lib/valuationTone';
import { CustomWatchlistModal } from '@/client/features/watchlist/CustomWatchlistModal';
import {
  useCustomWatchlists,
  useEnsureWatchlistItem,
  useIdxCatalog,
} from '@/client/features/watchlist/useWatchlist';
import { QualityBreakdownCard } from './QualityBreakdownCard';
import {
  RadarFilterPanel,
  type RadarFilterState,
  type RadarPresetId,
} from './RadarFilterPanel';
import { RadarResultsList } from './RadarResultsList';

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

function parseOptionalNumber(raw: string): number | undefined {
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  const num = Number(trimmed);
  return Number.isFinite(num) ? num : undefined;
}

export function RadarPage() {
  const { t, lang } = useI18n();
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [preset, setPreset] = useState<RadarPresetId>('all');
  const [filters, setFilters] = useState<RadarFilterState>(DEFAULT_RADAR_FILTERS);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
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
        filters.qualityGrade ||
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
    } catch {
      showToast(t.common.unexpectedError, 'error');
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
    } catch {
      showToast(t.common.unexpectedError, 'error');
    } finally {
      setOpeningTicker(null);
    }
  };

  const summary = catalogData?.summary;
  const items = catalogData?.items ?? [];
  const pagination = catalogData?.pagination;
  const startItem =
    pagination && pagination.totalItems > 0 ? (pagination.page - 1) * pagination.pageSize + 1 : 0;
  const endItem = pagination
    ? Math.min(pagination.page * pagination.pageSize, pagination.totalItems)
    : 0;

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
          <span className="inline-flex items-center gap-1.5 rounded-full border border-positive-600/30 bg-positive-50 px-2.5 py-1 text-[11px] font-semibold text-positive-700">
            <span className="h-1.5 w-1.5 rounded-full bg-positive-600" aria-hidden="true" />
            {t.common.autoSyncBadge}
          </span>
          {summary?.lastSyncedAt && (
            <span className="inline-flex items-center gap-1 text-xs text-muted">
              <Clock className="h-3.5 w-3.5" aria-hidden="true" />
              {t.watchlist.lastSyncedPrefix}: {formatShortDate(summary.lastSyncedAt, lang)}
            </span>
          )}
        </div>
      </div>

      {/* KPI Quick-Filter Strip */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <button
          type="button"
          onClick={resetAll}
          aria-pressed={!hasAnyFilter}
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
          aria-pressed={filters.qarpQuadrant === 'PRIME_OPPORTUNITY'}
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
          aria-pressed={filters.qualityGrade === 'A'}
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
          aria-pressed={filters.qualityGrade === 'B'}
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

      {/* Smart Presets & Filter Bar */}
      <RadarFilterPanel
        preset={preset}
        filters={filters}
        advancedOpen={advancedOpen}
        activeAdvancedCount={activeAdvancedCount}
        hasAnyFilter={hasAnyFilter}
        pagination={pagination}
        startItem={startItem}
        endItem={endItem}
        onApplyPreset={applyPreset}
        onPatchFilters={patchFilters}
        onToggleAdvanced={() => setAdvancedOpen((v) => !v)}
        onResetAll={resetAll}
      />

      {/* Main Radar Screener Results */}
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
          <RadarResultsList
            items={items}
            isFetching={isFetching}
            activeSector={filters.sector}
            openingTicker={openingTicker}
            customGroups={customGroups}
            onToggleSector={(sec) =>
              patchFilters({ sector: filters.sector === sec ? '' : sec })
            }
            onOpenXray={setXrayStock}
            onOpenDetail={handleOpenDetail}
            onOpenSimulator={handleOpenSimulator}
            onCreateWatchlistWithTicker={(ticker) => {
              setCreateGroupSeedTicker(ticker);
              setCreateGroupOpen(true);
            }}
          />
        )}

        {/* Pagination Footer */}
        {pagination && pagination.totalItems > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border bg-subtle/40 px-4 py-3 text-xs sm:px-5">
            <div className="flex flex-wrap items-center gap-2 text-muted">
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
                className="h-8 w-auto py-0 text-xs"
                aria-label={t.watchlist.paginationPerPage}
              >
                <option value="10">10 {t.common.perPageShort}</option>
                <option value="50">50 {t.common.perPageShort}</option>
                <option value="100">100 {t.common.perPageShort}</option>
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
                <div className="flex flex-wrap items-center gap-2">
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
