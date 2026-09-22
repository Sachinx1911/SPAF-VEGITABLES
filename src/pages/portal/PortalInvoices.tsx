import { useMemo } from 'react';
import { EmptyState } from '../../components/ui/States';
import { StatusBadge } from '../../components/ui/Badge';
import { useCurrentUser, useDb } from '../../store/useStore';
import { usePortalInvoicesSync } from '../../store/useApiSync';
import { invoiceViews } from '../../domain/finance';
import { API_MODE } from '../../lib/api';
import { todayISO } from '../../lib/clock';
import { fmtDate, inr } from '../../lib/format';

export function PortalInvoicesPage() {
  const db = useDb();
  const user = useCurrentUser()!;
  const today = todayISO();
  const { data } = usePortalInvoicesSync();

  const invoices = useMemo(() => {
    // The server has already worked out paid, balance and whether it is overdue.
    const rows = API_MODE && data
      ? data.map((r) => ({ ...r, derivedStatus: r.status }))
      : invoiceViews(db, today).filter((i) => i.customerId === user.customerId);

    return [...rows].sort((a, b) => (a.invoiceDate < b.invoiceDate ? 1 : -1));
  }, [data, db, today, user.customerId]);

  return (
    <div className="flex flex-col gap-3">
      <h1 className="text-[18px] font-semibold text-ink">Invoices</h1>
      {invoices.length === 0 ? (
        <EmptyState title="No invoices yet" />
      ) : (
        invoices.map((inv) => (
          <div key={inv.id} className="rounded-lg border border-line bg-white p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[13.5px] font-semibold text-ink">{inv.invoiceNo}</p>
              <StatusBadge status={inv.derivedStatus} />
            </div>
            <p className="mt-0.5 text-xs text-muted">{fmtDate(inv.invoiceDate)} · due {fmtDate(inv.dueDate)}</p>
            <div className="mt-2 flex items-center justify-between text-[13px]">
              <span className="tabular font-semibold text-ink">{inr(inv.total)}</span>
              {inv.balance > 0 && <span className="tabular font-medium text-orange-600">{inr(inv.balance)} due</span>}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
