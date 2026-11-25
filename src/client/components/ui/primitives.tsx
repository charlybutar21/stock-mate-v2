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
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', type = 'button', ...props }, ref) => (
    <button
      ref={ref}
      type={type}
      className={cn(
        'inline-flex items-center justify-center gap-1.5 rounded-md font-medium transition-all duration-150 ease-out active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700 disabled:pointer-events-none disabled:opacity-45 cursor-pointer',
        variant === 'primary' &&
          'bg-ink text-surface shadow-xs hover:bg-brand-700 hover:shadow-sm',
        variant === 'secondary' &&
          'border border-border bg-panel text-ink shadow-2xs hover:border-ink/30 hover:bg-surface',
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
        'h-9 w-full rounded-md border border-border bg-panel px-3 text-sm text-ink placeholder:text-muted/60 shadow-2xs transition-all duration-150 focus:border-brand-700 focus:ring-2 focus:ring-brand-100 focus:outline-none disabled:bg-subtle disabled:text-muted',
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
        'h-9 w-full rounded-md border border-border bg-panel px-3 text-sm text-ink shadow-2xs transition-all duration-150 focus:border-brand-700 focus:ring-2 focus:ring-brand-100 focus:outline-none disabled:bg-subtle disabled:text-muted',
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
      'w-full rounded-md border border-border bg-panel px-3 py-2 text-sm text-ink placeholder:text-muted/60 shadow-2xs transition-all duration-150 focus:border-brand-700 focus:ring-2 focus:ring-brand-100 focus:outline-none',
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
    const placeBelow = rect.top < 110;
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
          'inline-flex items-center gap-1 cursor-help border-b border-dotted border-muted/60 hover:border-ink hover:text-ink transition-colors',
          className,
        )}
      >
        <span>{label}</span>
        <HelpCircle className="h-3 w-3 shrink-0 opacity-60" aria-hidden="true" />
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
            className="pointer-events-none z-[100] w-68 rounded-md border border-ink/10 bg-ink px-3 py-2.5 text-left text-xs leading-relaxed font-normal tracking-normal text-surface normal-case shadow-lg"
          >
            <div className="mb-0.5 font-semibold text-white">{label}</div>
            <p className="text-surface/85">{definition}</p>
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
        'inline-flex items-center gap-1 rounded-sm border px-2 py-0.5 text-[11px] font-medium tracking-tight',
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

export function Card({
  className,
  interactive = false,
  children,
  ...props
}: HTMLAttributes<HTMLDivElement> & { interactive?: boolean; children: ReactNode }) {
  return (
    <div
      className={cn(
        'rounded-lg border border-border bg-panel p-5 surface-elevated',
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
  return <div className={cn('animate-pulse rounded-sm bg-subtle', className)} />;
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
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/45 p-4 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={cn(
          'flex max-h-[90vh] w-full flex-col overflow-hidden rounded-lg border border-border bg-panel shadow-2xl animate-fade-up',
          maxWidthClass,
        )}
      >
        <div className="flex items-center justify-between border-b border-border bg-surface px-5 py-3.5">
          <h2 className="font-display text-lg font-semibold tracking-tight text-ink">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-sm p-1 text-muted transition-colors hover:bg-subtle hover:text-ink cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="overflow-y-auto px-5 py-4">{children}</div>
      </div>
    </div>
  );
}
