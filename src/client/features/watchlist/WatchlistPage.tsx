import {
  AlertCircle,
  BarChart3,
  Calculator,
  Clock,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  Trash2,
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
  Input,
  Modal,
  Select,
  Skeleton,
  TermTooltip,
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

export function WatchlistPage() {
  const { t } = useI18n();
  const [search, setSearch] = useState('');
  const [sector, setSector] = useState<IdxSector | ''>('');
  const [sort, setSort] = useState<'updated_desc' | 'mos_desc' | 'ticker_asc'>('updated_desc');

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
      setQuickError('Must be a 4-letter IDX ticker (e.g. BBCA)');
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
    const portfolioMarketValue = list.reduce(
      (sum, item) =>
        sum + calculatePositionSummary(item.ownedLots, item.avgBuyPrice, item.currentPrice).marketValue,
      0,
    );
    return {
      total: list.length,
      undervalued: list.filter((i) => i.valuation.valuationStatus === 'UNDERVALUED').length,
      portfolioMarketValue,
      stale: list.filter((i) => i.isStale).length,
    };
  }, [items]);

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
      {/* Editorial Header */}
      <div className="flex flex-col gap-3 border-b border-border pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight text-ink">
            {t.watchlist.title}
          </h1>
          <p className="mt-1 text-sm text-muted">{t.watchlist.subtitle}</p>
        </div>
        <div className="flex items-center gap-2">
          {items && items.length > 0 && (
            <Button
              variant="secondary"
              size="md"
              onClick={() => syncAllMutation.mutate()}
              disabled={syncAllMutation.isPending}
            >
              <RefreshCw
                className={`h-3.5 w-3.5 ${syncAllMutation.isPending ? 'animate-spin' : ''}`}
              />
              {syncAllMutation.isPending ? t.watchlist.syncingAll : t.watchlist.syncAllBtn}
            </Button>
          )}
          <Button variant="secondary" onClick={openAdd} size="md">
            <Plus className="h-3.5 w-3.5" />
            {t.watchlist.addStock}
          </Button>
        </div>
      </div>

      {/* Dynamic Elevated KPI Cards */}
      <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-4 animate-fade-up">
        <Card interactive className="border-t-2 border-t-ink/70 p-4">
          <div className="text-[11px] font-semibold tracking-wide text-muted uppercase">
            {t.watchlist.kpiTotal}
          </div>
          <div className="mt-1.5 font-mono text-2xl font-bold text-ink tabular-nums">
            {isLoading ? <Skeleton className="h-7 w-12" /> : kpis.total}
          </div>
        </Card>
        <Card interactive className="border-t-2 border-t-positive-600 p-4">
          <div className="text-[11px] font-semibold tracking-wide text-muted uppercase">
            <TermTooltip
              label={t.watchlist.kpiUndervalued}
              definition={t.glossary.marginOfSafety}
            />
          </div>
          <div className="mt-1.5 font-mono text-2xl font-bold text-positive-700 tabular-nums">
            {isLoading ? <Skeleton className="h-7 w-12" /> : kpis.undervalued}
          </div>
        </Card>
        <Card interactive className="border-t-2 border-t-brand-700 p-4">
          <div className="text-[11px] font-semibold tracking-wide text-muted uppercase">
            {t.watchlist.kpiPositions}
          </div>
          <div className="mt-1.5 font-mono text-2xl font-bold text-ink tabular-nums">
            {isLoading ? <Skeleton className="h-7 w-24" /> : formatIdr(kpis.portfolioMarketValue)}
          </div>
        </Card>
        <Card interactive className="border-t-2 border-t-warning-600 p-4">
          <div className="text-[11px] font-semibold tracking-wide text-muted uppercase">
            {t.watchlist.kpiStale}
          </div>
          <div className="mt-1.5 font-mono text-2xl font-bold text-warning-700 tabular-nums">
            {isLoading ? <Skeleton className="h-7 w-12" /> : kpis.stale}
          </div>
        </Card>
      </div>

      {/* Quick Auto-Add Bar */}
      <Card className="p-4">
        <form onSubmit={handleQuickAdd} className="flex flex-col gap-2.5 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Sparkles className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-brand-700" />
            <Input
              placeholder={t.watchlist.quickAddPlaceholder}
              maxLength={4}
              value={quickTicker}
              onChange={(e) => {
                setQuickTicker(e.target.value.toUpperCase());
                if (quickError) setQuickError(null);
              }}
              className="pl-9 font-mono uppercase"
              disabled={isQuickAdding}
            />
          </div>
          <Button type="submit" disabled={isQuickAdding || quickTicker.trim().length < 4}>
            <Sparkles className="h-3.5 w-3.5" />
            {isQuickAdding ? t.watchlist.quickAdding : t.watchlist.quickAddBtn}
          </Button>
        </form>
        {quickError ? (
          <p className="mt-2 text-xs text-negative-600" role="alert">
            {quickError}
          </p>
        ) : (
          <p className="mt-2 text-xs text-muted">{t.watchlist.quickAddHint}</p>
        )}
      </Card>

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted" />
          <Input
            placeholder={t.watchlist.searchPlaceholder}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select
          value={sector}
          onChange={(e) => setSector(e.target.value as IdxSector | '')}
          className="sm:w-52"
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
          onChange={(e) => setSort(e.target.value as 'updated_desc' | 'mos_desc' | 'ticker_asc')}
          className="sm:w-52"
          aria-label="Sort watchlist"
        >
          <option value="updated_desc">{t.watchlist.sortUpdated}</option>
          <option value="mos_desc">{t.watchlist.sortMosDesc}</option>
          <option value="ticker_asc">{t.watchlist.sortTickerAsc}</option>
        </Select>
      </div>

      {/* Content */}
      {isError && (
        <Card className="flex items-center gap-3 border-negative-600/25 bg-negative-50 p-4 text-sm text-negative-700">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{t.common.unexpectedError}</span>
        </Card>
      )}

      {isLoading ? (
        <Card className="space-y-3 p-5">
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-11 w-full" />
          <Skeleton className="h-11 w-full" />
          <Skeleton className="h-11 w-full" />
        </Card>
      ) : items && items.length === 0 ? (
        <Card className="py-14 text-center">
          <h2 className="font-display text-xl font-semibold text-ink">{t.watchlist.emptyTitle}</h2>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted">{t.watchlist.emptyBody}</p>
          <Button variant="secondary" className="mt-5" onClick={openAdd}>
            <Plus className="h-4 w-4" />
            {t.watchlist.emptyAction}
          </Button>
        </Card>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border bg-panel surface-elevated animate-fade-up">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-border bg-surface text-[11px] font-semibold tracking-wider text-muted uppercase">
                  <th className="px-4 py-3.5">{t.watchlist.colTicker}</th>
                  <th className="px-4 py-3.5 text-right">
                    <TermTooltip
                      label={t.watchlist.colPosition}
                      definition={t.glossary.unrealizedPnL}
                    />
                  </th>
                  <th className="px-4 py-3.5 text-right">{t.watchlist.colPrice}</th>
                  <th className="px-4 py-3.5 text-right">
                    <TermTooltip
                      label={t.watchlist.colFairValue}
                      definition={t.glossary.fairValueMedian}
                    />
                  </th>
                  <th className="px-4 py-3.5 text-right">
                    <TermTooltip
                      label={t.watchlist.colMos}
                      definition={t.glossary.marginOfSafety}
                    />
                  </th>
                  <th className="px-4 py-3.5">{t.watchlist.colStatus}</th>
                  <th className="px-4 py-3.5 text-right">{t.watchlist.colActions}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {(items ?? []).map((item) => {
                  const pos = calculatePositionSummary(
                    item.ownedLots,
                    item.avgBuyPrice,
                    item.currentPrice,
                  );
                  const mosVal = item.valuation.mosPct;
                  const barWidth =
                    mosVal !== null ? Math.min(100, Math.max(8, Math.abs(mosVal))) : 0;
                  return (
                    <tr
                      key={item.id}
                      className="group transition-colors duration-150 hover:bg-brand-50/40"
                    >
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-2">
                          <Link
                            to={`/watchlist/${item.id}`}
                            className="font-mono text-sm font-bold text-ink transition-colors group-hover:text-brand-700"
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
                        <div className="mt-0.5 text-xs text-muted">
                          {item.companyName} · {t.sectors[item.sector]}
                        </div>
                      </td>
                      <td className="px-4 py-3.5 text-right">
                        {pos.ownedLots > 0 ? (
                          <div>
                            <div className="font-mono text-xs font-semibold text-ink tabular-nums">
                              {formatNumber(pos.ownedLots)} {t.common.lots}
                              {pos.avgBuyPrice ? ` @ ${formatIdr(pos.avgBuyPrice)}` : ''}
                            </div>
                            {pos.unrealizedPnLPct !== null && (
                              <div
                                className={`font-mono text-[11px] font-medium tabular-nums ${
                                  pos.unrealizedPnLPct >= 0
                                    ? 'text-positive-700'
                                    : 'text-negative-600'
                                }`}
                              >
                                {formatPercent(pos.unrealizedPnLPct, true)}
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs text-muted/70">{t.watchlist.noPosition}</span>
                        )}
                      </td>
                      <td className="px-4 py-3.5 text-right font-mono text-sm font-medium text-ink tabular-nums">
                        {formatIdr(item.currentPrice)}
                      </td>
                      <td className="px-4 py-3.5 text-right font-mono text-sm font-medium text-ink tabular-nums">
                        {formatIdr(item.valuation.fairValue.moderate)}
                      </td>
                      <td className="px-4 py-3.5 text-right">
                        <div className="inline-flex flex-col items-end gap-1">
                          <span
                            className={`font-mono text-sm font-semibold tabular-nums ${
                              mosVal === null
                                ? 'text-muted'
                                : mosVal >= 30
                                  ? 'text-positive-700'
                                  : mosVal >= 0
                                    ? 'text-warning-700'
                                    : 'text-negative-600'
                            }`}
                          >
                            {formatPercent(mosVal, true)}
                          </span>
                          {mosVal !== null && (
                            <div className="h-1.5 w-20 overflow-hidden rounded-full bg-subtle">
                              <div
                                className={`h-full rounded-full transition-all duration-300 ${
                                  mosVal >= 30
                                    ? 'bg-positive-600'
                                    : mosVal >= 0
                                      ? 'bg-warning-600'
                                      : 'bg-negative-600'
                                }`}
                                style={{ width: `${barWidth}%` }}
                              />
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3.5">
                        <Badge tone={statusTone(item.valuation.valuationStatus)}>
                          {t.valuationStatus[item.valuation.valuationStatus]}
                        </Badge>
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="flex items-center justify-end gap-1">
                          <Link
                            to={`/watchlist/${item.id}`}
                            className="inline-flex h-8 items-center gap-1 rounded-sm px-2.5 text-xs font-medium text-brand-700 transition-colors hover:bg-brand-50"
                          >
                            <BarChart3 className="h-3.5 w-3.5" />
                            {t.watchlist.analyze}
                          </Link>
                          <Link
                            to={`/simulator?stockId=${item.id}`}
                            className="inline-flex h-8 items-center gap-1 rounded-sm px-2.5 text-xs font-medium text-muted transition-colors hover:bg-subtle hover:text-ink"
                          >
                            <Calculator className="h-3.5 w-3.5" />
                            {t.watchlist.simulate}
                          </Link>
                          <button
                            type="button"
                            onClick={() => openEdit(item)}
                            aria-label={t.common.edit}
                            className="rounded-sm p-1.5 text-muted transition-colors hover:bg-subtle hover:text-ink cursor-pointer"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeletingItem(item)}
                            aria-label={t.common.delete}
                            className="rounded-sm p-1.5 text-muted transition-colors hover:bg-negative-50 hover:text-negative-600 cursor-pointer"
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
        </div>
      )}

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
