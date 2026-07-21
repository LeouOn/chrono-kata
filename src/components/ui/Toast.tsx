'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { AnimatePresence, motion } from 'motion/react';

type Variant = 'info' | 'success' | 'error';

interface Toast {
  id: string;
  message: string;
  variant: Variant;
}

interface ToastContextValue {
  show: (message: string, variant?: Variant) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const TOAST_EVENT = 'chrono-kata-toast';

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const show = useCallback((message: string, variant: Variant = 'info') => {
    const id =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : Math.random().toString(36).slice(2);
    setToasts((prev) => [...prev, { id, message, variant }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  // Listen for toast dispatches from non-React code paths (e.g. fire-and-forget
  // side-effect functions in hooks that can't use the React context directly).
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ message: string; variant: Variant }>)
        .detail;
      if (detail?.message) {
        show(detail.message, detail.variant ?? 'info');
      }
    };
    window.addEventListener(TOAST_EVENT, handler);
    return () => window.removeEventListener(TOAST_EVENT, handler);
  }, [show]);

  const value = useMemo(() => ({ show }), [show]);

  const variantColors: Record<Variant, string> = {
    info: 'bg-surface border-border text-text',
    success: 'bg-surface border-zen/50 text-zen',
    error: 'bg-surface border-hype/50 text-hype',
  };

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed top-4 left-0 right-0 z-[100] flex flex-col items-center gap-2 px-4">
        <AnimatePresence>
          {toasts.map((t) => (
            <motion.div
              key={t.id}
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className={`pointer-events-auto max-w-md rounded-2xl border px-4 py-3 text-sm shadow-lg ${variantColors[t.variant]}`}
            >
              {t.message}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}

export function useToastContext(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToastContext must be used within ToastProvider');
  return ctx;
}

/**
 * Dispatch a toast from non-React code paths (module-scope functions,
 * fire-and-forget side effects, etc.) that can't use the useToast hook.
 * Picked up by ToastProvider's window event listener.
 */
export function dispatchToast(
  message: string,
  variant: Variant = 'info',
): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent(TOAST_EVENT, { detail: { message, variant } }),
  );
}
