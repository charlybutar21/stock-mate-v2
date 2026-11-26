import { useI18n } from '@/client/i18n/useI18n';
import { formatIdr } from '@/client/lib/formatters';

interface FairValueRangeBarProps {
  conservative: number | null;
  moderate: number | null;
  optimistic: number | null;
  currentPrice: number;
}

export function FairValueRangeBar({
  conservative,
  moderate,
  optimistic,
  currentPrice,
}: FairValueRangeBarProps) {
  const { t } = useI18n();

  if (conservative === null || moderate === null || optimistic === null) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-subtle/50 p-4 text-center text-xs text-muted">
        {t.valuationStatus.INSUFFICIENT_DATA}
      </div>
    );
  }

  const allValues = [conservative, moderate, optimistic, currentPrice];
  const minVal = Math.min(...allValues) * 0.9;
  const maxVal = Math.max(...allValues) * 1.1;
  const span = Math.max(maxVal - minVal, 1);

  const pct = (v: number) => Math.max(0, Math.min(100, ((v - minVal) / span) * 100));

  const leftPct = pct(conservative);
  const rightPct = pct(optimistic);
  const modPct = pct(moderate);
  const pricePct = pct(currentPrice);

  return (
    <div className="space-y-4">
      <div className="relative pt-7 pb-6">
        {/* Track */}
        <div className="h-2.5 w-full rounded-full bg-subtle" />

        {/* Fair Value Range Highlight */}
        <div
          className="absolute top-7 h-2.5 rounded-full bg-brand-100 border border-brand-600/30"
          style={{
            left: `${leftPct}%`,
            width: `${Math.max(rightPct - leftPct, 1.5)}%`,
          }}
        />

        {/* Moderate Median Marker */}
        <div
          className="absolute top-6 h-4.5 w-0.5 -translate-x-1/2 bg-brand-700"
          style={{ left: `${modPct}%` }}
          title={`${t.detail.moderate}: ${formatIdr(moderate)}`}
        />

        {/* Current Price Pin */}
        <div
          className="absolute top-0 -translate-x-1/2 flex flex-col items-center"
          style={{ left: `${pricePct}%` }}
        >
          <span className="whitespace-nowrap rounded bg-ink px-1.5 py-0.5 font-mono text-[10px] font-semibold text-panel tabular-nums">
            {formatIdr(currentPrice)}
          </span>
          <div className="h-3.5 w-0.5 bg-ink" />
          <div className="h-2.5 w-2.5 -mt-1 rounded-full border-2 border-panel bg-ink shadow-xs" />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3 text-center sm:text-left">
        <div className="rounded-lg bg-subtle/70 px-3 py-2">
          <div className="text-[11px] font-medium text-muted">{t.detail.conservative}</div>
          <div className="mt-0.5 font-mono text-sm font-semibold text-ink tabular-nums">
            {formatIdr(conservative)}
          </div>
        </div>
        <div className="rounded-lg bg-brand-50 px-3 py-2">
          <div className="text-[11px] font-medium text-brand-700">{t.detail.moderate}</div>
          <div className="mt-0.5 font-mono text-sm font-semibold text-brand-900 tabular-nums">
            {formatIdr(moderate)}
          </div>
        </div>
        <div className="rounded-lg bg-subtle/70 px-3 py-2">
          <div className="text-[11px] font-medium text-muted">{t.detail.optimistic}</div>
          <div className="mt-0.5 font-mono text-sm font-semibold text-ink tabular-nums">
            {formatIdr(optimistic)}
          </div>
        </div>
      </div>
    </div>
  );
}
