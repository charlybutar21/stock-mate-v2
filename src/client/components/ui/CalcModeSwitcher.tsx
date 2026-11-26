import { useI18n } from '@/client/i18n/useI18n';
import { useCalcMode } from '@/client/lib/useCalcMode';
import { cn, TermTooltip } from './primitives';

interface CalcModeSwitcherProps {
  compact?: boolean;
  showLabel?: boolean;
}

export function CalcModeSwitcher({
  compact = false,
  showLabel = true,
}: CalcModeSwitcherProps) {
  const { t } = useI18n();
  const { calcMode, setCalcMode } = useCalcMode();

  return (
    <div className="flex flex-wrap items-center gap-2">
      {showLabel && (
        <span className="text-xs font-medium text-muted">
          <TermTooltip
            label={t.watchlist.calcModeLabel}
            definition={t.glossary.calcMode}
          />
        </span>
      )}
      <div
        role="group"
        aria-label={t.watchlist.calcModeLabel}
        className="inline-flex items-center rounded-lg border border-border bg-panel p-0.5 shadow-2xs"
      >
        <button
          type="button"
          onClick={() => setCalcMode('NET_AFTER_FEES')}
          aria-pressed={calcMode === 'NET_AFTER_FEES'}
          title={t.watchlist.calcModeNetHint}
          className={cn(
            'rounded-md font-semibold transition-all cursor-pointer',
            compact ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-1 text-xs',
            calcMode === 'NET_AFTER_FEES'
              ? 'bg-brand-solid text-white shadow-2xs'
              : 'text-muted hover:text-ink',
          )}
        >
          {t.watchlist.calcModeNet}
        </button>
        <button
          type="button"
          onClick={() => setCalcMode('BROKER_GROSS')}
          aria-pressed={calcMode === 'BROKER_GROSS'}
          title={t.watchlist.calcModeGrossHint}
          className={cn(
            'rounded-md font-semibold transition-all cursor-pointer',
            compact ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-1 text-xs',
            calcMode === 'BROKER_GROSS'
              ? 'bg-brand-solid text-white shadow-2xs'
              : 'text-muted hover:text-ink',
          )}
        >
          {t.watchlist.calcModeGross}
        </button>
      </div>
    </div>
  );
}
