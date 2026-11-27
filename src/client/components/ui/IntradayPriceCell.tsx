import { cn } from '@/client/components/ui/primitives';
import { useI18n } from '@/client/i18n/useI18n';
import { formatIdr, formatNumber, formatPercent } from '@/client/lib/formatters';

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
      ? `${dailyChange > 0 ? '+' : dailyChange < 0 ? '-' : ''}${formatNumber(Math.abs(dailyChange))}`
      : null;

  return (
    <div
      className={cn(
        'flex flex-col font-mono tabular-nums',
        align === 'right' ? 'items-end text-right' : 'items-start text-left',
      )}
    >
      <div
        className={cn(
          'font-bold whitespace-nowrap',
          size === 'md' ? 'text-base' : 'text-sm',
          priceColorClass,
        )}
      >
        {formatIdr(currentPrice)}
      </div>

      {hasChange && (
        <div className={cn('mt-0.5 text-[11px] font-semibold whitespace-nowrap', changeTone)}>
          {formattedDelta !== null ? formattedDelta : ''}
          {formattedDelta !== null && dailyChangePct !== null ? ' ' : ''}
          {dailyChangePct !== null ? `(${formatPercent(dailyChangePct, true)})` : ''}
        </div>
      )}

      {openPrice !== null && (
        <div className="mt-0.5 text-[10px] text-muted whitespace-nowrap">
          {t.common.openLabel} {formatNumber(openPrice)}
        </div>
      )}

      {fairValueModerate !== undefined && (
        <div className="mt-0.5 text-[11px] text-muted whitespace-nowrap">
          FV <span className="font-semibold text-ink">{formatIdr(fairValueModerate)}</span>
        </div>
      )}
    </div>
  );
}
