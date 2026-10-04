import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';

export interface TabItem {
  key: string;
  label: ReactNode;
  count?: number;
  icon?: ReactNode;
}

export function Tabs({ items, value, onChange, variant = 'underline', className }: { items: TabItem[]; value: string; onChange: (k: string) => void; variant?: 'underline' | 'pill' | 'vertical'; className?: string }) {
  if (variant === 'vertical') {
    // Settings-style section nav: a stacked list on wide screens, a scrollable strip on phones.
    return (
      <div className={cn('scrollbar-thin flex gap-1 overflow-x-auto lg:flex-col lg:overflow-visible', className)}>
        {items.map((t) => (
          <button
            key={t.key}
            onClick={() => onChange(t.key)}
            className={cn(
              'flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-left text-[13px] font-medium whitespace-nowrap transition-colors',
              value === t.key ? 'bg-brand-50 text-brand-800' : 'text-muted hover:bg-canvas hover:text-ink',
            )}
          >
            {t.icon}
            {t.label}
            {t.count != null && <span className="ml-auto text-xs opacity-70">{t.count}</span>}
          </button>
        ))}
      </div>
    );
  }
  if (variant === 'pill') {
    return (
      <div className={cn('inline-flex gap-1 rounded-lg bg-brand-50 p-1', className)}>
        {items.map((t) => (
          <button
            key={t.key}
            onClick={() => onChange(t.key)}
            className={cn(
              'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[13px] font-medium transition-colors',
              value === t.key ? 'bg-white text-brand-800 shadow-sm' : 'text-muted hover:text-ink',
            )}
          >
            {t.icon}
            {t.label}
            {t.count != null && <span className="text-xs opacity-70">{t.count}</span>}
          </button>
        ))}
      </div>
    );
  }
  return (
    <div className={cn('scrollbar-thin flex gap-5 overflow-x-auto border-b border-line', className)}>
      {items.map((t) => (
        <button
          key={t.key}
          onClick={() => onChange(t.key)}
          className={cn(
            'relative flex shrink-0 items-center gap-1.5 pb-2.5 text-[13px] font-medium whitespace-nowrap transition-colors',
            value === t.key ? 'text-brand-800' : 'text-muted hover:text-ink',
          )}
        >
          {t.icon}
          {t.label}
          {t.count != null && (
            <span className={cn('rounded-full px-1.5 text-[11px]', value === t.key ? 'bg-brand-100 text-brand-800' : 'bg-canvas text-muted')}>{t.count}</span>
          )}
          {value === t.key && <span className="absolute inset-x-0 -bottom-px h-[2px] rounded-full bg-brand-700" />}
        </button>
      ))}
    </div>
  );
}
