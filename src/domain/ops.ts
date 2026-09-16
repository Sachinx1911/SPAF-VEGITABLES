import type { Database, DailySnapshot, Order, Unit } from '../types/models';
import { addDays } from '../lib/format';
import { outstandingSummary } from './finance';

export type RequirementStatus = 'OK' | 'Purchase Required' | 'Critical';

export interface RequirementRow {
  itemId: string;
  unit: Unit;
  required: number;
  stock: number;
  purchased: number;
  toPurchase: number;
  accepted: number;
  available: number;
  shortage: number;
  excess: number;
  status: RequirementStatus;
}

const round3 = (n: number) => Math.round(n * 1000) / 1000;

/** Purchase requirement for a delivery date: snapshot at lock + everything purchased/accepted since. */
export function requirementRows(db: Database, deliveryDate: string): RequirementRow[] {
  const poIds = new Set(db.purchaseOrders.filter((p) => p.forDeliveryDate === deliveryDate).map((p) => p.id));
  const purchased = new Map<string, number>();
  const poLineIds = new Set<string>();
  for (const l of db.purchaseOrderItems) {
    if (!poIds.has(l.purchaseOrderId)) continue;
    purchased.set(l.itemId, (purchased.get(l.itemId) ?? 0) + l.qty);
    poLineIds.add(l.id);
  }
  const accepted = new Map<string, number>();
  const riToPoLine = new Map(db.receivingItems.map((ri) => [ri.id, ri.purchaseOrderItemId]));
  for (const qc of db.qualityChecks) {
    const poLine = riToPoLine.get(qc.receivingItemId);
    if (poLine && poLineIds.has(poLine)) accepted.set(qc.itemId, (accepted.get(qc.itemId) ?? 0) + qc.acceptedQty);
  }

  return db.requirements
    .filter((r) => r.deliveryDate === deliveryDate)
    .map((r) => {
      const p = purchased.get(r.itemId) ?? 0;
      const a = accepted.get(r.itemId) ?? 0;
      const toPurchase = Math.max(round3(r.requiredQty - r.stockQty - p), 0);
      const available = round3(r.stockQty + a);
      const status: RequirementStatus =
        toPurchase <= 0 ? 'OK' : toPurchase / (r.requiredQty || 1) > 0.3 ? 'Critical' : 'Purchase Required';
      return {
        itemId: r.itemId,
        unit: r.unit,
        required: r.requiredQty,
        stock: r.stockQty,
        purchased: p,
        toPurchase,
        accepted: a,
        available,
        shortage: Math.max(round3(r.requiredQty - available), 0),
        excess: Math.max(round3(available - r.requiredQty), 0),
        status,
      };
    });
}

export const isPendingApproval = (o: Order, today: string) =>
  (o.status === 'Submitted' || o.status === 'Late') && o.deliveryDate >= today;

export interface OrderBoard {
  Draft: Order[];
  Submitted: Order[];
  Approved: Order[];
  Late: Order[];
  Rejected: Order[];
  Locked: Order[];
}

/** Order board covers the live ordering window: today's delivery cycle and tomorrow's intake. */
export function orderBoard(db: Database, today: string): OrderBoard {
  const window = new Set([today, addDays(today, 1)]);
  const b: OrderBoard = { Draft: [], Submitted: [], Approved: [], Late: [], Rejected: [], Locked: [] };
  for (const o of db.orders) {
    if (!window.has(o.deliveryDate)) continue;
    if (o.status in b) b[o.status as keyof OrderBoard].push(o);
    else if (o.lockedAt && o.deliveryDate === today) b.Locked.push(o);
  }
  return b;
}

export interface DeliveryBoard {
  Packing: number;
  Packed: number;
  Dispatched: number;
  Delivered: number;
  Partial: number;
  Issue: number;
  total: number;
}

export function deliveryBoard(db: Database, date: string): DeliveryBoard {
  const b: DeliveryBoard = { Packing: 0, Packed: 0, Dispatched: 0, Delivered: 0, Partial: 0, Issue: 0, total: 0 };
  for (const o of db.orders) {
    if (o.deliveryDate !== date || !o.lockedAt) continue;
    b.total++;
    if (o.packingStatus === 'Issue' || o.deliveryStatus === 'Failed') b.Issue++;
    else if (o.deliveryStatus === 'Delivered') b.Delivered++;
    else if (o.deliveryStatus === 'Partial') b.Partial++;
    else if (o.deliveryStatus === 'Dispatched' || o.deliveryStatus === 'In Transit') b.Dispatched++;
    else if (o.packingStatus === 'Packed') b.Packed++;
    else b.Packing++;
  }
  return b;
}

/** Live KPI values in the same shape as the daily snapshot job, so deltas compare like with like. */
export function liveStats(db: Database, today: string): DailySnapshot {
  const reqs = requirementRows(db, today);
  const grnToday = new Set(db.receivings.filter((g) => g.receivedAt.startsWith(today)).map((g) => g.id));
  const lock = db.locks.find((l) => l.deliveryDate === today);
  return {
    date: today,
    ordersReceived: db.orders.filter((o) => o.orderDate === today && o.status !== 'Draft').length,
    pendingApproval: db.orders.filter((o) => isPendingApproval(o, today)).length,
    locked: lock ? lock.orderIds.length : 0,
    purchaseRequired: reqs.filter((r) => r.status !== 'OK').length,
    receivedLines: db.receivingItems.filter((ri) => grnToday.has(ri.receivingId)).length,
    packingPending: db.packings.filter((p) => p.deliveryDate === today && p.status !== 'Packed').length,
    dispatchPending: db.challans.filter((c) => c.challanDate === today && c.status === 'Ready').length,
    delivered: db.challans.filter((c) => c.challanDate === today && (c.status === 'Delivered' || c.status === 'Partial')).length,
    outstanding: Math.round(outstandingSummary(db, today).total),
    salesValue: db.invoices.filter((i) => i.invoiceDate === today).reduce((s, i) => s + i.total, 0),
  };
}

export type StepState = 'done' | 'active' | 'pending' | 'attention';

export interface TimelineStep {
  key: string;
  label: string;
  state: StepState;
  detail: string;
  progress: number; // 0–100
  at: string | null;
  link: string;
}

export function operationsTimeline(db: Database, today: string): TimelineStep[] {
  const todays = db.orders.filter((o) => o.deliveryDate === today);
  const lock = db.locks.find((l) => l.deliveryDate === today);
  const late = todays.filter((o) => o.status === 'Late').length;
  const reqs = requirementRows(db, today);
  const pos = db.purchaseOrders.filter((p) => p.forDeliveryDate === today);
  const poIds = new Set(pos.map((p) => p.id));
  const grns = db.receivings.filter((g) => poIds.has(g.purchaseOrderId));
  const packs = db.packings.filter((p) => p.deliveryDate === today);
  const packed = packs.filter((p) => p.status === 'Packed').length;
  const chal = db.challans.filter((c) => c.challanDate === today);
  const delivered = chal.filter((c) => c.status === 'Delivered' || c.status === 'Partial').length;
  const invoiced = db.invoices.filter((i) => i.invoiceDate === today).length;
  const needBuy = reqs.filter((r) => r.status !== 'OK').length;
  const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);
  const firstAt = (xs: string[]) => (xs.length ? xs.sort()[0]! : null);

  return [
    {
      key: 'orders', label: 'Orders', link: '/orders',
      state: late ? 'attention' : 'done', progress: 100,
      detail: `${todays.length - late} approved${late ? ` · ${late} late pending` : ''}`,
      at: firstAt(todays.map((o) => o.receivedAt)),
    },
    {
      key: 'consolidation', label: 'Consolidation', link: '/consolidation',
      state: lock ? 'done' : 'active', progress: lock ? 100 : 40,
      detail: lock ? `Locked · ${lock.orderIds.length} orders` : 'Open for changes', at: lock?.lockedAt ?? null,
    },
    {
      key: 'purchase', label: 'Purchase', link: '/purchase',
      state: needBuy ? 'attention' : pos.length ? 'done' : 'pending', progress: pct(reqs.length - needBuy, reqs.length),
      detail: `${pos.length} POs · ${needBuy ? `${needBuy} items still to buy` : 'all items bought'}`,
      at: firstAt(pos.map((p) => p.createdAt)),
    },
    {
      key: 'receiving', label: 'Receiving', link: '/receiving',
      state: grns.length === pos.length && pos.length ? 'done' : grns.length ? 'active' : 'pending', progress: pct(grns.length, pos.length),
      detail: `${grns.length}/${pos.length} GRNs · ${grns.filter((g) => g.status === 'Partial').length} partial`,
      at: firstAt(grns.map((g) => g.receivedAt)),
    },
    {
      key: 'packing', label: 'Packing', link: '/packing',
      state: packs.length && packed === packs.length ? 'done' : packs.some((p) => p.status === 'Issue') ? 'attention' : packed ? 'active' : 'pending',
      progress: pct(packed, packs.length), detail: `${packed}/${packs.length} orders packed`,
      at: firstAt(packs.map((p) => p.startedAt).filter((x): x is string => !!x)),
    },
    {
      key: 'delivery', label: 'Delivery', link: '/delivery',
      state: packs.length && delivered === packs.length ? 'done' : delivered ? 'active' : 'pending',
      progress: pct(delivered, packs.length), detail: `${delivered}/${packs.length} delivered`,
      at: firstAt(chal.map((c) => c.dispatchedAt).filter((x): x is string => !!x)),
    },
    {
      key: 'invoicing', label: 'Invoicing', link: '/invoices',
      state: delivered && invoiced >= delivered ? 'done' : invoiced ? 'active' : 'pending',
      progress: pct(invoiced, delivered), detail: `${invoiced}/${delivered} invoiced`,
      at: firstAt(db.invoices.filter((i) => i.invoiceDate === today).map((i) => i.createdAt)),
    },
  ];
}
