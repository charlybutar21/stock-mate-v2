import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Briefcase,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Eye,
  EyeOff,
  Filter,
  Layers,
  PieChart,
  TrendingUp,
  Wallet,
} from 'lucide-react';
import type { CatalogSummaryDto } from '@/shared/contracts';
import type { PortfolioRiskSummary } from '@/shared/domain';
import { CalcModeSwitcher } from '@/client/components/ui/CalcModeSwitcher';
import {
  Badge,
  Card,
  cn,
  SectionHeader,
  Skeleton,
  TermTooltip,
} from '@/client/components/ui/primitives';
import { useI18n } from '@/client/i18n/useI18n';
import { formatIdr, formatNumber, formatPercent, formatShortDate } from '@/client/lib/formatters';
import { useCalcMode } from '@/client/lib/useCalcMode';
import { MASKED_IDR, usePrivacy } from '@/client/lib/usePrivacy';
import { PortfolioRiskXrayCard } from './PortfolioRiskXrayCard';

export interface PortfolioKpis {
  myStocksCount: number;
  portfolioMarketValue: number;
  totalInvestedCapital: number;
  totalNetPnL: number | null;
  totalNetPnLPct: number | null;
}

interface PortfolioOverviewSectionProps {
  kpis: PortfolioKpis;
  portfolioRisk: PortfolioRiskSummary;
  summary: CatalogSummaryDto | undefined;
  customGroupsCount: number;
  isPersonalLoading: boolean;
  isCatalogLoading: boolean;
  isMyStocksTabActive: boolean;
  isUndervaluedQuickFilterActive: boolean;
  showXray: boolean;
  onToggleXray: () => void;
  onToggleMyStocksTab: () => void;
  onToggleUndervaluedFilter: () => void;
}

export function PortfolioOverviewSection({
  kpis,
  portfolioRisk,
  summary,
  customGroupsCount,
  isPersonalLoading,
  isCatalogLoading,
  isMyStocksTabActive,
  isUndervaluedQuickFilterActive,
  showXray,
  onToggleXray,
  onToggleMyStocksTab,
  onToggleUndervaluedFilter,
}: PortfolioOverviewSectionProps) {
  const { t, lang } = useI18n();
  const { hideBalances, toggleHideBalances } = usePrivacy();
  const { isBrokerGross } = useCalcMode();

  const hasHoldings = portfolioRisk.activeHoldingsCount > 0;
  const hasRiskAlerts = portfolioRisk.alerts.length > 0;

  return (
    <section className="space-y-4 animate-fade-up" aria-label={t.watchlist.sectionOverview}>
      <SectionHeader
        title={t.watchlist.sectionOverview}
        subtitle={t.watchlist.sectionOverviewSub}
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
                  className="inline-flex h-8 w-8 sm:h-6 sm:w-6 items-center justify-center rounded-md text-muted transition-colors hover:bg-subtle hover:text-ink cursor-pointer"
                >
                  {hideBalances ? (
                    <EyeOff className="h-3.5 w-3.5" aria-hidden="true" />
                  ) : (
                    <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                  )}
                </button>
              </div>
              <div className="mt-2 font-mono text-2xl font-bold tracking-tight text-ink tabular-nums sm:text-3xl">
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
                    label={isBrokerGross ? t.watchlist.kpiTotalPnLGross : t.watchlist.kpiTotalPnL}
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

            <button
              type="button"
              onClick={onToggleMyStocksTab}
              aria-pressed={isMyStocksTabActive}
              className={cn(
                'inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-semibold transition-colors cursor-pointer',
                isMyStocksTabActive
                  ? 'border-brand-600/40 bg-brand-50 text-brand-700'
                  : 'border-border bg-panel text-ink hover:border-brand-600/40 hover:bg-brand-50 hover:text-brand-700',
              )}
            >
              <Briefcase className="h-3.5 w-3.5 text-brand-700" aria-hidden="true" />
              <span className="font-mono">{kpis.myStocksCount}</span>
              <span>{t.watchlist.tabMyStocks}</span>
            </button>
          </div>
        </Card>

        {/* Secondary Insight Cards */}
        <div className="grid grid-cols-2 gap-4 lg:col-span-5">
          <button
            type="button"
            onClick={onToggleUndervaluedFilter}
            title={t.watchlist.filterByUndervaluedHint}
            aria-pressed={isUndervaluedQuickFilterActive}
            className={cn(
              'flex flex-col justify-between rounded-xl border p-4 sm:p-5 text-left transition-all cursor-pointer surface-interactive',
              isUndervaluedQuickFilterActive
                ? 'border-positive-600 bg-positive-50/60'
                : 'border-border bg-display hover:bg-panel',
            )}
          >
            <div className="flex w-full items-center justify-between">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-positive-50 text-positive-700">
                <TrendingUp className="h-4 w-4" aria-hidden="true" />
              </span>
              {isUndervaluedQuickFilterActive ? (
                <Badge tone="positive">{t.common.activeTag}</Badge>
              ) : (
                <span className="inline-flex items-center gap-1 text-[10px] font-semibold tracking-wide text-muted uppercase">
                  <Filter className="h-3 w-3" aria-hidden="true" />
                  {t.common.filterTag}
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
              <div className="mt-1 font-mono text-2xl font-bold text-positive-700 tabular-nums sm:text-3xl">
                {isCatalogLoading && !summary ? (
                  <Skeleton className="h-8 w-14" />
                ) : (
                  formatNumber(summary?.undervalued ?? 0)
                )}
              </div>
            </div>
          </button>

          <Card variant="display" className="flex flex-col justify-between p-4 sm:p-5">
            <div className="flex items-center justify-between gap-1">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-subtle text-ink">
                <Layers className="h-4 w-4" aria-hidden="true" />
              </span>
              {summary?.lastSyncedAt && (
                <span
                  className="inline-flex items-center gap-1 truncate text-[10px] font-medium text-muted"
                  title={`${t.watchlist.lastSyncedPrefix}: ${formatShortDate(summary.lastSyncedAt, lang)}`}
                >
                  <Clock className="h-3 w-3 shrink-0" aria-hidden="true" />
                  <span className="truncate">{formatShortDate(summary.lastSyncedAt, lang)}</span>
                </span>
              )}
            </div>
            <div className="mt-4">
              <div className="text-xs font-medium text-muted">{t.watchlist.kpiSyncedIhsg}</div>
              <div className="mt-1 font-mono text-2xl font-bold text-ink tabular-nums sm:text-3xl">
                {isCatalogLoading && !summary ? (
                  <Skeleton className="h-8 w-14" />
                ) : (
                  formatNumber(summary?.totalStocks ?? 0)
                )}
              </div>
              {!isPersonalLoading && (
                <div className="mt-1 font-mono text-[11px] text-muted tabular-nums">
                  {kpis.myStocksCount} {t.watchlist.tabMyStocks} · {customGroupsCount}{' '}
                  {t.watchlist.tabCustomGroupLabel}
                </div>
              )}
            </div>
          </Card>
        </div>
      </div>

      {/* Progressive Disclosure Strip for Portfolio Risk & Sector Allocation X-Ray */}
      {!isPersonalLoading && hasHoldings && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-display px-4 py-2.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-md bg-brand-50 text-brand-700">
                <PieChart className="h-3.5 w-3.5" aria-hidden="true" />
              </span>
              <span className="text-xs font-semibold text-ink">
                <TermTooltip
                  label={t.watchlist.xray.title}
                  definition={t.glossary.portfolioXray}
                />
              </span>
              {portfolioRisk.activeHoldingsCount === 1 ? (
                <span className="text-xs text-muted">{t.watchlist.xray.singleHoldingNote}</span>
              ) : hasRiskAlerts ? (
                <Badge tone="warning">
                  <AlertTriangle className="h-3 w-3" aria-hidden="true" />
                  {t.watchlist.xray.alertBadge} ({portfolioRisk.alerts.length})
                </Badge>
              ) : (
                <Badge tone="positive">
                  <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
                  {t.watchlist.xray.healthyBadge}
                </Badge>
              )}
            </div>

            <button
              type="button"
              onClick={onToggleXray}
              aria-expanded={showXray}
              className="inline-flex h-8 items-center gap-1 rounded-lg border border-border bg-panel px-2.5 text-xs font-semibold text-brand-700 transition-colors hover:border-brand-600/40 hover:bg-brand-50 cursor-pointer"
            >
              <span>{showXray ? t.watchlist.xray.hideChart : t.watchlist.xray.showChart}</span>
              {showXray ? (
                <ChevronUp className="h-3.5 w-3.5" aria-hidden="true" />
              ) : (
                <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
              )}
            </button>
          </div>

          {showXray && <PortfolioRiskXrayCard risk={portfolioRisk} />}
        </div>
      )}
    </section>
  );
}
