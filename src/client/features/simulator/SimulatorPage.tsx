import { ArrowUpRight, Info, Layers, Plus, Target, TrendingDown } from 'lucide-react';
import { lazy, Suspense, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { DEFAULT_BUY_FEE_PCT, DEFAULT_SELL_FEE_PCT } from '@/shared/domain';
import {
  Badge,
  Card,
  cn,
  Field,
  Input,
  RolePill,
  Select,
  Skeleton,
  TermTooltip,
} from '@/client/components/ui/primitives';
import { useWatchlist } from '@/client/features/watchlist/useWatchlist';
import { statusTone } from '@/client/lib/valuationTone';
import { useI18n } from '@/client/i18n/useI18n';
import { formatIdr, formatPercent } from '@/client/lib/formatters';
import { ForwardTab } from './ForwardTab';

const GoalSeekTab = lazy(() =>
  import('./GoalSeekTab').then((m) => ({ default: m.GoalSeekTab })),
);
const PyramidingTab = lazy(() =>
  import('./PyramidingTab').then((m) => ({ default: m.PyramidingTab })),
);
const TakeProfitTab = lazy(() =>
  import('./TakeProfitTab').then((m) => ({ default: m.TakeProfitTab })),
);

type SimulatorTabMode = 'forward' | 'pyramiding' | 'takeProfit' | 'goalSeek';

export function SimulatorPage() {
  const { t } = useI18n();
  const [searchParams, setSearchParams] = useSearchParams();
  const { data: items, isLoading } = useWatchlist({ sort: 'ticker_asc' });

  const requestedId = searchParams.get('stockId');
  const [selectedId, setSelectedId] = useState<string>('');
  const [activeTab, setActiveTab] = useState<SimulatorTabMode>('forward');

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
          <h1 className="font-display text-2xl font-bold tracking-tight text-ink">
            {t.simulator.title}
          </h1>
          <p className="mt-0.5 text-sm text-muted">{t.simulator.subtitle}</p>
        </div>
        <Card variant="display" className="py-14 text-center">
          <h2 className="text-base font-semibold text-ink">{t.simulator.emptyTitle}</h2>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted">{t.simulator.emptyBody}</p>
          <Link
            to="/watchlist"
            className="mt-5 inline-flex h-9 items-center gap-2 rounded-lg bg-brand-solid px-4 text-sm font-medium text-white transition-colors hover:bg-brand-solid-hover"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            {t.simulator.emptyAction}
          </Link>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Page Title & IDX Tick Guide */}
      <div className="flex flex-col gap-3 border-b border-border pb-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-ink sm:text-3xl">
            {t.simulator.title}
          </h1>
          <p className="mt-1 text-sm text-muted">{t.simulator.subtitle}</p>
        </div>
        <div className="inline-flex items-center gap-2 rounded-lg border border-border bg-display px-3 py-2 text-[11px] text-muted">
          <Info className="h-3.5 w-3.5 shrink-0 text-brand-600" aria-hidden="true" />
          <span>{t.simulator.tickRulesHint}</span>
        </div>
      </div>

      {/* Top Strip: Clearly Separated Editable Setup (Left) vs Display Stock Snapshot (Right) */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        {/* Editable Setup Card */}
        <Card variant="editable" className="overflow-hidden p-0 lg:col-span-6">
          <div className="flex items-center justify-between gap-2 border-b border-border bg-editable-header px-4 py-2.5">
            <span className="text-xs font-bold text-ink">{t.simulator.sectionConfig}</span>
            <RolePill role="editable" label={t.common.editableTag} />
          </div>

          <div className="space-y-4 p-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-12 sm:items-end">
              <div className="sm:col-span-6">
                <Field label={t.simulator.selectStock} htmlFor="sim-stock-select">
                  <Select
                    id="sim-stock-select"
                    value={effectiveSelectedId}
                    onChange={(e) => handleSelectStock(e.target.value)}
                  >
                    {items.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.ticker} - {item.companyName}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>
              <div className="sm:col-span-3">
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
              <div className="sm:col-span-3">
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

            <div className="border-t border-border/80 pt-3">
              <label className="inline-flex cursor-pointer items-center gap-2 text-xs font-medium text-ink">
                <input
                  type="checkbox"
                  checked={includeStampDuty}
                  onChange={(e) => setIncludeStampDuty(e.target.checked)}
                  className="h-4 w-4 rounded border-input-border accent-brand-600 cursor-pointer"
                />
                <TermTooltip
                  label={t.simulator.includeStampDuty}
                  definition={t.glossary.stampDuty}
                />
              </label>
            </div>
          </div>
        </Card>

        {/* Read-Only Selected Stock Reference Display Card */}
        {linkedStock && (
          <Card variant="display" className="flex flex-col justify-between overflow-hidden p-0 lg:col-span-6">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-subtle/60 px-4 py-2.5">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-ink">{t.simulator.sectionStockRef}</span>
                <RolePill role="display" label={t.common.displayTag} />
              </div>
              <Badge tone="neutral">{t.sectors[linkedStock.sector]}</Badge>
            </div>

            <div className="grid flex-1 grid-cols-1 gap-2.5 p-4 sm:grid-cols-3">
              <div className="flex flex-col justify-center rounded-lg border border-border bg-panel/70 px-3 py-2.5">
                <div className="text-[11px] text-muted">{t.simulator.linkedPrice}</div>
                <div className="mt-0.5 font-mono text-sm font-bold text-ink tabular-nums whitespace-nowrap">
                  {formatIdr(linkedStock.currentPrice)}
                </div>
              </div>
              <div className="flex flex-col justify-center rounded-lg border border-brand-600/25 bg-brand-50/75 px-3 py-2.5">
                <div className="text-[11px] text-brand-700">
                  <TermTooltip
                    label={t.simulator.linkedFairValue}
                    definition={t.glossary.fairValueMedian}
                  />
                </div>
                <div className="mt-0.5 font-mono text-sm font-bold text-brand-900 tabular-nums whitespace-nowrap">
                  {formatIdr(linkedStock.valuation.fairValue.moderate)}
                </div>
              </div>
              <div className="flex flex-col justify-center rounded-lg border border-border bg-panel/70 px-3 py-2.5">
                <div className="text-[11px] text-muted">
                  <TermTooltip
                    label={t.simulator.linkedMos}
                    definition={t.glossary.marginOfSafety}
                  />
                </div>
                <div className="mt-0.5 flex flex-wrap items-center gap-1">
                  <span className="font-mono text-sm font-bold text-ink tabular-nums whitespace-nowrap">
                    {formatPercent(linkedStock.valuation.mosPct, true)}
                  </span>
                  <Badge tone={statusTone(linkedStock.valuation.valuationStatus)}>
                    {t.valuationStatus[linkedStock.valuation.valuationStatus]}
                  </Badge>
                </div>
              </div>
            </div>
          </Card>
        )}
      </div>

      {/* Balanced 4-Column Mode Switcher */}
      <div
        className="grid grid-cols-2 gap-1 rounded-xl border border-border bg-subtle p-1 sm:grid-cols-4"
        role="tablist"
        aria-label="Simulator modes"
      >
        {(
          [
            ['forward', t.simulator.tabForward, TrendingDown],
            ['pyramiding', t.simulator.tabPyramiding, Layers],
            ['takeProfit', t.simulator.tabTakeProfit, ArrowUpRight],
            ['goalSeek', t.simulator.tabGoalSeek, Target],
          ] as const
        ).map(([mode, label, Icon]) => (
          <button
            key={mode}
            type="button"
            role="tab"
            aria-selected={activeTab === mode}
            onClick={() => setActiveTab(mode)}
            className={cn(
              'inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition-all sm:text-sm cursor-pointer',
              activeTab === mode
                ? 'bg-panel text-brand-700 shadow-xs ring-1 ring-border'
                : 'text-muted hover:text-ink',
            )}
          >
            <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span className="truncate">{label}</span>
          </button>
        ))}
      </div>

      {linkedStock && activeTab === 'forward' && (
        <ForwardTab
          key={`fwd-${linkedStock.id}-${linkedStock.ownedLots}-${linkedStock.avgBuyPrice ?? ''}`}
          linkedStock={linkedStock}
          buyFeePct={Number(buyFeePct || 0)}
          sellFeePct={Number(sellFeePct || 0)}
          includeStampDuty={includeStampDuty}
        />
      )}

      <Suspense fallback={<Skeleton className="h-72 w-full" />}>
        {linkedStock && activeTab === 'pyramiding' && (
          <PyramidingTab
            key={`pyr-${linkedStock.id}-${linkedStock.ownedLots}-${linkedStock.avgBuyPrice ?? ''}`}
            linkedStock={linkedStock}
            buyFeePct={Number(buyFeePct || 0)}
            sellFeePct={Number(sellFeePct || 0)}
            includeStampDuty={includeStampDuty}
          />
        )}

        {linkedStock && activeTab === 'takeProfit' && (
          <TakeProfitTab
            key={`tp-${linkedStock.id}-${linkedStock.ownedLots}-${linkedStock.avgBuyPrice ?? ''}`}
            linkedStock={linkedStock}
            buyFeePct={Number(buyFeePct || 0)}
            sellFeePct={Number(sellFeePct || 0)}
            includeStampDuty={includeStampDuty}
          />
        )}

        {linkedStock && activeTab === 'goalSeek' && (
          <GoalSeekTab
            key={`gs-${linkedStock.id}-${linkedStock.ownedLots}-${linkedStock.avgBuyPrice ?? ''}`}
            linkedStock={linkedStock}
            buyFeePct={Number(buyFeePct || 0)}
            includeStampDuty={includeStampDuty}
          />
        )}
      </Suspense>
    </div>
  );
}
