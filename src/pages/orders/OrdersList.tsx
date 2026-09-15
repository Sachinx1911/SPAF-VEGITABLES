import { useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { Check, MoreHorizontal, Plus, Repeat, X } from 'lucide-react';
import { PageHeader, Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Select } from '../../components/ui/Field';
import { Badge, StatusBadge } from '../../components/ui/Badge';
import { DataTable, type Column } from '../../components/ui/DataTable';
import { Menu } from '../../components/ui/Dropdown';
import { useConfirm } from '../../components/ui/ConfirmDialog';
import { useToast } from '../../components/ui/Toast';
import { useCurrentUser, useDb } from '../../store/useStore';
import { approveOrder, rejectOrder } from '../../store/orderActions';
import { can } from '../../lib/nav';
import type { Order, OrderStatus } from '../../types/models';
import { fmtDate, inr } from '../../lib/format';
import { RejectOrderModal } from './RejectOrderModal';

const STATUSES: OrderStatus[] = ['Draft', 'Submitted', 'Approved', 'Late', 'Rejected', 'Locked', 'Partially Fulfilled', 'Completed'];

export function OrdersListPage() {
  const db = useDb();
  const user = useCurrentUser()!;
  const nav = useNavigate();
  const loc = useLocation();
  const confirm = useConfirm();
  const toast = useToast();
  const canApprove = can(db, user.role, 'orders', 'approve');

  const [search, setSearch] = useState('');
  const [status, setStatus] = useState(() => new URLSearchParams(loc.search).get('status') ?? '');
  const [customerId, setCustomerId] = useState('');
  const [deliveryStatus, setDeliveryStatus] = useState('');
  const [rejecting, setRejecting] = useState<Order | null>(null);

  const custById = new Map(db.customers.map((c) => [c.id, c]));
  const lineCountBy = useMemo(() => {
    const m = new Map<string, { count: number; qty: number; amount: number }>();
    for (const l of db.orderItems) {
      const cur = m.get(l.orderId) ?? { count: 0, qty: 0, amount: 0 };
      cur.count += 1;
      cur.qty += l.qty.ordered ?? 0;
      cur.amount += (l.qty.ordered ?? 0) * l.rate;
      m.set(l.orderId, cur);
    }
    return m;
  }, [db.orderItems]);

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return db.orders.filter((o) => {
      const cust = custById.get(o.customerId);
      if (term && !(o.orderNo.toLowerCase().includes(term) || cust?.name.toLowerCase().includes(term))) return false;
      if (status && o.status !== status) return false;
      if (customerId && o.customerId !== customerId) return false;
      if (deliveryStatus && o.deliveryStatus !== deliveryStatus) return false;
      return true;
    }).sort((a, b) => (a.receivedAt < b.receivedAt ? 1 : -1));
  }, [db.orders, search, status, customerId, deliveryStatus]);

  const doApprove = async (o: Order) => {
    const ok = await confirm({ title: 'Approve this order?', description: `${o.orderNo} · ${custById.get(o.customerId)?.name}`, confirmLabel: 'Approve' });
    if (ok) { approveOrder(o.id, user.id); toast({ tone: 'success', title: 'Order approved', description: o.orderNo }); }
  };

  const columns: Column<Order>[] = [
    { key: 'orderNo', header: 'Order ID', render: (o) => <span className="font-medium text-brand-700">{o.orderNo}</span>, sortValue: (o) => o.orderNo, exportValue: (o) => o.orderNo },
    { key: 'customer', header: 'Customer', render: (o) => custById.get(o.customerId)?.name ?? '—', sortValue: (o) => custById.get(o.customerId)?.name ?? '', exportValue: (o) => custById.get(o.customerId)?.name ?? '' },
    { key: 'orderDate', header: 'Order Date', render: (o) => fmtDate(o.orderDate), sortValue: (o) => o.orderDate, hideBelow: 'md' },
    { key: 'deliveryDate', header: 'Delivery Date', render: (o) => fmtDate(o.deliveryDate), sortValue: (o) => o.deliveryDate },
    { key: 'items', header: 'Items', align: 'right', render: (o) => lineCountBy.get(o.id)?.count ?? 0, hideBelow: 'lg' },
    { key: 'amount', header: 'Amount', align: 'right', render: (o) => <span className="tabular">{inr(lineCountBy.get(o.id)?.amount ?? 0)}</span>, sortValue: (o) => lineCountBy.get(o.id)?.amount ?? 0, hideBelow: 'lg' },
    { key: 'status', header: 'Status', render: (o) => <StatusBadge status={o.status} /> },
    { key: 'packing', header: 'Packing', render: (o) => <StatusBadge status={o.packingStatus} />, hideBelow: 'lg' },
    { key: 'delivery', header: 'Delivery', render: (o) => <StatusBadge status={o.deliveryStatus} />, hideBelow: 'md' },
    { key: 'invoice', header: 'Invoice', render: (o) => <StatusBadge status={o.invoiceStatus} />, hideBelow: 'lg' },
    {
      key: 'actions', header: '', width: '110px', align: 'right',
      render: (o) => (
        <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
          {canApprove && (o.status === 'Submitted' || o.status === 'Late') && (
            <>
              <Button size="xs" variant="primary" icon={Check} onClick={() => doApprove(o)}>Approve</Button>
              <Button size="xs" variant="danger" icon={X} onClick={() => setRejecting(o)} />
            </>
          )}
          <Menu
            align="right"
            items={[
              { key: 'view', label: 'View detail', onClick: () => nav(`/orders/${o.id}`) },
              { key: 'repeat', label: 'Repeat this order', icon: <Repeat size={14} />, onClick: () => nav(`/orders/new?customer=${o.customerId}`) },
            ]}
            trigger={(open) => <button onClick={(e) => { e.stopPropagation(); open(); }} className="rounded p-1 text-subtle hover:bg-canvas hover:text-ink"><MoreHorizontal size={16} /></button>}
          />
        </div>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Orders"
        description={`${rows.length} of ${db.orders.length} orders`}
        actions={<Button variant="primary" icon={Plus} onClick={() => nav('/orders/new')}>New Order</Button>}
      />
      <Card>
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(o) => o.id}
          onRowClick={(o) => nav(`/orders/${o.id}`)}
          searchValue={search}
          onSearchChange={setSearch}
          searchPlaceholder="Search order no. or customer…"
          exportFilename="orders"
          filters={
            <>
              <Select value={status} onChange={(e) => setStatus(e.target.value)} placeholder="All status" options={STATUSES} className="w-40" />
              <Select value={customerId} onChange={(e) => setCustomerId(e.target.value)} placeholder="All customers" className="w-48" options={db.customers.map((c) => ({ value: c.id, label: c.name }))} />
              <Select value={deliveryStatus} onChange={(e) => setDeliveryStatus(e.target.value)} placeholder="All delivery" className="w-36"
                options={['Pending', 'Ready', 'Dispatched', 'In Transit', 'Delivered', 'Partial', 'Failed']} />
            </>
          }
          emptyTitle="No orders found"
          emptyDescription="Try clearing filters, or create the first order."
          emptyAction={<Button size="sm" variant="primary" icon={Plus} onClick={() => nav('/orders/new')} className="mt-1">New Order</Button>}
          cardRender={(o) => (
            <div>
              <div className="flex items-center justify-between gap-2">
                <p className="text-[13.5px] font-medium text-brand-700">{o.orderNo}</p>
                <StatusBadge status={o.status} />
              </div>
              <p className="mt-0.5 text-xs text-muted">{custById.get(o.customerId)?.name} · Delivery {fmtDate(o.deliveryDate)}</p>
              {canApprove && (o.status === 'Submitted' || o.status === 'Late') && (
                <div className="mt-2 flex gap-2">
                  <Button size="xs" variant="primary" icon={Check} onClick={(e) => { e.stopPropagation(); doApprove(o); }}>Approve</Button>
                  <Button size="xs" variant="danger" icon={X} onClick={(e) => { e.stopPropagation(); setRejecting(o); }}>Reject</Button>
                </div>
              )}
            </div>
          )}
        />
      </Card>

      <RejectOrderModal order={rejecting} onClose={() => setRejecting(null)} />
    </div>
  );
}
