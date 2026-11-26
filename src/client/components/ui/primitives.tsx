import clsx from 'clsx';
import { BarChart3, ChevronDown, ChevronUp, Eye, HelpCircle, PencilLine, X } from 'lucide-react';
import {
  forwardRef,
  useEffect,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type HTMLAttributes,
  type InputHTMLAttributes,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import { createPortal } from 'react-dom';
import { twMerge } from 'tailwind-merge';
import { getIdxTickSize, MIN_IDX_PRICE, stepIdxPrice } from '@/shared/domain';
import {
  formatNumber,
  formatStockbitPriceInput,
  parseStockbitPriceInput,
} from '@/client/lib/formatters';

export function cn(...inputs: Array<string | undefined | null | false>) {
  return twMerge(clsx(inputs));
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outlineBrand' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', type = 'button', ...props }, ref) => (
    <button
      ref={ref}
      type={type}
      className={cn(
        'inline-flex items-center justify-center gap-1.5 rounded-lg font-semibold transition-all duration-150 ease-out active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 disabled:pointer-events-none disabled:opacity-45 cursor-pointer',
        variant === 'primary' &&
          'bg-brand-solid text-white shadow-xs hover:bg-brand-solid-hover hover:shadow-sm',
        variant === 'outlineBrand' &&
          'border border-brand-600/45 bg-panel text-brand-700 hover:border-brand-600 hover:bg-brand-50',
        variant === 'secondary' &&
          'border border-border bg-panel text-ink shadow-2xs hover:border-muted/50 hover:bg-subtle/60',
        variant === 'ghost' && 'text-muted hover:bg-subtle hover:text-ink',
        variant === 'danger' &&
          'bg-danger-solid text-white shadow-xs hover:bg-danger-solid-hover',
        size === 'sm' && 'h-8 px-3 text-xs',
        size === 'md' && 'h-9 px-4 text-sm',
        size === 'lg' && 'h-10 px-5 text-sm',
        className,
      )}
      {...props}
    />
  ),
);
Button.displayName = 'Button';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        'h-9 w-full rounded-lg border border-input-border bg-input-bg px-3 text-sm text-ink placeholder:text-muted/65 transition-all duration-150 hover:border-muted/60 focus:border-brand-600 focus:ring-2 focus:ring-brand-100 focus:outline-none disabled:cursor-not-allowed disabled:bg-subtle disabled:text-muted',
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = 'Input';

export interface IdxPriceInputProps {
  id?: string;
  value: string;
  onValueChange: (next: string) => void;
  placeholder?: string;
  disabled?: boolean;
  allowDecimals?: boolean;
  className?: string;
  showTickHint?: boolean;
  tickHintLabel?: string;
  stepDownLabel?: string;
  stepUpLabel?: string;
}

/**
 * IDX-compliant price input with custom Up/Down stepper buttons and ArrowUp/ArrowDown support.
 * Steps strictly by BEI price fractions:
 *   < 200 -> 1, 200-499 -> 2, 500-1999 -> 5, 2000-4999 -> 10, >= 5000 -> 25
 */
export function IdxPriceInput({
  id,
  value,
  onValueChange,
  placeholder,
  disabled = false,
  allowDecimals = false,
  className,
  showTickHint = false,
  tickHintLabel = 'Fraksi',
  stepDownLabel = 'Decrease by 1 IDX tick',
  stepUpLabel = 'Increase by 1 IDX tick',
}: IdxPriceInputProps) {
  const numericVal = value.trim() === '' ? 0 : Number(value);
  const validNum = Number.isFinite(numericVal) && numericVal > 0 ? numericVal : 0;

  const nextUp = stepIdxPrice(validNum, 'up');
  const nextDown = stepIdxPrice(validNum, 'down');
  const upDelta = validNum > 0 ? nextUp - Math.floor(validNum) : 1;
  const downDelta = validNum > MIN_IDX_PRICE ? Math.ceil(validNum) - nextDown : 0;
  const activeTick = validNum > 0 ? getIdxTickSize(Math.floor(validNum)) : 1;

  const handleStep = (dir: 'up' | 'down') => {
    if (disabled) return;
    const base = validNum > 0 ? validNum : 0;
    const next = stepIdxPrice(base, dir);
    onValueChange(String(next));
  };

  const handleKeyDown = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      handleStep('up');
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      handleStep('down');
    }
  };

  const formattedDisplay = formatStockbitPriceInput(value, allowDecimals);
  const formattedPlaceholder = placeholder
    ? formatStockbitPriceInput(parseStockbitPriceInput(placeholder, allowDecimals), allowDecimals) ||
      placeholder
    : undefined;

  const handleBlur = () => {
    if (allowDecimals && value.endsWith('.')) {
      onValueChange(value.slice(0, -1));
    }
  };

  return (
    <div className={cn('min-w-0 w-full space-y-1', className)}>
      <div className="flex h-9 w-full min-w-0 items-stretch overflow-hidden rounded-lg border border-input-border bg-input-bg transition-all duration-150 hover:border-muted/60 focus-within:border-brand-600 focus-within:ring-2 focus-within:ring-brand-100">
        <button
          type="button"
          onClick={() => handleStep('down')}
          disabled={disabled || validNum <= MIN_IDX_PRICE}
          aria-label={`${stepDownLabel}${downDelta > 0 ? ` (-${downDelta})` : ''}`}
          title={downDelta > 0 ? `-${downDelta} (${tickHintLabel})` : stepDownLabel}
          className="flex w-7 shrink-0 items-center justify-center border-r border-input-border bg-subtle/60 text-muted transition-colors hover:bg-subtle hover:text-ink active:bg-brand-50 active:text-brand-700 disabled:cursor-not-allowed disabled:opacity-35 cursor-pointer"
        >
          <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
        </button>

        <input
          id={id}
          type="text"
          inputMode={allowDecimals ? 'decimal' : 'numeric'}
          autoComplete="off"
          spellCheck={false}
          placeholder={formattedPlaceholder}
          value={formattedDisplay}
          disabled={disabled}
          data-tick={activeTick}
          onChange={(e) => onValueChange(parseStockbitPriceInput(e.target.value, allowDecimals))}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          className="no-spinner w-full min-w-0 flex-1 bg-transparent px-2 text-sm font-mono font-medium text-ink tabular-nums placeholder:text-muted/60 focus:outline-none disabled:cursor-not-allowed disabled:text-muted"
        />

        <button
          type="button"
          onClick={() => handleStep('up')}
          disabled={disabled}
          aria-label={`${stepUpLabel} (+${upDelta})`}
          title={`+${upDelta} (${tickHintLabel})`}
          className="flex w-7 shrink-0 items-center justify-center border-l border-input-border bg-subtle/60 text-muted transition-colors hover:bg-subtle hover:text-ink active:bg-brand-50 active:text-brand-700 disabled:cursor-not-allowed disabled:opacity-35 cursor-pointer"
        >
          <ChevronUp className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </div>

      {showTickHint && (
        <div className="flex items-center justify-between text-[11px] text-muted">
          <span>
            {tickHintLabel}:{' '}
            <strong className="font-mono font-semibold text-brand-700 tabular-nums">
              {downDelta > 0 && downDelta !== upDelta
                ? `-${downDelta} / +${upDelta}`
                : `±${upDelta}`}
            </strong>
          </span>
          {validNum > 0 && (
            <span className="font-mono text-[10px] text-muted/85 tabular-nums">
              {formatNumber(nextDown)} ← {formatNumber(Math.round(validNum))} →{' '}
              {formatNumber(nextUp)}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, ...props }, ref) => (
    <select
      ref={ref}
      className={cn(
        'h-9 w-full rounded-lg border border-input-border bg-input-bg px-3 text-sm text-ink transition-all duration-150 hover:border-muted/60 focus:border-brand-600 focus:ring-2 focus:ring-brand-100 focus:outline-none disabled:cursor-not-allowed disabled:bg-subtle disabled:text-muted cursor-pointer',
        className,
      )}
      {...props}
    />
  ),
);
Select.displayName = 'Select';

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn(
      'w-full rounded-lg border border-input-border bg-input-bg px-3 py-2 text-sm text-ink placeholder:text-muted/65 transition-all duration-150 hover:border-muted/60 focus:border-brand-600 focus:ring-2 focus:ring-brand-100 focus:outline-none',
      className,
    )}
    {...props}
  />
));
Textarea.displayName = 'Textarea';

/**
 * Portal-rendered accessible hover/focus tooltip for financial terminology.
 * Never clipped by overflow-hidden tables or modals.
 */
export function TermTooltip({
  label,
  definition,
  className,
}: {
  label: string;
  definition: string;
  className?: string;
}) {
  const triggerRef = useRef<HTMLSpanElement>(null);
  const [coords, setCoords] = useState<{ top: number; left: number; placeBelow: boolean } | null>(
    null,
  );

  const show = () => {
    const el = triggerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const clampedX = Math.max(150, Math.min(window.innerWidth - 150, centerX));
    const placeBelow = rect.top < 115;
    setCoords({
      top: placeBelow ? rect.bottom + 8 : rect.top - 8,
      left: clampedX,
      placeBelow,
    });
  };

  const hide = () => setCoords(null);

  return (
    <>
      <span
        ref={triggerRef}
        tabIndex={0}
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
        className={cn(
          'inline-flex items-center gap-1 cursor-help border-b border-dotted border-muted/50 hover:border-brand-600 hover:text-ink transition-colors',
          className,
        )}
      >
        <span>{label}</span>
        <HelpCircle className="h-3 w-3 shrink-0 text-muted/75" aria-hidden="true" />
      </span>

      {coords &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            role="tooltip"
            style={{
              position: 'fixed',
              top: coords.top,
              left: coords.left,
              transform: coords.placeBelow
                ? 'translate(-50%, 0)'
                : 'translate(-50%, -100%)',
            }}
            className="pointer-events-none z-[100] w-80 max-w-[calc(100vw-2rem)] rounded-lg border border-slate-700/80 bg-slate-900 px-4 py-3 text-left text-xs leading-relaxed font-normal tracking-normal text-slate-100 normal-case shadow-xl dark:border-slate-600 dark:bg-slate-800"
          >
            <div className="mb-1 font-semibold text-emerald-300">{label}</div>
            <p className="text-slate-200">{definition}</p>
          </div>,
          document.body,
        )}
    </>
  );
}

export function Field({
  label,
  tooltip,
  htmlFor,
  error,
  hint,
  children,
}: {
  label: string;
  tooltip?: string;
  htmlFor?: string;
  error?: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="min-w-0 space-y-1.5">
      <label htmlFor={htmlFor} className="block text-xs font-medium text-ink">
        {tooltip ? <TermTooltip label={label} definition={tooltip} /> : label}
      </label>
      {children}
      {error ? (
        <p className="text-xs text-negative-600" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="text-[11px] text-muted">{hint}</p>
      ) : null}
    </div>
  );
}

export type BadgeTone = 'neutral' | 'positive' | 'warning' | 'negative' | 'info';

export function Badge({
  tone = 'neutral',
  className,
  children,
}: {
  tone?: BadgeTone;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold tracking-tight',
        tone === 'neutral' && 'border-border bg-subtle text-muted',
        tone === 'positive' && 'border-positive-600/25 bg-positive-50 text-positive-700',
        tone === 'warning' && 'border-warning-600/25 bg-warning-50 text-warning-700',
        tone === 'negative' && 'border-negative-600/25 bg-negative-50 text-negative-700',
        tone === 'info' && 'border-brand-600/25 bg-brand-50 text-brand-700',
        className,
      )}
    >
      {children}
    </span>
  );
}

export type CardVariant = 'default' | 'editable' | 'display' | 'highlight';

export function Card({
  className,
  variant = 'default',
  interactive = false,
  children,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  variant?: CardVariant;
  interactive?: boolean;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        'rounded-xl border p-5',
        variant === 'default' && 'border-border bg-panel surface-elevated',
        variant === 'editable' && 'border-editable-border bg-editable surface-editable',
        variant === 'display' && 'border-border/90 bg-display',
        variant === 'highlight' && 'border-brand-600/35 bg-brand-50/75',
        interactive && 'surface-interactive',
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

/**
 * Unmistakable role indicator pill distinguishing Editable cards from Display/Auto-Calculated cards.
 */
export function RolePill({
  role,
  label,
  className,
}: {
  role: 'editable' | 'display' | 'calculated';
  label: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[10px] font-bold tracking-wide uppercase',
        role === 'editable' &&
          'border-brand-600/35 bg-brand-50 text-brand-700',
        role === 'display' &&
          'border-border bg-subtle/80 text-muted',
        role === 'calculated' &&
          'border-border bg-subtle/80 text-muted',
        className,
      )}
    >
      {role === 'editable' ? (
        <PencilLine className="h-3 w-3 shrink-0" aria-hidden="true" />
      ) : role === 'calculated' ? (
        <BarChart3 className="h-3 w-3 shrink-0" aria-hidden="true" />
      ) : (
        <Eye className="h-3 w-3 shrink-0" aria-hidden="true" />
      )}
      <span>{label}</span>
    </span>
  );
}

/**
 * Clear section header used to group related zones across pages.
 */
export function SectionHeader({
  title,
  subtitle,
  role,
  roleLabel,
  action,
  className,
}: {
  title: string;
  subtitle?: string;
  role?: 'editable' | 'display' | 'calculated';
  roleLabel?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-wrap items-end justify-between gap-2', className)}>
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="font-display text-base font-bold tracking-tight text-ink sm:text-lg">
            {title}
          </h2>
          {role && roleLabel && <RolePill role={role} label={roleLabel} />}
        </div>
        {subtitle && <p className="mt-0.5 text-xs text-muted">{subtitle}</p>}
      </div>
      {action && <div className="flex flex-wrap items-center gap-2">{action}</div>}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-md bg-subtle', className)} />;
}

export function Modal({
  open,
  onClose,
  title,
  children,
  maxWidthClass = 'max-w-2xl',
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  maxWidthClass?: string;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={cn(
          'flex max-h-[90vh] w-full flex-col overflow-hidden rounded-xl border border-editable-border bg-panel shadow-2xl animate-fade-up',
          maxWidthClass,
        )}
      >
        <div className="flex items-center justify-between border-b border-border bg-editable-header px-5 py-3.5">
          <h2 className="font-display text-base font-bold tracking-tight text-ink">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-md p-1 text-muted transition-colors hover:bg-subtle hover:text-ink cursor-pointer"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
        <div className="overflow-y-auto px-5 py-4">{children}</div>
      </div>
    </div>
  );
}
