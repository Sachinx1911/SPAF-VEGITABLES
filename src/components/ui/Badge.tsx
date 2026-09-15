import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';

export type Tone = 'neutral' | 'blue' | 'green' | 'orange' | 'red' | 'amber' | 'violet' | 'brand';

const TONES: Record<Tone, string> = {
  neutral: 'bg-[#eef1ef] text-[#4d5a52] ring-[#dfe5e1]',
  blue: 'bg-blue-50 text-blue-700 ring-blue-200/70',
  green: 'bg-emerald-50 text-emerald-700 ring-emerald-200/70',
  orange: 'bg-orange-50 text-orange-700 ring-orange-200/80',
  red: 'bg-red-50 text-red-700 ring-red-200/70',
  amber: 'bg-amber-50 text-amber-800 ring-amber-200/80',
  violet: 'bg-violet-50 text-violet-700 ring-violet-200/70',
  brand: 'bg-brand-50 text-brand-800 ring-brand-200/70',
};

const DOTS: Record<Tone, string> = {
  neutral: 'bg-[#8a968e]', blue: 'bg-blue-500', green: 'bg-emerald-500', orange: 'bg-orange-500', red: 'bg-red-500',
  amber: 'bg-amber-500', violet: 'bg-violet-500', brand: 'bg-brand-500',
};

export function Badge({ tone = 'neutral', dot, children, className }: { tone?: Tone; dot?: boolean; children: ReactNode; className?: string }) {
  return (
    <span className={cn('inline-flex h-[22px] items-center gap-1.5 rounded-md px-2 text-[11.5px] font-medium whitespace-nowrap ring-1 ring-inset', TONES[tone], className)}>
      {dot && <span className={cn('size-1.5 rounded-full', DOTS[tone])} />}
      {children}
    </span>
  );
}

/** One place that decides the colour of every workflow status in the product. */
const STATUS_TONE: Record<string, Tone> = {
  // orders
  Draft: 'neutral', Pending: 'neutral', Submitted: 'blue', Approved: 'green', Late: 'orange', Rejected: 'red',
  Locked: 'violet', 'Partially Fulfilled': 'orange', Completed: 'green',
  // procurement
  OK: 'green', 'Purchase Required': 'orange', Critical: 'red', Shortage: 'red', Excess: 'amber', Available: 'green',
  Partial: 'orange', Received: 'green', Confirmed: 'blue', 'Partially Received': 'orange',
  // packing / delivery
  'Not Started': 'neutral', 'To Pack': 'neutral', Packing: 'blue', Packed: 'green', Issue: 'red', Ready: 'amber',
  Dispatched: 'blue', 'In Transit': 'blue', Delivered: 'green', Failed: 'red',
  // finance
  'Not Ready': 'neutral', Invoiced: 'green', Generated: 'blue', Sent: 'blue', 'Partially Paid': 'orange', Paid: 'green',
  Overdue: 'red', Outstanding: 'orange',
  // system
  Active: 'green', Inactive: 'neutral', Success: 'green', Warning: 'orange', Info: 'blue',
  High: 'red', Medium: 'orange', Low: 'neutral',
};

export function statusTone(status: string): Tone {
  return STATUS_TONE[status] ?? 'neutral';
}

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  return (
    <Badge tone={statusTone(status)} dot className={className}>
      {status}
    </Badge>
  );
}
