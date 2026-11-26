import {
  AlertCircle,
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  Bookmark,
  Briefcase,
  Calculator,
  Clock,
  Eye,
  EyeOff,
  Layers,
  Pencil,
  PieChart,
  Plus,
  RefreshCw,
  Search,
  ShieldAlert,
  Sparkles,
  Trash2,
  TrendingUp,
  Wallet,
  X,
} from 'lucide-react';
import { useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import type { WatchlistItemDto } from '@/shared/contracts';
import {
  analyzePortfolioRisk,
  calculatePositionSummary,
  IDX_SECTORS,
  type IdxSector,
  type ValuationStatus,
} from '@/shared/domain';
import {
  Badge,
  Button,
  Card,
  cn,
  Input,
  Modal,
  RolePill,
  SectionHeader,
  Select,
  Skeleton,
  TermTooltip,
  type BadgeTone,
} from '@/client/components/ui/primitives';
import { useI18n } from '@/client/i18n/useI18n';
import { ApiClientError } from '@/client/lib/apiClient';
import { formatIdr, formatNumber, formatPercent } from '@/client/lib/formatters';
import { MASKED_IDR, MASKED_LOTS, usePrivacy } from '@/client/lib/usePrivacy';
import { PortfolioRiskXrayCard } from './PortfolioRiskXrayCard';
import { StockFormModal } from './StockFormModal';
import {
  useCreateWatchlistItem,
  useDeleteWatchlistItem,
  useFetchIdxQuote,
  useSyncAllWatchlist,
  useWatchlist,
} from './useWatchlist';

export function statusTone(status: ValuationStatus): BadgeTone {
  if (status === 'UNDERVALUED') return 'positive';
  if (status === 'FAIRLY_VALUED') return 'warning';
  if (status === 'OVERVALUED') return 'negative';
  return 'neutral';
}

type ViewFilter = 'all' | 'portfolio' | 'watching' | 'undervalued';

interface WatchlistTableProps {
  items: WatchlistItemDto[];
  mode: 'portfolio' | 'watching' | 'mixed';
  sector: IdxSector | '';
  onToggleSector: (next: IdxSector | '') => void;
  hideBalances: boolean;
  onEdit: (item: WatchlistItemDto) => void;
  onDelete: (item: WatchlistItemDto) => void;
}

function WatchlistTable({
  items,
  mode,
  sector,
  onToggleSector,
  hideBalances,
  onEdit,
  onDelete,
}: WatchlistTableProps) {
  const { t } = useI18n();

  return (
    <div className="w-full overflow-x-auto">
      <table className="w-full min-w-[880px] table-fixed border-collapse text-left text-sm">
        <colgroup>
          <col className="w-[20%]" />
          <col className="w-[15%]" />
          <col className="w-[11%]" />
          <col className="w-[11%]" />
          <col className="w-[15%]" />
          <col className="w-[17%]" />
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
            <th className="px-3 py-3 text-right">
              {mode === 'watching' ? (
                <span>{t.watchlist.colTargetBuy}</span>
              ) : (
                <TermTooltip
                  label={t.watchlist.colPosition}
                  definition={t.glossary.unrealizedPnL}
                />
              )}
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

            return (
              <tr
                key={item.id}
                className="group transition-colors duration-150 hover:bg-brand-50/40"
              >
                {/* Symbol + Company Name */}
                <td className="py-3.5 pr-3 pl-5 align-middle">
                  <div className="flex items-center gap-2">
                    <Link
                      to={`/watchlist/${item.id}`}
                      className="font-mono text-sm font-bold tracking-tight text-ink transition-colors group-hover:text-brand-700"
                    >
                      {item.ticker}
                    </Link>
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
                  className={`px-3 py-3.5 text-right align-middle font-mono text-sm font-bold tabular-nums ${priceColor}`}
                >
                  {formatIdr(item.currentPrice)}
                </td>

                {/* Moderate Fair Value */}
                <td className="px-3 py-3.5 text-right align-middle font-mono text-sm font-semibold text-ink tabular-nums">
                  {formatIdr(item.valuation.fairValue.moderate)}
                </td>

                {/* Margin of Safety + Valuation Verdict Badge */}
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
                            @{formatNumber(pos.avgBuyPrice)}
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

                {/* Compact Icon-Only Actions */}
                <td className="py-3.5 pr-5 pl-2 align-middle">
                  <div className="flex items-center justify-end gap-1">
                    <Link
                      to={`/simulator?stockId=${item.id}`}
                      title={t.watchlist.simulate}
                      aria-label={t.watchlist.simulate}
                      className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-brand-600/35 bg-brand-50/70 text-brand-700 transition-colors hover:border-brand-solid hover:bg-brand-solid hover:text-white"
                    >
                      <Calculator className="h-3.5 w-3.5" aria-hidden="true" />
                    </Link>
                    <Link
                      to={`/watchlist/${item.id}`}
                      title={t.watchlist.analyze}
                      aria-label={t.watchlist.analyze}
                      className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted transition-colors hover:bg-subtle hover:text-ink"
                    >
                      <BarChart3 className="h-3.5 w-3.5" aria-hidden="true" />
                    </Link>
                    <button
                      type="button"
                      onClick={() => onEdit(item)}
                      title={t.common.edit}
                      aria-label={t.common.edit}
                      className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted transition-colors hover:bg-subtle hover:text-ink cursor-pointer"
                    >
                      <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onDelete(item)}
                      title={t.common.delete}
                      aria-label={t.common.delete}
                      className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted transition-colors hover:bg-negative-50 hover:text-negative-600 cursor-pointer"
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
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
  const { t } = useI18n();
  const { hideBalances, toggleHideBalances } = usePrivacy();
  const [search, setSearch] = useState('');
  const [sector, setSector] = useState<IdxSector | ''>('');
  const [sort, setSort] = useState<'updated_desc' | 'mos_desc' | 'ticker_asc'>('updated_desc');
  const [viewFilter, setViewFilter] = useState<ViewFilter>('all');
  const [showXray, setShowXray] = useState(true);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<WatchlistItemDto | null>(null);
  const [deletingItem, setDeletingItem] = useState<WatchlistItemDto | null>(null);
  const [quickTicker, setQuickTicker] = useState('');
  const [quickError, setQuickError] = useState<string | null>(null);

  const { data: items, isLoading, isError } = useWatchlist({
    search: search.trim() || undefined,
    sector: sector || undefined,
    sort,
  });

  const deleteMutation = useDeleteWatchlistItem();
  const fetchQuoteMutation = useFetchIdxQuote();
  const createMutation = useCreateWatchlistItem();
  const syncAllMutation = useSyncAllWatchlist();
  const isQuickAdding = fetchQuoteMutation.isPending || createMutation.isPending;

  const handleQuickAdd = async (e: FormEvent) => {
    e.preventDefault();
    setQuickError(null);
    const clean = quickTicker.trim().toUpperCase();
    if (!/^[A-Z]{4}$/.test(clean)) {
      setQuickError('Must be a 4-letter IDX symbol (e.g. BBCA)');
      return;
    }

    try {
      const quote = await fetchQuoteMutation.mutateAsync(clean);
      await createMutation.mutateAsync({
        ticker: quote.ticker,
        companyName: quote.companyName,
        sector: quote.sector,
        currentPrice: quote.currentPrice,
        ownedLots: 0,
        fundamentals: {
          periodLabel: quote.periodLabel,
          eps: quote.fundamentals.eps,
          bvps: quote.fundamentals.bvps,
          dps: quote.fundamentals.dps,
          roePct: quote.fundamentals.roePct,
          der: quote.fundamentals.der,
          epsGrowthPct: quote.fundamentals.epsGrowthPct,
          targetPer: quote.fundamentals.targetPer,
          targetPbv: quote.fundamentals.targetPbv,
          discountRatePct: 12,
          projectionYears: 5,
          terminalGrowthPct: 4,
          dividendGrowthPct: null,
        },
      });
      setQuickTicker('');
    } catch (err) {
      if (err instanceof ApiClientError) {
        setQuickError(err.message);
      } else {
        setQuickError(t.common.unexpectedError);
      }
    }
  };

  const { portfolioItems, watchingItems, kpis } = useMemo(() => {
    const list = items ?? [];
    const owned: WatchlistItemDto[] = [];
    const watching: WatchlistItemDto[] = [];
    let portfolioMarketValue = 0;
    let totalInvestedCapital = 0;

    for (const item of list) {
      if (item.ownedLots > 0) {
        owned.push(item);
        const pos = calculatePositionSummary(item.ownedLots, item.avgBuyPrice, item.currentPrice);
        portfolioMarketValue += pos.marketValue;
        totalInvestedCapital += pos.costBasis;
      } else {
        watching.push(item);
      }
    }

    const totalNetPnL =
      totalInvestedCapital > 0 ? portfolioMarketValue - totalInvestedCapital : null;
    const totalNetPnLPct =
      totalNetPnL !== null && totalInvestedCapital > 0
        ? Math.round((totalNetPnL / totalInvestedCapital) * 10000) / 100
        : null;

    return {
      portfolioItems: owned,
      watchingItems: watching,
      kpis: {
        total: list.length,
        portfolioCount: owned.length,
        watchingCount: watching.length,
        undervalued: list.filter((i) => i.valuation.valuationStatus === 'UNDERVALUED').length,
        portfolioMarketValue,
        totalInvestedCapital,
        totalNetPnL,
        totalNetPnLPct,
        stale: list.filter((i) => i.isStale).length,
      },
    };
  }, [items]);

  const portfolioRisk = useMemo(() => {
    const list = items ?? [];
    return analyzePortfolioRisk(
      list.map((i) => ({
        ticker: i.ticker,
        companyName: i.companyName,
        sector: i.sector,
        ownedLots: i.ownedLots,
        avgBuyPrice: i.avgBuyPrice,
        currentPrice: i.currentPrice,
      })),
    );
  }, [items]);

  const filteredItems = useMemo(() => {
    const list = items ?? [];
    if (viewFilter === 'portfolio') return portfolioItems;
    if (viewFilter === 'watching') return watchingItems;
    if (viewFilter === 'undervalued') {
      return list.filter((i) => i.valuation.valuationStatus === 'UNDERVALUED');
    }
    return list;
  }, [items, portfolioItems, watchingItems, viewFilter]);

  const openAdd = () => {
    setEditingItem(null);
    setModalOpen(true);
  };

  const openEdit = (item: WatchlistItemDto) => {
    setEditingItem(item);
    setModalOpen(true);
  };

  const confirmDelete = async () => {
    if (!deletingItem) return;
    await deleteMutation.mutateAsync(deletingItem.id);
    setDeletingItem(null);
  };

  const showSplitSections = viewFilter === 'all' && (items?.length ?? 0) > 0;

  return (
    <div className="space-y-8">
      {/* GROUP 1: Portfolio & Market Overview (Display / Auto-Calculated) */}
      <section className="space-y-4 animate-fade-up" aria-label={t.watchlist.sectionOverview}>
        <SectionHeader
          title={t.watchlist.sectionOverview}
          subtitle={t.watchlist.sectionOverviewSub}
          role="calculated"
          roleLabel={t.common.calculatedTag}
        />

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
          {/* Primary Portfolio Financial Display Card */}
          <Card variant="display" className="border-t-2 border-t-brand-600 p-5 lg:col-span-7">
            <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
              <div>
                <div className="flex items-center gap-2 text-xs font-semibold text-muted">
                  <span className="flex h-6 w-6 items-center justify-center rounded-md bg-brand-50 text-brand-700">
                    <Wallet className="h-3.5 w-3.5" aria-hidden="true" />
                  </span>
                  <TermTooltip
                    label={t.watchlist.kpiPositions}
                    definition={t.glossary.netMarketValue}
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
                  {isLoading ? (
                    <Skeleton className="h-9 w-44" />
                  ) : hideBalances ? (
                    MASKED_IDR
                  ) : (
                    formatIdr(kpis.portfolioMarketValue)
                  )}
                </div>
              </div>

              {!isLoading && kpis.totalNetPnL !== null && (
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
                      label={t.watchlist.kpiTotalPnL}
                      definition={t.glossary.unrealizedPnL}
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
                  label={t.watchlist.kpiInvested}
                  definition={t.glossary.totalInvested}
                />
                <span className="font-mono text-sm font-bold text-ink tabular-nums">
                  {isLoading ? (
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
                  onClick={() => setViewFilter(viewFilter === 'portfolio' ? 'all' : 'portfolio')}
                  aria-pressed={viewFilter === 'portfolio'}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold transition-colors cursor-pointer',
                    viewFilter === 'portfolio'
                      ? 'border-brand-600/40 bg-brand-50 text-brand-700'
                      : 'border-border bg-panel text-ink hover:border-brand-600/40 hover:bg-brand-50 hover:text-brand-700',
                  )}
                >
                  <Briefcase className="h-3.5 w-3.5 text-brand-600" aria-hidden="true" />
                  <span className="font-mono">{kpis.portfolioCount}</span>
                  <span>{t.watchlist.pillPortfolio}</span>
                </button>
              </div>
            </div>
          </Card>

          {/* Secondary Insight Cards */}
          <div className="grid grid-cols-2 gap-4 lg:col-span-5">
            <button
              type="button"
              onClick={() => setViewFilter(viewFilter === 'undervalued' ? 'all' : 'undervalued')}
              title={t.watchlist.filterByUndervaluedHint}
              aria-pressed={viewFilter === 'undervalued'}
              className={cn(
                'flex flex-col justify-between rounded-xl border p-5 text-left transition-all cursor-pointer surface-interactive',
                viewFilter === 'undervalued'
                  ? 'border-positive-600 bg-positive-50/60'
                  : 'border-border bg-display hover:bg-panel',
              )}
            >
              <div className="flex w-full items-center justify-between">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-positive-50 text-positive-600">
                  <TrendingUp className="h-4 w-4" aria-hidden="true" />
                </span>
                {viewFilter === 'undervalued' && <Badge tone="positive">Active</Badge>}
              </div>
              <div className="mt-4">
                <div className="text-xs font-medium text-muted">
                  <TermTooltip
                    label={t.watchlist.kpiUndervalued}
                    definition={t.glossary.marginOfSafety}
                  />
                </div>
                <div className="mt-1 font-mono text-3xl font-bold text-positive-600 tabular-nums">
                  {isLoading ? <Skeleton className="h-8 w-12" /> : kpis.undervalued}
                </div>
              </div>
            </button>

            <Card variant="display" className="flex flex-col justify-between p-5">
              <div className="flex items-center justify-between">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-subtle text-ink">
                  <Layers className="h-4 w-4" aria-hidden="true" />
                </span>
                {!isLoading && kpis.stale > 0 && (
                  <Badge tone="warning">
                    <Clock className="h-3 w-3" aria-hidden="true" />
                    {kpis.stale} {t.watchlist.staleBadge}
                  </Badge>
                )}
              </div>
              <div className="mt-4">
                <div className="text-xs font-medium text-muted">{t.watchlist.kpiTotal}</div>
                <div className="mt-1 font-mono text-3xl font-bold text-ink tabular-nums">
                  {isLoading ? <Skeleton className="h-8 w-12" /> : kpis.total}
                </div>
                {!isLoading && (
                  <div className="mt-1 font-mono text-[11px] text-muted tabular-nums">
                    {kpis.portfolioCount} {t.watchlist.pillPortfolio} · {kpis.watchingCount}{' '}
                    {t.watchlist.pillWatching}
                  </div>
                )}
              </div>
            </Card>
          </div>
        </div>

        {/* Portfolio Risk & Sector Allocation X-Ray (Display Card) */}
        {!isLoading && showXray && portfolioRisk.activeHoldingsCount > 0 && (
          <PortfolioRiskXrayCard risk={portfolioRisk} />
        )}
      </section>

      {/* GROUP 2: Watchlist Actions (Editable) & Separated Portfolio / Watchlist-Only Lists */}
      <section className="space-y-4 animate-fade-up" aria-label={t.watchlist.sectionWatchlist}>
        <SectionHeader
          title={t.watchlist.sectionWatchlist}
          subtitle={t.watchlist.sectionWatchlistSub}
          action={
            <div className="flex flex-wrap items-center gap-2">
              {items && items.length > 0 && (
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
              <Button variant="outlineBrand" size="sm" onClick={openAdd}>
                <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                {t.watchlist.addStock}
              </Button>
            </div>
          }
        />

        {/* Quick Add Editable Strip */}
        <Card variant="editable" className="p-4">
          <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-ink">{t.watchlist.quickAddLabel}</span>
              <RolePill role="editable" label={t.common.editableTag} />
            </div>
            <span className="text-[11px] text-muted">{t.watchlist.quickAddHint}</span>
          </div>

          <form onSubmit={handleQuickAdd} className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="relative flex-1 max-w-md">
              <Plus
                className="pointer-events-none absolute top-1/2 left-2.5 h-4 w-4 -translate-y-1/2 text-brand-600"
                aria-hidden="true"
              />
              <Input
                type="text"
                maxLength={4}
                aria-label={t.watchlist.quickAddLabel}
                placeholder={t.watchlist.quickAddPlaceholder}
                value={quickTicker}
                onChange={(e) => {
                  setQuickTicker(e.target.value.toUpperCase());
                  if (quickError) setQuickError(null);
                }}
                disabled={isQuickAdding}
                className="pl-8 font-mono uppercase placeholder:font-sans placeholder:normal-case"
              />
            </div>
            <Button
              type="submit"
              size="md"
              disabled={isQuickAdding || quickTicker.trim().length < 4}
              className="shrink-0"
            >
              <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
              {isQuickAdding ? t.watchlist.quickAdding : t.watchlist.quickAddBtn}
            </Button>
          </form>

          {quickError && (
            <p className="mt-2 text-xs text-negative-600" role="alert">
              {quickError}
            </p>
          )}
        </Card>

        {/* Filter & Search Bar */}
        <div className="flex flex-col gap-3 rounded-xl border border-border bg-panel px-4 py-3 sm:px-5 lg:flex-row lg:items-center lg:justify-between surface-elevated">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setViewFilter('all')}
              aria-pressed={viewFilter === 'all'}
              className={cn(
                'inline-flex h-8 items-center gap-1.5 rounded-full border px-3.5 text-xs font-semibold transition-all cursor-pointer',
                viewFilter === 'all'
                  ? 'border-brand-600 bg-brand-50 text-brand-700'
                  : 'border-border bg-surface text-muted hover:border-muted/50 hover:text-ink',
              )}
            >
              {t.watchlist.pillAll}
              <span className="font-mono text-[11px] opacity-80">({kpis.total})</span>
            </button>
            <button
              type="button"
              onClick={() => setViewFilter('portfolio')}
              aria-pressed={viewFilter === 'portfolio'}
              className={cn(
                'inline-flex h-8 items-center gap-1.5 rounded-full border px-3.5 text-xs font-semibold transition-all cursor-pointer',
                viewFilter === 'portfolio'
                  ? 'border-brand-600 bg-brand-50 text-brand-700'
                  : 'border-border bg-surface text-muted hover:border-muted/50 hover:text-ink',
              )}
            >
              <Briefcase className="h-3.5 w-3.5" aria-hidden="true" />
              {t.watchlist.pillPortfolio}
              <span className="font-mono text-[11px] opacity-80">({kpis.portfolioCount})</span>
            </button>
            <button
              type="button"
              onClick={() => setViewFilter('watching')}
              aria-pressed={viewFilter === 'watching'}
              className={cn(
                'inline-flex h-8 items-center gap-1.5 rounded-full border px-3.5 text-xs font-semibold transition-all cursor-pointer',
                viewFilter === 'watching'
                  ? 'border-brand-600 bg-brand-50 text-brand-700'
                  : 'border-border bg-surface text-muted hover:border-muted/50 hover:text-ink',
              )}
            >
              <Bookmark className="h-3.5 w-3.5" aria-hidden="true" />
              {t.watchlist.pillWatching}
              <span className="font-mono text-[11px] opacity-80">({kpis.watchingCount})</span>
            </button>
            <button
              type="button"
              onClick={() => setViewFilter('undervalued')}
              aria-pressed={viewFilter === 'undervalued'}
              className={cn(
                'inline-flex h-8 items-center gap-1.5 rounded-full border px-3.5 text-xs font-semibold transition-all cursor-pointer',
                viewFilter === 'undervalued'
                  ? 'border-brand-600 bg-brand-50 text-brand-700'
                  : 'border-border bg-surface text-muted hover:border-muted/50 hover:text-ink',
              )}
            >
              {t.watchlist.pillUndervalued}
              <span className="font-mono text-[11px] opacity-80">({kpis.undervalued})</span>
            </button>

            {sector && (
              <button
                type="button"
                onClick={() => setSector('')}
                title={t.watchlist.clearSectorFilter}
                className="inline-flex h-8 items-center gap-1 rounded-full border border-brand-600/40 bg-brand-50 px-2.5 text-xs font-semibold text-brand-700 transition-colors hover:bg-brand-100 cursor-pointer"
              >
                <span>{t.sectors[sector]}</span>
                <X className="h-3 w-3" aria-hidden="true" />
              </button>
            )}
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="relative sm:w-44">
              <Search
                className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-muted"
                aria-hidden="true"
              />
              <Input
                placeholder={t.watchlist.searchPlaceholder}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-8 pl-8 text-xs"
              />
            </div>
            <Select
              value={sector}
              onChange={(e) => setSector(e.target.value as IdxSector | '')}
              className="h-8 text-xs sm:w-44"
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
              onChange={(e) =>
                setSort(e.target.value as 'updated_desc' | 'mos_desc' | 'ticker_asc')
              }
              className="h-8 text-xs sm:w-44"
              aria-label="Sort watchlist"
            >
              <option value="updated_desc">{t.watchlist.sortUpdated}</option>
              <option value="mos_desc">{t.watchlist.sortMosDesc}</option>
              <option value="ticker_asc">{t.watchlist.sortTickerAsc}</option>
            </Select>
          </div>
        </div>

        {/* Error / Loading / Tables */}
        {isError && (
          <div className="flex items-center gap-3 rounded-xl border border-negative-600/25 bg-negative-50 px-5 py-3 text-sm text-negative-700">
            <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{t.common.unexpectedError}</span>
          </div>
        )}

        {isLoading ? (
          <Card variant="default" className="space-y-3 p-5">
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </Card>
        ) : showSplitSections ? (
          /* Separated Portfolio vs Watchlist-Only (Non-Portfolio) Containers */
          <div className="space-y-5">
            {/* Section A: My Portfolio (Owned Holdings) */}
            <div className="overflow-hidden rounded-xl border border-brand-600/30 bg-panel surface-elevated">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-brand-50/45 px-5 py-3">
                <div className="flex items-center gap-2.5">
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-solid text-white">
                    <Briefcase className="h-3.5 w-3.5" aria-hidden="true" />
                  </span>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-display text-sm font-bold text-ink">
                        {t.watchlist.groupPortfolioTitle}
                      </h3>
                      <Badge tone="info">{portfolioItems.length}</Badge>
                    </div>
                    <p className="text-[11px] text-muted">{t.watchlist.groupPortfolioSub}</p>
                  </div>
                </div>
              </div>

              {portfolioItems.length === 0 ? (
                <div className="px-6 py-8 text-center">
                  <p className="text-sm font-semibold text-ink">
                    {t.watchlist.emptyPortfolioTitle}
                  </p>
                  <p className="mx-auto mt-1 max-w-md text-xs text-muted">
                    {t.watchlist.emptyPortfolioBody}
                  </p>
                </div>
              ) : (
                <WatchlistTable
                  items={portfolioItems}
                  mode="portfolio"
                  sector={sector}
                  onToggleSector={setSector}
                  hideBalances={hideBalances}
                  onEdit={openEdit}
                  onDelete={setDeletingItem}
                />
              )}
            </div>

            {/* Section B: Watchlist Only (Non-Portfolio) */}
            <div className="overflow-hidden rounded-xl border border-border bg-panel surface-elevated">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-display px-5 py-3">
                <div className="flex items-center gap-2.5">
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-subtle text-ink">
                    <Bookmark className="h-3.5 w-3.5" aria-hidden="true" />
                  </span>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-display text-sm font-bold text-ink">
                        {t.watchlist.groupWatchingTitle}
                      </h3>
                      <Badge tone="neutral">{watchingItems.length}</Badge>
                    </div>
                    <p className="text-[11px] text-muted">{t.watchlist.groupWatchingSub}</p>
                  </div>
                </div>
              </div>

              {watchingItems.length === 0 ? (
                <div className="px-6 py-8 text-center">
                  <p className="text-sm font-semibold text-ink">
                    {t.watchlist.emptyWatchingTitle}
                  </p>
                  <p className="mx-auto mt-1 max-w-md text-xs text-muted">
                    {t.watchlist.emptyWatchingBody}
                  </p>
                </div>
              ) : (
                <WatchlistTable
                  items={watchingItems}
                  mode="watching"
                  sector={sector}
                  onToggleSector={setSector}
                  hideBalances={hideBalances}
                  onEdit={openEdit}
                  onDelete={setDeletingItem}
                />
              )}
            </div>
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="rounded-xl border border-border bg-panel px-6 py-14 text-center surface-elevated">
            <h3 className="font-display text-base font-bold text-ink">
              {viewFilter === 'portfolio'
                ? t.watchlist.emptyPortfolioTitle
                : viewFilter === 'watching'
                  ? t.watchlist.emptyWatchingTitle
                  : t.watchlist.emptyTitle}
            </h3>
            <p className="mx-auto mt-1 max-w-md text-sm text-muted">
              {viewFilter === 'portfolio'
                ? t.watchlist.emptyPortfolioBody
                : viewFilter === 'watching'
                  ? t.watchlist.emptyWatchingBody
                  : t.watchlist.emptyBody}
            </p>
            <Button variant="outlineBrand" className="mt-5" onClick={openAdd}>
              <Plus className="h-4 w-4" aria-hidden="true" />
              {t.watchlist.emptyAction}
            </Button>
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-border bg-panel surface-elevated">
            <WatchlistTable
              items={filteredItems}
              mode={
                viewFilter === 'portfolio'
                  ? 'portfolio'
                  : viewFilter === 'watching'
                    ? 'watching'
                    : 'mixed'
              }
              sector={sector}
              onToggleSector={setSector}
              hideBalances={hideBalances}
              onEdit={openEdit}
              onDelete={setDeletingItem}
            />
          </div>
        )}
      </section>

      <StockFormModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        editingItem={editingItem}
      />

      <Modal
        open={Boolean(deletingItem)}
        onClose={() => setDeletingItem(null)}
        title={`${t.common.confirmDelete}: ${deletingItem?.ticker ?? ''}`}
        maxWidthClass="max-w-md"
      >
        <p className="text-sm text-muted">{t.watchlist.deletePrompt}</p>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setDeletingItem(null)}>
            {t.common.cancel}
          </Button>
          <Button
            variant="danger"
            onClick={confirmDelete}
            disabled={deleteMutation.isPending}
          >
            {t.common.delete}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
