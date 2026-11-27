import {
  AlertCircle,
  Bookmark,
  Briefcase,
  ChevronLeft,
  ChevronRight,
  FolderPlus,
  Globe,
  Pencil,
  Plus,
  Radar,
  RefreshCw,
  RotateCcw,
  Trash2,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import type {
  CatalogSortOption,
  CustomWatchlistGroupDto,
  MarketStockDto,
  QualityGradeFilter,
  ValuationStatusFilter,
  WatchlistItemDto,
} from '@/shared/contracts';
import {
  analyzePortfolioRisk,
  calculatePositionSummary,
  DEFAULT_BUY_FEE_PCT,
  DEFAULT_SELL_FEE_PCT,
  type IdxSector,
} from '@/shared/domain';
import {
  Button,
  Card,
  cn,
  Modal,
  Select,
  Skeleton,
} from '@/client/components/ui/primitives';
import { useI18n } from '@/client/i18n/useI18n';
import { formatNumber } from '@/client/lib/formatters';
import { useCalcMode } from '@/client/lib/useCalcMode';
import { useDebouncedValue } from '@/client/lib/useDebouncedValue';
import { usePrivacy } from '@/client/lib/usePrivacy';
import { useToast } from '@/client/lib/useToast';
import { CustomWatchlistModal } from './CustomWatchlistModal';
import { CustomWatchlistQuickAdd } from './CustomWatchlistQuickAdd';
import { MarketStockTable } from './MarketStockTable';
import { PortfolioOverviewSection } from './PortfolioOverviewSection';
import { StockFormModal } from './StockFormModal';
import { WatchlistFilterToolbar, type MosPreset } from './WatchlistFilterToolbar';
import {
  useCustomWatchlists,
  useCustomWatchlistStocks,
  useDeleteCustomWatchlist,
  useDeleteWatchlistItem,
  useEnsureWatchlistItem,
  useIdxCatalog,
  useRemoveStockFromCustomWatchlist,
  useSyncAllWatchlist,
  useSyncIdxCatalog,
  useWatchlist,
} from './useWatchlist';

type ActiveTab = { kind: 'all' } | { kind: 'my_stocks' } | { kind: 'custom'; groupId: string };

function parseOptionalNumericFilter(raw: string): number | undefined {
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  const num = Number(trimmed);
  return Number.isFinite(num) ? num : undefined;
}

function mapWatchlistItemToMarket(
  item: WatchlistItemDto,
  customWatchlistIds: string[],
): MarketStockDto {
  return {
    watchlistItemId: item.id,
    ticker: item.ticker,
    companyName: item.companyName,
    sector: item.sector,
    currentPrice: item.currentPrice,
    openPrice: item.openPrice,
    dailyChange: item.dailyChange,
    dailyChangePct: item.dailyChangePct,
    ownedLots: item.ownedLots,
    avgBuyPrice: item.avgBuyPrice,
    holdingTranches: item.holdingTranches,
    targetBuyPrice: item.targetBuyPrice,
    investmentThesis: item.investmentThesis,
    updatedAt: item.updatedAt,
    isStale: item.isStale,
    fundamentals: item.fundamentals,
    valuation: item.valuation,
    quality: item.quality,
    customWatchlistIds,
  };
}

export function WatchlistPage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const { hideBalances } = usePrivacy();
  const { calcMode } = useCalcMode();
  const { showToast } = useToast();

  // Default to Portfolio (my_stocks) with compact collapsed Allocation X-Ray
  const [activeTab, setActiveTab] = useState<ActiveTab>({ kind: 'my_stocks' });
  const [showXray, setShowXray] = useState(false);

  // Screener & filter controls
  const [search, setSearch] = useState('');
  const [sector, setSector] = useState<IdxSector | ''>('');
  const [valuationStatus, setValuationStatus] = useState<ValuationStatusFilter | ''>('');
  const [qualityGrade, setQualityGrade] = useState<QualityGradeFilter | ''>('');
  const [minFqsInput, setMinFqsInput] = useState('');
  const [mosPreset, setMosPreset] = useState<MosPreset>('any');
  const [minMosInput, setMinMosInput] = useState('');
  const [maxMosInput, setMaxMosInput] = useState('');
  const [sort, setSort] = useState<CatalogSortOption>('mos_desc');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Modals & action states
  const [stockModalOpen, setStockModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<WatchlistItemDto | null>(null);
  const [prefillStock, setPrefillStock] = useState<MarketStockDto | null>(null);
  const [deletingPersonalStock, setDeletingPersonalStock] = useState<MarketStockDto | null>(null);

  const [customModalOpen, setCustomModalOpen] = useState(false);
  const [editingGroup, setEditingGroup] = useState<CustomWatchlistGroupDto | null>(null);
  const [initialTickerForNewGroup, setInitialTickerForNewGroup] = useState<string | null>(null);
  const [deletingGroup, setDeletingGroup] = useState<CustomWatchlistGroupDto | null>(null);
  const [openingTicker, setOpeningTicker] = useState<string | null>(null);

  const debouncedSearch = useDebouncedValue(search.trim(), 220);
  const debouncedMinMos = useDebouncedValue(parseOptionalNumericFilter(minMosInput), 250);
  const debouncedMaxMos = useDebouncedValue(parseOptionalNumericFilter(maxMosInput), 250);
  const debouncedMinFqs = useDebouncedValue(parseOptionalNumericFilter(minFqsInput), 250);

  // Queries (auto-refresh every 3 minutes while tab is visible)
  const { data: personalItems, isLoading: isPersonalLoading } = useWatchlist();
  const { data: customGroups = [], isLoading: isGroupsLoading } = useCustomWatchlists();

  const activeCustomGroupId = activeTab.kind === 'custom' ? activeTab.groupId : null;
  const activeCustomGroup = useMemo(
    () => customGroups.find((g) => g.id === activeCustomGroupId) ?? null,
    [customGroups, activeCustomGroupId],
  );

  const {
    data: catalogData,
    isLoading: isCatalogLoading,
    isFetching: isCatalogFetching,
    isError: isCatalogError,
  } = useIdxCatalog({
    search: activeTab.kind === 'all' ? debouncedSearch || undefined : undefined,
    sector: activeTab.kind === 'all' ? sector || undefined : undefined,
    valuationStatus: activeTab.kind === 'all' ? valuationStatus || undefined : undefined,
    qualityGrade: activeTab.kind === 'all' ? qualityGrade || undefined : undefined,
    minFqs: activeTab.kind === 'all' ? debouncedMinFqs : undefined,
    minMos: activeTab.kind === 'all' ? debouncedMinMos : undefined,
    maxMos: activeTab.kind === 'all' ? debouncedMaxMos : undefined,
    sort: activeTab.kind === 'all' ? sort : 'mos_desc',
    page: activeTab.kind === 'all' ? page : 1,
    pageSize: activeTab.kind === 'all' ? pageSize : 10,
  });

  const {
    data: customStocksData,
    isLoading: isCustomStocksLoading,
    isError: isCustomStocksError,
  } = useCustomWatchlistStocks(activeCustomGroupId, {
    search: debouncedSearch || undefined,
    sector: sector || undefined,
    valuationStatus: valuationStatus || undefined,
    qualityGrade: qualityGrade || undefined,
    minFqs: debouncedMinFqs,
    minMos: debouncedMinMos,
    maxMos: debouncedMaxMos,
    sort,
  });

  // Mutations
  const syncCatalogMutation = useSyncIdxCatalog();
  const syncAllMutation = useSyncAllWatchlist();
  const ensureItemMutation = useEnsureWatchlistItem();
  const deleteItemMutation = useDeleteWatchlistItem();
  const deleteGroupMutation = useDeleteCustomWatchlist();
  const removeFromGroupMutation = useRemoveStockFromCustomWatchlist();

  const tickerMembershipMap = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const g of customGroups) {
      for (const ticker of g.tickers) {
        const list = map.get(ticker) ?? [];
        list.push(g.id);
        map.set(ticker, list);
      }
    }
    return map;
  }, [customGroups]);

  const { personalItemById, personalItemByTicker } = useMemo(() => {
    const byId = new Map<string, WatchlistItemDto>();
    const byTicker = new Map<string, WatchlistItemDto>();
    for (const item of personalItems ?? []) {
      byId.set(item.id, item);
      byTicker.set(item.ticker, item);
    }
    return { personalItemById: byId, personalItemByTicker: byTicker };
  }, [personalItems]);

  const { myStocksAll, kpis, portfolioRisk } = useMemo(() => {
    const list = personalItems ?? [];
    const owned = list.filter((i) => i.ownedLots > 0);
    let portfolioMarketValue = 0;
    let totalInvestedCapital = 0;

    for (const item of owned) {
      const pos = calculatePositionSummary(
        item.ownedLots,
        item.avgBuyPrice,
        item.currentPrice,
        DEFAULT_BUY_FEE_PCT,
        DEFAULT_SELL_FEE_PCT,
        calcMode,
      );
      portfolioMarketValue += pos.marketValue;
      totalInvestedCapital += pos.costBasis;
    }

    const totalNetPnL =
      totalInvestedCapital > 0 ? portfolioMarketValue - totalInvestedCapital : null;
    const totalNetPnLPct =
      totalNetPnL !== null && totalInvestedCapital > 0
        ? Math.round((totalNetPnL / totalInvestedCapital) * 10000) / 100
        : null;

    const risk = analyzePortfolioRisk(
      owned.map((i) => ({
        ticker: i.ticker,
        companyName: i.companyName,
        sector: i.sector,
        ownedLots: i.ownedLots,
        avgBuyPrice: i.avgBuyPrice,
        currentPrice: i.currentPrice,
      })),
      calcMode,
    );

    return {
      myStocksAll: owned,
      kpis: {
        myStocksCount: owned.length,
        portfolioMarketValue,
        totalInvestedCapital,
        totalNetPnL,
        totalNetPnLPct,
      },
      portfolioRisk: risk,
    };
  }, [personalItems, calcMode]);

  const filteredMyStocks = useMemo(() => {
    let list = myStocksAll.map((item) =>
      mapWatchlistItemToMarket(item, tickerMembershipMap.get(item.ticker) ?? []),
    );
    if (sector) {
      list = list.filter((i) => i.sector === sector);
    }
    if (debouncedSearch) {
      const needle = debouncedSearch.toLowerCase();
      list = list.filter(
        (i) =>
          i.ticker.toLowerCase().includes(needle) ||
          i.companyName.toLowerCase().includes(needle),
      );
    }
    if (valuationStatus) {
      list = list.filter((i) => i.valuation.valuationStatus === valuationStatus);
    }
    if (qualityGrade) {
      list = list.filter((i) => i.quality.grade === qualityGrade);
    }
    if (debouncedMinFqs !== undefined) {
      list = list.filter((i) => i.quality.score !== null && i.quality.score >= debouncedMinFqs);
    }
    if (debouncedMinMos !== undefined) {
      list = list.filter(
        (i) => i.valuation.mosPct !== null && i.valuation.mosPct >= debouncedMinMos,
      );
    }
    if (debouncedMaxMos !== undefined) {
      list = list.filter(
        (i) => i.valuation.mosPct !== null && i.valuation.mosPct <= debouncedMaxMos,
      );
    }

    const sorted = [...list];
    sorted.sort((a, b) => {
      if (sort === 'mos_desc') {
        return (b.valuation.mosPct ?? -Infinity) - (a.valuation.mosPct ?? -Infinity);
      }
      if (sort === 'mos_asc') {
        return (a.valuation.mosPct ?? Infinity) - (b.valuation.mosPct ?? Infinity);
      }
      if (sort === 'fqs_desc') {
        return (b.quality.score ?? -Infinity) - (a.quality.score ?? -Infinity);
      }
      if (sort === 'qarp_desc') {
        const scoreA =
          a.quality.score !== null && a.valuation.mosPct !== null
            ? a.quality.score * 0.6 + Math.max(-50, Math.min(80, a.valuation.mosPct)) * 0.4
            : -Infinity;
        const scoreB =
          b.quality.score !== null && b.valuation.mosPct !== null
            ? b.quality.score * 0.6 + Math.max(-50, Math.min(80, b.valuation.mosPct)) * 0.4
            : -Infinity;
        return scoreB - scoreA;
      }
      if (sort === 'ticker_asc') return a.ticker.localeCompare(b.ticker);
      if (sort === 'ticker_desc') return b.ticker.localeCompare(a.ticker);
      if (sort === 'price_asc') return a.currentPrice - b.currentPrice;
      if (sort === 'price_desc') return b.currentPrice - a.currentPrice;
      if (sort === 'fair_value_desc') {
        return (
          (b.valuation.fairValue.moderate ?? -Infinity) -
          (a.valuation.fairValue.moderate ?? -Infinity)
        );
      }
      return a.ticker.localeCompare(b.ticker);
    });
    return sorted;
  }, [
    myStocksAll,
    tickerMembershipMap,
    sector,
    debouncedSearch,
    valuationStatus,
    qualityGrade,
    debouncedMinFqs,
    debouncedMinMos,
    debouncedMaxMos,
    sort,
  ]);

  const applyMosPreset = (preset: MosPreset) => {
    setMosPreset(preset);
    setPage(1);
    if (preset === 'any') {
      setMinMosInput('');
      setMaxMosInput('');
    } else if (preset === 'gte50') {
      setMinMosInput('50');
      setMaxMosInput('');
    } else if (preset === 'gte30') {
      setMinMosInput('30');
      setMaxMosInput('');
    } else if (preset === 'gte15') {
      setMinMosInput('15');
      setMaxMosInput('');
    } else if (preset === 'fair0to30') {
      setMinMosInput('0');
      setMaxMosInput('29.99');
    } else if (preset === 'lt0') {
      setMinMosInput('');
      setMaxMosInput('-0.01');
    }
  };

  const resetFilters = () => {
    setSearch('');
    setSector('');
    setValuationStatus('');
    setQualityGrade('');
    setMinFqsInput('');
    setMosPreset('any');
    setMinMosInput('');
    setMaxMosInput('');
    setPage(1);
  };

  const hasActiveFilters =
    search.trim() !== '' ||
    sector !== '' ||
    valuationStatus !== '' ||
    qualityGrade !== '' ||
    minFqsInput.trim() !== '' ||
    minMosInput.trim() !== '' ||
    maxMosInput.trim() !== '';

  const switchTab = (next: ActiveTab) => {
    setActiveTab(next);
    setPage(1);
  };

  const handleSyncCatalog = () => {
    syncCatalogMutation.mutate(undefined, {
      onSuccess: () => showToast(t.watchlist.toastSyncDone, 'success'),
      onError: () => showToast(t.watchlist.toastSyncFailed, 'error'),
    });
  };

  const handleSyncAll = () => {
    syncAllMutation.mutate(undefined, {
      onSuccess: () => showToast(t.watchlist.toastSyncDone, 'success'),
      onError: () => showToast(t.watchlist.toastSyncFailed, 'error'),
    });
  };

  const handleOpenDetail = async (stock: MarketStockDto) => {
    if (stock.watchlistItemId) {
      navigate(`/watchlist/${stock.watchlistItemId}`);
      return;
    }
    setOpeningTicker(stock.ticker);
    try {
      const ensured = await ensureItemMutation.mutateAsync(stock.ticker);
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
      const ensured = await ensureItemMutation.mutateAsync(stock.ticker);
      navigate(`/simulator?stockId=${ensured.id}`);
    } catch {
      showToast(t.common.unexpectedError, 'error');
    } finally {
      setOpeningTicker(null);
    }
  };

  const handleOpenEditStock = (stock: MarketStockDto) => {
    const existing =
      (stock.watchlistItemId ? personalItemById.get(stock.watchlistItemId) : undefined) ??
      personalItemByTicker.get(stock.ticker) ??
      null;
    if (existing) {
      setEditingItem(existing);
      setPrefillStock(null);
      setStockModalOpen(true);
      return;
    }
    setEditingItem(null);
    setPrefillStock(stock);
    setStockModalOpen(true);
  };

  const handleOpenManualAdd = () => {
    setEditingItem(null);
    setPrefillStock(null);
    setStockModalOpen(true);
  };

  const handleOpenCreateWatchlist = (ticker?: string) => {
    setEditingGroup(null);
    setInitialTickerForNewGroup(ticker ?? null);
    setCustomModalOpen(true);
  };

  const handleOpenEditWatchlist = (group: CustomWatchlistGroupDto) => {
    setEditingGroup(group);
    setInitialTickerForNewGroup(null);
    setCustomModalOpen(true);
  };

  const confirmDeletePersonal = async () => {
    if (!deletingPersonalStock?.watchlistItemId) return;
    try {
      await deleteItemMutation.mutateAsync(deletingPersonalStock.watchlistItemId);
      setDeletingPersonalStock(null);
      showToast(t.watchlist.toastDeletedStock, 'info');
    } catch {
      showToast(t.common.unexpectedError, 'error');
    }
  };

  const confirmDeleteGroup = async () => {
    if (!deletingGroup) return;
    const deletedId = deletingGroup.id;
    try {
      await deleteGroupMutation.mutateAsync(deletedId);
      setDeletingGroup(null);
      if (activeTab.kind === 'custom' && activeTab.groupId === deletedId) {
        setActiveTab({ kind: 'my_stocks' });
      }
      showToast(t.watchlist.toastDeletedGroup, 'info');
    } catch {
      showToast(t.common.unexpectedError, 'error');
    }
  };

  const handleRemoveFromCustom = async (ticker: string) => {
    if (!activeCustomGroupId) return;
    try {
      await removeFromGroupMutation.mutateAsync({ groupId: activeCustomGroupId, ticker });
      showToast(t.watchlist.toastSavedToWatchlist, 'info');
    } catch {
      showToast(t.common.unexpectedError, 'error');
    }
  };

  const summary = catalogData?.summary;
  const pagination = catalogData?.pagination;
  const isUndervaluedQuickFilterActive =
    activeTab.kind === 'all' && valuationStatus === 'UNDERVALUED';

  const activeRows: MarketStockDto[] =
    activeTab.kind === 'all'
      ? (catalogData?.items ?? [])
      : activeTab.kind === 'my_stocks'
        ? filteredMyStocks
        : (customStocksData?.items ?? []);

  const isTableLoading =
    activeTab.kind === 'all'
      ? isCatalogLoading
      : activeTab.kind === 'my_stocks'
        ? isPersonalLoading
        : isCustomStocksLoading;

  const isTableError =
    activeTab.kind === 'all'
      ? isCatalogError
      : activeTab.kind === 'custom'
        ? isCustomStocksError
        : false;

  return (
    <div className="space-y-8">
      {/* SECTION 1: Portfolio Summary & Collapsible Allocation X-Ray */}
      <PortfolioOverviewSection
        kpis={kpis}
        portfolioRisk={portfolioRisk}
        summary={summary}
        customGroupsCount={customGroups.length}
        isPersonalLoading={isPersonalLoading}
        isCatalogLoading={isCatalogLoading}
        isMyStocksTabActive={activeTab.kind === 'my_stocks'}
        isUndervaluedQuickFilterActive={isUndervaluedQuickFilterActive}
        showXray={showXray}
        onToggleXray={() => setShowXray((v) => !v)}
        onToggleMyStocksTab={() =>
          switchTab(activeTab.kind === 'my_stocks' ? { kind: 'all' } : { kind: 'my_stocks' })
        }
        onToggleUndervaluedFilter={() => {
          if (isUndervaluedQuickFilterActive) {
            setValuationStatus('');
          } else {
            setActiveTab({ kind: 'all' });
            setValuationStatus('UNDERVALUED');
            setPage(1);
          }
        }}
      />

      {/* SECTION 2: Grouped Watchlist Workspace */}
      <section className="space-y-4 animate-fade-up" aria-label={t.watchlist.sectionWatchlist}>
        {/* Group Navigation Rail */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
          <div
            className="flex flex-wrap items-center gap-1.5"
            role="tablist"
            aria-label="Watchlist groups"
          >
            {/* 1. Portfolio (My Stocks) */}
            <button
              type="button"
              role="tab"
              aria-selected={activeTab.kind === 'my_stocks'}
              onClick={() => switchTab({ kind: 'my_stocks' })}
              className={cn(
                'inline-flex h-9 items-center gap-2 rounded-lg border px-3 text-xs font-semibold transition-all cursor-pointer',
                activeTab.kind === 'my_stocks'
                  ? 'border-brand-600/50 bg-brand-solid text-white shadow-xs'
                  : 'border-border bg-panel text-ink hover:border-brand-600/40 hover:bg-brand-50/50',
              )}
            >
              <Briefcase className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span>{t.watchlist.tabMyStocks}</span>
              <span
                className={cn(
                  'rounded-md px-1.5 py-0.5 font-mono text-[10px] tabular-nums',
                  activeTab.kind === 'my_stocks'
                    ? 'bg-white/20 text-white'
                    : 'bg-subtle text-muted',
                )}
              >
                {kpis.myStocksCount}
              </span>
            </button>

            {/* 2. All IHSG */}
            <button
              type="button"
              role="tab"
              aria-selected={activeTab.kind === 'all'}
              onClick={() => switchTab({ kind: 'all' })}
              className={cn(
                'inline-flex h-9 items-center gap-2 rounded-lg border px-3 text-xs font-semibold transition-all cursor-pointer',
                activeTab.kind === 'all'
                  ? 'border-brand-600/50 bg-brand-solid text-white shadow-xs'
                  : 'border-border bg-panel text-ink hover:border-brand-600/40 hover:bg-brand-50/50',
              )}
            >
              <Globe className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span>{t.watchlist.tabAllStocks}</span>
              <span
                className={cn(
                  'rounded-md px-1.5 py-0.5 font-mono text-[10px] tabular-nums',
                  activeTab.kind === 'all' ? 'bg-white/20 text-white' : 'bg-subtle text-muted',
                )}
              >
                {summary?.totalStocks ?? 0}
              </span>
            </button>

            {/* Visual Divider before Custom Watchlists */}
            <span className="mx-1 hidden h-5 w-px bg-border sm:inline-block" aria-hidden="true" />

            {/* 3. Custom Watchlist Tabs */}
            {isGroupsLoading ? (
              <Skeleton className="h-9 w-28" />
            ) : (
              customGroups.map((group) => {
                const isSelected = activeTab.kind === 'custom' && activeTab.groupId === group.id;
                return (
                  <button
                    key={group.id}
                    type="button"
                    role="tab"
                    aria-selected={isSelected}
                    onClick={() => switchTab({ kind: 'custom', groupId: group.id })}
                    className={cn(
                      'inline-flex h-9 items-center gap-2 rounded-lg border px-3 text-xs font-semibold transition-all cursor-pointer',
                      isSelected
                        ? 'border-brand-600/50 bg-brand-solid text-white shadow-xs'
                        : 'border-border bg-panel text-ink hover:border-brand-600/40 hover:bg-brand-50/50',
                    )}
                  >
                    <Bookmark className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    <span className="max-w-[140px] truncate">{group.name}</span>
                    <span
                      className={cn(
                        'rounded-md px-1.5 py-0.5 font-mono text-[10px] tabular-nums',
                        isSelected ? 'bg-white/20 text-white' : 'bg-subtle text-muted',
                      )}
                    >
                      {group.stockCount}
                    </span>
                  </button>
                );
              })
            )}

            <Button
              variant="outlineBrand"
              size="sm"
              onClick={() => handleOpenCreateWatchlist()}
              className="h-9"
            >
              <FolderPlus className="h-3.5 w-3.5" aria-hidden="true" />
              {t.watchlist.createWatchlistBtn}
            </Button>
          </div>
        </div>

        {/* Contextual Group Header + Actions */}
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-display text-base font-bold tracking-tight text-ink sm:text-lg">
                {activeTab.kind === 'all'
                  ? t.watchlist.tabAllStocks
                  : activeTab.kind === 'my_stocks'
                    ? t.watchlist.tabMyStocks
                    : (activeCustomGroup?.name ?? t.watchlist.tabCustomGroupLabel)}
              </h2>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-positive-600/30 bg-positive-50 px-2 py-0.5 text-[10px] font-semibold text-positive-700">
                <span className="h-1.5 w-1.5 rounded-full bg-positive-600" aria-hidden="true" />
                {t.common.autoSyncBadge}
              </span>
              {activeTab.kind === 'all' && isCatalogFetching && !isCatalogLoading && (
                <RefreshCw className="h-3.5 w-3.5 animate-spin text-muted" aria-hidden="true" />
              )}
            </div>
            <p className="mt-0.5 text-xs text-muted">
              {activeTab.kind === 'all'
                ? t.watchlist.allStocksSub
                : activeTab.kind === 'my_stocks'
                  ? t.watchlist.myStocksSub
                  : activeCustomGroup?.description || t.watchlist.customWatchlistSub}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {activeTab.kind === 'all' && (
              <Button variant="outlineBrand" size="sm" onClick={handleOpenManualAdd}>
                <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                {t.watchlist.addStock}
              </Button>
            )}

            {activeTab.kind === 'my_stocks' && (
              <>
                {kpis.myStocksCount > 0 && (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={handleSyncAll}
                    disabled={syncAllMutation.isPending}
                  >
                    <RefreshCw
                      className={`h-3.5 w-3.5 ${syncAllMutation.isPending ? 'animate-spin' : ''}`}
                      aria-hidden="true"
                    />
                    {syncAllMutation.isPending ? t.watchlist.syncingAll : t.watchlist.syncAllBtn}
                  </Button>
                )}
                <Button variant="outlineBrand" size="sm" onClick={handleOpenManualAdd}>
                  <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                  {t.watchlist.addStock}
                </Button>
              </>
            )}

            {activeTab.kind === 'custom' && activeCustomGroup && (
              <>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => handleOpenEditWatchlist(activeCustomGroup)}
                >
                  <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                  {t.watchlist.renameWatchlist}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setDeletingGroup(activeCustomGroup)}
                  className="text-negative-600 hover:bg-negative-50 hover:text-negative-700"
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                  {t.watchlist.deleteWatchlist}
                </Button>
              </>
            )}
          </div>
        </div>

        {/* Quick Add Bar inside Custom Watchlist */}
        {activeTab.kind === 'custom' && activeCustomGroup && (
          <CustomWatchlistQuickAdd group={activeCustomGroup} />
        )}

        {/* Filter & Sort Toolbar (hide on empty my_stocks without filters to keep onboarding ultra-clean) */}
        {(activeTab.kind !== 'my_stocks' || kpis.myStocksCount > 0 || hasActiveFilters) && (
          <WatchlistFilterToolbar
            search={search}
            onSearchChange={(val) => {
              setSearch(val);
              setPage(1);
            }}
            sector={sector}
            onSectorChange={(val) => {
              setSector(val);
              setPage(1);
            }}
            sort={sort}
            onSortChange={(val) => {
              setSort(val);
              setPage(1);
            }}
            valuationStatus={valuationStatus}
            onValuationStatusChange={(val) => {
              setValuationStatus(val);
              setPage(1);
            }}
            qualityGrade={qualityGrade}
            onQualityGradeChange={(val) => {
              setQualityGrade(val);
              setPage(1);
            }}
            minFqsInput={minFqsInput}
            onMinFqsChange={(val) => {
              setMinFqsInput(val);
              setPage(1);
            }}
            mosPreset={mosPreset}
            onApplyMosPreset={applyMosPreset}
            minMosInput={minMosInput}
            maxMosInput={maxMosInput}
            onMinMosChange={(val) => {
              setMinMosInput(val);
              setMosPreset(val.trim() || maxMosInput.trim() ? 'custom' : 'any');
              setPage(1);
            }}
            onMaxMosChange={(val) => {
              setMaxMosInput(val);
              setMosPreset(minMosInput.trim() || val.trim() ? 'custom' : 'any');
              setPage(1);
            }}
            showCounts={activeTab.kind === 'all'}
            summary={summary}
            hasActiveFilters={hasActiveFilters}
            onResetFilters={resetFilters}
          />
        )}

        {/* Error / Loading / Data Table */}
        {isTableError && (
          <div className="flex items-center gap-3 rounded-xl border border-negative-600/25 bg-negative-50 px-5 py-3 text-sm text-negative-700">
            <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{t.common.unexpectedError}</span>
          </div>
        )}

        {isTableLoading ? (
          <Card variant="default" className="space-y-3 p-5">
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </Card>
        ) : activeRows.length === 0 ? (
          <div className="rounded-xl border border-border bg-panel px-6 py-12 text-center surface-elevated">
            <h3 className="font-display text-base font-bold text-ink">
              {activeTab.kind === 'my_stocks'
                ? t.watchlist.emptyPortfolioTitle
                : activeTab.kind === 'custom'
                  ? t.watchlist.emptyCustomTitle
                  : t.watchlist.emptyAllStocksTitle}
            </h3>
            <p className="mx-auto mt-1.5 max-w-md text-sm text-muted">
              {activeTab.kind === 'my_stocks'
                ? t.watchlist.emptyPortfolioBody
                : activeTab.kind === 'custom'
                  ? t.watchlist.emptyCustomBody
                  : t.watchlist.emptyAllStocksBody}
            </p>
            <div className="mt-5 flex flex-wrap items-center justify-center gap-2.5">
              {hasActiveFilters && (
                <Button variant="secondary" onClick={resetFilters}>
                  <RotateCcw className="h-4 w-4" aria-hidden="true" />
                  {t.watchlist.resetFilters}
                </Button>
              )}
              {activeTab.kind === 'all' && !hasActiveFilters && (
                <Button
                  variant="outlineBrand"
                  onClick={handleSyncCatalog}
                  disabled={syncCatalogMutation.isPending}
                >
                  <RefreshCw
                    className={`h-4 w-4 ${syncCatalogMutation.isPending ? 'animate-spin' : ''}`}
                    aria-hidden="true"
                  />
                  {t.watchlist.syncIhsgBtn}
                </Button>
              )}
              {activeTab.kind === 'my_stocks' && !hasActiveFilters && (
                <>
                  <Link
                    to="/radar"
                    className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-brand-solid px-4 text-sm font-semibold text-white shadow-xs transition-all hover:bg-brand-solid-hover"
                  >
                    <Radar className="h-4 w-4" aria-hidden="true" />
                    {t.watchlist.openRadarCta}
                  </Link>
                  <Button variant="outlineBrand" onClick={handleOpenManualAdd}>
                    <Plus className="h-4 w-4" aria-hidden="true" />
                    {t.watchlist.addFirstStockCta}
                  </Button>
                  <Button variant="ghost" onClick={() => switchTab({ kind: 'all' })}>
                    <Globe className="h-4 w-4" aria-hidden="true" />
                    {t.watchlist.tabAllStocks}
                  </Button>
                </>
              )}
            </div>
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-border bg-panel surface-elevated">
            <MarketStockTable
              items={activeRows}
              tabKind={activeTab.kind}
              sector={sector}
              onToggleSector={(next) => {
                setSector(next);
                setPage(1);
              }}
              hideBalances={hideBalances}
              customGroups={customGroups}
              openingTicker={openingTicker}
              onOpenDetail={handleOpenDetail}
              onOpenSimulator={handleOpenSimulator}
              onEdit={handleOpenEditStock}
              onDeletePersonal={setDeletingPersonalStock}
              onRemoveFromCustom={handleRemoveFromCustom}
              onCreateWatchlistWithTicker={(ticker) => handleOpenCreateWatchlist(ticker)}
            />

            {/* Pagination Footer for All Stocks */}
            {activeTab.kind === 'all' && pagination && pagination.totalItems > 0 && (
              <div className="flex flex-col items-center justify-between gap-3 border-t border-border bg-subtle/40 px-4 py-3 sm:flex-row sm:px-5">
                <div className="flex flex-wrap items-center justify-center gap-3 text-xs text-muted">
                  <span className="font-mono tabular-nums">
                    {t.watchlist.paginationShowing}{' '}
                    <strong className="text-ink">
                      {(pagination.page - 1) * pagination.pageSize + 1}-
                      {Math.min(pagination.page * pagination.pageSize, pagination.totalItems)}
                    </strong>{' '}
                    {t.watchlist.paginationOf}{' '}
                    <strong className="text-ink">{formatNumber(pagination.totalItems)}</strong>{' '}
                    {t.watchlist.paginationStocks}
                  </span>

                  <Select
                    value={String(pageSize)}
                    onChange={(e) => {
                      setPageSize(Number(e.target.value));
                      setPage(1);
                    }}
                    aria-label={t.watchlist.paginationPerPage}
                    className="h-8 w-32 px-2 text-xs"
                  >
                    <option value="10">10 {t.common.perPageShort}</option>
                    <option value="50">50 {t.common.perPageShort}</option>
                    <option value="100">100 {t.common.perPageShort}</option>
                  </Select>
                </div>

                <div className="flex items-center gap-1.5">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={pagination.page <= 1}
                    className="h-8 px-2.5 text-xs"
                  >
                    <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
                    {t.watchlist.paginationPrev}
                  </Button>
                  <span className="px-2 font-mono text-xs font-semibold text-ink tabular-nums">
                    {pagination.page} / {pagination.totalPages}
                  </span>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}
                    disabled={pagination.page >= pagination.totalPages}
                    className="h-8 px-2.5 text-xs"
                  >
                    {t.watchlist.paginationNext}
                    <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </section>

      {/* Modals */}
      <StockFormModal
        open={stockModalOpen}
        onClose={() => {
          setStockModalOpen(false);
          setEditingItem(null);
          setPrefillStock(null);
        }}
        editingItem={editingItem}
        prefillStock={prefillStock}
      />

      <CustomWatchlistModal
        open={customModalOpen}
        onClose={() => {
          setCustomModalOpen(false);
          setEditingGroup(null);
          setInitialTickerForNewGroup(null);
        }}
        editingGroup={editingGroup}
        initialTicker={initialTickerForNewGroup}
        onCreated={(created) => {
          switchTab({ kind: 'custom', groupId: created.id });
        }}
      />

      <Modal
        open={Boolean(deletingPersonalStock)}
        onClose={() => setDeletingPersonalStock(null)}
        title={`${t.common.confirmDelete}: ${deletingPersonalStock?.ticker ?? ''}`}
        maxWidthClass="max-w-md"
      >
        <p className="text-sm text-muted">{t.watchlist.deletePrompt}</p>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setDeletingPersonalStock(null)}>
            {t.common.cancel}
          </Button>
          <Button
            variant="danger"
            onClick={confirmDeletePersonal}
            disabled={deleteItemMutation.isPending}
          >
            {t.common.delete}
          </Button>
        </div>
      </Modal>

      <Modal
        open={Boolean(deletingGroup)}
        onClose={() => setDeletingGroup(null)}
        title={`${t.watchlist.deleteWatchlist}: ${deletingGroup?.name ?? ''}`}
        maxWidthClass="max-w-md"
      >
        <p className="text-sm text-muted">{t.watchlist.deleteWatchlistPrompt}</p>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setDeletingGroup(null)}>
            {t.common.cancel}
          </Button>
          <Button
            variant="danger"
            onClick={confirmDeleteGroup}
            disabled={deleteGroupMutation.isPending}
          >
            {t.common.delete}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
