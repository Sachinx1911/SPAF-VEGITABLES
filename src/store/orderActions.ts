import type { Order, OrderItem, OrderSource, PurchaseRequirement, QtyChain, Unit } from '../types/models';
import { useStore } from './useStore';
import { uid } from '../lib/id';
import { nowISO, todayISO } from '../lib/clock';
import { addDays } from '../lib/format';
import { isPastCutoff } from '../domain/orders';

const emptyChain = (ordered: number): QtyChain => ({
  ordered, approved: null, purchased: null, received: null, accepted: null, allocated: null, packed: null,
  dispatched: null, delivered: null, customerAccepted: null, invoiced: null, paid: null,
});

export interface NewOrderLine {
  itemId: string;
  unit: Unit;
  qty: number;
  rate: number;
  remarks?: string;
}

export interface NewOrderInput {
  customerId: string;
  deliveryDate: string;
  orderType?: Order['orderType'];
  source?: OrderSource;
  repeatOfOrderId?: string | null;
  remarks?: string;
  /** Parked for later — never flagged late and never reaches consolidation. */
  draft?: boolean;
  lines: NewOrderLine[];
}

function auditRow(userId: string, action: string, module: string, recordRef: string, customerId: string | null, oldValue: string, newValue: string, status: 'Success' | 'Warning' = 'Success') {
  return { id: uid('a'), at: nowISO(), userId, action, module: module as any, recordRef, customerId, oldValue, newValue, device: 'Chrome · Windows', status };
}

let orderSeq = 1000;

/** Creates a new order, flagging it Late automatically if it arrives after the cutoff. */
export function createOrder(input: NewOrderInput, userId: string): Order {
  const { db, commit } = useStore.getState();
  const now = nowISO();
  const today = todayISO();
  const late = !input.draft && isPastCutoff(now, db.settings.orderCutoffTime) && input.deliveryDate <= addDays(today, 1);

  const order: Order = {
    id: uid('o'),
    orderNo: `SO-2609-${String(++orderSeq).padStart(4, '0')}`,
    customerId: input.customerId,
    orderDate: today,
    deliveryDate: input.deliveryDate,
    orderType: input.orderType ?? 'Regular',
    source: input.source ?? 'Staff',
    status: input.draft ? 'Draft' : late ? 'Late' : 'Submitted',
    isLate: late,
    receivedAt: now,
    approvedBy: null,
    approvedAt: null,
    lockedAt: null,
    packingStatus: 'Not Started',
    deliveryStatus: 'Pending',
    invoiceStatus: 'Not Ready',
    repeatOfOrderId: input.repeatOfOrderId ?? null,
    remarks: input.remarks ?? '',
    createdBy: userId,
    createdAt: now,
  };
  const lines: OrderItem[] = input.lines.map((l) => ({
    id: uid('oi'), orderId: order.id, itemId: l.itemId, unit: l.unit, rate: l.rate, qty: emptyChain(l.qty), remarks: l.remarks ?? '',
  }));

  commit((d) => ({
    orders: [...d.orders, order],
    orderItems: [...d.orderItems, ...lines],
    auditLogs: [
      auditRow(userId, input.draft ? 'Order draft saved' : late ? 'Late order flagged' : 'Order submitted', 'orders',
        order.orderNo, order.customerId, '', `${lines.length} items`, late ? 'Warning' : 'Success'),
      ...d.auditLogs,
    ],
  }));
  return order;
}

/**
 * Replaces an order's lines with what the customer now wants — how "add something to
 * today's order" lands. Approval is withdrawn on every change, so the ops team always
 * sees the final list before it reaches consolidation.
 */
export function amendOrder(orderId: string, lines: NewOrderLine[], userId: string): Order {
  const { db, commit } = useStore.getState();
  const order = db.orders.find((o) => o.id === orderId)!;
  const now = nowISO();
  const late = isPastCutoff(now, db.settings.orderCutoffTime) && order.deliveryDate <= addDays(todayISO(), 1);
  const existing = new Map(db.orderItems.filter((l) => l.orderId === orderId).map((l) => [l.itemId, l]));

  const next: OrderItem[] = lines.map((l) => {
    const prev = existing.get(l.itemId);
    return prev
      ? { ...prev, unit: l.unit, rate: l.rate, remarks: l.remarks ?? prev.remarks, qty: { ...prev.qty, ordered: l.qty, approved: null } }
      : { id: uid('oi'), orderId, itemId: l.itemId, unit: l.unit, rate: l.rate, qty: emptyChain(l.qty), remarks: l.remarks ?? '' };
  });

  const updated: Order = { ...order, status: late ? 'Late' : 'Submitted', isLate: late, approvedBy: null, approvedAt: null };

  commit((d) => ({
    orders: d.orders.map((o) => (o.id === orderId ? updated : o)),
    orderItems: [...d.orderItems.filter((l) => l.orderId !== orderId), ...next],
    auditLogs: [
      auditRow(userId, 'Order changed by customer', 'orders', order.orderNo, order.customerId,
        `${existing.size} items`, `${next.length} items`, late ? 'Warning' : 'Success'),
      ...d.auditLogs,
    ],
  }));
  return updated;
}

export function approveOrder(orderId: string, userId: string, adjustments?: Record<string, number>) {
  const { commit } = useStore.getState();
  const now = nowISO();
  commit((d) => ({
    orders: d.orders.map((o) => (o.id === orderId ? { ...o, status: 'Approved', approvedBy: userId, approvedAt: now } : o)),
    orderItems: d.orderItems.map((l) =>
      l.orderId === orderId ? { ...l, qty: { ...l.qty, approved: adjustments?.[l.id] ?? l.qty.ordered } } : l,
    ),
    auditLogs: [auditRow(userId, 'Order approved', 'orders', d.orders.find((o) => o.id === orderId)?.orderNo ?? orderId, d.orders.find((o) => o.id === orderId)?.customerId ?? null, 'Submitted', 'Approved'), ...d.auditLogs],
  }));
}

export function rejectOrder(orderId: string, reason: string, userId: string) {
  const { db, commit } = useStore.getState();
  const order = db.orders.find((o) => o.id === orderId);
  commit((d) => ({
    orders: d.orders.map((o) => (o.id === orderId ? { ...o, status: 'Rejected', remarks: reason } : o)),
    auditLogs: [auditRow(userId, 'Order rejected', 'orders', order?.orderNo ?? orderId, order?.customerId ?? null, order?.status ?? '', `Rejected — ${reason}`, 'Warning'), ...d.auditLogs],
  }));
}

/** Locks every approved order for a delivery date and snapshots the purchase requirement. */
export function lockConsolidation(deliveryDate: string, userId: string) {
  const { db, commit } = useStore.getState();
  const now = nowISO();
  const orders = db.orders.filter((o) => o.deliveryDate === deliveryDate && o.status === 'Approved');
  const orderIds = new Set(orders.map((o) => o.id));

  const totals = new Map<string, { unit: Unit; qty: number }>();
  for (const line of db.orderItems) {
    if (!orderIds.has(line.orderId)) continue;
    const q = line.qty.approved ?? line.qty.ordered ?? 0;
    const cur = totals.get(line.itemId) ?? { unit: line.unit, qty: 0 };
    cur.qty += q;
    totals.set(line.itemId, cur);
  }

  const requirements: PurchaseRequirement[] = [...totals.entries()].map(([itemId, v]) => {
    const stock = db.items.find((i) => i.id === itemId)?.stock ?? 0;
    return { id: uid('pr'), deliveryDate, itemId, unit: v.unit, requiredQty: v.qty, stockQty: Math.min(stock, v.qty), generatedAt: now };
  });

  commit((d) => ({
    orders: d.orders.map((o) => (orderIds.has(o.id) ? { ...o, status: 'Locked', lockedAt: now } : o)),
    locks: [...d.locks, { id: uid('lk'), deliveryDate, lockedAt: now, lockedBy: userId, orderIds: [...orderIds] }],
    requirements: [...d.requirements.filter((r) => r.deliveryDate !== deliveryDate), ...requirements],
    auditLogs: [
      auditRow(userId, 'Purchase requirement generated', 'purchase', `PR ${deliveryDate}`, null, '', `${requirements.length} items`),
      auditRow(userId, 'Consolidation locked', 'consolidation', `Delivery ${deliveryDate}`, null, '', `${orders.length} orders`),
      ...d.auditLogs,
    ],
  }));
}
