import { AlertTriangle, Building2, CheckCircle2, Layers, ShieldCheck, Sparkles } from 'lucide-react';
import type { FundamentalsDto } from '@/shared/contracts';
import type { FundamentalQualitySummary, QualityPillarKey } from '@/shared/domain';
import { Badge, Card, cn, TermTooltip } from '@/client/components/ui/primitives';
import { useI18n } from '@/client/i18n/useI18n';
import { formatCompactIdr, formatMultiple, formatPercent } from '@/client/lib/formatters';
import {
  pillarScoreColorClass,
  pillarScoreTextClass,
  quadrantTone,
  qualityGradeTone,
} from './QualityScoreBadge';

interface MetricRowItem {
  label: string;
  tooltip: string;
  value: string;
  badge?: string;
}

function formatBoolCash(
  val: boolean | null,
  posLabel: string,
  negLabel: string,
): string {
  if (val === null) return '-';
  return val ? posLabel : negLabel;
}

export function QualityBreakdownCard({
  quality,
  fundamentals,
  dividendYieldPct,
  compact = false,
}: {
  quality: FundamentalQualitySummary;
  fundamentals: FundamentalsDto;
  dividendYieldPct: number;
  compact?: boolean;
}) {
  const { t, lang } = useI18n();
  const isFinancials = quality.track === 'FINANCIALS';

  const pillarMetrics: Record<QualityPillarKey, MetricRowItem[]> = {
    profitability: isFinancials
      ? [
          {
            label: t.radar.metrics.roe,
            tooltip: t.glossary.roe,
            value: formatPercent(fundamentals.roePct),
          },
          {
            label: t.radar.metrics.roa,
            tooltip: t.glossary.roa,
            value: formatPercent(fundamentals.roaPct),
          },
          {
            label: t.radar.metrics.npm,
            tooltip: t.glossary.npm,
            value: formatPercent(fundamentals.netMarginPct),
          },
        ]
      : [
          {
            label: t.radar.metrics.roe,
            tooltip: t.glossary.roe,
            value: formatPercent(fundamentals.roePct),
          },
          {
            label: t.radar.metrics.roic,
            tooltip: t.glossary.roic,
            value: formatPercent(fundamentals.roicPct),
          },
          {
            label: t.radar.metrics.opm,
            tooltip: t.glossary.opm,
            value: formatPercent(fundamentals.operatingMarginPct),
          },
          {
            label: t.radar.metrics.npm,
            tooltip: t.glossary.npm,
            value: formatPercent(fundamentals.netMarginPct),
          },
        ],
    growth: [
      {
        label: t.radar.metrics.revGrowth,
        tooltip: t.glossary.revenueGrowth,
        value: formatPercent(fundamentals.revenueGrowthPct, true),
      },
      {
        label: t.radar.metrics.epsGrowth,
        tooltip: t.glossary.epsGrowth,
        value: formatPercent(fundamentals.epsGrowthPct, true),
      },
      ...(fundamentals.netIncomeGrowthPct !== null
        ? [
            {
              label: t.radar.metrics.niGrowth,
              tooltip: t.glossary.epsGrowth,
              value: formatPercent(fundamentals.netIncomeGrowthPct, true),
            },
          ]
        : []),
    ],
    financialHealth: isFinancials
      ? [
          {
            label: t.radar.metrics.equityToAssets,
            tooltip: t.glossary.equityToAssets,
            value: formatPercent(fundamentals.equityToAssetsPct),
          },
          {
            label: t.radar.metrics.wholesaleDer,
            tooltip: t.glossary.wholesaleDer,
            value: formatMultiple(fundamentals.wholesaleDer),
          },
        ]
      : [
          {
            label: t.radar.metrics.der,
            tooltip: t.glossary.der,
            value: formatMultiple(fundamentals.der),
          },
          {
            label: t.radar.metrics.netDebtToEbitda,
            tooltip: t.glossary.netDebtToEbitda,
            value:
              fundamentals.netDebtToEbitda !== null && fundamentals.netDebtToEbitda <= 0
                ? t.radar.metrics.netCashTag
                : formatMultiple(fundamentals.netDebtToEbitda),
            badge:
              fundamentals.netDebtToEbitda !== null && fundamentals.netDebtToEbitda <= 0
                ? t.radar.metrics.netCashTag
                : undefined,
          },
          {
            label: t.radar.metrics.currentRatio,
            tooltip: t.glossary.currentRatio,
            value: formatMultiple(fundamentals.currentRatio),
          },
        ],
    cashFlow: isFinancials
      ? [
          {
            label: t.radar.metrics.cfoStatus,
            tooltip: t.glossary.cfoToNetIncome,
            value: formatBoolCash(
              fundamentals.cfoPositive,
              t.radar.metrics.positive,
              t.radar.metrics.negative,
            ),
          },
          {
            label: t.radar.metrics.fcfStatus,
            tooltip: t.glossary.fcfMargin,
            value: formatBoolCash(
              fundamentals.fcfPositive,
              t.radar.metrics.positive,
              t.radar.metrics.negative,
            ),
          },
          {
            label: t.radar.metrics.divYield,
            tooltip: t.glossary.dividendYield,
            value: formatPercent(dividendYieldPct),
          },
        ]
      : [
          {
            label: t.radar.metrics.cfoToNi,
            tooltip: t.glossary.cfoToNetIncome,
            value: formatMultiple(fundamentals.cfoToNetIncome),
          },
          {
            label: t.radar.metrics.fcfMargin,
            tooltip: t.glossary.fcfMargin,
            value: formatPercent(fundamentals.fcfMarginPct),
          },
          {
            label: t.radar.metrics.fcfYield,
            tooltip: t.glossary.fcfYield,
            value: formatPercent(fundamentals.fcfYieldPct),
          },
        ],
  };

  const pillarOrder: QualityPillarKey[] = [
    'profitability',
    'growth',
    'financialHealth',
    'cashFlow',
  ];

  return (
    <div className="space-y-4">
      {/* Hero Summary Row */}
      <div
        className={cn(
          'flex flex-col gap-4 rounded-xl border border-border bg-subtle/40 sm:flex-row sm:items-center sm:justify-between',
          compact ? 'p-4' : 'p-5',
        )}
      >
        <div className="flex items-center gap-4">
          <div
            className={cn(
              'flex h-16 w-16 shrink-0 flex-col items-center justify-center rounded-2xl border-2 font-mono',
              quality.grade === 'S' &&
                'border-positive-600 bg-positive-50 text-positive-700 ring-2 ring-positive-600/20',
              quality.grade === 'A' && 'border-positive-600/45 bg-positive-50/80 text-positive-700',
              quality.grade === 'B' && 'border-brand-600/45 bg-brand-50 text-brand-700',
              quality.grade === 'C' && 'border-warning-600/45 bg-warning-50 text-warning-700',
              quality.grade === 'D' && 'border-negative-600/40 bg-negative-50/75 text-negative-700',
              quality.grade === 'E' && 'border-negative-600 bg-negative-50 text-negative-700',
              quality.grade === 'INSUFFICIENT_DATA' && 'border-border bg-panel text-muted',
            )}
          >
            <span className="text-2xl font-extrabold leading-none tabular-nums">
              {quality.score !== null ? quality.score : '–'}
            </span>
            <span className="mt-0.5 text-[10px] font-bold tracking-wider uppercase">/ 100</span>
          </div>

          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-bold text-ink">
                <TermTooltip label={t.radar.sectionQualityTitle} definition={t.glossary.fqs} />
              </span>
              <Badge tone={qualityGradeTone(quality.grade)}>
                {quality.grade !== 'INSUFFICIENT_DATA' ? `Grade ${quality.grade} · ` : ''}
                {t.radar.gradeLabels[quality.grade]}
              </Badge>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <Badge tone={quadrantTone(quality.qarpQuadrant)}>
                <Sparkles className="h-3 w-3" aria-hidden="true" />
                {t.radar.quadrantLabels[quality.qarpQuadrant]}
              </Badge>
              <Badge tone="neutral">
                <Building2 className="h-3 w-3" aria-hidden="true" />
                {t.radar.trackLabels[quality.track]}
              </Badge>
              <Badge tone="neutral">
                <Layers className="h-3 w-3" aria-hidden="true" />
                {t.radar.coverageLabel}: {quality.availablePillars}/4 {t.radar.pillarsUnit}
              </Badge>
            </div>
          </div>
        </div>
      </div>

      {/* Weak-Link Cap Notice */}
      {quality.appliedCaps.length > 0 && quality.rawCompositeScore !== null && quality.score !== null && (
        <div className="rounded-xl border border-warning-600/35 bg-warning-50/70 p-3.5 text-xs">
          <div className="flex flex-wrap items-center justify-between gap-2 font-semibold text-warning-700">
            <span className="inline-flex items-center gap-1.5">
              <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
              {t.radar.capNoticeTitle}
            </span>
            <span className="font-mono tabular-nums">
              {t.radar.capFromTo} {quality.rawCompositeScore} → {quality.score}
            </span>
          </div>
          <ul className="mt-1.5 space-y-1 text-ink/90">
            {quality.appliedCaps.map((code) => (
              <li key={code} className="flex items-start gap-2">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-warning-600" />
                <span>{t.radar.capReasons[code]}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* 4 Pillars Grid */}
      <div className="grid grid-cols-1 gap-3.5 md:grid-cols-2">
        {pillarOrder.map((key) => {
          const pillar = quality.pillars[key];
          const pct = pillar.score ?? 0;
          const rows = pillarMetrics[key];
          return (
            <Card key={key} variant="display" className="p-4">
              <div className="flex items-baseline justify-between gap-2">
                <div>
                  <h4 className="font-display text-sm font-bold text-ink">
                    {t.radar.pillarNames[key]}
                  </h4>
                  <span className="text-[11px] text-muted">
                    {pillar.weightPct}% {t.radar.weightUnit} · {pillar.availableMetrics}/
                    {pillar.totalMetrics}
                  </span>
                </div>
                <span
                  className={cn(
                    'font-mono text-lg font-extrabold tabular-nums',
                    pillarScoreTextClass(pillar.score),
                  )}
                >
                  {pillar.score !== null ? `${pillar.score}` : 'N/A'}
                  {pillar.score !== null && (
                    <span className="text-xs font-medium text-muted">/100</span>
                  )}
                </span>
              </div>

              <div className="mt-2.5 h-2 w-full overflow-hidden rounded-full bg-subtle">
                <div
                  className={cn(
                    'h-full rounded-full transition-all duration-300',
                    pillarScoreColorClass(pillar.score),
                  )}
                  style={{ width: `${pillar.score !== null ? Math.max(3, pct) : 0}%` }}
                />
              </div>

              <dl className="mt-3.5 space-y-2 border-t border-border/80 pt-3 text-xs">
                {rows.map((row) => (
                  <div key={row.label} className="flex items-center justify-between gap-2">
                    <dt className="text-muted">
                      <TermTooltip label={row.label} definition={row.tooltip} />
                    </dt>
                    <dd className="font-mono font-semibold text-ink tabular-nums">
                      {row.badge ? (
                        <Badge tone="positive" className="px-2 py-0 text-[10px]">
                          <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
                          {row.badge}
                        </Badge>
                      ) : (
                        row.value
                      )}
                    </dd>
                  </div>
                ))}
              </dl>
            </Card>
          );
        })}
      </div>

      {/* Liquidity & Institutional Secondary Signals */}
      <div className="rounded-xl border border-border bg-panel p-4">
        <div className="mb-3 flex items-center gap-1.5 text-xs font-bold tracking-wide text-muted uppercase">
          <ShieldCheck className="h-3.5 w-3.5 text-brand-600" aria-hidden="true" />
          {t.radar.secondarySignalsTitle}
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-lg border border-border/80 bg-subtle/40 px-3 py-2.5">
            <div className="text-[11px] text-muted">{t.radar.metrics.marketCap}</div>
            <div className="mt-1 font-mono text-sm font-bold text-ink tabular-nums">
              {formatCompactIdr(fundamentals.marketCapIdr, lang)}
            </div>
          </div>
          <div className="rounded-lg border border-border/80 bg-subtle/40 px-3 py-2.5">
            <div className="text-[11px] text-muted">
              <TermTooltip label={t.radar.metrics.adtv} definition={t.glossary.adtv} />
            </div>
            <div className="mt-1 font-mono text-sm font-bold text-ink tabular-nums">
              {formatCompactIdr(fundamentals.adtvIdr, lang)}
            </div>
          </div>
          <div className="rounded-lg border border-border/80 bg-subtle/40 px-3 py-2.5">
            <div className="text-[11px] text-muted">
              <TermTooltip label={t.radar.metrics.piotroski} definition={t.glossary.piotroski} />
            </div>
            <div className="mt-1 font-mono text-sm font-bold text-ink tabular-nums">
              {fundamentals.piotroskiFScore !== null ? `${fundamentals.piotroskiFScore} / 9` : '-'}
            </div>
          </div>
          <div className="rounded-lg border border-border/80 bg-subtle/40 px-3 py-2.5">
            <div className="text-[11px] text-muted">
              <TermTooltip label={t.radar.metrics.altmanZ} definition={t.glossary.altmanZ} />
            </div>
            <div className="mt-1 font-mono text-sm font-bold text-ink tabular-nums">
              {fundamentals.altmanZScore !== null ? fundamentals.altmanZScore.toFixed(2) : '-'}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
