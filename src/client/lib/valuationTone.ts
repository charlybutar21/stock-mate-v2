import type { ValuationStatus } from '@/shared/domain';
import type { BadgeTone } from '@/client/components/ui/primitives';

export function statusTone(status: ValuationStatus): BadgeTone {
  if (status === 'UNDERVALUED') return 'positive';
  if (status === 'FAIRLY_VALUED') return 'warning';
  if (status === 'OVERVALUED') return 'negative';
  return 'neutral';
}
