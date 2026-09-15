import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { CircleAlert, CircleCheck, Info, TriangleAlert, X } from 'lucide-react';
import { cn } from '../../lib/cn';

type ToastTone = 'success' | 'error' | 'warning' | 'info';

interface ToastItem {
  id: number;
  tone: ToastTone;
  title: string;
  description?: string;
}

interface ToastCtx {
  push: (t: Omit<ToastItem, 'id'>) => void;
}

const Ctx = createContext<ToastCtx | null>(null);

const ICONS: Record<ToastTone, typeof CircleCheck> = { success: CircleCheck, error: CircleAlert, warning: TriangleAlert, info: Info };
const COLORS: Record<ToastTone, string> = {
  success: 'text-emerald-600', error: 'text-red-600', warning: 'text-amber-600', info: 'text-blue-600',
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const push = useCallback((t: Omit<ToastItem, 'id'>) => {
    const id = Date.now() + Math.random();
    setItems((cur) => [...cur, { ...t, id }]);
    setTimeout(() => setItems((cur) => cur.filter((x) => x.id !== id)), 4200);
  }, []);
  const value = useMemo(() => ({ push }), [push]);

  return (
    <Ctx.Provider value={value}>
      {children}
      {typeof document !== 'undefined' &&
        createPortal(
          <div className="pointer-events-none fixed top-4 right-4 z-[60] flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-2">
            {items.map((t) => {
              const Icon = ICONS[t.tone];
              return (
                <div key={t.id} className="animate-slide-in pointer-events-auto flex items-start gap-2.5 rounded-lg border border-line bg-white p-3 shadow-pop">
                  <Icon size={18} className={cn('mt-0.5 shrink-0', COLORS[t.tone])} />
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-medium text-ink">{t.title}</p>
                    {t.description && <p className="mt-0.5 text-xs text-muted">{t.description}</p>}
                  </div>
                  <button onClick={() => setItems((cur) => cur.filter((x) => x.id !== t.id))} className="text-subtle hover:text-ink" aria-label="Dismiss">
                    <X size={14} />
                  </button>
                </div>
              );
            })}
          </div>,
          document.body,
        )}
    </Ctx.Provider>
  );
}

export function useToast() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx.push;
}
