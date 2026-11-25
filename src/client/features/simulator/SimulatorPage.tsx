import { Plus } from 'lucide-react';
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { DEFAULT_BUY_FEE_PCT, DEFAULT_SELL_FEE_PCT } from '@/shared/domain';
import {
  Badge,
  Card,
  cn,
  Field,
  Input,
  Select,
  Skeleton,
  TermTooltip,
} from '@/client/components/ui/primitives';
import { useWatchlist } from '@/client/features/watchlist/useWatchlist';
import { statusTone } from '@/client/features/watchlist/WatchlistPage';
import { useI18n } from '@/client/i18n/useI18n';
import { formatIdr, formatPercent } from '@/client/lib/formatters';
import { ForwardTab } from './ForwardTab';
import { GoalSeekTab } from './GoalSeekTab';

export function SimulatorPage() {
  const { t } = useI18n();
  const [searchParams, setSearchParams] = useSearchParams();
  const { data: items, isLoading } = useWatchlist({ sort: 'ticker_asc' });

  const requestedId = searchParams.get('stockId');
  const [selectedId, setSelectedId] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'forward' | 'goalSeek'>('forward');

  const [buyFeePct, setBuyFeePct] = useState(String(DEFAULT_BUY_FEE_PCT));
  const [sellFeePct, setSellFeePct] = useState(String(DEFAULT_SELL_FEE_PCT));
  const [includeStampDuty, setIncludeStampDuty] = useState(false);

  const effectiveSelectedId = (() => {
    if (!items || items.length === 0) return '';
    if (selectedId && items.some((i) => i.id === selectedId)) return selectedId;
    if (requestedId && items.some((i) => i.id === requestedId)) return requestedId;
    return items[0]!.id;
  })();

  const linkedStock = (items ?? []).find((i) => i.id === effectiveSelectedId) ?? null;

  const handleSelectStock = (nextId: string) => {
    setSelectedId(nextId);
    setSearchParams({ stockId: nextId }, { replace: true });
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-72 w-full" />
      </div>
    );
  }

  if (!items || items.length === 0) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-ink">{t.simulator.title}</h1>
          <p className="mt-0.5 text-sm text-muted">{t.simulator.subtitle}</p>
        </div>
        <Card className="py-14 text-center">
          <h2 className="text-base font-semibold text-ink">{t.simulator.emptyTitle}</h2>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted">{t.simulator.emptyBody}</p>
          <Link
            to="/watchlist"
            className="mt-5 inline-flex h-9 items-center gap-2 rounded-lg bg-brand-600 px-4 text-sm font-medium text-white transition-colors hover:bg-brand-700"
          >
            <Plus className="h-4 w-4" />
            {t.simulator.emptyAction}
          </Link>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="border-b border-border pb-5">
        <h1 className="font-display text-3xl font-semibold tracking-tight text-ink">
          {t.simulator.title}
        </h1>
        <p className="mt-1 text-sm text-muted">{t.simulator.subtitle}</p>
      </div>

      {/* Linked Watchlist Stock Selector & Context Strip */}
      <Card className="space-y-4">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-12 md:items-end">
          <div className="md:col-span-5">
            <Field label={t.simulator.selectStock} htmlFor="sim-stock-select">
              <Select
                id="sim-stock-select"
                value={effectiveSelectedId}
                onChange={(e) => handleSelectStock(e.target.value)}
              >
                {items.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.ticker} — {item.companyName}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          {linkedStock && (
            <div className="grid grid-cols-3 gap-3 md:col-span-7">
              <div className="rounded-lg bg-subtle/70 px-3 py-2">
                <div className="text-[11px] text-muted">{t.simulator.linkedPrice}</div>
                <div className="font-mono text-sm font-semibold text-ink tabular-nums">
                  {formatIdr(linkedStock.currentPrice)}
                </div>
              </div>
              <div className="rounded-md border border-brand-600/20 bg-brand-50 px-3 py-2">
                <div className="text-[11px] text-brand-700">
                  <TermTooltip
                    label={t.simulator.linkedFairValue}
                    definition={t.glossary.fairValueMedian}
                  />
                </div>
                <div className="font-mono text-sm font-semibold text-brand-900 tabular-nums">
                  {formatIdr(linkedStock.valuation.fairValue.moderate)}
                </div>
              </div>
              <div className="rounded-md border border-border bg-surface px-3 py-2">
                <div className="text-[11px] text-muted">
                  <TermTooltip
                    label={t.simulator.linkedMos}
                    definition={t.glossary.marginOfSafety}
                  />
                </div>
                <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                  <span className="font-mono text-sm font-semibold text-ink tabular-nums">
                    {formatPercent(linkedStock.valuation.mosPct, true)}
                  </span>
                  <Badge tone={statusTone(linkedStock.valuation.valuationStatus)}>
                    {t.valuationStatus[linkedStock.valuation.valuationStatus]}
                  </Badge>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Broker Fee & Bea Materai Settings */}
        <div className="flex flex-col gap-3 border-t border-border pt-4 md:flex-row md:items-end md:justify-between">
          <div className="flex flex-wrap items-end gap-3">
            <div className="w-32">
              <Field label={t.simulator.buyFeePct} htmlFor="sim-buy-fee">
                <Input
                  id="sim-buy-fee"
                  type="number"
                  min={0}
                  max={10}
                  step="0.01"
                  value={buyFeePct}
                  onChange={(e) => setBuyFeePct(e.target.value)}
                  className="font-mono tabular-nums"
                />
              </Field>
            </div>
            <div className="w-32">
              <Field label={t.simulator.sellFeePct} htmlFor="sim-sell-fee">
                <Input
                  id="sim-sell-fee"
                  type="number"
                  min={0}
                  max={10}
                  step="0.01"
                  value={sellFeePct}
                  onChange={(e) => setSellFeePct(e.target.value)}
                  className="font-mono tabular-nums"
                />
              </Field>
            </div>
          </div>

          <label className="inline-flex cursor-pointer items-center gap-2 text-xs font-medium text-ink">
            <input
              type="checkbox"
              checked={includeStampDuty}
              onChange={(e) => setIncludeStampDuty(e.target.checked)}
              className="h-4 w-4 rounded border-border accent-brand-700"
            />
            <TermTooltip
              label={t.simulator.includeStampDuty}
              definition={t.glossary.stampDuty}
            />
          </label>
        </div>
      </Card>

      {/* Mode Switcher Tabs */}
      <div className="inline-flex rounded-lg border border-border bg-subtle p-1">
        <button
          type="button"
          onClick={() => setActiveTab('forward')}
          className={cn(
            'rounded-md px-4 py-1.5 text-sm font-medium transition-colors cursor-pointer',
            activeTab === 'forward' ? 'bg-panel text-ink shadow-xs' : 'text-muted hover:text-ink',
          )}
        >
          {t.simulator.tabForward}
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('goalSeek')}
          className={cn(
            'rounded-md px-4 py-1.5 text-sm font-medium transition-colors cursor-pointer',
            activeTab === 'goalSeek' ? 'bg-panel text-ink shadow-xs' : 'text-muted hover:text-ink',
          )}
        >
          {t.simulator.tabGoalSeek}
        </button>
      </div>

      {linkedStock && activeTab === 'forward' && (
        <ForwardTab
          key={`${linkedStock.id}-${linkedStock.ownedLots}-${linkedStock.avgBuyPrice ?? ''}`}
          linkedStock={linkedStock}
          buyFeePct={Number(buyFeePct || 0)}
          sellFeePct={Number(sellFeePct || 0)}
          includeStampDuty={includeStampDuty}
        />
      )}

      {linkedStock && activeTab === 'goalSeek' && (
        <GoalSeekTab
          key={`${linkedStock.id}-${linkedStock.ownedLots}-${linkedStock.avgBuyPrice ?? ''}`}
          linkedStock={linkedStock}
          buyFeePct={Number(buyFeePct || 0)}
          includeStampDuty={includeStampDuty}
        />
      )}
    </div>
  );
}
