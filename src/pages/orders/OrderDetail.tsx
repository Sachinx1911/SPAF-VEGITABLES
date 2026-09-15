import { useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { ArrowLeft, Check, Clock, Printer, Repeat, X } from 'lucide-react';
import { Card, CardBody, CardHeader, PageHeader } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { StatusBadge } from '../../components/ui/Badge';
import { Breadcrumb } from '../../components/ui/Breadcrumb';
import { Alert } from '../../components/ui/Alert';
import { EmptyState } from '../../components/ui/States';
import { QtyChain } from '../../components/ui/QtyChain';
import { useConfirm } from '../../components/ui/ConfirmDialog';
import { useToast } from '../../components/ui/Toast';
import { useCurrentUser, useDb } from '../../store/useStore';
import { approveOrder, rejectOrder } from '../../store/orderActions';
import { can } from '../../lib/nav';
import { fmtDate, fmtDateTime, inr } from '../../lib/format';
import { RejectOrderModal } from './RejectOrderModal';

export function OrderDetailPage() {
  const { id } = useParams();
  const db = useDb();
  const user = useCurrentUser()!;
  const nav = useNavigate();
  const confirm = useConfirm();
  const toast = useToast();
  const [rejecting, setRejecting] = useState(false);

  const order = db.orders.find((o) => o.id === id);
  const customer = order ? db.customers.find((c) => c.id === order.customerId) : null;
  const lines = order ? db.orderItems.filter((l) => l.orderId === order.id) : [];
  const itemById = new Map(db.items.map((i) => [i.id, i]));
  const canApprove = can(db, user.role, 'orders', 'approve');

  if (!order || !customer) {
    return <EmptyState title="Order not found" action={<Button size="sm" onClick={() => nav('/orders')}>Back to orders</Button>} />;
  }

  const totalAmount = lines.reduce((s, l) => s + (l.qty.ordered ?? 0) * l.rate, 0);
  const isPending = order.status === 'Submitted' || order.status === 'Late';

  const doApprove = async () => {
    const ok = await confirm({ title: 'Approve this order?', description: `${order.orderNo} · ${customer.name}`, confirmLabel: 'Approve' });
    if (ok) { approveOrder(order.id, user.id); toast({ tone: 'success', title: 'Order approved' }); }
  };

  return (
    <div>
      <PageHeader
        breadcrumb={<Breadcrumb items={[{ label: 'Orders', to: '/orders' }, { label: order.orderNo }]} />}
        title={<span className="flex items-center gap-2">{order.orderNo} <StatusBadge status={order.status} /></span>}
        description={`${customer.name} · Order ${fmtDate(order.orderDate)} · Delivery ${fmtDate(order.deliveryDate)}`}
        actions={
          <>
            <Button variant="secondary" icon={ArrowLeft} onClick={() => nav('/orders')}>Back</Button>
            <Button variant="secondary" icon={Printer} onClick={() => window.print()}>Print</Button>
            <Button variant="secondary" icon={Repeat} onClick={() => nav(`/orders/new?customer=${customer.id}`)}>Repeat</Button>
            {canApprove && isPending && (
              <>
                <Button variant="danger" icon={X} onClick={() => setRejecting(true)}>Reject</Button>
                <Button variant="primary" icon={Check} onClick={doApprove}>Approve</Button>
              </>
            )}
          </>
        }
      />

      {order.isLate && (
        <Alert tone="warning" title="Late order" className="mb-4">
          Received at {fmtDateTime(order.receivedAt)} — after the {db.settings.orderCutoffTime} cutoff for {fmtDate(order.deliveryDate)} delivery.
          {isPending && ' Approve to include it in tomorrow\'s consolidation despite the delay, or reject it.'}
        </Alert>
      )}
      {order.status === 'Rejected' && order.remarks && (
        <Alert tone="error" title="Rejected" className="mb-4">{order.remarks}</Alert>
      )}

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Info label="Source" value={order.source} />
        <Info label="Received At" value={fmtDateTime(order.receivedAt)} />
        <Info label="Approved At" value={order.approvedAt ? fmtDateTime(order.approvedAt) : '—'} />
        <Info label="Total Amount" value={inr(totalAmount)} />
      </div>

      <Card>
        <CardHeader title="Order lines" subtitle={`${lines.length} items · quantity chain kept at every stage`} icon={<Clock size={15} />} />
        <CardBody className="flex flex-col gap-3">
          {lines.map((l) => {
            const item = itemById.get(l.itemId);
            if (!item) return null;
            return (
              <div key={l.id} className="rounded-lg border border-line p-3">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <p className="font-medium text-ink">{item.name} <span className="text-muted">({item.unit})</span></p>
                  <div className="text-right text-[13px]">
                    <p className="tabular font-medium">{inr(l.rate, true)} / {item.unit}</p>
                    {l.remarks && <p className="text-xs text-orange-600">{l.remarks}</p>}
                  </div>
                </div>
                <QtyChain chain={l.qty} unit={item.unit} compact />
              </div>
            );
          })}
        </CardBody>
      </Card>

      <RejectOrderModal order={rejecting ? order : null} onClose={() => setRejecting(false)} />
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <Card className="p-3.5">
      <p className="text-[11.5px] font-medium text-muted">{label}</p>
      <p className="mt-1 text-[14px] font-semibold text-ink">{value}</p>
    </Card>
  );
}
