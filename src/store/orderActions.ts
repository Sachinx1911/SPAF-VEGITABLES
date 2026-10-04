import type { Order, OrderAmendment, OrderItem, OrderSource, PurchaseRequirement, QtyChain, Unit } from '../types/models';
import { useStore } from './useStore';
import { uid, nextDocNo, docPrefix } from '../lib/id';
import { nowISO, todayISO } from '../lib/clock';
import { addDays } from '../lib/format';
import { isPastCutoff, summarizeAmendment } from '../domain/orders';
import { automationOf } from '../domain/ops';
import { autoAllocateItem } from './procurementActions';

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

/** Creates a new order, flagging it Late automatically if it arrives after the cutoff. */
export function createOrder(input: NewOrderInput, userId: string): Order {
  const { db, commit } = useStore.getState();
  const now = nowISO();
  const today = todayISO();
  const late = !input.draft && isPastCutoff(now, db.settings.orderCutoffTime) && input.deliveryDate <= addDays(today, 1);
  // Regular, on-time orders approve themselves; late and urgent ones still wait for a person.
  const auto = !input.draft && !late && (input.orderType ?? 'Regular') === 'Regular' && automationOf(db).autoApproveOrders;

  const order: Order = {
    id: uid('o'),
    orderNo: nextDocNo(db.orders.map((o) => o.orderNo), docPrefix('SO', today)),
    customerId: input.customerId,
    orderDate: today,
    deliveryDate: input.deliveryDate,
    orderType: input.orderType ?? 'Regular',
    source: input.source ?? 'Staff',
    status: input.draft ? 'Draft' : late ? 'Late' : auto ? 'Approved' : 'Submitted',
    isLate: late,
    receivedAt: now,
    approvedBy: null,
    approvedAt: auto ? now : null,
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
    id: uid('oi'), orderId: order.id, itemId: l.itemId, unit: l.unit, rate: l.rate,
    qty: { ...emptyChain(l.qty), approved: auto ? l.qty : null }, remarks: l.remarks ?? '',
  }));

  commit((d) => ({
    orders: [...d.orders, order],
    orderItems: [...d.orderItems, ...lines],
    auditLogs: [
      ...(auto ? [auditRow(userId, 'Order auto-approved', 'orders', order.orderNo, order.customerId, 'Submitted', 'Approved')] : []),
      auditRow(userId, input.draft ? 'Order draft saved' : late ? 'Late order flagged' : 'Order submitted', 'orders',
        order.orderNo, order.customerId, '', `${lines.length} items`, late ? 'Warning' : 'Success'),
      ...d.auditLogs,
    ],
  }));
  if (auto) joinLockIfDayLocked(order.id, userId);
  return order;
}

/**
 * Replaces an order's lines with what the customer now wants — how "add something to
 * today's order" lands. Approval is withdrawn on every change, so the ops team always
 * sees the final list before it reaches consolidation.
 */
export function amendOrder(orderId: string, lines: NewOrderLine[], userId: string, source: OrderSource = 'Customer Portal'): Order {
  const { db, commit } = useStore.getState();
  const order = db.orders.find((o) => o.id === orderId)!;
  const actor = db.users.find((u) => u.id === userId);
  const itemById = new Map(db.items.map((i) => [i.id, i]));
  const now = nowISO();
  const late = isPastCutoff(now, db.settings.orderCutoffTime) && order.deliveryDate <= addDays(todayISO(), 1);
  const auto = !late && order.orderType === 'Regular' && automationOf(db).autoApproveOrders;
  const existing = new Map(db.orderItems.filter((l) => l.orderId === orderId).map((l) => [l.itemId, l]));

  const next: OrderItem[] = lines.map((l) => {
    const prev = existing.get(l.itemId);
    return prev
      ? { ...prev, unit: l.unit, rate: l.rate, remarks: l.remarks ?? prev.remarks, qty: { ...prev.qty, ordered: l.qty, approved: auto ? l.qty : null } }
      : { id: uid('oi'), orderId, itemId: l.itemId, unit: l.unit, rate: l.rate, qty: { ...emptyChain(l.qty), approved: auto ? l.qty : null }, remarks: l.remarks ?? '' };
  });

  // Line-by-line record of what changed, so the team sees exactly what was added, removed or resized.
  const diffLines: OrderAmendment['lines'] = [];
  for (const l of lines) {
    const prev = existing.get(l.itemId);
    if (!prev) diffLines.push({ itemId: l.itemId, unit: l.unit, from: null, to: l.qty });
    else if ((prev.qty.ordered ?? 0) !== l.qty) diffLines.push({ itemId: l.itemId, unit: l.unit, from: prev.qty.ordered, to: l.qty });
  }
  const nextIds = new Set(lines.map((l) => l.itemId));
  for (const prev of existing.values()) if (!nextIds.has(prev.itemId)) diffLines.push({ itemId: prev.itemId, unit: prev.unit, from: prev.qty.ordered, to: null });

  const amendment: OrderAmendment | null = diffLines.length
    ? { id: uid('am'), at: now, by: userId, source, lines: diffLines }
    : null;
  const summary = amendment ? summarizeAmendment(amendment, itemById) : null;
  const byCustomer = actor?.role === 'customer';

  const updated: Order = {
    ...order, status: late ? 'Late' : auto ? 'Approved' : 'Submitted', isLate: late, approvedBy: null, approvedAt: auto ? now : null,
    amendments: amendment ? [...(order.amendments ?? []), amendment] : order.amendments,
  };

  commit((d) => ({
    orders: d.orders.map((o) => (o.id === orderId ? updated : o)),
    orderItems: [...d.orderItems.filter((l) => l.orderId !== orderId), ...next],
    auditLogs: amendment
      ? [
          auditRow(userId, byCustomer ? 'Order changed by customer' : 'Order changed', 'orders', order.orderNo, order.customerId,
            `${existing.size} items`, `${next.length} items · ${summary!.text}`, late || byCustomer ? 'Warning' : 'Success'),
          ...d.auditLogs,
        ]
      : d.auditLogs,
  }));
  if (auto) joinLockIfDayLocked(orderId, userId);
  return updated;
}

/** Staff have looked at the customer's changes — clears the "changed" flag and notification. */
export function markChangesReviewed(orderId: string, userId: string) {
  const { db, commit } = useStore.getState();
  const order = db.orders.find((o) => o.id === orderId);
  if (!order) return;
  commit((d) => ({
    orders: d.orders.map((o) => (o.id === orderId ? { ...o, changesReviewedAt: nowISO() } : o)),
    auditLogs: [auditRow(userId, 'Customer changes reviewed', 'orders', order.orderNo, order.customerId, '', `${(order.amendments ?? []).length} change(s)`), ...d.auditLogs],
  }));
}

/**
 * An order approved after its delivery day was locked would otherwise sit outside the purchase
 * requirement until someone re-locked by hand. Fold it in straight away so the extra quantity shows up to buy.
 */
function joinLockIfDayLocked(orderId: string, userId: string) {
  const { db } = useStore.getState();
  const order = db.orders.find((o) => o.id === orderId);
  if (!order || order.status !== 'Approved') return;
  if (db.locks.some((l) => l.deliveryDate === order.deliveryDate)) lockConsolidation(order.deliveryDate, userId);
}

export function approveOrder(orderId: string, userId: string, adjustments?: Record<string, number>) {
  const { commit } = useStore.getState();
  const now = nowISO();
  commit((d) => ({
    orders: d.orders.map((o) => (o.id === orderId ? { ...o, status: 'Approved', approvedBy: userId, approvedAt: now, changesReviewedAt: o.amendments?.length ? now : o.changesReviewedAt } : o)),
    orderItems: d.orderItems.map((l) =>
      l.orderId === orderId ? { ...l, qty: { ...l.qty, approved: adjustments?.[l.id] ?? l.qty.ordered } } : l,
    ),
    auditLogs: [auditRow(userId, 'Order approved', 'orders', d.orders.find((o) => o.id === orderId)?.orderNo ?? orderId, d.orders.find((o) => o.id === orderId)?.customerId ?? null, 'Submitted', 'Approved'), ...d.auditLogs],
  }));
  joinLockIfDayLocked(orderId, userId);
}

/** One click for the morning queue: approves every order that is still waiting (late ones included when asked). */
export function approvePendingOrders(userId: string, opts: { includeLate?: boolean; deliveryDate?: string } = {}): number {
  const { db } = useStore.getState();
  const list = db.orders.filter((o) =>
    (o.status === 'Submitted' || (opts.includeLate && o.status === 'Late')) && (!opts.deliveryDate || o.deliveryDate === opts.deliveryDate),
  );
  for (const o of list) approveOrder(o.id, userId);
  return list.length;
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
  // Re-locking (an order approved after the first lock) must keep what was already locked in the totals.
  // Everything ever locked for the day stays in the totals, whatever stage it has reached since (packed, delivered, invoiced).
  const orders = db.orders.filter((o) => o.deliveryDate === deliveryDate && o.status !== 'Rejected' && (o.status === 'Approved' || !!o.lockedAt));
  const orderIds = new Set(orders.map((o) => o.id));
  const newlyLocked = orders.filter((o) => o.status === 'Approved');
  const existingLock = db.locks.find((l) => l.deliveryDate === deliveryDate);

  const totals = new Map<string, { unit: Unit; qty: number }>();
  for (const line of db.orderItems) {
    if (!orderIds.has(line.orderId)) continue;
    const q = line.qty.approved ?? line.qty.ordered ?? 0;
    const cur = totals.get(line.itemId) ?? { unit: line.unit, qty: 0 };
    cur.qty += q;
    totals.set(line.itemId, cur);
  }

  const prevReq = new Map(db.requirements.filter((r) => r.deliveryDate === deliveryDate).map((r) => [r.itemId, r]));
  const requirements: PurchaseRequirement[] = [...totals.entries()].map(([itemId, v]) => {
    const prev = prevReq.get(itemId);
    const stock = db.items.find((i) => i.id === itemId)?.stock ?? 0;
    // Carry-over stock is snapshotted once; a re-lock only grows the required quantity.
    return { id: prev?.id ?? uid('pr'), deliveryDate, itemId, unit: v.unit, requiredQty: v.qty, stockQty: prev ? prev.stockQty : Math.min(stock, v.qty), generatedAt: prev?.generatedAt ?? now };
  });

  commit((d) => ({
    orders: d.orders.map((o) => (orderIds.has(o.id) && o.status === 'Approved' ? { ...o, status: 'Locked', lockedAt: now } : o)),
    locks: existingLock
      ? d.locks.map((l) => (l.id === existingLock.id ? { ...l, lockedAt: now, lockedBy: userId, orderIds: [...orderIds] } : l))
      : [...d.locks, { id: uid('lk'), deliveryDate, lockedAt: now, lockedBy: userId, orderIds: [...orderIds] }],
    requirements: [...d.requirements.filter((r) => r.deliveryDate !== deliveryDate), ...requirements],
    auditLogs: [
      auditRow(userId, existingLock ? 'Purchase requirement updated' : 'Purchase requirement generated', 'purchase', `PR ${deliveryDate}`, null, '', `${requirements.length} items`),
      auditRow(userId, existingLock ? 'Orders added to lock' : 'Consolidation locked', 'consolidation', `Delivery ${deliveryDate}`, null, '', `${newlyLocked.length} orders`),
      ...d.auditLogs,
    ],
  }));

  // Items already covered by carry-over stock never pass through receiving, so allocate them right away.
  if (automationOf(db).autoAllocateOnReceive) {
    for (const r of requirements) if (r.stockQty >= r.requiredQty) autoAllocateItem(deliveryDate, r.itemId, userId);
  }
}
