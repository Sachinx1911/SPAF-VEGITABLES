import { useNavigate } from 'react-router';
import { StatusBadge } from '../../components/ui/Badge';
import { EmptyState } from '../../components/ui/States';
import { Button } from '../../components/ui/Button';
import { useCurrentUser, useDb } from '../../store/useStore';
import { fmtDate } from '../../lib/format';

export function PortalOrdersPage() {
  const db = useDb();
  const user = useCurrentUser()!;
  const nav = useNavigate();
  const orders = db.orders.filter((o) => o.customerId === user.customerId).sort((a, b) => (a.receivedAt < b.receivedAt ? 1 : -1));

  return (
    <div className="flex flex-col gap-3">
      <h1 className="text-[18px] font-semibold text-ink">Your orders</h1>
      {orders.length === 0 ? (
        <EmptyState title="No orders yet" description="Place your first order to see it here." action={<Button size="sm" variant="primary" onClick={() => nav('/portal/order')} className="mt-1">Place order</Button>} />
      ) : (
        orders.map((o) => {
          const lines = db.orderItems.filter((l) => l.orderId === o.id);
          return (
            <button key={o.id} className="rounded-lg border border-line bg-white p-3 text-left">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[13.5px] font-semibold text-ink">{o.orderNo}</p>
                <StatusBadge status={o.status} />
              </div>
              <p className="mt-0.5 text-xs text-muted">Delivery {fmtDate(o.deliveryDate)} · {lines.length} items</p>
              <div className="mt-2 flex gap-1.5">
                <StatusBadge status={o.packingStatus} />
                <StatusBadge status={o.deliveryStatus} />
              </div>
            </button>
          );
        })
      )}
    </div>
  );
}
