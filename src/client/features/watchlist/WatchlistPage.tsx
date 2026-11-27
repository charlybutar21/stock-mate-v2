import {
  AlertCircle,
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  Bookmark,
  Briefcase,
  Calculator,
  ChevronLeft,
  ChevronRight,
  Clock,
  Eye,
  EyeOff,
  Filter,
  FolderPlus,
  Globe,
  Layers,
  Pencil,
  PieChart,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldAlert,
  Trash2,
  TrendingUp,
  Wallet,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import type {
  CatalogSortOption,
  CustomWatchlistGroupDto,
  MarketStockDto,
  ValuationStatusFilter,
  WatchlistItemDto,
} from '@/shared/contracts';
import {
  analyzePortfolioRisk,
  calculatePositionSummary,
  DEFAULT_BUY_FEE_PCT,
  DEFAULT_SELL_FEE_PCT,
  IDX_SECTORS,
  type IdxSector,
  type ValuationStatus,
} from '@/shared/domain';
import { CalcModeSwitcher } from '@/client/components/ui/CalcModeSwitcher';
import {
  Badge,
  Button,
  Card,
  cn,
  Input,
  Modal,
  SectionHeader,
  Select,
  Skeleton,
  TermTooltip,
  type BadgeTone,
} from '@/client/components/ui/primitives';
import { useI18n } from '@/client/i18n/useI18n';
import { formatIdr, formatNumber, formatPercent, formatShortDate } from '@/client/lib/formatters';
import { useCalcMode } from '@/client/lib/useCalcMode';
import { MASKED_IDR, MASKED_LOTS, usePrivacy } from '@/client/lib/usePrivacy';
import { AddToWatchlistMenu } from './AddToWatchlistMenu';
import { CustomWatchlistModal } from './CustomWatchlistModal';
import { CustomWatchlistQuickAdd } from './CustomWatchlistQuickAdd';
import { PortfolioRiskXrayCard } from './PortfolioRiskXrayCard';
import { StockFormModal } from './StockFormModal';
import { QualityScoreBadge } from '@/client/features/radar/QualityScoreBadge';
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

export function statusTone(status: ValuationStatus): BadgeTone {
  if (status === 'UNDERVALUED') return 'positive';
  if (status === 'FAIRLY_VALUED') return 'warning';
  if (status === 'OVERVALUED') return 'negative';
  return 'neutral';
}

type ActiveTab = { kind: 'all' } | { kind: 'my_stocks' } | { kind: 'custom'; groupId: string };
type MosPreset = 'any' | 'gte50' | 'gte30' | 'gte15' | 'fair0to30' | 'lt0' | 'custom';

function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}

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

interface MarketStockTableProps {
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

function MarketStockTable({
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
    <div className="w-full overflow-x-auto">
      <table className="w-full min-w-[960px] table-fixed border-collapse text-left text-sm">
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
                  ? 'text-positive-600'
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
                        className="inline-flex items-center text-warning-600"
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
                            @{formatNumber(pos.avgBuyPrice, Number.isInteger(pos.avgBuyPrice) ? 0 : 2)}
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
  );
}

export function WatchlistPage() {
  const { t, lang } = useI18n();
  const navigate = useNavigate();
  const { hideBalances, toggleHideBalances } = usePrivacy();
  const { calcMode, isBrokerGross } = useCalcMode();

  const [activeTab, setActiveTab] = useState<ActiveTab>({ kind: 'all' });
  const [showXray, setShowXray] = useState(true);

  // Screener & filter controls
  const [search, setSearch] = useState('');
  const [sector, setSector] = useState<IdxSector | ''>('');
  const [valuationStatus, setValuationStatus] = useState<ValuationStatusFilter | ''>('');
  const [mosPreset, setMosPreset] = useState<MosPreset>('any');
  const [minMosInput, setMinMosInput] = useState('');
  const [maxMosInput, setMaxMosInput] = useState('');
  const [sort, setSort] = useState<CatalogSortOption>('mos_desc');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);

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

  // Queries
  const { data: personalItems, isLoading: isPersonalLoading } = useWatchlist();
  const { data: customGroups = [], isLoading: isGroupsLoading } = useCustomWatchlists();

  const activeCustomGroupId = activeTab.kind === 'custom' ? activeTab.groupId : null;
  const activeCustomGroup = useMemo(
    () => customGroups.find((g) => g.id === activeCustomGroupId) ?? null,
    [customGroups, activeCustomGroupId],
  );

  // Always keep catalog summary fresh (lightweight when on another tab: still cached for 2 min)
  const {
    data: catalogData,
    isLoading: isCatalogLoading,
    isFetching: isCatalogFetching,
    isError: isCatalogError,
  } = useIdxCatalog({
    search: activeTab.kind === 'all' ? debouncedSearch || undefined : undefined,
    sector: activeTab.kind === 'all' ? sector || undefined : undefined,
    valuationStatus: activeTab.kind === 'all' ? valuationStatus || undefined : undefined,
    minMos: activeTab.kind === 'all' ? debouncedMinMos : undefined,
    maxMos: activeTab.kind === 'all' ? debouncedMaxMos : undefined,
    sort: activeTab.kind === 'all' ? sort : 'mos_desc',
    page: activeTab.kind === 'all' ? page : 1,
    pageSize: activeTab.kind === 'all' ? pageSize : 25,
  });

  const {
    data: customStocksData,
    isLoading: isCustomStocksLoading,
    isError: isCustomStocksError,
  } = useCustomWatchlistStocks(activeCustomGroupId, {
    search: debouncedSearch || undefined,
    sector: sector || undefined,
    valuationStatus: valuationStatus || undefined,
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

  // Map ticker -> customWatchlistIds for My Stocks table
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

  // Owned positions ("My Stocks") + Portfolio KPIs
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

  // Filtered & sorted My Stocks view
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
    const sorted = [...list];
    sorted.sort((a, b) => {
      if (sort === 'mos_desc') {
        return (b.valuation.mosPct ?? -Infinity) - (a.valuation.mosPct ?? -Infinity);
      }
      if (sort === 'mos_asc') {
        return (a.valuation.mosPct ?? Infinity) - (b.valuation.mosPct ?? Infinity);
      }
      if (sort === 'ticker_asc') return a.ticker.localeCompare(b.ticker);
      if (sort === 'ticker_desc') return b.ticker.localeCompare(a.ticker);
      if (sort === 'price_asc') return a.currentPrice - b.currentPrice;
      if (sort === 'price_desc') return b.currentPrice - a.currentPrice;
      if (sort === 'fair_value_desc') {
        return (b.valuation.fairValue.moderate ?? -Infinity) - (a.valuation.fairValue.moderate ?? -Infinity);
      }
      return a.ticker.localeCompare(b.ticker);
    });
    return sorted;
  }, [myStocksAll, tickerMembershipMap, sector, debouncedSearch, sort]);

  // Filter helpers
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
    setMosPreset('any');
    setMinMosInput('');
    setMaxMosInput('');
    setPage(1);
  };

  const hasActiveFilters =
    search.trim() !== '' ||
    sector !== '' ||
    valuationStatus !== '' ||
    minMosInput.trim() !== '' ||
    maxMosInput.trim() !== '';

  const switchTab = (next: ActiveTab) => {
    setActiveTab(next);
    setPage(1);
  };

  // Row Actions
  const handleOpenDetail = async (stock: MarketStockDto) => {
    if (stock.watchlistItemId) {
      navigate(`/watchlist/${stock.watchlistItemId}`);
      return;
    }
    setOpeningTicker(stock.ticker);
    try {
      const ensured = await ensureItemMutation.mutateAsync(stock.ticker);
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
      const ensured = await ensureItemMutation.mutateAsync(stock.ticker);
      navigate(`/simulator?stockId=${ensured.id}`);
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
    await deleteItemMutation.mutateAsync(deletingPersonalStock.watchlistItemId);
    setDeletingPersonalStock(null);
  };

  const confirmDeleteGroup = async () => {
    if (!deletingGroup) return;
    const deletedId = deletingGroup.id;
    await deleteGroupMutation.mutateAsync(deletedId);
    setDeletingGroup(null);
    if (activeTab.kind === 'custom' && activeTab.groupId === deletedId) {
      setActiveTab({ kind: 'all' });
    }
  };

  const handleRemoveFromCustom = async (ticker: string) => {
    if (!activeCustomGroupId) return;
    await removeFromGroupMutation.mutateAsync({ groupId: activeCustomGroupId, ticker });
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

  const showValuationScreener = activeTab.kind === 'all' || activeTab.kind === 'custom';

  return (
    <div className="space-y-8">
      {/* SECTION 1: Portfolio Summary (Auto-Calculated from My Stocks) */}
      <section className="space-y-4 animate-fade-up" aria-label={t.watchlist.sectionOverview}>
        <SectionHeader
          title={t.watchlist.sectionOverview}
          subtitle={t.watchlist.sectionOverviewSub}
          role="calculated"
          roleLabel={t.common.calculatedTag}
          action={<CalcModeSwitcher />}
        />

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
          {/* Primary Portfolio Display Card */}
          <Card variant="display" className="border-t-2 border-t-brand-600 p-5 lg:col-span-7">
            <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
              <div>
                <div className="flex items-center gap-2 text-xs font-semibold text-muted">
                  <span className="flex h-6 w-6 items-center justify-center rounded-md bg-brand-50 text-brand-700">
                    <Wallet className="h-3.5 w-3.5" aria-hidden="true" />
                  </span>
                  <TermTooltip
                    label={isBrokerGross ? t.watchlist.kpiPositionsGross : t.watchlist.kpiPositions}
                    definition={
                      isBrokerGross ? t.glossary.grossMarketValue : t.glossary.netMarketValue
                    }
                  />
                  <button
                    type="button"
                    onClick={toggleHideBalances}
                    title={hideBalances ? t.watchlist.showBalances : t.watchlist.hideBalances}
                    aria-label={hideBalances ? t.watchlist.showBalances : t.watchlist.hideBalances}
                    className="inline-flex h-6 w-6 items-center justify-center rounded-md text-muted transition-colors hover:bg-subtle hover:text-ink cursor-pointer"
                  >
                    {hideBalances ? (
                      <EyeOff className="h-3.5 w-3.5" aria-hidden="true" />
                    ) : (
                      <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                    )}
                  </button>
                </div>
                <div className="mt-2 font-mono text-3xl font-bold tracking-tight text-ink tabular-nums">
                  {isPersonalLoading ? (
                    <Skeleton className="h-9 w-44" />
                  ) : hideBalances ? (
                    MASKED_IDR
                  ) : (
                    formatIdr(kpis.portfolioMarketValue)
                  )}
                </div>
              </div>

              {!isPersonalLoading && kpis.totalNetPnL !== null && (
                <div
                  className={cn(
                    'inline-flex flex-col items-start rounded-lg border px-3.5 py-2 sm:items-end',
                    kpis.totalNetPnL >= 0
                      ? 'border-positive-600/25 bg-positive-50 text-positive-700'
                      : 'border-negative-600/25 bg-negative-50 text-negative-700',
                  )}
                >
                  <span className="text-[11px] font-medium opacity-90">
                    <TermTooltip
                      label={
                        isBrokerGross ? t.watchlist.kpiTotalPnLGross : t.watchlist.kpiTotalPnL
                      }
                      definition={
                        isBrokerGross ? t.glossary.grossUnrealizedPnL : t.glossary.unrealizedPnL
                      }
                      className="border-current/40 hover:text-current"
                    />
                  </span>
                  <div className="mt-0.5 flex items-center gap-1 font-mono text-sm font-bold tabular-nums">
                    {kpis.totalNetPnL >= 0 ? (
                      <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
                    ) : (
                      <ArrowDownRight className="h-4 w-4" aria-hidden="true" />
                    )}
                    <span>
                      {hideBalances
                        ? MASKED_IDR
                        : `${kpis.totalNetPnL >= 0 ? '+' : ''}${formatIdr(kpis.totalNetPnL)}`}
                    </span>
                    <span className="text-xs font-semibold opacity-90">
                      ({formatPercent(kpis.totalNetPnLPct, true)})
                    </span>
                  </div>
                </div>
              )}
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border/80 pt-3.5">
              <div className="flex items-center gap-2 text-xs text-muted">
                <TermTooltip
                  label={isBrokerGross ? t.watchlist.kpiInvestedGross : t.watchlist.kpiInvested}
                  definition={
                    isBrokerGross ? t.glossary.grossTotalInvested : t.glossary.totalInvested
                  }
                />
                <span className="font-mono text-sm font-bold text-ink tabular-nums">
                  {isPersonalLoading ? (
                    <Skeleton className="inline-block h-4 w-28" />
                  ) : hideBalances ? (
                    MASKED_IDR
                  ) : (
                    formatIdr(kpis.totalInvestedCapital)
                  )}
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {portfolioRisk.activeHoldingsCount > 0 && (
                  <button
                    type="button"
                    onClick={() => setShowXray((v) => !v)}
                    aria-pressed={showXray}
                    className={cn(
                      'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold transition-colors cursor-pointer',
                      showXray
                        ? 'border-brand-600/40 bg-brand-50 text-brand-700'
                        : 'border-border bg-panel text-ink hover:border-brand-600/40 hover:bg-brand-50 hover:text-brand-700',
                    )}
                  >
                    <PieChart className="h-3.5 w-3.5 text-brand-600" aria-hidden="true" />
                    <span>{t.watchlist.xray.toggleBtn}</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() =>
                    switchTab(activeTab.kind === 'my_stocks' ? { kind: 'all' } : { kind: 'my_stocks' })
                  }
                  aria-pressed={activeTab.kind === 'my_stocks'}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold transition-colors cursor-pointer',
                    activeTab.kind === 'my_stocks'
                      ? 'border-brand-600/40 bg-brand-50 text-brand-700'
                      : 'border-border bg-panel text-ink hover:border-brand-600/40 hover:bg-brand-50 hover:text-brand-700',
                  )}
                >
                  <Briefcase className="h-3.5 w-3.5 text-brand-600" aria-hidden="true" />
                  <span className="font-mono">{kpis.myStocksCount}</span>
                  <span>{t.watchlist.tabMyStocks}</span>
                </button>
              </div>
            </div>
          </Card>

          {/* Secondary Insight Cards */}
          <div className="grid grid-cols-2 gap-4 lg:col-span-5">
            <button
              type="button"
              onClick={() => {
                if (isUndervaluedQuickFilterActive) {
                  setValuationStatus('');
                } else {
                  setActiveTab({ kind: 'all' });
                  setValuationStatus('UNDERVALUED');
                  setPage(1);
                }
              }}
              title={t.watchlist.filterByUndervaluedHint}
              aria-pressed={isUndervaluedQuickFilterActive}
              className={cn(
                'flex flex-col justify-between rounded-xl border p-5 text-left transition-all cursor-pointer surface-interactive',
                isUndervaluedQuickFilterActive
                  ? 'border-positive-600 bg-positive-50/60'
                  : 'border-border bg-display hover:bg-panel',
              )}
            >
              <div className="flex w-full items-center justify-between">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-positive-50 text-positive-600">
                  <TrendingUp className="h-4 w-4" aria-hidden="true" />
                </span>
                {isUndervaluedQuickFilterActive ? (
                  <Badge tone="positive">Active</Badge>
                ) : (
                  <span className="inline-flex items-center gap-1 text-[10px] font-semibold tracking-wide text-muted uppercase">
                    <Filter className="h-3 w-3" aria-hidden="true" />
                    Filter
                  </span>
                )}
              </div>
              <div className="mt-4">
                <div className="text-xs font-medium text-muted">
                  <TermTooltip
                    label={t.watchlist.kpiUndervalued}
                    definition={t.glossary.marginOfSafety}
                  />
                </div>
                <div className="mt-1 font-mono text-3xl font-bold text-positive-600 tabular-nums">
                  {isCatalogLoading && !summary ? (
                    <Skeleton className="h-8 w-14" />
                  ) : (
                    formatNumber(summary?.undervalued ?? 0)
                  )}
                </div>
              </div>
            </button>

            <Card variant="display" className="flex flex-col justify-between p-5">
              <div className="flex items-center justify-between">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-subtle text-ink">
                  <Layers className="h-4 w-4" aria-hidden="true" />
                </span>
                {summary?.lastSyncedAt && (
                  <span
                    className="inline-flex items-center gap-1 text-[10px] font-medium text-muted"
                    title={`${t.watchlist.lastSyncedPrefix}: ${formatShortDate(summary.lastSyncedAt, lang)}`}
                  >
                    <Clock className="h-3 w-3" aria-hidden="true" />
                    {formatShortDate(summary.lastSyncedAt, lang)}
                  </span>
                )}
              </div>
              <div className="mt-4">
                <div className="text-xs font-medium text-muted">{t.watchlist.kpiSyncedIhsg}</div>
                <div className="mt-1 font-mono text-3xl font-bold text-ink tabular-nums">
                  {isCatalogLoading && !summary ? (
                    <Skeleton className="h-8 w-14" />
                  ) : (
                    formatNumber(summary?.totalStocks ?? 0)
                  )}
                </div>
                {!isPersonalLoading && (
                  <div className="mt-1 font-mono text-[11px] text-muted tabular-nums">
                    {kpis.myStocksCount} {t.watchlist.tabMyStocks} · {customGroups.length}{' '}
                    {t.watchlist.tabCustomGroupLabel}
                  </div>
                )}
              </div>
            </Card>
          </div>
        </div>

        {/* Portfolio Risk & Sector Allocation X-Ray */}
        {!isPersonalLoading && showXray && portfolioRisk.activeHoldingsCount > 0 && (
          <PortfolioRiskXrayCard risk={portfolioRisk} />
        )}
      </section>

      {/* SECTION 2: Grouped Watchlist Workspace (All Stocks / My Stocks / Custom Watchlists) */}
      <section className="space-y-4 animate-fade-up" aria-label={t.watchlist.sectionWatchlist}>
        {/* Group Navigation Rail */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
          <div
            className="flex flex-wrap items-center gap-1.5"
            role="tablist"
            aria-label="Watchlist groups"
          >
            {/* 1. All Stocks (IHSG) */}
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

            {/* 2. My Stocks (Owned Positions) */}
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

            {/* + New Watchlist Button */}
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
              <>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => syncCatalogMutation.mutate()}
                  disabled={syncCatalogMutation.isPending}
                >
                  <RefreshCw
                    className={`h-3.5 w-3.5 ${syncCatalogMutation.isPending ? 'animate-spin' : ''}`}
                    aria-hidden="true"
                  />
                  {syncCatalogMutation.isPending
                    ? t.watchlist.syncingIhsg
                    : t.watchlist.syncIhsgBtn}
                </Button>
                <Button variant="outlineBrand" size="sm" onClick={handleOpenManualAdd}>
                  <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                  {t.watchlist.addStock}
                </Button>
              </>
            )}

            {activeTab.kind === 'my_stocks' && (
              <>
                {kpis.myStocksCount > 0 && (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => syncAllMutation.mutate()}
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

        {/* Quick Add Bar: ONLY shown inside Custom Watchlist view (never on All Stocks / My Stocks) */}
        {activeTab.kind === 'custom' && activeCustomGroup && (
          <CustomWatchlistQuickAdd group={activeCustomGroup} />
        )}

        {/* Filter, Valuation Screener, MoS Filter & Sort Toolbar */}
        <div className="space-y-3 rounded-xl border border-border bg-panel p-3.5 sm:px-4 surface-elevated">
          {/* Row 1: Search, Sector, Sort, Reset */}
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:flex lg:items-center">
            <div className="relative flex h-9 items-center sm:col-span-2 lg:min-w-0 lg:flex-1">
              <Search
                className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-muted"
                aria-hidden="true"
              />
              <Input
                placeholder={t.watchlist.searchPlaceholder}
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                className="h-9 pl-8 text-xs"
              />
            </div>

            <Select
              value={sector}
              onChange={(e) => {
                setSector(e.target.value as IdxSector | '');
                setPage(1);
              }}
              className={cn(
                'h-9 text-xs lg:w-48',
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
              onChange={(e) => {
                setSort(e.target.value as CatalogSortOption);
                setPage(1);
              }}
              className="h-9 text-xs lg:w-52"
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
                onClick={resetFilters}
                className="h-9 shrink-0 px-2.5 text-xs"
              >
                <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                {t.watchlist.resetFilters}
              </Button>
            )}
          </div>

          {/* Row 2: Valuation Status (Undervalued / Fairly Valued / Overvalued) + Margin of Safety Filter */}
          {showValuationScreener && (
            <div className="flex flex-col gap-3 border-t border-border/75 pt-3 xl:flex-row xl:items-center xl:justify-between">
              {/* Valuation Status Filter Pills */}
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
                      onClick={() => {
                        setValuationStatus(opt.value);
                        setPage(1);
                      }}
                      className={cn(
                        'inline-flex h-7 items-center gap-1.5 rounded-md border px-2.5 text-xs font-semibold transition-colors cursor-pointer',
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
                      {activeTab.kind === 'all' && opt.count !== undefined && (
                        <span className="font-mono text-[10px] opacity-80 tabular-nums">
                          {opt.count}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Margin of Safety (MoS %) Quick Presets + Custom Min/Max Range */}
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
                      onClick={() => applyMosPreset(presetKey)}
                      className={cn(
                        'inline-flex h-7 items-center rounded-md border px-2 text-[11px] font-semibold transition-colors cursor-pointer',
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
                    onChange={(e) => {
                      setMinMosInput(e.target.value);
                      setMosPreset(
                        e.target.value.trim() || maxMosInput.trim() ? 'custom' : 'any',
                      );
                      setPage(1);
                    }}
                    className="h-7 w-20 px-2 font-mono text-xs tabular-nums"
                  />
                  <span className="text-xs text-muted">-</span>
                  <Input
                    type="number"
                    step="1"
                    aria-label="Maximum Margin of Safety percent"
                    placeholder={t.watchlist.mosMaxPlaceholder}
                    value={maxMosInput}
                    onChange={(e) => {
                      setMaxMosInput(e.target.value);
                      setMosPreset(
                        minMosInput.trim() || e.target.value.trim() ? 'custom' : 'any',
                      );
                      setPage(1);
                    }}
                    className="h-7 w-20 px-2 font-mono text-xs tabular-nums"
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
                onClick={() => {
                  setSector('');
                  setPage(1);
                }}
                title={t.watchlist.clearSectorFilter}
                className="inline-flex h-7 items-center gap-1 rounded-md border border-brand-600/40 bg-brand-50 px-2.5 text-[11px] font-semibold text-brand-700 transition-colors hover:bg-brand-100 cursor-pointer"
              >
                <span>
                  {t.watchlist.colSector}: {t.sectors[sector]}
                </span>
                <X className="h-3 w-3" aria-hidden="true" />
              </button>
            </div>
          )}
        </div>

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
          <div className="rounded-xl border border-border bg-panel px-6 py-14 text-center surface-elevated">
            <h3 className="font-display text-base font-bold text-ink">
              {activeTab.kind === 'my_stocks'
                ? t.watchlist.emptyPortfolioTitle
                : activeTab.kind === 'custom'
                  ? t.watchlist.emptyCustomTitle
                  : t.watchlist.emptyAllStocksTitle}
            </h3>
            <p className="mx-auto mt-1 max-w-md text-sm text-muted">
              {activeTab.kind === 'my_stocks'
                ? t.watchlist.emptyPortfolioBody
                : activeTab.kind === 'custom'
                  ? t.watchlist.emptyCustomBody
                  : t.watchlist.emptyAllStocksBody}
            </p>
            <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
              {hasActiveFilters && (
                <Button variant="secondary" onClick={resetFilters}>
                  <RotateCcw className="h-4 w-4" aria-hidden="true" />
                  {t.watchlist.resetFilters}
                </Button>
              )}
              {activeTab.kind === 'all' && (
                <Button
                  variant="outlineBrand"
                  onClick={() => syncCatalogMutation.mutate()}
                  disabled={syncCatalogMutation.isPending}
                >
                  <RefreshCw
                    className={`h-4 w-4 ${syncCatalogMutation.isPending ? 'animate-spin' : ''}`}
                    aria-hidden="true"
                  />
                  {t.watchlist.syncIhsgBtn}
                </Button>
              )}
              {activeTab.kind === 'my_stocks' && (
                <Button variant="outlineBrand" onClick={() => switchTab({ kind: 'all' })}>
                  <Globe className="h-4 w-4" aria-hidden="true" />
                  {t.watchlist.tabAllStocks}
                </Button>
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
              <div className="flex flex-col items-center justify-between gap-3 border-t border-border bg-subtle/40 px-5 py-3 sm:flex-row">
                <div className="flex items-center gap-3 text-xs text-muted">
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
                    className="h-7 w-24 px-2 text-xs"
                  >
                    <option value="25">25 / pg</option>
                    <option value="50">50 / pg</option>
                    <option value="100">100 / pg</option>
                  </Select>
                </div>

                <div className="flex items-center gap-1.5">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={pagination.page <= 1}
                    className="h-7 px-2.5 text-xs"
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
                    className="h-7 px-2.5 text-xs"
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
