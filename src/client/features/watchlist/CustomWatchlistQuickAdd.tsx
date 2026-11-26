import { Check, Plus, Search } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { CustomWatchlistGroupDto, MarketStockDto } from '@/shared/contracts';
import { Button, Card, cn, Input, RolePill } from '@/client/components/ui/primitives';
import { useI18n } from '@/client/i18n/useI18n';
import { ApiClientError } from '@/client/lib/apiClient';
import { formatIdr, formatPercent } from '@/client/lib/formatters';
import { useAddStockToCustomWatchlist, useIdxCatalogSearch } from './useWatchlist';

interface CustomWatchlistQuickAddProps {
  group: CustomWatchlistGroupDto;
}

export function CustomWatchlistQuickAdd({ group }: CustomWatchlistQuickAddProps) {
  const { t } = useI18n();
  const [query, setQuery] = useState('');
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const addMutation = useAddStockToCustomWatchlist();
  const { data: suggestions, isFetching } = useIdxCatalogSearch(query, dropdownOpen);

  useEffect(() => {
    if (!dropdownOpen) return;
    const onOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setDropdownOpen(false);
    };
    window.addEventListener('mousedown', onOutside);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onOutside);
      window.removeEventListener('keydown', onKey);
    };
  }, [dropdownOpen]);

  const submitTicker = async (tickerRaw: string) => {
    setError(null);
    const clean = tickerRaw.trim().toUpperCase();
    if (!/^[A-Z]{4}$/.test(clean)) {
      setError('Select an IHSG stock or enter a 4-letter IDX symbol (e.g. BBCA).');
      return;
    }
    if (group.tickers.includes(clean)) {
      setError(`${clean} ${t.watchlist.quickAddCustomDuplicate}`);
      return;
    }

    try {
      await addMutation.mutateAsync({
        groupId: group.id,
        payload: { ticker: clean },
      });
      setQuery('');
      setDropdownOpen(false);
    } catch (err) {
      if (err instanceof ApiClientError) {
        setError(err.message);
      } else {
        setError(t.common.unexpectedError);
      }
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const clean = query.trim().toUpperCase();
    const exactMatch = suggestions?.find((s) => s.ticker === clean);
    if (exactMatch) {
      await submitTicker(exactMatch.ticker);
      return;
    }
    if (/^[A-Z]{4}$/.test(clean)) {
      await submitTicker(clean);
      return;
    }
    if (suggestions && suggestions.length === 1) {
      await submitTicker(suggestions[0]!.ticker);
      return;
    }
    setError('Select an IHSG stock or enter a 4-letter IDX symbol (e.g. BBCA).');
  };

  return (
    <Card variant="editable" className="p-3.5 sm:px-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-bold text-ink">{t.watchlist.quickAddLabel}</span>
          <RolePill role="editable" label={t.common.editableTag} />
          <span className="hidden text-xs text-muted xl:inline">·</span>
          <span className="hidden text-xs text-muted xl:inline">
            {t.watchlist.quickAddCustomHint}
          </span>
        </div>

        <form
          onSubmit={handleSubmit}
          className="flex w-full flex-col gap-2 sm:flex-row sm:items-center md:w-auto"
        >
          <div ref={containerRef} className="relative w-full sm:w-72 md:w-80">
            <Search
              className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-brand-600"
              aria-hidden="true"
            />
            <Input
              type="text"
              aria-label={t.watchlist.quickAddLabel}
              placeholder={t.watchlist.quickAddCustomPlaceholder}
              value={query}
              onFocus={() => setDropdownOpen(true)}
              onChange={(e) => {
                setQuery(e.target.value);
                setDropdownOpen(true);
                if (error) setError(null);
              }}
              disabled={addMutation.isPending}
              className="pl-8 text-xs"
            />

            {dropdownOpen && query.trim().length >= 1 && (
              <div className="absolute right-0 left-0 z-40 mt-1 max-h-60 overflow-y-auto rounded-xl border border-border bg-panel shadow-xl divide-y divide-border/70">
                {isFetching && (!suggestions || suggestions.length === 0) ? (
                  <div className="px-3 py-2.5 text-xs text-muted">{t.common.loading}</div>
                ) : suggestions && suggestions.length > 0 ? (
                  suggestions.map((stock: MarketStockDto) => {
                    const alreadyIn = group.tickers.includes(stock.ticker);
                    return (
                      <button
                        key={stock.ticker}
                        type="button"
                        disabled={alreadyIn || addMutation.isPending}
                        onClick={() => submitTicker(stock.ticker)}
                        className={cn(
                          'flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-xs transition-colors',
                          alreadyIn
                            ? 'bg-subtle/50 text-muted cursor-not-allowed'
                            : 'hover:bg-brand-50/70 cursor-pointer',
                        )}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-bold text-ink">{stock.ticker}</span>
                            <span className="truncate text-[11px] text-muted">
                              {stock.companyName}
                            </span>
                          </div>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <span className="font-mono text-[11px] text-ink tabular-nums">
                            {formatIdr(stock.currentPrice)}
                          </span>
                          {stock.valuation.mosPct !== null && (
                            <span
                              className={cn(
                                'font-mono text-[11px] font-semibold tabular-nums',
                                stock.valuation.mosPct >= 30
                                  ? 'text-positive-600'
                                  : stock.valuation.mosPct >= 0
                                    ? 'text-warning-600'
                                    : 'text-negative-600',
                              )}
                            >
                              {formatPercent(stock.valuation.mosPct, true)}
                            </span>
                          )}
                          {alreadyIn ? (
                            <Check className="h-3.5 w-3.5 text-brand-600" aria-hidden="true" />
                          ) : (
                            <Plus className="h-3.5 w-3.5 text-brand-700" aria-hidden="true" />
                          )}
                        </div>
                      </button>
                    );
                  })
                ) : (
                  <div className="px-3 py-2.5 text-xs text-muted">
                    {/^[A-Za-z]{4}$/.test(query.trim())
                      ? `Click "${t.watchlist.quickAddBtn}" to fetch ${query.trim().toUpperCase()}.`
                      : t.watchlist.emptyAllStocksTitle}
                  </div>
                )}
              </div>
            )}
          </div>

          <Button
            type="submit"
            size="md"
            disabled={addMutation.isPending || query.trim().length < 1}
            className="shrink-0"
          >
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            {addMutation.isPending ? t.watchlist.quickAdding : t.watchlist.quickAddBtn}
          </Button>
        </form>
      </div>

      {error ? (
        <p className="mt-2 text-xs text-negative-600" role="alert">
          {error}
        </p>
      ) : (
        <p className="mt-1.5 text-[11px] text-muted xl:hidden">{t.watchlist.quickAddCustomHint}</p>
      )}
    </Card>
  );
}
