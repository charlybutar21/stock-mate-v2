import { Check, Plus, Search, X } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import type { CustomWatchlistGroupDto, MarketStockDto } from '@/shared/contracts';
import {
  Badge,
  Button,
  cn,
  Field,
  Input,
  Modal,
  Textarea,
} from '@/client/components/ui/primitives';
import { useI18n } from '@/client/i18n/useI18n';
import { ApiClientError } from '@/client/lib/apiClient';
import { formatIdr, formatPercent } from '@/client/lib/formatters';
import { useToast } from '@/client/lib/useToast';
import {
  useCreateCustomWatchlist,
  useIdxCatalogSearch,
  useUpdateCustomWatchlist,
} from './useWatchlist';

interface CustomWatchlistModalProps {
  open: boolean;
  onClose: () => void;
  editingGroup?: CustomWatchlistGroupDto | null;
  initialTicker?: string | null;
  onCreated?: (group: CustomWatchlistGroupDto) => void;
}

export function CustomWatchlistModal({
  open,
  onClose,
  editingGroup,
  initialTicker,
  onCreated,
}: CustomWatchlistModalProps) {
  const { t } = useI18n();
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={
        editingGroup
          ? t.watchlist.customModal.editTitle
          : t.watchlist.customModal.createTitle
      }
      maxWidthClass="max-w-xl"
    >
      {open && (
        <CustomWatchlistModalBody
          key={editingGroup?.id ?? `create_${initialTicker ?? 'blank'}`}
          onClose={onClose}
          editingGroup={editingGroup}
          initialTicker={initialTicker}
          onCreated={onCreated}
        />
      )}
    </Modal>
  );
}

function CustomWatchlistModalBody({
  onClose,
  editingGroup,
  initialTicker,
  onCreated,
}: {
  onClose: () => void;
  editingGroup?: CustomWatchlistGroupDto | null;
  initialTicker?: string | null;
  onCreated?: (group: CustomWatchlistGroupDto) => void;
}) {
  const { t } = useI18n();
  const { showToast } = useToast();
  const createMutation = useCreateCustomWatchlist();
  const updateMutation = useUpdateCustomWatchlist();

  const [name, setName] = useState(editingGroup?.name ?? '');
  const [description, setDescription] = useState(editingGroup?.description ?? '');
  const [selectedTickers, setSelectedTickers] = useState<Array<{ ticker: string; companyName?: string }>>(
    () => (initialTicker ? [{ ticker: initialTicker.toUpperCase() }] : []),
  );
  const [quickQuery, setQuickQuery] = useState('');
  const [quickError, setQuickError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const isEditing = Boolean(editingGroup);
  const isSubmitting = createMutation.isPending || updateMutation.isPending;

  const { data: suggestions, isFetching } = useIdxCatalogSearch(quickQuery, !isEditing);

  const addTickerItem = (ticker: string, companyName?: string) => {
    setQuickError(null);
    const clean = ticker.trim().toUpperCase();
    if (!/^[A-Z]{4}$/.test(clean)) {
      setQuickError('Must be a 4-letter IDX symbol (e.g. BBCA)');
      return;
    }
    if (selectedTickers.some((s) => s.ticker === clean)) {
      setQuickError(`${clean} ${t.watchlist.quickAddCustomDuplicate}`);
      return;
    }
    setSelectedTickers((prev) => [...prev, { ticker: clean, companyName }]);
    setQuickQuery('');
  };

  const removeTicker = (ticker: string) => {
    setSelectedTickers((prev) => prev.filter((s) => s.ticker !== ticker));
  };

  const handleQuickAddClick = () => {
    const clean = quickQuery.trim().toUpperCase();
    const exactMatch = suggestions?.find((s) => s.ticker === clean);
    if (exactMatch) {
      addTickerItem(exactMatch.ticker, exactMatch.companyName);
      return;
    }
    if (/^[A-Z]{4}$/.test(clean)) {
      addTickerItem(clean);
      return;
    }
    if (suggestions && suggestions.length === 1) {
      addTickerItem(suggestions[0]!.ticker, suggestions[0]!.companyName);
      return;
    }
    setQuickError('Select a stock from the list or type a 4-letter IDX ticker (e.g. BBCA).');
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setFormError(null);
    const cleanName = name.trim();
    if (!cleanName) {
      setFormError('Watchlist name is required.');
      return;
    }

    try {
      if (editingGroup) {
        await updateMutation.mutateAsync({
          id: editingGroup.id,
          payload: {
            name: cleanName,
            description: description.trim() || null,
          },
        });
        showToast(t.watchlist.toastSavedToWatchlist, 'success');
      } else {
        const created = await createMutation.mutateAsync({
          name: cleanName,
          description: description.trim() || null,
          tickers: selectedTickers.map((s) => s.ticker),
        });
        showToast(t.watchlist.toastSavedToWatchlist, 'success');
        onCreated?.(created);
      }
      onClose();
    } catch (err) {
      if (err instanceof ApiClientError) {
        setFormError(err.message);
      } else {
        setFormError(t.common.unexpectedError);
      }
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
      {formError && (
        <div
          role="alert"
          className="rounded-lg border border-negative-600/25 bg-negative-50 px-3 py-2 text-xs text-negative-700"
        >
          {formError}
        </div>
      )}

      <Field label={t.watchlist.customModal.nameLabel} htmlFor="cw-name">
        <Input
          id="cw-name"
          maxLength={60}
          placeholder={t.watchlist.customModal.namePlaceholder}
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoFocus
        />
      </Field>

      <Field label={t.watchlist.customModal.descriptionLabel} htmlFor="cw-desc">
        <Textarea
          id="cw-desc"
          rows={2}
          maxLength={200}
          placeholder={t.watchlist.customModal.descriptionPlaceholder}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </Field>

      {!isEditing && (
        <div className="space-y-3 rounded-xl border border-editable-border bg-display/70 p-4">
          <div>
            <div className="text-xs font-bold text-ink">
              {t.watchlist.customModal.quickAddSection}
            </div>
            <p className="mt-0.5 text-[11px] text-muted">{t.watchlist.customModal.quickAddHint}</p>
          </div>

          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search
                className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-muted"
                aria-hidden="true"
              />
              <Input
                type="text"
                aria-label={t.watchlist.customModal.quickAddSection}
                placeholder={t.watchlist.quickAddCustomPlaceholder}
                value={quickQuery}
                onChange={(e) => {
                  setQuickQuery(e.target.value);
                  if (quickError) setQuickError(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleQuickAddClick();
                  }
                }}
                className="h-9 pl-8 text-xs"
              />
            </div>
            <Button
              type="button"
              variant="outlineBrand"
              size="sm"
              onClick={handleQuickAddClick}
              disabled={!quickQuery.trim()}
              className="h-9 shrink-0"
            >
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              {t.watchlist.quickAddBtn}
            </Button>
          </div>

          {quickError && (
            <p className="text-xs text-negative-600" role="alert">
              {quickError}
            </p>
          )}

          {/* Live IHSG Suggestions */}
          {quickQuery.trim().length >= 1 && (
            <div className="max-h-44 overflow-y-auto rounded-lg border border-border bg-panel divide-y divide-border/70">
              {isFetching && (!suggestions || suggestions.length === 0) ? (
                <div className="px-3 py-2 text-xs text-muted">{t.common.loading}</div>
              ) : suggestions && suggestions.length > 0 ? (
                suggestions.map((stock: MarketStockDto) => {
                  const isAdded = selectedTickers.some((s) => s.ticker === stock.ticker);
                  return (
                    <button
                      key={stock.ticker}
                      type="button"
                      disabled={isAdded}
                      onClick={() => addTickerItem(stock.ticker, stock.companyName)}
                      className={cn(
                        'flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-xs transition-colors',
                        isAdded
                          ? 'bg-subtle/50 text-muted cursor-not-allowed'
                          : 'hover:bg-brand-50/60 cursor-pointer',
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
                                ? 'text-positive-700'
                                : stock.valuation.mosPct >= 0
                                  ? 'text-warning-700'
                                  : 'text-negative-600',
                            )}
                          >
                            {formatPercent(stock.valuation.mosPct, true)}
                          </span>
                        )}
                        {isAdded ? (
                          <Check className="h-3.5 w-3.5 text-brand-600" aria-hidden="true" />
                        ) : (
                          <Plus className="h-3.5 w-3.5 text-brand-700" aria-hidden="true" />
                        )}
                      </div>
                    </button>
                  );
                })
              ) : (
                <div className="px-3 py-2 text-xs text-muted">
                  {/^[A-Za-z]{4}$/.test(quickQuery.trim())
                    ? `Press "${t.watchlist.quickAddBtn}" to fetch ${quickQuery.trim().toUpperCase()} directly.`
                    : t.watchlist.emptyAllStocksTitle}
                </div>
              )}
            </div>
          )}

          {/* Selected Tickers Chips */}
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-[11px] font-semibold text-muted">
                {t.watchlist.customModal.selectedStocksLabel}
              </span>
              <Badge tone={selectedTickers.length > 0 ? 'info' : 'neutral'}>
                {selectedTickers.length}
              </Badge>
            </div>
            {selectedTickers.length === 0 ? (
              <p className="text-xs text-muted">{t.watchlist.customModal.noStocksSelected}</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {selectedTickers.map((item) => (
                  <span
                    key={item.ticker}
                    className="inline-flex items-center gap-1.5 rounded-md border border-brand-600/35 bg-brand-50 px-2 py-1 text-xs font-semibold text-brand-700"
                  >
                    <span className="font-mono">{item.ticker}</span>
                    <button
                      type="button"
                      onClick={() => removeTicker(item.ticker)}
                      aria-label={`Remove ${item.ticker}`}
                      className="rounded p-0.5 transition-colors hover:bg-brand-100 cursor-pointer"
                    >
                      <X className="h-3 w-3" aria-hidden="true" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      <div className="flex items-center justify-end gap-2 border-t border-border pt-4">
        <Button variant="secondary" onClick={onClose} disabled={isSubmitting}>
          {t.common.cancel}
        </Button>
        <Button type="submit" disabled={isSubmitting || !name.trim()}>
          {isSubmitting
            ? t.watchlist.customModal.creating
            : isEditing
              ? t.watchlist.customModal.saveSubmit
              : t.watchlist.customModal.createSubmit}
        </Button>
      </div>
    </form>
  );
}
