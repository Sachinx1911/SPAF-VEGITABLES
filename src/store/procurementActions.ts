import type {
  Allocation, PurchaseOrder, PurchaseOrderItem, QcGrade, QcReason, QualityCheck, Receiving, ReceivingItem, Unit,
} from '../types/models';
import { useStore } from './useStore';
import { uid, nextDocNo, docPrefix } from '../lib/id';
import { nowISO, todayISO } from '../lib/clock';
import { automationOf, requirementRows } from '../domain/ops';

function auditRow(userId: string, action: string, module: string, recordRef: string, oldValue: string, newValue: string, status: 'Success' | 'Warning' = 'Success') {
  return { id: uid('a'), at: nowISO(), userId, action, module: module as any, recordRef, customerId: null, oldValue, newValue, device: 'Chrome · Windows', status };
}

export interface NewPurchaseLine {
  itemId: string;
  unit: Unit;
  qty: number;
  rate: number;
  remarks?: string;
}

export function createPurchaseOrder(
  input: { supplierId: string; purchaseDate: string; forDeliveryDate: string; supplierInvoiceNo: string; lines: NewPurchaseLine[] },
  userId: string,
): PurchaseOrder {
  const { db, commit } = useStore.getState();
  const po: PurchaseOrder = {
    id: uid('po'), poNo: nextDocNo(db.purchaseOrders.map((p) => p.poNo), docPrefix('PO', input.purchaseDate)), supplierId: input.supplierId, purchaseDate: input.purchaseDate,
    forDeliveryDate: input.forDeliveryDate, supplierInvoiceNo: input.supplierInvoiceNo, status: 'Confirmed', taxAmount: 0,
    createdBy: userId, createdAt: nowISO(),
  };
  const lines: PurchaseOrderItem[] = input.lines.map((l) => ({ id: uid('poi'), purchaseOrderId: po.id, itemId: l.itemId, unit: l.unit, qty: l.qty, rate: l.rate, remarks: l.remarks ?? '' }));
  commit((d) => ({
    purchaseOrders: [...d.purchaseOrders, po],
    purchaseOrderItems: [...d.purchaseOrderItems, ...lines],
    auditLogs: [auditRow(userId, 'Purchase confirmed', 'purchase', po.poNo, '', `${lines.length} items`), ...d.auditLogs],
  }));
  return po;
}

/**
 * Turns the outstanding requirement for a delivery date into purchase orders in one go —
 * one PO per supplier, each item going to the first supplier that deals in its category.
 */
export function createPurchaseOrdersFromRequirement(deliveryDate: string, userId: string): PurchaseOrder[] {
  const { db } = useStore.getState();
  const plan = planPurchaseOrders(deliveryDate);
  if (!plan.length) return [];
  const today = todayISO();
  return plan.map((group) =>
    createPurchaseOrder(
      {
        supplierId: group.supplierId, purchaseDate: today, forDeliveryDate: deliveryDate, supplierInvoiceNo: '',
        lines: group.lines.map((l) => ({ itemId: l.itemId, unit: l.unit, qty: l.qty, rate: db.items.find((i) => i.id === l.itemId)?.defaultPurchasePrice ?? 0 })),
      },
      userId,
    ),
  );
}

export interface PurchasePlanGroup { supplierId: string; supplierName: string; lines: { itemId: string; unit: Unit; qty: number }[] }

/** Preview of what createPurchaseOrdersFromRequirement would raise, for the confirmation dialog. */
export function planPurchaseOrders(deliveryDate: string): PurchasePlanGroup[] {
  const { db } = useStore.getState();
  const groups = new Map<string, PurchasePlanGroup>();
  const fallback = db.suppliers[0];
  for (const r of requirementRows(db, deliveryDate)) {
    if (r.toPurchase <= 0) continue;
    const item = db.items.find((i) => i.id === r.itemId);
    const supplier = db.suppliers.find((s) => item && s.categories.includes(item.category)) ?? fallback;
    if (!supplier) continue;
    const g = groups.get(supplier.id) ?? { supplierId: supplier.id, supplierName: supplier.name, lines: [] };
    g.lines.push({ itemId: r.itemId, unit: r.unit, qty: r.toPurchase });
    groups.set(supplier.id, g);
  }
  return [...groups.values()];
}

export interface ReceiveLine {
  purchaseOrderItemId: string;
  itemId: string;
  unit: Unit;
  orderedQty: number;
  receivedQty: number;
  condition: ReceivingItem['condition'];
}

export interface ReceiveResult {
  grn: Receiving;
  /** Lines accepted automatically at Grade A (good condition) — the rest wait in Quality Check. */
  autoAccepted: number;
  /** Items whose stock was also split across customer orders straight away. */
  autoAllocated: number;
}

export function receiveStock(purchaseOrderId: string, lines: ReceiveLine[], userId: string): ReceiveResult {
  const { db, commit } = useStore.getState();
  const automation = automationOf(db);
  const po = db.purchaseOrders.find((p) => p.id === purchaseOrderId)!;
  const status: Receiving['status'] = lines.every((l) => l.receivedQty <= 0) ? 'Rejected' : lines.some((l) => l.receivedQty < l.orderedQty) ? 'Partial' : 'Received';
  const grn: Receiving = { id: uid('grn'), grnNo: nextDocNo(db.receivings.map((g) => g.grnNo), docPrefix('GRN', todayISO())), purchaseOrderId, receivedAt: nowISO(), receivedBy: userId, status };
  const items: ReceivingItem[] = lines.map((l) => ({ id: uid('ri'), receivingId: grn.id, ...l }));

  const poStatus: PurchaseOrder['status'] = status === 'Received' ? 'Received' : status === 'Partial' ? 'Partially Received' : po.status;

  commit((d) => ({
    receivings: [...d.receivings, grn],
    receivingItems: [...d.receivingItems, ...items],
    purchaseOrders: d.purchaseOrders.map((p) => (p.id === purchaseOrderId ? { ...p, status: poStatus } : p)),
    auditLogs: [auditRow(userId, status === 'Partial' ? 'Stock received (partial)' : 'Stock received', 'receiving', grn.grnNo, '', po.poNo, status === 'Partial' ? 'Warning' : 'Success'), ...d.auditLogs],
  }));

  // Good stock goes straight through quality check and, if the day is locked, straight into allocation.
  let autoAccepted = 0;
  const touched = new Set<string>();
  if (automation.autoAcceptGoodStock) {
    for (const ri of items) {
      if (ri.condition !== 'Good' || ri.receivedQty <= 0) continue;
      recordQualityCheck({ receivingItemId: ri.id, itemId: ri.itemId, unit: ri.unit, acceptedQty: ri.receivedQty, rejectedQty: 0, grade: 'A', reason: null, remarks: 'Accepted on receipt (good condition)' }, userId);
      autoAccepted++;
      touched.add(ri.itemId);
    }
  }
  let autoAllocated = 0;
  if (automation.autoAllocateOnReceive && touched.size && useStore.getState().db.locks.some((l) => l.deliveryDate === po.forDeliveryDate)) {
    for (const itemId of touched) { autoAllocateItem(po.forDeliveryDate, itemId, userId); autoAllocated++; }
  }
  return { grn, autoAccepted, autoAllocated };
}

/** The common morning: everything arrived as ordered, in good condition. Receives every waiting PO in one go. */
export function receiveAllPending(userId: string): { pos: number; autoAccepted: number; autoAllocated: number } {
  const { db } = useStore.getState();
  const waiting = db.purchaseOrders.filter((p) => p.status === 'Confirmed' || p.status === 'Draft');
  let autoAccepted = 0;
  let autoAllocated = 0;
  for (const po of waiting) {
    const lines = useStore.getState().db.purchaseOrderItems.filter((l) => l.purchaseOrderId === po.id);
    const res = receiveStock(po.id, lines.map((l) => ({ purchaseOrderItemId: l.id, itemId: l.itemId, unit: l.unit, orderedQty: l.qty, receivedQty: l.qty, condition: 'Good' as const })), userId);
    autoAccepted += res.autoAccepted;
    autoAllocated += res.autoAllocated;
  }
  return { pos: waiting.length, autoAccepted, autoAllocated };
}

export interface QcInput {
  receivingItemId: string;
  itemId: string;
  unit: Unit;
  acceptedQty: number;
  rejectedQty: number;
  grade: QcGrade;
  reason: QcReason | null;
  remarks: string;
}

/** Recording a QC result also credits the item's stock with the accepted quantity. */
export function recordQualityCheck(input: QcInput, userId: string) {
  const { db, commit } = useStore.getState();
  const now = nowISO();
  const qc: QualityCheck = { id: uid('qc'), checkedBy: userId, checkedAt: now, ...input };
  const item = db.items.find((i) => i.id === input.itemId);
  commit((d) => ({
    qualityChecks: [...d.qualityChecks, qc],
    items: d.items.map((i) => (i.id === input.itemId ? { ...i, stock: Math.round((i.stock + input.acceptedQty) * 1000) / 1000 } : i)),
    auditLogs: [
      auditRow(userId, 'Quality check recorded', 'receiving', item?.name ?? input.itemId, '', `Grade ${input.grade} · accepted ${input.acceptedQty} ${input.unit}`, input.rejectedQty > 0 ? 'Warning' : 'Success'),
      ...d.auditLogs,
    ],
  }));
}

/**
 * Proportionally allocates available stock (existing stock + everything accepted through QC for
 * purchase orders raised for this delivery date) across every approved/locked order line for an
 * item, in customer route order — the same rule the legacy sheets used for a shortage.
 */
export function autoAllocateItem(deliveryDate: string, itemId: string, userId: string, override = false) {
  const { db, commit } = useStore.getState();
  const now = nowISO();
  const item = db.items.find((i) => i.id === itemId)!;

  const poIds = new Set(db.purchaseOrders.filter((p) => p.forDeliveryDate === deliveryDate).map((p) => p.id));
  const poLineIds = new Set(db.purchaseOrderItems.filter((l) => poIds.has(l.purchaseOrderId) && l.itemId === itemId).map((l) => l.id));
  const riToPoLine = new Map(db.receivingItems.map((ri) => [ri.id, ri.purchaseOrderItemId]));
  const accepted = db.qualityChecks
    .filter((qc) => qc.itemId === itemId && poLineIds.has(riToPoLine.get(qc.receivingItemId) ?? ''))
    .reduce((s, qc) => s + qc.acceptedQty, 0);
  const requirement = db.requirements.find((r) => r.deliveryDate === deliveryDate && r.itemId === itemId);
  const available = Math.round(((requirement?.stockQty ?? 0) + accepted) * 1000) / 1000;

  const orders = db.orders.filter((o) => o.deliveryDate === deliveryDate && (o.status === 'Locked' || o.status === 'Approved' || o.status === 'Completed' || o.status === 'Partially Fulfilled'));
  const custRouteOrder = new Map(db.customers.map((c) => [c.id, c.routeOrder]));
  const allLines = db.orderItems.filter((l) => l.itemId === itemId && orders.some((o) => o.id === l.orderId) && l.qty.approved != null);
  // Lines already packed keep what they got; only what is left of the stock is split across the rest.
  const packedQty = allLines.filter((l) => l.qty.packed != null).reduce((s, l) => s + (l.qty.allocated ?? 0), 0);
  const remaining = Math.max(0, Math.round((available - packedQty) * 1000) / 1000);
  const lines = allLines
    .filter((l) => l.qty.packed == null)
    .map((l) => ({ line: l, order: orders.find((o) => o.id === l.orderId)! }))
    .sort((a, b) => (custRouteOrder.get(a.order.customerId) ?? 0) - (custRouteOrder.get(b.order.customerId) ?? 0));

  const totalRequired = lines.reduce((s, x) => s + (x.line.qty.approved ?? 0), 0);
  const ratio = totalRequired > 0 ? Math.min(1, remaining / totalRequired) : 1;
  const step = item.unit === 'Kg' ? 0.5 : 1;
  const round = (v: number) => Math.round(v / step) * step;

  let allocatedSum = 0;
  const allocations: { orderItemId: string; orderId: string; customerId: string; allocatedQty: number; required: number }[] = [];
  for (const { line, order } of lines) {
    const required = line.qty.approved ?? 0;
    const alloc = override ? required : Math.max(0, Math.min(required, round(required * ratio)));
    allocations.push({ orderItemId: line.id, orderId: order.id, customerId: order.customerId, allocatedQty: alloc, required });
    allocatedSum += alloc;
  }
  // Distribute any leftover from rounding to the front of the queue (route order) without exceeding requirement.
  let spare = Math.round((remaining - allocatedSum) / step) * step;
  for (const a of allocations) {
    if (spare < step) break;
    if (a.allocatedQty < a.required) { a.allocatedQty = round(a.allocatedQty + step); spare = round(spare - step); }
  }

  commit((d) => ({
    orderItems: d.orderItems.map((l) => {
      const a = allocations.find((x) => x.orderItemId === l.id);
      return a ? { ...l, qty: { ...l.qty, allocated: a.allocatedQty } } : l;
    }),
    allocations: [
      ...d.allocations.filter((a) => !(a.deliveryDate === deliveryDate && a.itemId === itemId && allocations.some((x) => x.orderItemId === a.orderItemId))),
      ...allocations.map((a): Allocation => ({
        id: uid('al'), orderItemId: a.orderItemId, orderId: a.orderId, customerId: a.customerId, itemId, unit: item.unit,
        deliveryDate, requiredQty: a.required, allocatedQty: a.allocatedQty, override, allocatedBy: userId, allocatedAt: now,
      })),
    ],
    auditLogs: [auditRow(userId, 'Stock allocated', 'allocation', `${item.name} · ${deliveryDate}`, '', `${allocations.length} lines · available ${available} ${item.unit}`), ...d.auditLogs],
  }));
}

/** A quick, standalone audit-log note for actions that don't otherwise change any table (e.g. "Inform customer"). */
export function logNote(action: string, module: string, recordRef: string, note: string, userId: string) {
  const { commit } = useStore.getState();
  commit((d) => ({ auditLogs: [auditRow(userId, action, module, recordRef, '', note, 'Warning'), ...d.auditLogs] }));
}

export function setManualAllocation(orderItemId: string, allocatedQty: number, userId: string) {
  const { db, commit } = useStore.getState();
  const line = db.orderItems.find((l) => l.id === orderItemId);
  if (!line) return;
  commit((d) => ({
    orderItems: d.orderItems.map((l) => (l.id === orderItemId ? { ...l, qty: { ...l.qty, allocated: allocatedQty } } : l)),
    allocations: d.allocations.map((a) => (a.orderItemId === orderItemId ? { ...a, allocatedQty, override: true, allocatedBy: userId, allocatedAt: nowISO() } : a)),
    auditLogs: [auditRow(userId, 'Allocation adjusted', 'allocation', line.id, String(line.qty.allocated ?? ''), String(allocatedQty), 'Warning'), ...d.auditLogs],
  }));
}
