import { useMemo } from 'react';
import { useNavigate } from 'react-router';
import { StatusBadge } from '../../components/ui/Badge';
import { EmptyState } from '../../components/ui/States';
import { useCurrentUser, useDb } from '../../store/useStore';
import { fmtDate } from '../../lib/format';

export function DriverDeliveriesPage() {
  const db = useDb();
  const user = useCurrentUser()!;
  const nav = useNavigate();

  const rows = useMemo(() => {
    return db.challans
      .filter((c) => c.driverId === user.id && c.status !== 'Delivered' && c.status !== 'Failed')
      .map((c) => ({ challan: c, customer: db.customers.find((cu) => cu.id === c.customerId)! }))
      .sort((a, b) => (a.challan.challanDate < b.challan.challanDate ? -1 : 1) || a.customer.routeOrder - b.customer.routeOrder);
  }, [db, user.id]);

  return (
    <div className="flex flex-col gap-3">
      <h1 className="text-[18px] font-semibold text-ink">Upcoming deliveries</h1>
      {rows.length === 0 ? (
        <EmptyState title="Nothing pending" description="You're all caught up." />
      ) : (
        rows.map(({ challan, customer }) => (
          <button key={challan.id} onClick={() => nav(`/driver/challans/${challan.id}`)} className="rounded-lg border border-line bg-white p-3 text-left">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[13.5px] font-semibold text-ink">{customer.name}</p>
              <StatusBadge status={challan.status} />
            </div>
            <p className="mt-0.5 text-xs text-muted">{fmtDate(challan.challanDate)} · {challan.challanNo} · {challan.packages} packages</p>
          </button>
        ))
      )}
    </div>
  );
}
