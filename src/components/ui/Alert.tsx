import type { ReactNode } from 'react';
import { CircleAlert, CircleCheck, Info, TriangleAlert } from 'lucide-react';
import { cn } from '../../lib/cn';

type AlertTone = 'info' | 'success' | 'warning' | 'error';

const STYLES: Record<AlertTone, { wrap: string; icon: string; iconEl: typeof Info }> = {
  info: { wrap: 'bg-blue-50 border-blue-200 text-blue-900', icon: 'text-blue-600', iconEl: Info },
  success: { wrap: 'bg-emerald-50 border-emerald-200 text-emerald-900', icon: 'text-emerald-600', iconEl: CircleCheck },
  warning: { wrap: 'bg-amber-50 border-amber-200 text-amber-900', icon: 'text-amber-600', iconEl: TriangleAlert },
  error: { wrap: 'bg-red-50 border-red-200 text-red-900', icon: 'text-red-600', iconEl: CircleAlert },
};

export function Alert({ tone = 'info', title, children, actions, className }: { tone?: AlertTone; title?: ReactNode; children?: ReactNode; actions?: ReactNode; className?: string }) {
  const s = STYLES[tone];
  const Icon = s.iconEl;
  return (
    <div className={cn('flex gap-2.5 rounded-lg border px-3.5 py-3', s.wrap, className)}>
      <Icon size={17} className={cn('mt-0.5 shrink-0', s.icon)} />
      <div className="min-w-0 flex-1">
        {title && <p className="text-[13px] font-semibold">{title}</p>}
        {children && <div className="mt-0.5 text-[13px] leading-relaxed opacity-90">{children}</div>}
        {actions && <div className="mt-2 flex gap-2">{actions}</div>}
      </div>
    </div>
  );
}
