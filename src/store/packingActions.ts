import type { Challan, PackageType, Packing, PackingItem, Unit } from '../types/models';
import { useStore } from './useStore';
import { uid, nextDocNo, docPrefix } from '../lib/id';
import { nowISO } from '../lib/clock';
import { packingBoard } from '../domain/packing';
import { automationOf } from '../domain/ops';
import { generateInvoice } from './financeActions';

function auditRow(userId: string, action: string, module: string, recordRef: string, customerId: string | null, oldValue: string, newValue: string, status: 'Success' | 'Warning' = 'Success') {
  return { id: uid('a'), at: nowISO(), userId, action, module: module as any, recordRef, customerId, oldValue, newValue, device: 'Chrome · Windows', status };
}

const packageTypeFor = (unit: Unit, qty: number): PackageType => (unit === 'Box' ? 'Box' : unit === 'Kg' && qty >= 10 ? 'Crate' : 'Bag');

/** The packing list is created the first time anyone opens an order to pack it — never re-typed from allocation. */
export function getOrCreatePacking(orderId: string, userId: string): Packing {
  const { db, commit } = useStore.getState();
  const existing = db.packings.find((p) => p.orderId === orderId);
  if (existing) return existing;

  const order = db.orders.find((o) => o.id === orderId)!;
  const lines = db.orderItems.filter((l) => l.orderId === orderId && l.qty.allocated != null);
  const allocations = db.allocations.filter((a) => a.orderId === orderId);

  const packing: Packing = {
    id: uid('pk'), packingNo: nextDocNo(db.packings.map((p) => p.packingNo), docPrefix('PK', order.deliveryDate)), orderId, customerId: order.customerId, deliveryDate: order.deliveryDate,
    status: 'To Pack', packages: 0, packedBy: null, startedAt: null, packedAt: null, verified: false, issue: '',
  };
  const items: PackingItem[] = lines.map((l) => ({
    id: uid('pki'), packingId: packing.id, allocationId: allocations.find((a) => a.orderItemId === l.id)?.id ?? '',
    orderItemId: l.id, itemId: l.itemId, unit: l.unit, allocatedQty: l.qty.allocated!, packedQty: null, packageType: packageTypeFor(l.unit, l.qty.allocated!),
  }));

  commit((d) => ({
    packings: [...d.packings, packing],
    packingItems: [...d.packingItems, ...items],
    orders: d.orders.map((o) => (o.id === orderId ? { ...o, packingStatus: 'To Pack' } : o)),
  }));
  return packing;
}

/** Packs every open order for a delivery date exactly as allocated and generates all challans. */
export function packAllOrders(date: string, userId: string, routeId?: string): number {
  const rows = packingBoard(useStore.getState().db, date).filter((r) => r.status !== 'Packed' && (!routeId || r.route?.id === routeId));
  for (const r of rows) {
    const packing = getOrCreatePacking(r.order.id, userId);
    packAllAsAllocated(packing.id, userId);
    markPacked(packing.id, userId);
  }
  return rows.length;
}

/** Marks one order packed as allocated — the quick action on the packing board. */
export function packOrderAsAllocated(orderId: string, userId: string): Challan {
  const packing = getOrCreatePacking(orderId, userId);
  packAllAsAllocated(packing.id, userId);
  return markPacked(packing.id, userId);
}

/** Dispatches every challan that is Ready for a date (optionally one route). */
export function dispatchAllReady(date: string, userId: string, routeId?: string): number {
  const { db } = useStore.getState();
  const list = db.challans.filter((c) => c.challanDate === date && c.status === 'Ready' && (!routeId || c.routeId === routeId));
  for (const c of list) dispatchChallan(c.id, userId);
  return list.length;
}

export function setPackedQty(packingItemId: string, packedQty: number | null, userId: string) {
  const { db, commit } = useStore.getState();
  const item = db.packingItems.find((i) => i.id === packingItemId);
  if (!item) return;
  commit((d) => ({
    packingItems: d.packingItems.map((i) => (i.id === packingItemId ? { ...i, packedQty } : i)),
    packings: d.packings.map((p) => (p.id === item.packingId && p.status === 'To Pack' ? { ...p, status: 'Packing', startedAt: p.startedAt ?? nowISO(), packedBy: userId } : p)),
    orders: d.orders.map((o) => (o.id === d.packings.find((p) => p.id === item.packingId)?.orderId ? { ...o, packingStatus: 'Packing' } : o)),
  }));
}

/** Packer's fast path for a clean order: every line still blank is packed exactly as allocated. */
export function packAllAsAllocated(packingId: string, userId: string) {
  const { commit } = useStore.getState();
  commit((d) => {
    const packing = d.packings.find((p) => p.id === packingId);
    return {
      packingItems: d.packingItems.map((i) => (i.packingId === packingId && i.packedQty == null ? { ...i, packedQty: i.allocatedQty } : i)),
      packings: d.packings.map((p) => (p.id === packingId && p.status === 'To Pack' ? { ...p, status: 'Packing', startedAt: p.startedAt ?? nowISO(), packedBy: userId } : p)),
      orders: d.orders.map((o) => (o.id === packing?.orderId && o.packingStatus === 'To Pack' ? { ...o, packingStatus: 'Packing' } : o)),
    };
  });
}

export function setPackageType(packingItemId: string, packageType: PackageType) {
  const { commit } = useStore.getState();
  commit((d) => ({ packingItems: d.packingItems.map((i) => (i.id === packingItemId ? { ...i, packageType } : i)) }));
}

export function raisePackingIssue(packingId: string, issue: string, userId: string) {
  const { db, commit } = useStore.getState();
  const packing = db.packings.find((p) => p.id === packingId);
  commit((d) => ({
    packings: d.packings.map((p) => (p.id === packingId ? { ...p, status: 'Issue', issue } : p)),
    orders: d.orders.map((o) => (o.id === packing?.orderId ? { ...o, packingStatus: 'Issue' } : o)),
    auditLogs: [auditRow(userId, 'Packing issue raised', 'packing', packing?.packingNo ?? packingId, packing?.customerId ?? null, '', issue, 'Warning'), ...d.auditLogs],
  }));
}

/** Marking a packing verified also generates the delivery challan — quantities are pulled from packing, never re-typed. */
export function markPacked(packingId: string, userId: string): Challan {
  const { db, commit } = useStore.getState();
  const now = nowISO();
  const packing = db.packings.find((p) => p.id === packingId)!;
  const order = db.orders.find((o) => o.id === packing.orderId)!;
  const customer = db.customers.find((c) => c.id === packing.customerId)!;
  const items = db.packingItems.filter((i) => i.packingId === packingId);
  const finalItems = items.map((i) => ({ ...i, packedQty: i.packedQty ?? i.allocatedQty }));
  const packages = Math.max(1, Math.ceil(finalItems.reduce((s, i) => s + (i.packageType === 'Crate' ? 1 : 0.34), 0)));

  const challan: Challan = {
    id: uid('dc'), challanNo: nextDocNo(db.challans.map((c) => c.challanNo), docPrefix('DC', order.deliveryDate)), packingId, orderId: order.id, customerId: customer.id,
    routeId: customer.routeId, challanDate: order.deliveryDate, driverId: db.routes.find((r) => r.id === customer.routeId)?.driverId ?? null,
    vehicleNo: db.routes.find((r) => r.id === customer.routeId)?.vehicleNo ?? '', status: 'Ready', packages,
    lines: finalItems.map((i) => ({ orderItemId: i.orderItemId, itemId: i.itemId, unit: i.unit, qty: i.packedQty! })),
    preparedBy: userId, packedBy: userId, dispatchedAt: null, deliveredAt: null, receivedByName: '', signature: null, photo: null, deliveryRemarks: '',
  };

  commit((d) => ({
    packingItems: d.packingItems.map((i) => (i.packingId === packingId ? { ...i, packedQty: i.packedQty ?? i.allocatedQty } : i)),
    packings: d.packings.map((p) => (p.id === packingId ? { ...p, status: 'Packed', packedAt: now, verified: true, packages } : p)),
    orderItems: d.orderItems.map((l) => {
      const line = finalItems.find((i) => i.orderItemId === l.id);
      return line ? { ...l, qty: { ...l.qty, packed: line.packedQty } } : l;
    }),
    orders: d.orders.map((o) => (o.id === order.id ? { ...o, packingStatus: 'Packed', deliveryStatus: 'Ready' } : o)),
    challans: [...d.challans, challan],
    auditLogs: [
      auditRow(userId, 'Challan generated', 'delivery', challan.challanNo, customer.id, '', `${finalItems.length} items`),
      auditRow(userId, 'Marked packed', 'packing', packing.packingNo, customer.id, 'Packing', 'Packed'),
      ...d.auditLogs,
    ],
  }));
  return challan;
}

export function startTransit(challanId: string, userId: string) {
  const { db, commit } = useStore.getState();
  const challan = db.challans.find((c) => c.id === challanId)!;
  commit((d) => ({
    challans: d.challans.map((c) => (c.id === challanId ? { ...c, status: 'In Transit' } : c)),
    orders: d.orders.map((o) => (o.id === challan.orderId ? { ...o, deliveryStatus: 'In Transit' } : o)),
  }));
}

export function dispatchChallan(challanId: string, userId: string) {
  const { db, commit } = useStore.getState();
  const now = nowISO();
  const challan = db.challans.find((c) => c.id === challanId)!;
  commit((d) => ({
    challans: d.challans.map((c) => (c.id === challanId ? { ...c, status: 'Dispatched', dispatchedAt: now } : c)),
    orderItems: d.orderItems.map((l) => (challan.lines.some((x) => x.orderItemId === l.id) ? { ...l, qty: { ...l.qty, dispatched: challan.lines.find((x) => x.orderItemId === l.id)!.qty } } : l)),
    orders: d.orders.map((o) => (o.id === challan.orderId ? { ...o, deliveryStatus: 'Dispatched' } : o)),
    auditLogs: [auditRow(userId, 'Dispatched', 'delivery', challan.challanNo, challan.customerId, 'Ready', 'Dispatched'), ...d.auditLogs],
  }));
}

export interface DeliveryLineResult {
  orderItemId: string;
  deliveredQty: number;
  reason?: string;
}

export function confirmDelivery(
  challanId: string,
  input: { mode: 'Full' | 'Partial' | 'Refused' | 'Failed'; lines?: DeliveryLineResult[]; receivedByName: string; signature: string | null; photo: string | null; remarks: string },
  userId: string,
) {
  const { db, commit } = useStore.getState();
  const now = nowISO();
  const challan = db.challans.find((c) => c.id === challanId)!;
  const order = db.orders.find((o) => o.id === challan.orderId)!;

  if (input.mode === 'Failed') {
    commit((d) => ({
      challans: d.challans.map((c) => (c.id === challanId ? { ...c, status: 'Failed', deliveryRemarks: input.remarks } : c)),
      orders: d.orders.map((o) => (o.id === order.id ? { ...o, deliveryStatus: 'Failed' } : o)),
      auditLogs: [auditRow(userId, 'Delivery failed', 'delivery', challan.challanNo, challan.customerId, 'In Transit', 'Failed', 'Warning'), ...d.auditLogs],
    }));
    return;
  }

  const defaultLines: DeliveryLineResult[] = challan.lines.map((l) => ({ orderItemId: l.orderItemId, deliveredQty: input.mode === 'Refused' ? 0 : l.qty }));
  const deliveredMap = new Map((input.lines ?? defaultLines).map((l) => [l.orderItemId, l]));
  const isPartial = input.mode === 'Partial' || input.mode === 'Refused' || challan.lines.some((l) => (deliveredMap.get(l.orderItemId)?.deliveredQty ?? l.qty) < l.qty);
  const status: Challan['status'] = input.mode === 'Refused' ? 'Failed' : isPartial ? 'Partial' : 'Delivered';

  commit((d) => {
    const orderItems = d.orderItems.map((l) => {
      const res = deliveredMap.get(l.id);
      if (!res) return l;
      return { ...l, qty: { ...l.qty, delivered: res.deliveredQty, customerAccepted: res.deliveredQty }, remarks: res.reason || l.remarks };
    });
    // Judge fulfilment on the lines *after* this delivery is written, not the stale copy.
    const lines = orderItems.filter((l) => l.orderId === order.id);
    const fulfilled = lines.every((l) => (l.qty.customerAccepted ?? 0) >= (l.qty.approved ?? l.qty.ordered ?? 0));
    return {
    challans: d.challans.map((c) => (c.id === challanId ? { ...c, status, deliveredAt: now, receivedByName: input.receivedByName, signature: input.signature, photo: input.photo, deliveryRemarks: input.remarks } : c)),
    orderItems,
    orders: d.orders.map((o) => {
      if (o.id !== order.id) return o;
      return { ...o, deliveryStatus: status === 'Failed' ? 'Failed' : status, status: fulfilled ? 'Completed' : 'Partially Fulfilled', invoiceStatus: 'Ready' };
    }),
    auditLogs: [auditRow(userId, status === 'Partial' ? 'Delivery confirmed (partial)' : 'Delivery confirmed', 'delivery', challan.challanNo, challan.customerId, 'In Transit', status, status === 'Delivered' ? 'Success' : 'Warning'), ...d.auditLogs],
    };
  });

  // Delivered goods are invoiced on the spot — accounts only step in for exceptions.
  if (status !== 'Failed' && automationOf(db).autoInvoiceOnDelivery && !db.invoices.some((i) => i.orderId === order.id)) {
    const after = useStore.getState().db;
    if (after.orderItems.some((l) => l.orderId === order.id && (l.qty.customerAccepted ?? 0) > 0)) generateInvoice(order.id, userId);
  }
}
