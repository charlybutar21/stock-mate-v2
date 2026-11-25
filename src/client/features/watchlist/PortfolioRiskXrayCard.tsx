import { AlertTriangle, CheckCircle2, PieChart, ShieldAlert } from 'lucide-react';
import type { PortfolioRiskSummary } from '@/shared/domain';
import { Badge, Card, cn, TermTooltip } from '@/client/components/ui/primitives';
import { useI18n } from '@/client/i18n/useI18n';
import { formatIdr, formatPercent } from '@/client/lib/formatters';
import { MASKED_IDR, usePrivacy } from '@/client/lib/usePrivacy';

interface PortfolioRiskXrayCardProps {
  risk: PortfolioRiskSummary;
}

export function PortfolioRiskXrayCard({ risk }: PortfolioRiskXrayCardProps) {
  const { t } = useI18n();
  const { hideBalances } = usePrivacy();

  if (risk.activeHoldingsCount === 0) return null;

  const hasAlerts = risk.alerts.length > 0;

  return (
    <Card className="space-y-4 border-l-4 border-l-brand-600 p-5 animate-fade-up">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
              <PieChart className="h-4 w-4" />
            </span>
            <h2 className="font-display text-base font-bold text-ink">
              <TermTooltip
                label={t.watchlist.xray.title}
                definition={t.glossary.portfolioXray}
              />
            </h2>
          </div>
          <p className="mt-0.5 text-xs text-muted">{t.watchlist.xray.subtitle}</p>
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

      {hasAlerts && (
        <div className="flex flex-wrap gap-2 rounded-lg border border-warning-600/25 bg-warning-50/70 px-3.5 py-2.5 text-xs text-warning-700">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <div className="flex flex-wrap gap-x-4 gap-y-1">
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

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {/* Left: Stock Allocation */}
        <div className="space-y-2.5">
          <div className="text-xs font-semibold text-muted">
            {t.watchlist.xray.byStockTitle}
          </div>
          <div className="space-y-2">
            {risk.stockWeights.map((sw) => (
              <div
                key={sw.ticker}
                className="rounded-lg border border-border/80 bg-surface/60 px-3 py-2"
              >
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-ink">{sw.ticker}</span>
                    <span className="truncate text-muted max-w-44">{sw.companyName}</span>
                  </div>
                  <div className="flex items-center gap-2 font-mono tabular-nums">
                    <span className="text-[11px] text-muted">
                      {hideBalances ? MASKED_IDR : formatIdr(sw.netMarketValue)}
                    </span>
                    <span
                      className={cn(
                        'font-bold',
                        sw.isOverweight ? 'text-warning-700' : 'text-ink',
                      )}
                    >
                      {formatPercent(sw.weightPct)}
                    </span>
                  </div>
                </div>
                <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-border/60">
                  <div
                    className={cn(
                      'h-full rounded-full transition-all',
                      sw.isOverweight ? 'bg-warning-600' : 'bg-brand-600',
                    )}
                    style={{ width: `${Math.min(100, Math.max(2, sw.weightPct))}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right: Sector Allocation */}
        <div className="space-y-2.5">
          <div className="text-xs font-semibold text-muted">
            {t.watchlist.xray.bySectorTitle}
          </div>
          <div className="space-y-2">
            {risk.sectorWeights.map((sec) => (
              <div
                key={sec.sector}
                className="rounded-lg border border-border/80 bg-surface/60 px-3 py-2"
              >
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-ink">
                      {t.sectors[sec.sector]}
                    </span>
                    <span className="rounded-full bg-panel px-1.5 py-0.5 font-mono text-[10px] text-muted">
                      {sec.stockCount}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 font-mono tabular-nums">
                    <span className="text-[11px] text-muted">
                      {hideBalances ? MASKED_IDR : formatIdr(sec.netMarketValue)}
                    </span>
                    <span
                      className={cn(
                        'font-bold',
                        sec.isOverconcentrated ? 'text-warning-700' : 'text-ink',
                      )}
                    >
                      {formatPercent(sec.weightPct)}
                    </span>
                  </div>
                </div>
                <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-border/60">
                  <div
                    className={cn(
                      'h-full rounded-full transition-all',
                      sec.isOverconcentrated ? 'bg-warning-600' : 'bg-brand-600',
                    )}
                    style={{ width: `${Math.min(100, Math.max(2, sec.weightPct))}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Card>
  );
}
