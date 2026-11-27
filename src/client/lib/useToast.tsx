import { CheckCircle2, Info, X, XCircle } from 'lucide-react';
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/client/components/ui/primitives';

export type ToastTone = 'success' | 'error' | 'info';

interface ToastItem {
  id: string;
  message: string;
  tone: ToastTone;
}

interface ToastContextValue {
  showToast: (message: string, tone?: ToastTone) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const showToast = useCallback(
    (message: string, tone: ToastTone = 'info') => {
      const id = `toast_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      setToasts((prev) => [...prev.slice(-2), { id, message, tone }]);
      window.setTimeout(() => {
        dismiss(id);
      }, 3600);
    },
    [dismiss],
  );

  const value = useMemo(() => ({ showToast }), [showToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      {typeof document !== 'undefined' &&
        toasts.length > 0 &&
        createPortal(
          <div
            aria-live="polite"
            aria-atomic="true"
            className="pointer-events-none fixed right-4 bottom-20 left-4 z-[110] flex flex-col items-center gap-2 md:bottom-5 md:left-auto md:items-end"
          >
            {toasts.map((item) => (
              <div
                key={item.id}
                role={item.tone === 'error' ? 'alert' : 'status'}
                className={cn(
                  'pointer-events-auto flex w-full max-w-sm items-center gap-2.5 rounded-xl border px-3.5 py-2.5 text-xs font-medium shadow-lg animate-fade-up',
                  item.tone === 'success' &&
                    'border-positive-600/35 bg-panel text-positive-700',
                  item.tone === 'error' &&
                    'border-negative-600/35 bg-panel text-negative-700',
                  item.tone === 'info' && 'border-border bg-panel text-ink',
                )}
              >
                {item.tone === 'success' ? (
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-positive-600" aria-hidden="true" />
                ) : item.tone === 'error' ? (
                  <XCircle className="h-4 w-4 shrink-0 text-negative-600" aria-hidden="true" />
                ) : (
                  <Info className="h-4 w-4 shrink-0 text-brand-700" aria-hidden="true" />
                )}
                <span className="flex-1 leading-snug text-ink">{item.message}</span>
                <button
                  type="button"
                  onClick={() => dismiss(item.id)}
                  aria-label="Dismiss notification"
                  className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted transition-colors hover:bg-subtle hover:text-ink cursor-pointer"
                >
                  <X className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </div>
            ))}
          </div>,
          document.body,
        )}
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    return {
      showToast: () => {},
    };
  }
  return ctx;
}
