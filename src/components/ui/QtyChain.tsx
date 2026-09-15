import { Check, Minus } from 'lucide-react';
import { cn } from '../../lib/cn';
import { qty } from '../../lib/format';
import { QTY_STAGES, type QtyChain as QtyChainT, type Unit } from '../../types/models';

const LABELS: Record<(typeof QTY_STAGES)[number], string> = {
  ordered: 'Ordered', approved: 'Approved', purchased: 'Purchased', received: 'Received', accepted: 'Accepted',
  allocated: 'Allocated', packed: 'Packed', dispatched: 'Dispatched', delivered: 'Delivered',
  customerAccepted: 'Cust. Accepted', invoiced: 'Invoiced', paid: 'Paid',
};

/**
 * The audit trail of one order line: every lifecycle quantity, its own value,
 * never overwritten. Balance = ordered − customer-accepted (what's still owed).
 */
export function QtyChain({ chain, unit, compact }: { chain: QtyChainT; unit: Unit; compact?: boolean }) {
  const balance = chain.ordered != null && chain.customerAccepted != null ? Math.max(chain.ordered - chain.customerAccepted, 0) : null;

  return (
    <div className="scrollbar-thin overflow-x-auto">
      <div className={cn('flex gap-1.5', compact && 'gap-1')}>
        {QTY_STAGES.map((stage) => {
          const v = chain[stage];
          const reached = v != null;
          return (
            <div
              key={stage}
              className={cn(
                'flex min-w-[74px] flex-col items-center gap-1 rounded-lg border px-2 py-1.5 text-center',
                reached ? 'border-brand-200 bg-brand-50' : 'border-line bg-canvas/60',
              )}
            >
              <span className={cn('text-[10px] font-medium tracking-wide uppercase', reached ? 'text-brand-700' : 'text-subtle')}>{LABELS[stage]}</span>
              <span className={cn('tabular text-[12.5px] font-semibold', reached ? 'text-ink' : 'text-subtle')}>
                {reached ? qty(v, unit) : <Minus size={12} className="mx-auto" />}
              </span>
            </div>
          );
        })}
        <div className={cn('flex min-w-[74px] flex-col items-center gap-1 rounded-lg border px-2 py-1.5 text-center', balance ? 'border-orange-200 bg-orange-50' : 'border-emerald-200 bg-emerald-50')}>
          <span className={cn('text-[10px] font-medium tracking-wide uppercase', balance ? 'text-orange-700' : 'text-emerald-700')}>Balance</span>
          <span className="tabular flex items-center gap-1 text-[12.5px] font-semibold text-ink">
            {balance ? qty(balance, unit) : <Check size={13} className="text-emerald-600" />}
          </span>
        </div>
      </div>
    </div>
  );
}

/** One-line compact version for table cells: Ordered → Delivered → Balance. */
export function QtyChainMini({ chain, unit }: { chain: QtyChainT; unit: Unit }) {
  const balance = chain.ordered != null && chain.customerAccepted != null ? chain.ordered - chain.customerAccepted : null;
  return (
    <div className="tabular flex items-center gap-1 text-xs whitespace-nowrap">
      <span className="text-muted">{qty(chain.ordered, unit)}</span>
      <span className="text-subtle">→</span>
      <span className="font-medium text-ink">{qty(chain.customerAccepted ?? chain.delivered ?? chain.packed ?? chain.allocated, unit)}</span>
      {!!balance && <span className="ml-1 rounded bg-orange-50 px-1 py-0.5 font-medium text-orange-700">-{qty(balance, unit)}</span>}
    </div>
  );
}
