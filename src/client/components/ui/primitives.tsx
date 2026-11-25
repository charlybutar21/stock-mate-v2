import clsx from 'clsx';
import { HelpCircle, X } from 'lucide-react';
import {
  forwardRef,
  useEffect,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type HTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import { createPortal } from 'react-dom';
import { twMerge } from 'tailwind-merge';

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
          'bg-brand-600 text-white shadow-xs hover:bg-brand-700 hover:shadow-sm',
        variant === 'outlineBrand' &&
          'border border-brand-600/40 bg-panel text-brand-700 hover:border-brand-600 hover:bg-brand-50',
        variant === 'secondary' &&
          'border border-border bg-panel text-ink shadow-2xs hover:border-slate-300 hover:bg-surface',
        variant === 'ghost' && 'text-muted hover:bg-subtle hover:text-ink',
        variant === 'danger' &&
          'bg-negative-600 text-white shadow-xs hover:bg-negative-700',
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
        'h-9 w-full rounded-lg border border-border bg-panel px-3 text-sm text-ink placeholder:text-muted/65 transition-all duration-150 focus:border-brand-600 focus:ring-2 focus:ring-brand-100 focus:outline-none disabled:bg-subtle disabled:text-muted',
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = 'Input';

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, ...props }, ref) => (
    <select
      ref={ref}
      className={cn(
        'h-9 w-full rounded-lg border border-border bg-panel px-3 text-sm text-ink transition-all duration-150 focus:border-brand-600 focus:ring-2 focus:ring-brand-100 focus:outline-none disabled:bg-subtle disabled:text-muted',
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
      'w-full rounded-lg border border-border bg-panel px-3 py-2 text-sm text-ink placeholder:text-muted/65 transition-all duration-150 focus:border-brand-600 focus:ring-2 focus:ring-brand-100 focus:outline-none',
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
            className="pointer-events-none z-[100] w-72 rounded-lg border border-slate-700/60 bg-slate-900 px-3.5 py-2.5 text-left text-xs leading-relaxed font-normal tracking-normal text-slate-100 normal-case shadow-xl"
          >
            <div className="mb-0.5 font-semibold text-brand-100">{label}</div>
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
    <div className="space-y-1">
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
        tone === 'positive' && 'border-positive-600/20 bg-positive-50 text-positive-700',
        tone === 'warning' && 'border-warning-600/20 bg-warning-50 text-warning-700',
        tone === 'negative' && 'border-negative-600/20 bg-negative-50 text-negative-700',
        tone === 'info' && 'border-brand-600/20 bg-brand-50 text-brand-700',
        className,
      )}
    >
      {children}
    </span>
  );
}

const AVATAR_PALETTE = [
  'bg-emerald-600 text-white',
  'bg-sky-600 text-white',
  'bg-indigo-600 text-white',
  'bg-teal-600 text-white',
  'bg-amber-600 text-white',
  'bg-rose-600 text-white',
  'bg-slate-700 text-white',
];

export function TickerAvatar({ ticker }: { ticker: string }) {
  const hash = ticker.split('').reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  const colorClass = AVATAR_PALETTE[hash % AVATAR_PALETTE.length];
  return (
    <span
      aria-hidden="true"
      className={cn(
        'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full font-mono text-[11px] font-bold tracking-tight shadow-2xs',
        colorClass,
      )}
    >
      {ticker.slice(0, 2)}
    </span>
  );
}

export function Card({
  className,
  interactive = false,
  children,
  ...props
}: HTMLAttributes<HTMLDivElement> & { interactive?: boolean; children: ReactNode }) {
  return (
    <div
      className={cn(
        'rounded-xl border border-border bg-panel p-5 surface-elevated',
        interactive && 'surface-interactive',
        className,
      )}
      {...props}
    >
      {children}
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
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-4 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={cn(
          'flex max-h-[90vh] w-full flex-col overflow-hidden rounded-xl border border-border bg-panel shadow-2xl animate-fade-up',
          maxWidthClass,
        )}
      >
        <div className="flex items-center justify-between border-b border-border bg-surface/60 px-5 py-3.5">
          <h2 className="font-display text-base font-bold tracking-tight text-ink">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-md p-1 text-muted transition-colors hover:bg-subtle hover:text-ink cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="overflow-y-auto px-5 py-4">{children}</div>
      </div>
    </div>
  );
}
