import { AlertTriangle, CheckCircle2, PieChart, ShieldAlert } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { PortfolioRiskSummary } from '@/shared/domain';
import { Badge, Card, cn, RolePill, TermTooltip } from '@/client/components/ui/primitives';
import { useI18n } from '@/client/i18n/useI18n';
import { formatIdr, formatPercent } from '@/client/lib/formatters';
import { useCalcMode } from '@/client/lib/useCalcMode';
import { MASKED_IDR, usePrivacy } from '@/client/lib/usePrivacy';

interface PortfolioRiskXrayCardProps {
  risk: PortfolioRiskSummary;
}

interface AllocationSlice {
  id: string;
  codeLabel: string;
  fullName: string;
  subBadge?: string;
  netMarketValue: number;
  weightPct: number;
  isAlert: boolean;
  color: string;
}

const HEALTHY_PALETTE = [
  '#00ab6b', // Stockbit Emerald 600
  '#0284c7', // Sky 600
  '#0d9488', // Teal 600
  '#4f46e5', // Indigo 600
  '#2563eb', // Blue 600
  '#059669', // Deep Emerald
  '#475569', // Slate 600
  '#94a3b8', // Slate 400
] as const;

const ALERT_PALETTE = [
  '#d97706', // Warning Amber 600
  '#ea580c', // Orange 600
  '#b45309', // Amber 700
] as const;

const MAX_COMPACT_STOCK_SLOTS = 8;

function polarToCartesian(cx: number, cy: number, radius: number, angleRad: number) {
  const theta = angleRad - Math.PI / 2;
  return {
    x: cx + radius * Math.cos(theta),
    y: cy + radius * Math.sin(theta),
  };
}

function describeDonutArc(
  cx: number,
  cy: number,
  rOuter: number,
  rInner: number,
  startAngle: number,
  endAngle: number,
): string {
  const clampedEnd =
    endAngle - startAngle >= Math.PI * 2 - 0.001
      ? startAngle + Math.PI * 2 - 0.001
      : endAngle;
  const delta = Math.max(0.001, clampedEnd - startAngle);
  const largeArcFlag = delta > Math.PI ? 1 : 0;

  const outStart = polarToCartesian(cx, cy, rOuter, startAngle);
  const outEnd = polarToCartesian(cx, cy, rOuter, clampedEnd);
  const inEnd = polarToCartesian(cx, cy, rInner, clampedEnd);
  const inStart = polarToCartesian(cx, cy, rInner, startAngle);

  return [
    `M ${outStart.x.toFixed(2)} ${outStart.y.toFixed(2)}`,
    `A ${rOuter} ${rOuter} 0 ${largeArcFlag} 1 ${outEnd.x.toFixed(2)} ${outEnd.y.toFixed(2)}`,
    `L ${inEnd.x.toFixed(2)} ${inEnd.y.toFixed(2)}`,
    `A ${rInner} ${rInner} 0 ${largeArcFlag} 0 ${inStart.x.toFixed(2)} ${inStart.y.toFixed(2)}`,
    'Z',
  ].join(' ');
}

function AllocationDonutChart({
  slices,
  activeId,
  onSelect,
  ariaLabel,
}: {
  slices: AllocationSlice[];
  activeId: string | null;
  onSelect: (id: string | null) => void;
  ariaLabel: string;
}) {
  const activeSlice = slices.find((s) => s.id === activeId) ?? slices[0];

  const arcs = useMemo(() => {
    const totalWeight = slices.reduce((sum, s) => sum + Math.max(0, s.weightPct), 0) || 100;
    const result: Array<{ slice: AllocationSlice; startAngle: number; endAngle: number }> = [];
    let cursor = 0;
    for (const slice of slices) {
      const fraction = Math.max(0, slice.weightPct) / totalWeight;
      const startAngle = cursor;
      const endAngle = cursor + fraction * Math.PI * 2;
      cursor = endAngle;
      result.push({
        slice,
        startAngle,
        endAngle,
      });
    }
    return result;
  }, [slices]);

  return (
    <div className="relative flex h-28 w-28 shrink-0 items-center justify-center">
      <svg
        viewBox="0 0 112 112"
        width={112}
        height={112}
        role="img"
        aria-label={ariaLabel}
        className="overflow-visible"
        onMouseLeave={() => onSelect(null)}
      >
        {arcs.map(({ slice, startAngle, endAngle }) => {
          const isSelected = activeSlice?.id === slice.id;
          const isDimmed = activeId !== null && activeId !== slice.id;
          const rOuter = isSelected && slices.length > 1 ? 50 : 47;
          const rInner = 31;

          return (
            <path
              key={slice.id}
              d={describeDonutArc(56, 56, rOuter, rInner, startAngle, endAngle)}
              fill={slice.color}
              stroke="var(--color-panel)"
              strokeWidth={slices.length > 1 ? 1.5 : 0}
              className="cursor-pointer transition-all duration-150 ease-out"
              style={{ opacity: isDimmed ? 0.55 : 1 }}
              onMouseEnter={() => onSelect(slice.id)}
              onClick={() => onSelect(slice.id)}
            >
              <title>{`${slice.codeLabel} — ${slice.fullName} (${formatPercent(slice.weightPct)})`}</title>
            </path>
          );
        })}
      </svg>

      {activeSlice && (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-3 text-center">
          <span className="max-w-[54px] truncate font-mono text-[10px] font-bold text-muted">
            {activeSlice.codeLabel}
          </span>
          <span
            className={cn(
              'font-mono text-xs font-bold tabular-nums leading-tight',
              activeSlice.isAlert ? 'text-warning-700' : 'text-ink',
            )}
          >
            {formatPercent(activeSlice.weightPct)}
          </span>
        </div>
      )}
    </div>
  );
}

export function PortfolioRiskXrayCard({ risk }: PortfolioRiskXrayCardProps) {
  const { t } = useI18n();
  const { hideBalances } = usePrivacy();
  const { isBrokerGross } = useCalcMode();
  const [hoveredStockId, setHoveredStockId] = useState<string | null>(null);
  const [hoveredSectorId, setHoveredSectorId] = useState<string | null>(null);
  const [showAllStocks, setShowAllStocks] = useState(false);

  const stockSlices = useMemo<AllocationSlice[]>(() => {
    let alertIdx = 0;
    let healthyIdx = 0;

    const items = risk.stockWeights;
    const shouldGroupOverflow = !showAllStocks && items.length > MAX_COMPACT_STOCK_SLOTS;
    const visibleItems = shouldGroupOverflow
      ? items.slice(0, MAX_COMPACT_STOCK_SLOTS - 1)
      : items;
    const overflowItems = shouldGroupOverflow
      ? items.slice(MAX_COMPACT_STOCK_SLOTS - 1)
      : [];

    const mapped: AllocationSlice[] = [];
    for (const sw of visibleItems) {
      const color = sw.isOverweight
        ? ALERT_PALETTE[alertIdx++ % ALERT_PALETTE.length]!
        : HEALTHY_PALETTE[healthyIdx++ % HEALTHY_PALETTE.length]!;
      mapped.push({
        id: sw.ticker,
        codeLabel: sw.ticker,
        fullName: sw.companyName,
        netMarketValue: sw.netMarketValue,
        weightPct: sw.weightPct,
        isAlert: sw.isOverweight,
        color,
      });
    }

    if (overflowItems.length > 0) {
      const othersValue = overflowItems.reduce((sum, s) => sum + s.netMarketValue, 0);
      const othersWeight =
        Math.round(overflowItems.reduce((sum, s) => sum + s.weightPct, 0) * 100) / 100;
      mapped.push({
        id: '__OTHERS__',
        codeLabel: `+${overflowItems.length} ${t.watchlist.xray.othersLabel}`,
        fullName: overflowItems.map((s) => s.ticker).join(', '),
        netMarketValue: othersValue,
        weightPct: othersWeight,
        isAlert: false,
        color: '#94a3b8',
      });
    }

    return mapped;
  }, [risk.stockWeights, showAllStocks, t.watchlist.xray.othersLabel]);

  const sectorSlices = useMemo<AllocationSlice[]>(() => {
    let alertIdx = 0;
    let healthyIdx = 0;
    const mapped: AllocationSlice[] = [];

    for (const sec of risk.sectorWeights) {
      const color = sec.isOverconcentrated
        ? ALERT_PALETTE[alertIdx++ % ALERT_PALETTE.length]!
        : HEALTHY_PALETTE[healthyIdx++ % HEALTHY_PALETTE.length]!;
      const label = t.sectors[sec.sector];
      mapped.push({
        id: sec.sector,
        codeLabel: label,
        fullName: label,
        subBadge: String(sec.stockCount),
        netMarketValue: sec.netMarketValue,
        weightPct: sec.weightPct,
        isAlert: sec.isOverconcentrated,
        color,
      });
    }
    return mapped;
  }, [risk.sectorWeights, t.sectors]);

  if (risk.activeHoldingsCount === 0) return null;

  const hasAlerts = risk.alerts.length > 0;
  const activeStock =
    stockSlices.find((s) => s.id === hoveredStockId) ?? stockSlices[0] ?? null;
  const activeSector =
    sectorSlices.find((s) => s.id === hoveredSectorId) ?? sectorSlices[0] ?? null;

  return (
    <Card variant="display" className="space-y-3 px-4 py-3.5 animate-fade-up">
      {/* Compact Header Row */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-md bg-brand-50 text-brand-700">
            <PieChart className="h-3.5 w-3.5" aria-hidden="true" />
          </span>
          <h3 className="font-display text-sm font-bold text-ink">
            <TermTooltip
              label={t.watchlist.xray.title}
              definition={t.glossary.portfolioXray}
            />
          </h3>
          <RolePill role="display" label={t.common.displayTag} />
          <span className="hidden text-xs text-muted sm:inline">·</span>
          <p className="text-[11px] text-muted">
            {isBrokerGross ? t.watchlist.xray.subtitleGross : t.watchlist.xray.subtitle}
          </p>
        </div>

        {risk.activeHoldingsCount === 1 ? (
          <span className="text-xs text-muted">{t.watchlist.xray.singleHoldingNote}</span>
        ) : hasAlerts ? (
          <Badge tone="warning">
            <AlertTriangle className="h-3 w-3" />
            {t.watchlist.xray.alertBadge} ({risk.alerts.length})
          </Badge>
        ) : (
          <Badge tone="positive">
            <CheckCircle2 className="h-3 w-3" />
            {t.watchlist.xray.healthyBadge}
          </Badge>
        )}
      </div>

      {/* Slim Single-Line Alert Strip */}
      {hasAlerts && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-warning-600/25 bg-warning-50/70 px-3 py-1.5 text-[11px] text-warning-700">
          <ShieldAlert className="h-3.5 w-3.5 shrink-0" />
          <div className="flex flex-wrap gap-x-4 gap-y-0.5">
            {risk.alerts.map((alert) => (
              <span key={`${alert.code}-${alert.target}`} className="font-medium">
                <strong className="font-mono">
                  {alert.code === 'SECTOR_CONCENTRATION'
                    ? t.sectors[alert.target as keyof typeof t.sectors]
                    : alert.target}
                </strong>{' '}
                ({formatPercent(alert.weightPct)}){' '}
                {alert.code === 'SINGLE_STOCK_CONCENTRATION'
                  ? t.watchlist.xray.singleStockAlert
                  : t.watchlist.xray.sectorAlert}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Side-by-Side Donut Chart + High-Density Legend Panels */}
      <div className="grid grid-cols-1 gap-3.5 lg:grid-cols-2">
        {/* Left Panel: Stock Allocation Donut + 2-Column Compact Legend */}
        <div className="flex flex-col justify-between rounded-lg border border-border/80 bg-surface/40 p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="text-xs font-semibold text-muted">
              {t.watchlist.xray.byStockTitle}
            </span>
            {risk.stockWeights.length > MAX_COMPACT_STOCK_SLOTS && (
              <button
                type="button"
                onClick={() => setShowAllStocks((prev) => !prev)}
                className="text-[11px] font-semibold text-brand-700 hover:underline cursor-pointer"
              >
                {showAllStocks
                  ? t.watchlist.xray.showCompact
                  : `${t.watchlist.xray.showAll} (${risk.stockWeights.length})`}
              </button>
            )}
          </div>

          <div className="flex flex-col items-center gap-3 sm:flex-row">
            <AllocationDonutChart
              slices={stockSlices}
              activeId={hoveredStockId}
              onSelect={setHoveredStockId}
              ariaLabel={t.watchlist.xray.byStockTitle}
            />

            <div className="grid w-full flex-1 grid-cols-2 gap-1.5">
              {stockSlices.map((slice) => {
                const isActive = activeStock?.id === slice.id;
                return (
                  <button
                    key={slice.id}
                    type="button"
                    onMouseEnter={() => setHoveredStockId(slice.id)}
                    onFocus={() => setHoveredStockId(slice.id)}
                    onMouseLeave={() => setHoveredStockId(null)}
                    title={`${slice.codeLabel} — ${slice.fullName}: ${hideBalances ? MASKED_IDR : formatIdr(slice.netMarketValue)} (${formatPercent(slice.weightPct)})`}
                    className={cn(
                      'flex items-center justify-between gap-1.5 rounded-md border px-2 py-1 text-left text-xs transition-colors cursor-pointer',
                      isActive
                        ? 'border-brand-600/40 bg-panel shadow-2xs'
                        : 'border-border/70 bg-panel/70 hover:border-border hover:bg-panel',
                    )}
                  >
                    <span className="flex min-w-0 items-center gap-1.5">
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: slice.color }}
                        aria-hidden="true"
                      />
                      <span className="truncate font-mono text-[11px] font-bold text-ink">
                        {slice.codeLabel}
                      </span>
                    </span>
                    <span
                      className={cn(
                        'shrink-0 font-mono text-[11px] font-bold tabular-nums',
                        slice.isAlert ? 'text-warning-700' : 'text-ink',
                      )}
                    >
                      {formatPercent(slice.weightPct)}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {activeStock && (
            <div className="mt-2.5 flex items-center justify-between gap-2 border-t border-border/70 pt-2 text-[11px]">
              <div className="flex min-w-0 items-center gap-1.5">
                <span
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: activeStock.color }}
                  aria-hidden="true"
                />
                <span className="font-mono font-bold text-ink">{activeStock.codeLabel}</span>
                <span className="truncate text-muted">{activeStock.fullName}</span>
              </div>
              <div className="flex shrink-0 items-center gap-2 font-mono tabular-nums">
                <span className="text-muted">
                  {hideBalances ? MASKED_IDR : formatIdr(activeStock.netMarketValue)}
                </span>
                <span
                  className={cn(
                    'font-bold',
                    activeStock.isAlert ? 'text-warning-700' : 'text-ink',
                  )}
                >
                  {formatPercent(activeStock.weightPct)}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Right Panel: Sector Allocation Donut + Compact Sector Legend */}
        <div className="flex flex-col justify-between rounded-lg border border-border/80 bg-surface/40 p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="text-xs font-semibold text-muted">
              {t.watchlist.xray.bySectorTitle}
            </span>
            <span className="font-mono text-[11px] text-muted">
              {risk.sectorWeights.length} {t.watchlist.xray.sectorsCountLabel}
            </span>
          </div>

          <div className="flex flex-col items-center gap-3 sm:flex-row">
            <AllocationDonutChart
              slices={sectorSlices}
              activeId={hoveredSectorId}
              onSelect={setHoveredSectorId}
              ariaLabel={t.watchlist.xray.bySectorTitle}
            />

            <div
              className={cn(
                'grid w-full flex-1 gap-1.5',
                sectorSlices.length > 4 ? 'grid-cols-2' : 'grid-cols-1',
              )}
            >
              {sectorSlices.map((slice) => {
                const isActive = activeSector?.id === slice.id;
                return (
                  <button
                    key={slice.id}
                    type="button"
                    onMouseEnter={() => setHoveredSectorId(slice.id)}
                    onFocus={() => setHoveredSectorId(slice.id)}
                    onMouseLeave={() => setHoveredSectorId(null)}
                    title={`${slice.fullName} (${slice.subBadge}): ${hideBalances ? MASKED_IDR : formatIdr(slice.netMarketValue)} (${formatPercent(slice.weightPct)})`}
                    className={cn(
                      'flex items-center justify-between gap-2 rounded-md border px-2.5 py-1 text-left text-xs transition-colors cursor-pointer',
                      isActive
                        ? 'border-brand-600/40 bg-panel shadow-2xs'
                        : 'border-border/70 bg-panel/70 hover:border-border hover:bg-panel',
                    )}
                  >
                    <span className="flex min-w-0 items-center gap-1.5">
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: slice.color }}
                        aria-hidden="true"
                      />
                      <span className="truncate text-[11px] font-semibold text-ink">
                        {slice.codeLabel}
                      </span>
                      {slice.subBadge && (
                        <span className="shrink-0 rounded-full bg-surface px-1.5 py-0.2 font-mono text-[10px] text-muted">
                          {slice.subBadge}
                        </span>
                      )}
                    </span>
                    <span className="flex shrink-0 items-center gap-2 font-mono text-[11px] tabular-nums">
                      {sectorSlices.length <= 4 && (
                        <span className="hidden text-muted sm:inline">
                          {hideBalances ? MASKED_IDR : formatIdr(slice.netMarketValue)}
                        </span>
                      )}
                      <span
                        className={cn(
                          'font-bold',
                          slice.isAlert ? 'text-warning-700' : 'text-ink',
                        )}
                      >
                        {formatPercent(slice.weightPct)}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {activeSector && (
            <div className="mt-2.5 flex items-center justify-between gap-2 border-t border-border/70 pt-2 text-[11px]">
              <div className="flex min-w-0 items-center gap-1.5">
                <span
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: activeSector.color }}
                  aria-hidden="true"
                />
                <span className="truncate font-semibold text-ink">{activeSector.fullName}</span>
                {activeSector.subBadge && (
                  <span className="shrink-0 font-mono text-muted">
                    ({activeSector.subBadge} {t.watchlist.xray.stocksCountLabel})
                  </span>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-2 font-mono tabular-nums">
                <span className="text-muted">
                  {hideBalances ? MASKED_IDR : formatIdr(activeSector.netMarketValue)}
                </span>
                <span
                  className={cn(
                    'font-bold',
                    activeSector.isAlert ? 'text-warning-700' : 'text-ink',
                  )}
                >
                  {formatPercent(activeSector.weightPct)}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}
