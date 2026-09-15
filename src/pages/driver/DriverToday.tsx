import { useMemo } from 'react';
import { useNavigate } from 'react-router';
import { FileText, Navigation, Phone, PlayCircle } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { StatusBadge } from '../../components/ui/Badge';
import { EmptyState } from '../../components/ui/States';
import { useCurrentUser, useDb } from '../../store/useStore';
import { startTransit } from '../../store/packingActions';
import { todayISO } from '../../lib/clock';
import { inr } from '../../lib/format';

export function DriverTodayPage() {
  const db = useDb();
  const user = useCurrentUser()!;
  const nav = useNavigate();
  const today = todayISO();

  const rows = useMemo(() => {
    return db.challans
      .filter((c) => c.driverId === user.id && c.challanDate === today && c.status !== 'Delivered' && c.status !== 'Failed')
      .map((c) => ({ challan: c, customer: db.customers.find((cu) => cu.id === c.customerId)!, order: db.orders.find((o) => o.id === c.orderId) }))
      .sort((a, b) => a.customer.routeOrder - b.customer.routeOrder);
  }, [db, user.id, today]);

  if (rows.length === 0) {
    return <EmptyState title="No deliveries left today" description="Everything on your route has been delivered or isn't packed yet." />;
  }

  return (
    <div className="flex flex-col gap-3">
      <div>
        <h1 className="text-[18px] font-semibold text-ink">Today's route</h1>
        <p className="text-[12.5px] text-muted">{rows.length} stops remaining</p>
      </div>
      {rows.map(({ challan, customer, order }, i) => {
        const amount = order ? db.orderItems.filter((l) => l.orderId === order.id).reduce((s, l) => s + (l.qty.dispatched ?? l.qty.packed ?? 0) * l.rate, 0) : 0;
        const address = encodeURIComponent(customer.deliveryAddress || customer.billingAddress);
        return (
          <div key={challan.id} className="rounded-card border border-line bg-white p-3.5 shadow-card">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="grid size-7 shrink-0 place-items-center rounded-full bg-brand-100 text-[12px] font-bold text-brand-800">{i + 1}</span>
                <div>
                  <p className="text-[14px] font-semibold text-ink">{customer.name}</p>
                  <p className="text-xs text-muted">{customer.location}</p>
                </div>
              </div>
              <StatusBadge status={challan.status} />
            </div>
            <div className="mt-2 flex items-center justify-between text-[12.5px] text-muted">
              <span>{order?.orderNo} · {challan.packages} packages</span>
              <span className="tabular font-medium text-ink">{inr(amount)}</span>
            </div>
            <div className="mt-3 grid grid-cols-4 gap-1.5">
              <a href={`https://maps.google.com/?q=${address}`} target="_blank" rel="noreferrer" className="flex flex-col items-center gap-1 rounded-lg border border-line py-2 text-[10.5px] font-medium text-ink active:bg-canvas">
                <Navigation size={16} /> Navigate
              </a>
              <a href={`tel:${customer.mobile.replace(/\s/g, '')}`} className="flex flex-col items-center gap-1 rounded-lg border border-line py-2 text-[10.5px] font-medium text-ink active:bg-canvas">
                <Phone size={16} /> Call
              </a>
              <button onClick={() => nav(`/driver/challans/${challan.id}`)} className="flex flex-col items-center gap-1 rounded-lg border border-line py-2 text-[10.5px] font-medium text-ink active:bg-canvas">
                <FileText size={16} /> Challan
              </button>
              <button
                onClick={() => { if (challan.status === 'Dispatched') startTransit(challan.id, user.id); nav(`/driver/confirm/${challan.id}`); }}
                className="flex flex-col items-center gap-1 rounded-lg bg-brand-700 py-2 text-[10.5px] font-medium text-white active:bg-brand-800"
              >
                <PlayCircle size={16} /> {challan.status === 'In Transit' ? 'Confirm' : 'Start'}
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
