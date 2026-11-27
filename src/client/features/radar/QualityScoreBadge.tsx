import type {
  FundamentalQualitySummary,
  QarpQuadrant,
  QualityGrade,
  QualityPillarKey,
} from '@/shared/domain';
import { cn, type BadgeTone } from '@/client/components/ui/primitives';
import { useI18n } from '@/client/i18n/useI18n';

export function qualityGradeTone(grade: QualityGrade): BadgeTone {
  if (grade === 'A') return 'positive';
  if (grade === 'B') return 'info';
  if (grade === 'C') return 'warning';
  if (grade === 'D') return 'negative';
  return 'neutral';
}

export function quadrantTone(quadrant: QarpQuadrant): BadgeTone {
  if (quadrant === 'PRIME_OPPORTUNITY') return 'positive';
  if (quadrant === 'QUALITY_FAIR_PRICE') return 'info';
  if (quadrant === 'DEEP_VALUE_TURNAROUND') return 'warning';
  if (quadrant === 'VALUE_TRAP_RISK') return 'negative';
  return 'neutral';
}

export function pillarScoreColorClass(score: number | null): string {
  if (score === null) return 'bg-muted/30';
  if (score >= 75) return 'bg-positive-600';
  if (score >= 55) return 'bg-brand-600';
  if (score >= 35) return 'bg-warning-600';
  return 'bg-negative-600';
}

export function pillarScoreTextClass(score: number | null): string {
  if (score === null) return 'text-muted';
  if (score >= 75) return 'text-positive-700';
  if (score >= 55) return 'text-brand-700';
  if (score >= 35) return 'text-warning-700';
  return 'text-negative-600';
}

export function QualityScoreBadge({
  quality,
  onClick,
  compact = false,
  className,
}: {
  quality: FundamentalQualitySummary;
  onClick?: () => void;
  compact?: boolean;
  className?: string;
}) {
  const { t } = useI18n();
  const hasScore = quality.score !== null;

  const toneClasses: Record<QualityGrade, string> = {
    A: 'border-positive-600/35 bg-positive-50 text-positive-700',
    B: 'border-brand-600/35 bg-brand-50 text-brand-700',
    C: 'border-warning-600/35 bg-warning-50 text-warning-700',
    D: 'border-negative-600/35 bg-negative-50 text-negative-700',
    INSUFFICIENT_DATA: 'border-border bg-subtle text-muted',
  };

  const title = hasScore
    ? `FQS ${quality.score}/100 (${quality.grade} · ${t.radar.gradeLabels[quality.grade]})`
    : t.radar.gradeLabels.INSUFFICIENT_DATA;

  const content = (
    <>
      <span
        className={cn(
          'inline-flex items-center justify-center rounded font-mono font-bold tabular-nums',
          compact ? 'h-4 min-w-[16px] px-1 text-[10px]' : 'h-5 min-w-[20px] px-1 text-[11px]',
          hasScore ? 'bg-panel/80 shadow-2xs' : 'bg-transparent',
        )}
      >
        {hasScore ? quality.grade : '–'}
      </span>
      <span className={cn('font-mono font-bold tabular-nums', compact ? 'text-xs' : 'text-sm')}>
        {hasScore ? quality.score : 'N/A'}
      </span>
    </>
  );

  const baseClass = cn(
    'inline-flex items-center gap-1.5 rounded-lg border transition-colors',
    compact ? 'px-1.5 py-0.5' : 'px-2 py-1',
    toneClasses[quality.grade],
    onClick && 'hover:brightness-95 cursor-pointer',
    className,
  );

  if (onClick) {
    return (
      <button type="button" onClick={onClick} title={title} className={baseClass}>
        {content}
      </button>
    );
  }

  return (
    <span title={title} className={baseClass}>
      {content}
    </span>
  );
}

const PILLAR_ORDER: QualityPillarKey[] = [
  'profitability',
  'growth',
  'financialHealth',
  'cashFlow',
];

export function PillarMiniGrid({
  quality,
  className,
}: {
  quality: FundamentalQualitySummary;
  className?: string;
}) {
  const { t } = useI18n();

  return (
    <div className={cn('grid grid-cols-2 gap-x-3 gap-y-1.5', className)}>
      {PILLAR_ORDER.map((key) => {
        const pillar = quality.pillars[key];
        const pct = pillar.score ?? 0;
        return (
          <div key={key} className="min-w-0">
            <div className="flex items-center justify-between gap-1 text-[10px] leading-tight">
              <span className="truncate font-medium text-muted">{t.radar.pillarShort[key]}</span>
              <span
                className={cn(
                  'font-mono font-bold tabular-nums',
                  pillarScoreTextClass(pillar.score),
                )}
              >
                {pillar.score !== null ? pillar.score : '–'}
              </span>
            </div>
            <div className="mt-0.5 h-1.5 w-full overflow-hidden rounded-full bg-subtle">
              <div
                className={cn(
                  'h-full rounded-full transition-all duration-300',
                  pillarScoreColorClass(pillar.score),
                )}
                style={{ width: `${pillar.score !== null ? Math.max(4, pct) : 0}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
