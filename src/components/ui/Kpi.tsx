import type { ReactNode } from 'react';
import { ArrowDown, ArrowUp, Minus, type LucideIcon } from 'lucide-react';
import { cn } from '../../lib/cn';
import { Card } from './Card';

interface KpiCardProps {
  label: string;
  value: ReactNode;
  deltaPct?: number;
  deltaGoodDirection?: 'up' | 'down';
  icon?: LucideIcon;
  tone?: 'brand' | 'orange' | 'red' | 'green' | 'neutral';
  onClick?: () => void;
  sub?: ReactNode;
}

const TONE: Record<NonNullable<KpiCardProps['tone']>, string> = {
  brand: 'bg-brand-50 text-brand-700', orange: 'bg-orange-50 text-orange-600', red: 'bg-red-50 text-red-600',
  green: 'bg-emerald-50 text-emerald-600', neutral: 'bg-canvas text-muted',
};

export function KpiCard({ label, value, deltaPct, deltaGoodDirection = 'up', icon: Icon, tone = 'brand', onClick, sub }: KpiCardProps) {
  const good = deltaPct != null && (deltaGoodDirection === 'up' ? deltaPct >= 0 : deltaPct <= 0);
  const Trend = deltaPct == null || deltaPct === 0 ? Minus : deltaPct > 0 ? ArrowUp : ArrowDown;

  return (
    <Card
      onClick={onClick}
      className={cn('p-4', onClick && 'cursor-pointer transition-shadow hover:shadow-pop')}
    >
      <div className="flex items-start justify-between">
        <p className="text-[12.5px] font-medium text-muted">{label}</p>
        {Icon && <span className={cn('grid size-7 shrink-0 place-items-center rounded-lg', TONE[tone])}><Icon size={15} /></span>}
      </div>
      <p className="tabular mt-1.5 text-[22px] leading-none font-semibold text-ink">{value}</p>
      <div className="mt-2 flex items-center gap-1.5">
        {deltaPct != null && (
          <span className={cn('flex items-center gap-0.5 text-[11.5px] font-semibold', good ? 'text-emerald-600' : 'text-red-600')}>
            <Trend size={12} /> {Math.abs(deltaPct)}%
          </span>
        )}
        {sub && <span className="text-[11.5px] text-subtle">{sub}</span>}
      </div>
    </Card>
  );
}

export function StatTile({ label, value, tone = 'neutral' }: { label: string; value: ReactNode; tone?: 'neutral' | 'orange' | 'red' | 'green' | 'blue' }) {
  const dot = { neutral: 'bg-subtle', orange: 'bg-orange-500', red: 'bg-red-500', green: 'bg-emerald-500', blue: 'bg-blue-500' }[tone];
  return (
    <div className="flex flex-1 items-center gap-2.5 rounded-lg border border-line bg-white px-3 py-2.5">
      <span className={cn('size-2 shrink-0 rounded-full', dot)} />
      <div className="min-w-0">
        <p className="tabular text-[15px] leading-tight font-semibold text-ink">{value}</p>
        <p className="truncate text-[11px] text-muted">{label}</p>
      </div>
    </div>
  );
}
