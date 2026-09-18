import type {
  Allocation, PurchaseOrder, PurchaseOrderItem, QcGrade, QcReason, QualityCheck, Receiving, ReceivingItem, Unit,
} from '../types/models';
import { useStore } from './useStore';
import { uid } from '../lib/id';
import { nowISO } from '../lib/clock';
import { API_MODE } from '../lib/api';
import { createPurchaseOrderApi } from './procurementApi';

function auditRow(userId: string, action: string, module: string, recordRef: string, oldValue: string, newValue: string, status: 'Success' | 'Warning' = 'Success') {
  return { id: uid('a'), at: nowISO(), userId, action, module: module as any, recordRef, customerId: null, oldValue, newValue, device: 'Chrome · Windows', status };
}

let poSeq = 100;
let grnSeq = 100;

export interface NewPurchaseLine {
  itemId: string;
  unit: Unit;
  qty: number;
  rate: number;
  remarks?: string;
}

export interface PurchaseResult {
  poNo: string;
}

export async function createPurchaseOrder(
  input: { supplierId: string; purchaseDate: string; forDeliveryDate: string; supplierInvoiceNo: string; lines: NewPurchaseLine[] },
  userId: string,
): Promise<PurchaseResult> {
  if (API_MODE) {
    // The server records the purchase against its own PO number and looks up
    // nothing from the browser but the item, quantity and rate the buyer typed.
    const res = await createPurchaseOrderApi({
      supplierId: input.supplierId,
      purchaseDate: input.purchaseDate,
      forDeliveryDate: input.forDeliveryDate,
      supplierInvoiceNo: input.supplierInvoiceNo,
      lines: input.lines.map((l) => ({ itemId: l.itemId, qty: l.qty, rate: l.rate })),
    });
    return { poNo: res.poNo };
  }

  return createPurchaseOrderLocal(input, userId);
}

function createPurchaseOrderLocal(
  input: { supplierId: string; purchaseDate: string; forDeliveryDate: string; supplierInvoiceNo: string; lines: NewPurchaseLine[] },
  userId: string,
): PurchaseResult {
  const { commit } = useStore.getState();
  const po: PurchaseOrder = {
    id: uid('po'), poNo: `PO-2609-${String(++poSeq).padStart(4, '0')}`, supplierId: input.supplierId, purchaseDate: input.purchaseDate,
    forDeliveryDate: input.forDeliveryDate, supplierInvoiceNo: input.supplierInvoiceNo, status: 'Confirmed', taxAmount: 0,
    createdBy: userId, createdAt: nowISO(),
  };
  const lines: PurchaseOrderItem[] = input.lines.map((l) => ({ id: uid('poi'), purchaseOrderId: po.id, itemId: l.itemId, unit: l.unit, qty: l.qty, rate: l.rate, remarks: l.remarks ?? '' }));
  commit((d) => ({
    purchaseOrders: [...d.purchaseOrders, po],
    purchaseOrderItems: [...d.purchaseOrderItems, ...lines],
    auditLogs: [auditRow(userId, 'Purchase confirmed', 'purchase', po.poNo, '', `${lines.length} items`), ...d.auditLogs],
  }));
  return { poNo: po.poNo };
}

export interface ReceiveLine {
  purchaseOrderItemId: string;
  itemId: string;
  unit: Unit;
  orderedQty: number;
  receivedQty: number;
  condition: ReceivingItem['condition'];
}

export function receiveStock(purchaseOrderId: string, lines: ReceiveLine[], userId: string): Receiving {
  const { db, commit } = useStore.getState();
  const po = db.purchaseOrders.find((p) => p.id === purchaseOrderId)!;
  const status: Receiving['status'] = lines.every((l) => l.receivedQty <= 0) ? 'Rejected' : lines.some((l) => l.receivedQty < l.orderedQty) ? 'Partial' : 'Received';
  const grn: Receiving = { id: uid('grn'), grnNo: `GRN-2609-${String(++grnSeq).padStart(4, '0')}`, purchaseOrderId, receivedAt: nowISO(), receivedBy: userId, status };
  const items: ReceivingItem[] = lines.map((l) => ({ id: uid('ri'), receivingId: grn.id, ...l }));

  const poStatus: PurchaseOrder['status'] = status === 'Received' ? 'Received' : status === 'Partial' ? 'Partially Received' : po.status;

  commit((d) => ({
    receivings: [...d.receivings, grn],
    receivingItems: [...d.receivingItems, ...items],
    purchaseOrders: d.purchaseOrders.map((p) => (p.id === purchaseOrderId ? { ...p, status: poStatus } : p)),
    auditLogs: [auditRow(userId, status === 'Partial' ? 'Stock received (partial)' : 'Stock received', 'receiving', grn.grnNo, '', po.poNo, status === 'Partial' ? 'Warning' : 'Success'), ...d.auditLogs],
  }));
  return grn;
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

  const orders = db.orders.filter((o) => o.deliveryDate === deliveryDate && (o.status === 'Locked' || o.status === 'Approved'));
  const custRouteOrder = new Map(db.customers.map((c) => [c.id, c.routeOrder]));
  const lines = db.orderItems
    .filter((l) => l.itemId === itemId && orders.some((o) => o.id === l.orderId) && l.qty.approved != null)
    .map((l) => ({ line: l, order: orders.find((o) => o.id === l.orderId)! }))
    .sort((a, b) => (custRouteOrder.get(a.order.customerId) ?? 0) - (custRouteOrder.get(b.order.customerId) ?? 0));

  const totalRequired = lines.reduce((s, x) => s + (x.line.qty.approved ?? 0), 0);
  const ratio = totalRequired > 0 ? Math.min(1, available / totalRequired) : 1;
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
  let spare = Math.round((available - allocatedSum) / step) * step;
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
      ...d.allocations.filter((a) => !(a.deliveryDate === deliveryDate && a.itemId === itemId)),
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
