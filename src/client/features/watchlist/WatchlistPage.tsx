import {
  AlertCircle,
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  Briefcase,
  Calculator,
  Clock,
  Layers,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  Trash2,
  TrendingUp,
  Wallet,
} from 'lucide-react';
import { useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import type { WatchlistItemDto } from '@/shared/contracts';
import {
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
  Select,
  Skeleton,
  TermTooltip,
  TickerAvatar,
  type BadgeTone,
} from '@/client/components/ui/primitives';
import { useI18n } from '@/client/i18n/useI18n';
import { ApiClientError } from '@/client/lib/apiClient';
import { formatIdr, formatNumber, formatPercent } from '@/client/lib/formatters';
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

type ViewFilter = 'all' | 'portfolio' | 'undervalued';

export function WatchlistPage() {
  const { t } = useI18n();
  const [search, setSearch] = useState('');
  const [sector, setSector] = useState<IdxSector | ''>('');
  const [sort, setSort] = useState<'updated_desc' | 'mos_desc' | 'ticker_asc'>('updated_desc');
  const [viewFilter, setViewFilter] = useState<ViewFilter>('all');

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

  const kpis = useMemo(() => {
    const list = items ?? [];
    const portfolioItems = list.filter((i) => i.ownedLots > 0);
    let portfolioMarketValue = 0;
    let totalInvestedCapital = 0;

    for (const item of portfolioItems) {
      const pos = calculatePositionSummary(item.ownedLots, item.avgBuyPrice, item.currentPrice);
      portfolioMarketValue += pos.marketValue;
      totalInvestedCapital += pos.costBasis;
    }

    const totalNetPnL =
      totalInvestedCapital > 0 ? portfolioMarketValue - totalInvestedCapital : null;
    const totalNetPnLPct =
      totalNetPnL !== null && totalInvestedCapital > 0
        ? Math.round((totalNetPnL / totalInvestedCapital) * 10000) / 100
        : null;

    return {
      total: list.length,
      portfolioCount: portfolioItems.length,
      undervalued: list.filter((i) => i.valuation.valuationStatus === 'UNDERVALUED').length,
      portfolioMarketValue,
      totalInvestedCapital,
      totalNetPnL,
      totalNetPnLPct,
      stale: list.filter((i) => i.isStale).length,
    };
  }, [items]);

  const filteredItems = useMemo(() => {
    const list = items ?? [];
    if (viewFilter === 'portfolio') return list.filter((i) => i.ownedLots > 0);
    if (viewFilter === 'undervalued') {
      return list.filter((i) => i.valuation.valuationStatus === 'UNDERVALUED');
    }
    return list;
  }, [items, viewFilter]);

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

  return (
    <div className="space-y-6">
      {/* Executive Portfolio Summary + Watchlist Insights */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12 animate-fade-up">
        {/* Primary Portfolio Financial Card (Invested Capital vs Net Market Value vs Net P/L) */}
        <Card className="border-t-2 border-t-brand-600 p-5 lg:col-span-7">
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
            <div>
              <div className="flex items-center gap-2 text-xs font-semibold text-muted">
                <span className="flex h-6 w-6 items-center justify-center rounded-md bg-brand-50 text-brand-600">
                  <Wallet className="h-3.5 w-3.5" />
                </span>
                <TermTooltip
                  label={t.watchlist.kpiPositions}
                  definition={t.glossary.netMarketValue}
                />
              </div>
              <div className="mt-2 font-mono text-3xl font-bold tracking-tight text-ink tabular-nums">
                {isLoading ? (
                  <Skeleton className="h-9 w-44" />
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
                    ? 'border-positive-600/20 bg-positive-50 text-positive-700'
                    : 'border-negative-600/20 bg-negative-50 text-negative-700',
                )}
              >
                <span className="text-[11px] font-medium opacity-85">
                  <TermTooltip
                    label={t.watchlist.kpiTotalPnL}
                    definition={t.glossary.unrealizedPnL}
                    className="border-current/40 hover:text-current"
                  />
                </span>
                <div className="mt-0.5 flex items-center gap-1 font-mono text-sm font-bold tabular-nums">
                  {kpis.totalNetPnL >= 0 ? (
                    <ArrowUpRight className="h-4 w-4" />
                  ) : (
                    <ArrowDownRight className="h-4 w-4" />
                  )}
                  <span>
                    {kpis.totalNetPnL >= 0 ? '+' : ''}
                    {formatIdr(kpis.totalNetPnL)}
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
                ) : (
                  formatIdr(kpis.totalInvestedCapital)
                )}
              </span>
            </div>

            <button
              type="button"
              onClick={() => setViewFilter(viewFilter === 'portfolio' ? 'all' : 'portfolio')}
              className="inline-flex items-center gap-1.5 rounded-full bg-surface px-2.5 py-1 text-xs font-semibold text-ink transition-colors hover:bg-brand-50 hover:text-brand-700 cursor-pointer"
            >
              <Briefcase className="h-3.5 w-3.5 text-brand-600" />
              <span className="font-mono">{kpis.portfolioCount}</span>
              <span>{t.watchlist.pillPortfolio}</span>
            </button>
          </div>
        </Card>

        {/* Secondary Insight Cards */}
        <div className="grid grid-cols-2 gap-4 lg:col-span-5">
          <Card
            interactive
            onClick={() => setViewFilter(viewFilter === 'undervalued' ? 'all' : 'undervalued')}
            className="flex cursor-pointer flex-col justify-between p-5"
            title={t.watchlist.filterByUndervaluedHint}
          >
            <div className="flex items-center justify-between">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-positive-50 text-positive-600">
                <TrendingUp className="h-4 w-4" />
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
          </Card>

          <Card interactive className="flex flex-col justify-between p-5">
            <div className="flex items-center justify-between">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-surface text-ink">
                <Layers className="h-4 w-4" />
              </span>
              {!isLoading && kpis.stale > 0 && (
                <Badge tone="warning">
                  <Clock className="h-3 w-3" />
                  {kpis.stale} {t.watchlist.staleBadge}
                </Badge>
              )}
            </div>
            <div className="mt-4">
              <div className="text-xs font-medium text-muted">{t.watchlist.kpiTotal}</div>
              <div className="mt-1 font-mono text-3xl font-bold text-ink tabular-nums">
                {isLoading ? <Skeleton className="h-8 w-12" /> : kpis.total}
              </div>
            </div>
          </Card>
        </div>
      </div>

      {/* Stockbit-Style Unified Watchlist Workspace Card */}
      <div className="overflow-hidden rounded-xl border border-border bg-panel surface-elevated animate-fade-up">
        {/* Top Row: Inline "+ Type here to add IDX stock..." + Right Toolbar */}
        <div className="border-b border-border px-4 py-3 sm:px-5">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <form onSubmit={handleQuickAdd} className="flex flex-1 items-center gap-2">
              <div className="relative flex-1 max-w-md">
                <Plus className="pointer-events-none absolute top-1/2 left-2.5 h-4 w-4 -translate-y-1/2 text-brand-600" />
                <input
                  type="text"
                  maxLength={4}
                  placeholder={t.watchlist.quickAddPlaceholder}
                  value={quickTicker}
                  onChange={(e) => {
                    setQuickTicker(e.target.value.toUpperCase());
                    if (quickError) setQuickError(null);
                  }}
                  disabled={isQuickAdding}
                  className="h-9 w-full rounded-lg border border-transparent bg-surface/80 pr-3 pl-8 font-mono text-sm text-ink uppercase placeholder:font-sans placeholder:normal-case placeholder:text-muted/75 transition-all focus:border-brand-600 focus:bg-panel focus:ring-2 focus:ring-brand-100 focus:outline-none"
                />
              </div>
              <Button
                type="submit"
                size="sm"
                disabled={isQuickAdding || quickTicker.trim().length < 4}
                className="h-9"
              >
                <Sparkles className="h-3.5 w-3.5" />
                {isQuickAdding ? t.watchlist.quickAdding : t.watchlist.quickAddBtn}
              </Button>
            </form>

            <div className="flex flex-wrap items-center gap-2">
              {items && items.length > 0 && (
                <button
                  type="button"
                  onClick={() => syncAllMutation.mutate()}
                  disabled={syncAllMutation.isPending}
                  className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold text-brand-700 transition-colors hover:bg-brand-50 disabled:opacity-50 cursor-pointer"
                >
                  <RefreshCw
                    className={`h-3.5 w-3.5 ${syncAllMutation.isPending ? 'animate-spin' : ''}`}
                  />
                  {syncAllMutation.isPending ? t.watchlist.syncingAll : t.watchlist.syncAllBtn}
                </button>
              )}
              <button
                type="button"
                onClick={openAdd}
                className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold text-brand-700 transition-colors hover:bg-brand-50 cursor-pointer"
              >
                <Plus className="h-3.5 w-3.5" />
                {t.watchlist.addStock}
              </button>
            </div>
          </div>

          {quickError ? (
            <p className="mt-1.5 text-xs text-negative-600" role="alert">
              {quickError}
            </p>
          ) : (
            <p className="mt-1.5 text-[11px] text-muted">{t.watchlist.quickAddHint}</p>
          )}
        </div>

        {/* Second Row: Stockbit-Style Filter Pills + Search/Sector/Sort */}
        <div className="flex flex-col gap-3 border-b border-border bg-panel px-4 py-3 sm:px-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setViewFilter('all')}
              className={cn(
                'inline-flex h-8 items-center gap-1.5 rounded-full border px-3.5 text-xs font-semibold transition-all cursor-pointer',
                viewFilter === 'all'
                  ? 'border-brand-600 bg-brand-50 text-brand-700'
                  : 'border-border bg-panel text-muted hover:border-slate-300 hover:text-ink',
              )}
            >
              {t.watchlist.pillAll}
              <span className="font-mono text-[11px] opacity-80">({kpis.total})</span>
            </button>
            <button
              type="button"
              onClick={() => setViewFilter('portfolio')}
              className={cn(
                'inline-flex h-8 items-center gap-1.5 rounded-full border px-3.5 text-xs font-semibold transition-all cursor-pointer',
                viewFilter === 'portfolio'
                  ? 'border-brand-600 bg-brand-50 text-brand-700'
                  : 'border-border bg-panel text-muted hover:border-slate-300 hover:text-ink',
              )}
            >
              <Briefcase className="h-3.5 w-3.5" />
              {t.watchlist.pillPortfolio}
              <span className="font-mono text-[11px] opacity-80">({kpis.portfolioCount})</span>
            </button>
            <button
              type="button"
              onClick={() => setViewFilter('undervalued')}
              className={cn(
                'inline-flex h-8 items-center gap-1.5 rounded-full border px-3.5 text-xs font-semibold transition-all cursor-pointer',
                viewFilter === 'undervalued'
                  ? 'border-brand-600 bg-brand-50 text-brand-700'
                  : 'border-border bg-panel text-muted hover:border-slate-300 hover:text-ink',
              )}
            >
              {t.watchlist.pillUndervalued}
              <span className="font-mono text-[11px] opacity-80">({kpis.undervalued})</span>
            </button>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="relative sm:w-48">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
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
              className="h-8 text-xs sm:w-48"
              aria-label="Sort watchlist"
            >
              <option value="updated_desc">{t.watchlist.sortUpdated}</option>
              <option value="mos_desc">{t.watchlist.sortMosDesc}</option>
              <option value="ticker_asc">{t.watchlist.sortTickerAsc}</option>
            </Select>
          </div>
        </div>

        {/* Table Body */}
        {isError && (
          <div className="flex items-center gap-3 bg-negative-50 px-5 py-3 text-sm text-negative-700">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{t.common.unexpectedError}</span>
          </div>
        )}

        {isLoading ? (
          <div className="space-y-3 p-5">
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="px-6 py-14 text-center">
            <h2 className="font-display text-base font-bold text-ink">{t.watchlist.emptyTitle}</h2>
            <p className="mx-auto mt-1 max-w-md text-sm text-muted">{t.watchlist.emptyBody}</p>
            <Button variant="outlineBrand" className="mt-5" onClick={openAdd}>
              <Plus className="h-4 w-4" />
              {t.watchlist.emptyAction}
            </Button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-border bg-surface/60 text-xs font-semibold text-muted">
                  <th className="px-4 py-3 sm:px-5">{t.watchlist.colTicker}</th>
                  <th className="px-4 py-3 text-right">{t.watchlist.colPrice}</th>
                  <th className="px-4 py-3 text-right">
                    <TermTooltip
                      label={t.watchlist.colFairValue}
                      definition={t.glossary.fairValueMedian}
                    />
                  </th>
                  <th className="px-4 py-3 text-right">
                    <TermTooltip
                      label={t.watchlist.colMos}
                      definition={t.glossary.marginOfSafety}
                    />
                  </th>
                  <th className="px-4 py-3 text-right">
                    <TermTooltip
                      label={t.watchlist.colPosition}
                      definition={t.glossary.unrealizedPnL}
                    />
                  </th>
                  <th className="px-4 py-3">{t.watchlist.colStatus}</th>
                  <th className="px-4 py-3 text-right sm:px-5">{t.watchlist.colActions}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/80">
                {filteredItems.map((item) => {
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

                  return (
                    <tr
                      key={item.id}
                      className="group transition-colors duration-150 hover:bg-brand-50/35"
                    >
                      <td className="px-4 py-3 sm:px-5">
                        <div className="flex items-center gap-3">
                          <TickerAvatar ticker={item.ticker} />
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <Link
                                to={`/watchlist/${item.id}`}
                                className="font-mono text-sm font-bold text-ink transition-colors group-hover:text-brand-600"
                              >
                                {item.ticker}
                              </Link>
                              {item.isStale && (
                                <Badge tone="warning">
                                  <Clock className="h-3 w-3" />
                                  {t.watchlist.staleBadge}
                                </Badge>
                              )}
                            </div>
                            <div className="max-w-[220px] truncate text-xs text-muted">
                              {item.companyName}
                            </div>
                          </div>
                        </div>
                      </td>

                      <td
                        className={`px-4 py-3 text-right font-mono text-sm font-bold tabular-nums ${priceColor}`}
                      >
                        {formatIdr(item.currentPrice)}
                      </td>

                      <td className="px-4 py-3 text-right font-mono text-sm font-semibold text-ink tabular-nums">
                        {formatIdr(item.valuation.fairValue.moderate)}
                      </td>

                      <td className="px-4 py-3 text-right">
                        {mosVal !== null ? (
                          <div className="inline-flex items-center justify-end gap-1 font-mono text-sm font-semibold tabular-nums">
                            {mosVal >= 0 ? (
                              <ArrowUpRight className="h-3.5 w-3.5 text-positive-600" />
                            ) : (
                              <ArrowDownRight className="h-3.5 w-3.5 text-negative-600" />
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
                          <span className="font-mono text-xs text-muted">—</span>
                        )}
                      </td>

                      <td className="px-4 py-3.5 text-right">
                        {pos.ownedLots > 0 ? (
                          <div className="space-y-0.5">
                            <div className="font-mono text-xs font-bold text-ink tabular-nums">
                              {formatNumber(pos.ownedLots)} {t.common.lots}
                              {pos.avgBuyPrice ? ` · ${formatIdr(pos.avgBuyPrice)}` : ''}
                            </div>
                            <div className="font-mono text-[11px] text-muted tabular-nums">
                              {t.watchlist.investedPrefix}: {formatIdr(pos.costBasis)}
                            </div>
                            {pos.unrealizedPnLPct !== null && (
                              <div
                                className={`font-mono text-[11px] font-semibold tabular-nums ${
                                  pos.unrealizedPnLPct >= 0
                                    ? 'text-positive-600'
                                    : 'text-negative-600'
                                }`}
                              >
                                {pos.unrealizedPnL !== null
                                  ? `${pos.unrealizedPnL >= 0 ? '+' : ''}${formatIdr(pos.unrealizedPnL)} `
                                  : ''}
                                ({formatPercent(pos.unrealizedPnLPct, true)})
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="font-mono text-xs text-muted/60">
                            {t.watchlist.noPosition}
                          </span>
                        )}
                      </td>

                      <td className="px-4 py-3">
                        <Badge tone={statusTone(item.valuation.valuationStatus)}>
                          {t.valuationStatus[item.valuation.valuationStatus]}
                        </Badge>
                      </td>

                      <td className="px-4 py-3 sm:px-5">
                        <div className="flex items-center justify-end gap-1.5">
                          <Link
                            to={`/simulator?stockId=${item.id}`}
                            className="inline-flex h-7 items-center gap-1 rounded-md border border-brand-600/45 bg-panel px-2.5 text-xs font-semibold text-brand-700 transition-all hover:border-brand-600 hover:bg-brand-50"
                          >
                            <Calculator className="h-3 w-3" />
                            {t.watchlist.simulate}
                          </Link>
                          <Link
                            to={`/watchlist/${item.id}`}
                            className="inline-flex h-7 items-center gap-1 rounded-md px-2 text-xs font-semibold text-muted transition-colors hover:bg-subtle hover:text-ink"
                          >
                            <BarChart3 className="h-3.5 w-3.5" />
                            {t.watchlist.analyze}
                          </Link>
                          <button
                            type="button"
                            onClick={() => openEdit(item)}
                            aria-label={t.common.edit}
                            className="rounded-md p-1.5 text-muted transition-colors hover:bg-subtle hover:text-ink cursor-pointer"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeletingItem(item)}
                            aria-label={t.common.delete}
                            className="rounded-md p-1.5 text-muted transition-colors hover:bg-negative-50 hover:text-negative-600 cursor-pointer"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
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
      </div>

      <StockFormModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        editingItem={editingItem}
      />

      <Modal
        open={Boolean(deletingItem)}
        onClose={() => setDeletingItem(null)}
        title={`${t.common.confirmDelete} — ${deletingItem?.ticker ?? ''}`}
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
