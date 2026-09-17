import { Fragment, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import {
  ArrowLeft, Building2, CalendarDays, Check, ChevronDown, ChevronRight, ClipboardList, Copy, Download, FileText,
  Mail, MapPin, MoreHorizontal, Pencil, Phone, Printer, Repeat, Trash2, Truck, User, UserRound, X,
} from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { StatusBadge } from '../../components/ui/Badge';
import { Breadcrumb } from '../../components/ui/Breadcrumb';
import { Alert } from '../../components/ui/Alert';
import { EmptyState } from '../../components/ui/States';
import { QtyChain } from '../../components/ui/QtyChain';
import { Menu } from '../../components/ui/Dropdown';
import { useConfirm } from '../../components/ui/ConfirmDialog';
import { useToast } from '../../components/ui/Toast';
import { useCurrentUser, useDb } from '../../store/useStore';
import { approveOrder } from '../../store/orderActions';
import { can } from '../../lib/nav';
import { ROLES } from '../../data/seed/roles';
import { fmtDate, fmtDateTime, fmtTime, initials, inr } from '../../lib/format';
import { cn } from '../../lib/cn';
import { RejectOrderModal } from './RejectOrderModal';
import { downloadCsv, itemEmoji } from './orderUi';

type TrackState = 'done' | 'active' | 'pending' | 'failed';

const DOT: Record<TrackState, string> = {
  done: 'bg-emerald-500 text-white',
  active: 'bg-brand-700 text-white',
  failed: 'bg-red-500 text-white',
  pending: 'bg-canvas text-subtle border border-line',
};

const TABS = ['items', 'quantity', 'purchase', 'packing', 'invoices', 'notes'] as const;
type TabKey = (typeof TABS)[number];

export function OrderDetailPage() {
  const { id } = useParams();
  const db = useDb();
  const user = useCurrentUser()!;
  const nav = useNavigate();
  const confirm = useConfirm();
  const toast = useToast();
  const [rejecting, setRejecting] = useState(false);
  const [tab, setTab] = useState<TabKey>('items');

  const order = db.orders.find((o) => o.id === id);
  const customer = order ? db.customers.find((c) => c.id === order.customerId) : null;
  const lines = useMemo(() => (order ? db.orderItems.filter((l) => l.orderId === order.id) : []), [db.orderItems, order]);
  const itemById = useMemo(() => new Map(db.items.map((i) => [i.id, i])), [db.items]);
  const userById = useMemo(() => new Map(db.users.map((u) => [u.id, u])), [db.users]);
  const canApprove = can(db, user.role, 'orders', 'approve');

  if (!order || !customer) {
    return <EmptyState title="Order not found" action={<Button size="sm" onClick={() => nav('/orders')}>Back to orders</Button>} />;
  }

  const totalAmount = lines.reduce((s, l) => s + (l.qty.ordered ?? 0) * l.rate, 0);
  const totalQty = lines.reduce((s, l) => s + (l.qty.ordered ?? 0), 0);
  const isPending = order.status === 'Submitted' || order.status === 'Late';

  const packing = db.packings.find((p) => p.orderId === order.id);
  const challan = db.challans.find((c) => c.orderId === order.id);
  const invoices = db.invoices.filter((i) => i.orderId === order.id);
  const payments = db.payments.filter((p) => invoices.some((i) => i.id === p.invoiceId));
  const audit = db.auditLogs.filter((a) => a.recordRef === order.orderNo).slice(0, 6);

  const poLinks = useMemo(() => {
    const itemIds = new Set(lines.map((l) => l.itemId));
    const pos = db.purchaseOrders.filter((p) => p.forDeliveryDate === order.deliveryDate);
    const poIds = new Set(pos.map((p) => p.id));
    return {
      pos,
      items: db.purchaseOrderItems.filter((l) => poIds.has(l.purchaseOrderId) && itemIds.has(l.itemId)),
      receivings: db.receivings.filter((g) => poIds.has(g.purchaseOrderId)),
    };
  }, [db.purchaseOrders, db.purchaseOrderItems, db.receivings, lines, order.deliveryDate]);

  /* ------------------------------------------------------------- tracker */

  const reached = (stage: keyof (typeof lines)[number]['qty']) => lines.some((l) => l.qty[stage] != null);
  const track: { label: string; at: string | null; note: string; state: TrackState }[] = [
    { label: 'Order', at: order.receivedAt, note: 'Submitted', state: 'done' },
    {
      label: 'Approval', at: order.approvedAt,
      note: order.status === 'Rejected' ? 'Rejected' : order.approvedAt ? 'Approved' : 'Pending',
      state: order.status === 'Rejected' ? 'failed' : order.approvedAt ? 'done' : 'active',
    },
    { label: 'Consolidation', at: order.lockedAt, note: order.lockedAt ? 'Included' : 'Pending', state: order.lockedAt ? 'done' : 'pending' },
    { label: 'Purchase', at: null, note: reached('purchased') ? 'Completed' : 'Pending', state: reached('purchased') ? 'done' : 'pending' },
    { label: 'Receiving', at: null, note: reached('received') ? 'Completed' : 'Pending', state: reached('received') ? 'done' : 'pending' },
    { label: 'Allocation', at: null, note: reached('allocated') ? 'Completed' : 'Pending', state: reached('allocated') ? 'done' : 'pending' },
    {
      label: 'Packing', at: packing?.packedAt ?? packing?.startedAt ?? null,
      note: packing?.status === 'Packed' || reached('packed') ? 'Completed' : packing ? 'In Progress' : 'Pending',
      state: packing?.status === 'Packed' || reached('packed') ? 'done' : packing ? 'active' : 'pending',
    },
    {
      label: 'Delivery', at: challan?.deliveredAt ?? challan?.dispatchedAt ?? null,
      note: order.deliveryStatus === 'Pending' ? 'Pending' : order.deliveryStatus,
      state: challan?.status === 'Delivered' ? 'done' : challan?.status === 'Failed' ? 'failed' : challan ? 'active' : 'pending',
    },
    {
      label: 'Invoice', at: invoices[0]?.createdAt ?? null,
      note: invoices.length ? 'Invoiced' : 'Pending', state: invoices.length ? 'done' : 'pending',
    },
    {
      label: 'Payment', at: payments[0]?.recordedAt ?? null,
      note: payments.length ? 'Received' : 'Pending', state: payments.length ? 'done' : 'pending',
    },
  ];

  /* -------------------------------------------------------------- actions */

  const doApprove = async () => {
    const ok = await confirm({ title: 'Approve this order?', description: `${order.orderNo} · ${customer.name}`, confirmLabel: 'Approve' });
    if (!ok) return;
    try {
      await approveOrder(order.id, user.id);
      toast({ tone: 'success', title: 'Order approved' });
    } catch (e) {
      toast({ tone: 'error', title: 'Could not approve', description: (e as Error).message });
    }
  };

  const exportItems = () =>
    downloadCsv(
      order.orderNo,
      ['#', 'Item', 'Category', 'Unit', 'Ordered Qty', 'Approved Qty', 'Rate', 'Amount', 'Remarks'],
      lines.map((l, i) => {
        const it = itemById.get(l.itemId);
        return [i + 1, it?.name ?? l.itemId, it?.category ?? '', l.unit, l.qty.ordered ?? 0, l.qty.approved ?? '', l.rate, Math.round((l.qty.ordered ?? 0) * l.rate), l.remarks];
      }),
    );

  const instructions = order.remarks.split(' · ').filter(Boolean);

  return (
    <div className="flex flex-col gap-4">
      {/* -------------------------------------------------------- page head */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <Breadcrumb items={[{ label: 'Orders', to: '/orders' }, { label: 'Order Details' }]} />
          <div className="mt-1.5 flex items-center gap-2.5">
            <h1 className="text-[24px] leading-tight font-semibold tracking-[-0.01em] text-ink">Order Details</h1>
            <StatusBadge status={order.status} />
          </div>
          <p className="mt-0.5 text-[13px] text-muted">View complete details and track the order from purchase to delivery.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" icon={ArrowLeft} onClick={() => nav('/orders')}>Back</Button>
          <Button variant="secondary" icon={Pencil} onClick={() => nav(`/orders/new?customer=${customer.id}`)}>Edit Order</Button>
          <Button variant="secondary" icon={Printer} onClick={() => window.print()}>Print</Button>
          <Menu
            align="right"
            items={[
              { key: 'csv', label: 'Export items CSV', icon: <Download size={14} />, onClick: exportItems },
              { key: 'repeat', label: 'Duplicate order', icon: <Copy size={14} />, onClick: () => nav(`/orders/new?customer=${customer.id}`) },
              ...(canApprove && isPending ? [{ key: 'reject', label: 'Reject order', icon: <X size={14} />, danger: true, onClick: () => setRejecting(true) }] : []),
            ]}
            trigger={(open) => <Button variant="secondary" icon={MoreHorizontal} iconRight={ChevronDown} onClick={open}>More</Button>}
          />
          {canApprove && isPending
            ? <Button variant="primary" icon={Check} onClick={doApprove}>Approve Order</Button>
            : <Button variant="primary" icon={Truck} onClick={() => nav(challan ? `/challans/${challan.id}` : '/challans')}>Generate Challan</Button>}
        </div>
      </div>

      {order.isLate && (
        <Alert tone="warning" title="Late order">
          Received at {fmtDateTime(order.receivedAt)} — after the {db.settings.orderCutoffTime} cutoff for {fmtDate(order.deliveryDate)} delivery.
        </Alert>
      )}
      {order.status === 'Rejected' && order.remarks && <Alert tone="error" title="Rejected">{order.remarks}</Alert>}

      <div className="grid gap-4 xl:grid-cols-12">
        {/* ----------------------------------------------------- left column */}
        <div className="flex flex-col gap-4 xl:col-span-9">
          {/* summary card */}
          <div className="rounded-card border border-line bg-white p-4 shadow-card">
            <div className="grid gap-4 lg:grid-cols-3">
              <div className="flex flex-col gap-3">
                <div className="flex gap-8">
                  <div>
                    <p className="text-[11px] font-semibold tracking-wide text-subtle uppercase">Order No.</p>
                    <p className="mt-0.5 text-[15px] font-semibold text-ink">{order.orderNo}</p>
                  </div>
                  <div className="min-w-0">
                    <p className="text-[11px] font-semibold tracking-wide text-subtle uppercase">Customer</p>
                    <p className="mt-0.5 truncate text-[15px] font-semibold text-ink">{customer.name}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2.5 rounded-lg border border-line bg-canvas/40 p-3">
                  <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-brand-700 text-[13px] font-semibold text-white">{initials(customer.name)}</span>
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-semibold text-ink">{customer.name}</p>
                    <p className="truncate text-[11.5px] text-muted">{customer.location}</p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 lg:col-span-2">
                <Tile icon={CalendarDays} tone="bg-blue-50 text-blue-600" label="Order Date" value={fmtDate(order.orderDate)} sub={fmtTime(order.receivedAt)} />
                <Tile icon={Truck} tone="bg-emerald-50 text-emerald-600" label="Delivery Date" value={fmtDate(order.deliveryDate)} sub="As per schedule" />
                <Tile icon={FileText} tone="bg-violet-50 text-violet-600" label="Order Type" value={`${order.orderType} Order`} sub={order.source} />
                <Tile
                  icon={UserRound} tone="bg-amber-50 text-amber-600" label="Created By"
                  value={userById.get(order.createdBy)?.name ?? '—'}
                  sub={ROLES.find((r) => r.key === userById.get(order.createdBy)?.role)?.name ?? ''}
                />
              </div>
            </div>

            <div className="mt-4 grid gap-3 lg:grid-cols-3">
              <div className="flex items-center gap-2.5 rounded-lg border border-line p-3">
                <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-700"><Check size={17} /></span>
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold tracking-wide text-subtle uppercase">Approved By</p>
                  <p className="truncate text-[13px] font-medium text-ink">{order.approvedBy ? userById.get(order.approvedBy)?.name ?? '—' : 'Not approved yet'}</p>
                  <p className="text-[11.5px] text-muted">{order.approvedAt ? fmtDateTime(order.approvedAt) : '—'}</p>
                </div>
              </div>
              <div className="rounded-lg border border-line p-3 lg:col-span-2">
                <p className="text-[11px] font-semibold tracking-wide text-subtle uppercase">Remarks</p>
                <p className="mt-1 text-[12.5px] text-ink">{order.remarks || 'No remarks on this order.'}</p>
              </div>
            </div>
          </div>

          {/* tracker */}
          <div className="rounded-card border border-line bg-white p-4 shadow-card">
            <div className="scrollbar-thin flex items-start overflow-x-auto">
              {track.map((s, i) => (
                <Fragment key={s.label}>
                  {i > 0 && <span className={cn('mt-3.5 h-0.5 min-w-3 flex-1', s.state === 'pending' ? 'bg-line' : 'bg-emerald-300')} />}
                  <div className="flex w-[74px] shrink-0 flex-col items-center gap-1 text-center">
                    <span className={cn('grid size-7 place-items-center rounded-full', DOT[s.state])}>
                      {s.state === 'done' ? <Check size={15} strokeWidth={3} /> : s.state === 'failed' ? <X size={14} strokeWidth={3} /> : <ChevronRight size={14} />}
                    </span>
                    <span className="text-[11.5px] leading-tight font-medium text-ink">{s.label}</span>
                    <span className="text-[10px] leading-tight text-subtle">{s.at ? fmtDate(s.at).slice(0, 5) : '—'}</span>
                    <span className={cn('text-[10.5px] leading-tight',
                      s.state === 'done' ? 'text-emerald-600' : s.state === 'active' ? 'text-brand-700' : s.state === 'failed' ? 'text-red-600' : 'text-muted')}>
                      {s.note}
                    </span>
                  </div>
                </Fragment>
              ))}
            </div>
          </div>

          {/* tabbed detail */}
          <div className="rounded-card border border-line bg-white shadow-card">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4">
              <div className="scrollbar-thin flex gap-5 overflow-x-auto">
                {([
                  ['items', `Items (${lines.length})`],
                  ['quantity', 'Quantity Tracking'],
                  ['purchase', 'Purchase & Receiving'],
                  ['packing', 'Packing & Delivery'],
                  ['invoices', 'Invoices & Payments'],
                  ['notes', 'Notes'],
                ] as [TabKey, string][]).map(([k, label]) => (
                  <button
                    key={k}
                    onClick={() => setTab(k)}
                    className={cn('relative shrink-0 py-2.5 text-[13px] font-medium whitespace-nowrap', tab === k ? 'text-brand-800' : 'text-muted hover:text-ink')}
                  >
                    {label}
                    {tab === k && <span className="absolute inset-x-0 -bottom-px h-[2px] rounded-full bg-brand-700" />}
                  </button>
                ))}
              </div>
              <div className="flex shrink-0 items-center gap-2 py-2">
                <Button size="xs" variant="secondary" icon={Download} iconRight={ChevronDown} onClick={exportItems}>Export</Button>
                <Button size="xs" variant="secondary" icon={Pencil} onClick={() => nav(`/orders/new?customer=${customer.id}`)}>Add Item</Button>
              </div>
            </div>

            {tab === 'items' && (
              <div className="scrollbar-thin overflow-x-auto">
                <table className="w-full border-collapse text-[12.5px]">
                  <thead>
                    <tr className="border-b border-line bg-canvas/70 text-[11px] font-semibold tracking-wide text-subtle uppercase">
                      <th className="w-10 px-3 py-2.5 text-left">#</th>
                      {['Item', 'Category', 'Unit'].map((h) => <th key={h} className="px-3 py-2.5 text-left whitespace-nowrap">{h}</th>)}
                      {['Ordered Qty', 'Approved Qty', 'Rate (₹)', 'Amount (₹)'].map((h) => <th key={h} className="px-3 py-2.5 text-right whitespace-nowrap">{h}</th>)}
                      <th className="px-3 py-2.5 text-left">Status</th>
                      <th className="px-3 py-2.5 text-left">Remarks</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map((l, i) => {
                      const item = itemById.get(l.itemId);
                      if (!item) return null;
                      const stage = l.qty.delivered != null ? 'Delivered' : l.qty.packed != null ? 'Packed'
                        : l.qty.allocated != null ? 'Allocated' : l.qty.received != null ? 'Received'
                        : l.qty.approved != null ? 'Approved' : 'Pending';
                      return (
                        <tr key={l.id} className="border-b border-line last:border-0 hover:bg-brand-50/25">
                          <td className="tabular px-3 py-2 text-subtle">{i + 1}</td>
                          <td className="px-3 py-2 font-medium whitespace-nowrap text-ink">
                            <span className="mr-1.5">{itemEmoji(item.name, item.category)}</span>{item.name}
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap text-muted">{item.category}</td>
                          <td className="px-3 py-2 text-muted">{l.unit}</td>
                          <td className="tabular px-3 py-2 text-right">{l.qty.ordered ?? '—'}</td>
                          <td className="tabular px-3 py-2 text-right">{l.qty.approved ?? '—'}</td>
                          <td className="tabular px-3 py-2 text-right text-muted">{l.rate.toFixed(2)}</td>
                          <td className="tabular px-3 py-2 text-right font-medium text-ink">{((l.qty.ordered ?? 0) * l.rate).toFixed(2)}</td>
                          <td className="px-3 py-2"><StatusBadge status={stage} /></td>
                          <td className="px-3 py-2 text-muted">{l.remarks || '-'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {tab === 'quantity' && (
              <div className="flex flex-col gap-3 p-4">
                {lines.map((l) => {
                  const item = itemById.get(l.itemId);
                  if (!item) return null;
                  return (
                    <div key={l.id} className="rounded-lg border border-line p-3">
                      <div className="mb-2 flex items-center justify-between gap-3">
                        <p className="text-[13px] font-medium text-ink">{item.name} <span className="text-muted">({item.unit})</span></p>
                        <p className="tabular text-[12.5px] text-muted">{inr(l.rate, true)} / {item.unit}</p>
                      </div>
                      <QtyChain chain={l.qty} unit={item.unit} compact />
                    </div>
                  );
                })}
              </div>
            )}

            {tab === 'purchase' && (
              <div className="flex flex-col gap-4 p-4">
                <Section title={`Purchase orders for ${fmtDate(order.deliveryDate)}`}>
                  {poLinks.pos.length === 0 ? <Muted>No purchase orders raised for this delivery date yet.</Muted> : (
                    <div className="flex flex-col gap-1.5">
                      {poLinks.pos.map((p) => (
                        <button key={p.id} onClick={() => nav('/purchase')} className="flex items-center gap-3 rounded-lg border border-line px-3 py-2 text-left hover:bg-canvas/50">
                          <span className="text-[12.5px] font-medium text-brand-700">{p.poNo}</span>
                          <span className="min-w-0 flex-1 truncate text-[12px] text-muted">{db.suppliers.find((s) => s.id === p.supplierId)?.name ?? '—'}</span>
                          <StatusBadge status={p.status} />
                        </button>
                      ))}
                    </div>
                  )}
                </Section>
                <Section title="Goods receipts">
                  {poLinks.receivings.length === 0 ? <Muted>Nothing received against these POs yet.</Muted> : (
                    <div className="flex flex-col gap-1.5">
                      {poLinks.receivings.map((g) => (
                        <div key={g.id} className="flex items-center gap-3 rounded-lg border border-line px-3 py-2">
                          <span className="text-[12.5px] font-medium text-brand-700">{g.grnNo}</span>
                          <span className="min-w-0 flex-1 truncate text-[12px] text-muted">{fmtDateTime(g.receivedAt)}</span>
                          <StatusBadge status={g.status} />
                        </div>
                      ))}
                    </div>
                  )}
                </Section>
              </div>
            )}

            {tab === 'packing' && (
              <div className="flex flex-col gap-4 p-4">
                <Section title="Packing">
                  {!packing ? <Muted>Packing has not started for this order.</Muted> : (
                    <div className="grid gap-3 sm:grid-cols-4">
                      <Fact label="Packing No" value={packing.packingNo} />
                      <Fact label="Status" value={packing.status} />
                      <Fact label="Packages" value={String(packing.packages)} />
                      <Fact label="Packed At" value={packing.packedAt ? fmtDateTime(packing.packedAt) : '—'} />
                    </div>
                  )}
                </Section>
                <Section title="Delivery">
                  {!challan ? <Muted>No challan generated yet.</Muted> : (
                    <div className="grid gap-3 sm:grid-cols-4">
                      <Fact label="Challan No" value={challan.challanNo} link={() => nav(`/challans/${challan.id}`)} />
                      <Fact label="Driver" value={challan.driverId ? userById.get(challan.driverId)?.name ?? '—' : '—'} />
                      <Fact label="Vehicle" value={challan.vehicleNo} />
                      <Fact label="Delivered At" value={challan.deliveredAt ? fmtDateTime(challan.deliveredAt) : '—'} />
                    </div>
                  )}
                </Section>
              </div>
            )}

            {tab === 'invoices' && (
              <div className="flex flex-col gap-4 p-4">
                <Section title="Invoices">
                  {invoices.length === 0 ? <Muted>Not invoiced yet.</Muted> : (
                    <div className="flex flex-col gap-1.5">
                      {invoices.map((inv) => (
                        <button key={inv.id} onClick={() => nav(`/invoices/${inv.id}`)} className="flex items-center gap-3 rounded-lg border border-line px-3 py-2 text-left hover:bg-canvas/50">
                          <span className="text-[12.5px] font-medium text-brand-700">{inv.invoiceNo}</span>
                          <span className="min-w-0 flex-1 truncate text-[12px] text-muted">{fmtDate(inv.invoiceDate)} · due {fmtDate(inv.dueDate)}</span>
                          <span className="tabular text-[12.5px] font-semibold text-ink">{inr(inv.total)}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </Section>
                <Section title="Payments">
                  {payments.length === 0 ? <Muted>No payment recorded against this order.</Muted> : (
                    <div className="flex flex-col gap-1.5">
                      {payments.map((p) => (
                        <div key={p.id} className="flex items-center gap-3 rounded-lg border border-line px-3 py-2">
                          <span className="text-[12.5px] font-medium text-brand-700">{p.receiptNo}</span>
                          <span className="min-w-0 flex-1 truncate text-[12px] text-muted">{fmtDate(p.paymentDate)} · {p.mode}</span>
                          <span className="tabular text-[12.5px] font-semibold text-emerald-600">{inr(p.amount)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </Section>
              </div>
            )}

            {tab === 'notes' && (
              <div className="flex flex-col gap-4 p-4">
                <Section title="Order remarks"><p className="text-[12.5px] text-ink">{order.remarks || 'No remarks on this order.'}</p></Section>
                <Section title="Line remarks">
                  {lines.filter((l) => l.remarks).length === 0 ? <Muted>No line-level remarks.</Muted> : (
                    <ul className="flex flex-col gap-1.5">
                      {lines.filter((l) => l.remarks).map((l) => (
                        <li key={l.id} className="text-[12.5px] text-ink">
                          <b>{itemById.get(l.itemId)?.name}</b> — <span className="text-muted">{l.remarks}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </Section>
              </div>
            )}
          </div>

          {/* bottom trio */}
          <div className="grid gap-4 lg:grid-cols-3">
            <Panel title="Order Summary" icon={ClipboardList}>
              <div className="flex flex-col divide-y divide-line px-4">
                <Row label="Total Items" value={String(lines.length)} />
                <Row label="Total Quantity" value={String(Math.round(totalQty * 100) / 100)} />
                <Row label="Total Amount" value={inr(totalAmount)} strong />
              </div>
            </Panel>
            <Panel title="Remarks" icon={FileText}>
              <p className="p-4 text-[12.5px] text-ink">{order.remarks || 'No remarks on this order.'}</p>
            </Panel>
            <Panel title="Customer Instructions" icon={User}>
              {instructions.length === 0 ? <p className="p-4 text-[12.5px] text-subtle">None recorded.</p> : (
                <ul className="flex list-disc flex-col gap-1.5 p-4 pl-8 text-[12.5px] text-ink">
                  {instructions.map((t, i) => <li key={i}>{t}</li>)}
                </ul>
              )}
            </Panel>
          </div>
        </div>

        {/* ---------------------------------------------------- right column */}
        <div className="flex flex-col gap-4 xl:col-span-3">
          <Panel title="Customer Information" icon={Building2} action={<button onClick={() => nav(`/customers/${customer.id}`)} className="text-[11.5px] font-medium text-brand-700 hover:underline">View Profile →</button>}>
            <div className="flex flex-col gap-3 p-4">
              <div className="flex items-center gap-2.5">
                <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-brand-700 text-[13px] font-semibold text-white">{initials(customer.name)}</span>
                <div className="min-w-0">
                  <p className="truncate text-[13px] font-semibold text-ink">{customer.name}</p>
                  <p className="truncate text-[11.5px] text-muted">{customer.type} · {customer.location}</p>
                </div>
              </div>
              <div className="flex flex-col gap-2 text-[12px] text-muted">
                <Line icon={Phone}>{customer.mobile}</Line>
                <Line icon={User}>{customer.contactPerson}</Line>
                <Line icon={Mail}>{customer.email || '—'}</Line>
                <Line icon={MapPin}>{customer.deliveryAddress || customer.location}</Line>
                <Line icon={Building2}>GST: {customer.gstin || '—'}</Line>
              </div>
            </div>
          </Panel>

          <Panel title="Order Summary" icon={ClipboardList}>
            <div className="flex flex-col divide-y divide-line px-4">
              <Row label="Items" value={String(lines.length)} />
              <Row label="Total Quantity" value={String(Math.round(totalQty * 100) / 100)} />
              <Row label="Total Amount" value={inr(totalAmount)} strong />
              <div className="flex items-center justify-between gap-2 py-2.5">
                <p className="text-[12.5px] text-muted">Status</p>
                <StatusBadge status={order.status} />
              </div>
            </div>
          </Panel>

          <Panel title="Quick Actions">
            <div className="flex flex-col gap-2 p-4">
              <Button variant="secondary" icon={Pencil} onClick={() => nav(`/orders/new?customer=${customer.id}`)} className="justify-start">Edit Order</Button>
              <Button variant="secondary" icon={Copy} onClick={() => nav(`/orders/new?customer=${customer.id}`)} className="justify-start">Duplicate Order</Button>
              <Button variant="secondary" icon={Truck} onClick={() => nav(challan ? `/challans/${challan.id}` : '/challans')} className="justify-start">Generate Challan</Button>
              <Button variant="secondary" icon={Download} onClick={() => window.print()} className="justify-start">Download PDF</Button>
              <Button variant="secondary" icon={Trash2} disabled={!canApprove || !isPending} onClick={() => setRejecting(true)}
                className="justify-start border-red-200 text-red-600 hover:bg-red-50">Cancel Order</Button>
            </div>
          </Panel>

          <Panel title="Audit History" icon={Repeat} action={<button onClick={() => nav('/audit-logs')} className="text-[11.5px] font-medium text-brand-700 hover:underline">View All →</button>}>
            <div className="flex flex-col gap-3 p-4">
              {audit.length === 0 ? <p className="text-[12.5px] text-subtle">Nothing logged for this order yet.</p> : audit.map((a) => (
                <div key={a.id} className="flex gap-2.5">
                  <span className={cn('mt-1 size-2 shrink-0 rounded-full', a.status === 'Failed' ? 'bg-red-500' : a.status === 'Warning' ? 'bg-orange-500' : 'bg-emerald-500')} />
                  <div className="min-w-0">
                    <p className="truncate text-[12.5px] font-medium text-ink">{a.action}</p>
                    <p className="truncate text-[11px] text-muted">{fmtDateTime(a.at)} · by {userById.get(a.userId)?.name ?? a.userId}</p>
                  </div>
                </div>
              ))}
            </div>
          </Panel>
        </div>
      </div>

      <RejectOrderModal order={rejecting ? order : null} onClose={() => setRejecting(false)} />
    </div>
  );
}

/* ------------------------------------------------------------- small parts */

function Panel({ title, icon: Icon, action, children }: { title: string; icon?: typeof ClipboardList; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex flex-col rounded-card border border-line bg-white shadow-card">
      <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-2.5">
        <h3 className="flex min-w-0 items-center gap-2 truncate text-[13.5px] font-semibold text-ink">
          {Icon && <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-700"><Icon size={14} /></span>}
          {title}
        </h3>
        {action}
      </div>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

function Tile({ icon: Icon, tone, label, value, sub }: { icon: typeof CalendarDays; tone: string; label: string; value: string; sub?: string }) {
  return (
    <div className="flex items-start gap-2.5 rounded-lg border border-line p-3">
      <span className={cn('grid size-9 shrink-0 place-items-center rounded-lg', tone)}><Icon size={17} /></span>
      <div className="min-w-0">
        <p className="text-[11px] font-semibold tracking-wide text-subtle uppercase">{label}</p>
        <p className="truncate text-[13px] font-medium text-ink">{value}</p>
        {sub && <p className="truncate text-[11.5px] text-muted">{sub}</p>}
      </div>
    </div>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-2 py-2.5">
      <p className="text-[12.5px] text-muted">{label}</p>
      <p className={cn('tabular text-[13px] font-semibold', strong ? 'text-brand-800' : 'text-ink')}>{value}</p>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-2 text-[11px] font-semibold tracking-wide text-subtle uppercase">{title}</p>
      {children}
    </div>
  );
}

function Fact({ label, value, link }: { label: string; value: string; link?: () => void }) {
  return (
    <div className="rounded-lg border border-line p-2.5">
      <p className="text-[11px] text-subtle">{label}</p>
      {link
        ? <button onClick={link} className="text-[12.5px] font-medium text-brand-700 hover:underline">{value}</button>
        : <p className="truncate text-[12.5px] font-medium text-ink">{value}</p>}
    </div>
  );
}

function Muted({ children }: { children: React.ReactNode }) {
  return <p className="text-[12.5px] text-subtle">{children}</p>;
}

function Line({ icon: Icon, children }: { icon: typeof Phone; children: React.ReactNode }) {
  return <span className="flex items-start gap-1.5"><Icon size={13} className="mt-0.5 shrink-0" /><span className="min-w-0 break-words">{children}</span></span>;
}
