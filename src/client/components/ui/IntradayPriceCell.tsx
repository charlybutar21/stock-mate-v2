import { cn } from '@/client/components/ui/primitives';
import { useI18n } from '@/client/i18n/useI18n';
import { formatIdr, formatPercent } from '@/client/lib/formatters';

interface IntradayPriceCellProps {
  currentPrice: number;
  openPrice: number | null;
  dailyChange: number | null;
  dailyChangePct: number | null;
  priceColorClass?: string;
  align?: 'right' | 'left';
  size?: 'sm' | 'md';
  fairValueModerate?: number | null;
}

export function IntradayPriceCell({
  currentPrice,
  openPrice,
  dailyChange,
  dailyChangePct,
  priceColorClass = 'text-ink',
  align = 'right',
  size = 'sm',
  fairValueModerate,
}: IntradayPriceCellProps) {
  const { t } = useI18n();
  const hasChange = dailyChange !== null || dailyChangePct !== null;
  const changeSign =
    dailyChange !== null ? dailyChange : dailyChangePct !== null ? dailyChangePct : 0;

  const changeTone =
    changeSign > 0
      ? 'text-positive-700'
      : changeSign < 0
        ? 'text-negative-600'
        : 'text-muted';

  const formattedDelta =
    dailyChange !== null
      ? `${dailyChange > 0 ? '+' : dailyChange < 0 ? '-' : ''}${formatIdr(Math.abs(dailyChange))}`
      : null;

  return (
    <div
      className={cn(
        'flex flex-col font-mono tabular-nums',
        align === 'right' ? 'items-end text-right' : 'items-start text-left',
      )}
    >
      {/* 1. Current Price */}
      <div
        className={cn(
          'font-bold whitespace-nowrap',
          size === 'md' ? 'text-base' : 'text-sm',
          priceColorClass,
        )}
      >
        {formatIdr(currentPrice)}
      </div>

      {/* 2. Today's Price Change (Rp & %) */}
      <div className={cn('mt-0.5 text-[11px] font-semibold whitespace-nowrap', changeTone)}>
        {hasChange ? (
          <>
            {formattedDelta !== null ? formattedDelta : ''}
            {formattedDelta !== null && dailyChangePct !== null ? ' ' : ''}
            {dailyChangePct !== null ? `(${formatPercent(dailyChangePct, true)})` : ''}
          </>
        ) : (
          <span className="font-normal text-muted">–</span>
        )}
      </div>

      {/* 3. Opening Price Today */}
      <div className="mt-0.5 text-[11px] text-muted whitespace-nowrap">
        {t.common.openLabel}{' '}
        <span className="font-medium text-ink/80">
          {openPrice !== null ? formatIdr(openPrice) : '–'}
        </span>
      </div>

      {/* 4. Optional Fair Value (used in Radar combined Price/FV column) */}
      {fairValueModerate !== undefined && (
        <div className="mt-0.5 text-[11px] text-muted whitespace-nowrap">
          {t.common.fairValueShort}{' '}
          <span className="font-semibold text-ink">{formatIdr(fairValueModerate)}</span>
        </div>
      )}
    </div>
  );
}
