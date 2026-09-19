import type { Challan, PackageType, Packing, PackingItem, Unit } from '../types/models';
import { useStore } from './useStore';
import { uid } from '../lib/id';
import { nowISO } from '../lib/clock';
import { API_MODE } from '../lib/api';
import {
  fetchPackingDetail,
  updatePackingApi,
  verifyPackingApi,
} from './packingApi';

function auditRow(userId: string, action: string, module: string, recordRef: string, customerId: string | null, oldValue: string, newValue: string, status: 'Success' | 'Warning' = 'Success') {
  return { id: uid('a'), at: nowISO(), userId, action, module: module as any, recordRef, customerId, oldValue, newValue, device: 'Chrome · Windows', status };
}

let pkSeq = 200;
let dcSeq = 200;

const packageTypeFor = (unit: Unit, qty: number): PackageType => (unit === 'Box' ? 'Box' : unit === 'Kg' && qty >= 10 ? 'Crate' : 'Bag');

/**
 * Opens (or creates) the packing sheet for one order.
 *
 * In API mode: hits the server, which does firstOrCreate, then commits the full
 * detail (packing + lines) into the store so the page renders without knowing
 * which mode it is in. In demo mode: creates locally and returns synchronously.
 */
export async function getOrCreatePacking(orderId: string, userId: string): Promise<Packing> {
  if (API_MODE) {
    const { db, commit } = useStore.getState();
    const res = await fetchPackingDetail(orderId);
    const raw = res.packing;

    const packing: Packing = {
      id: String(raw.id),
      packingNo: raw.packing_no,
      orderId: String(raw.order_id),
      customerId: String(raw.customer_id),
      deliveryDate: raw.delivery_date,
      status: raw.status as Packing['status'],
      packages: raw.packages,
      packedBy: raw.packed_by != null ? String(raw.packed_by) : null,
      startedAt: raw.started_at,
      packedAt: raw.packed_at,
      verified: raw.verified,
      issue: raw.issue ?? '',
    };

    const items: PackingItem[] = res.lines.map((l): PackingItem => ({
      id: l.id,
      packingId: packing.id,
      // allocationId and orderItemId are not exposed by the board API — they
      // are only needed by the local domain functions (which don't run in API mode).
      allocationId: '',
      orderItemId: '',
      itemId: l.itemId,
      unit: l.unit as Unit,
      allocatedQty: l.allocatedQty,
      packedQty: l.packedQty,
      packageType: l.packageType,
    }));

    commit((d) => {
      // Remove any previous entry for this order (could be a board-level stub).
      const oldPacking = d.packings.find((p) => p.orderId === orderId);
      return {
        packings: [...d.packings.filter((p) => p.orderId !== orderId), packing],
        packingItems: [
          ...d.packingItems.filter((i) => !oldPacking || i.packingId !== oldPacking.id),
          ...items,
        ],
      };
    });

    return packing;
  }

  return getOrCreatePackingLocal(orderId, userId);
}

function getOrCreatePackingLocal(orderId: string, userId: string): Packing {
  const { db, commit } = useStore.getState();
  const existing = db.packings.find((p) => p.orderId === orderId);
  if (existing) return existing;

  const order = db.orders.find((o) => o.id === orderId)!;
  const lines = db.orderItems.filter((l) => l.orderId === orderId && l.qty.allocated != null);
  const allocations = db.allocations.filter((a) => a.orderId === orderId);

  const packing: Packing = {
    id: uid('pk'), packingNo: `PK-2609-${String(++pkSeq).padStart(4, '0')}`, orderId, customerId: order.customerId, deliveryDate: order.deliveryDate,
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

/**
 * Verifies a packing and generates the delivery challan.
 *
 * In API mode: saves all packed quantities, then calls verify which issues the
 * challan server-side and writes qty_packed into the order chain. Returns the
 * challan so the caller can show its number in a toast.
 *
 * In demo mode: same logic as before, runs fully client-side.
 */
export async function markPacked(packingId: string, userId: string): Promise<Challan> {
  if (API_MODE) {
    const { db, commit } = useStore.getState();
    const packing = db.packings.find((p) => p.id === packingId)!;
    const packingItems = db.packingItems.filter((i) => i.packingId === packingId);

    // Step 1: save all packed qtys (unset lines default to their allocated qty).
    const lines = packingItems.map((i) => ({
      id: i.id,
      packed_qty: i.packedQty ?? i.allocatedQty,
      package_type: i.packageType,
    }));
    await updatePackingApi(packingId, lines, packing.packages || undefined, packing.issue || undefined);

    // Step 2: verify and let the server generate the challan.
    const { challan: raw } = await verifyPackingApi(packingId);

    const challan: Challan = {
      id: String(raw.id),
      challanNo: raw.challan_no,
      packingId: String(raw.packing_id),
      orderId: String(raw.order_id),
      customerId: String(raw.customer_id),
      routeId: String(raw.route_id ?? ''),
      challanDate: raw.challan_date,
      driverId: raw.driver_id != null ? String(raw.driver_id) : null,
      vehicleNo: raw.vehicle_no ?? '',
      status: raw.status as Challan['status'],
      packages: raw.packages,
      lines: raw.lines.map((l) => ({
        orderItemId: String(l.order_item_id),
        itemId: String(l.item_id),
        unit: l.unit as Unit,
        qty: Number(l.qty),
      })),
      preparedBy: String(raw.prepared_by),
      packedBy: raw.packed_by != null ? String(raw.packed_by) : null,
      dispatchedAt: null,
      deliveredAt: null,
      receivedByName: '',
      signature: null,
      photo: null,
      deliveryRemarks: '',
    };

    commit((d) => ({
      packings: d.packings.map((p) => (p.id === packingId ? { ...p, status: 'Packed', verified: true, packedAt: nowISO() } : p)),
      orders: d.orders.map((o) => (o.id === challan.orderId ? { ...o, packingStatus: 'Packed', deliveryStatus: 'Ready' } : o)),
      challans: [...d.challans, challan],
    }));

    return challan;
  }

  return markPackedLocal(packingId, userId);
}

function markPackedLocal(packingId: string, userId: string): Challan {
  const { db, commit } = useStore.getState();
  const now = nowISO();
  const packing = db.packings.find((p) => p.id === packingId)!;
  const order = db.orders.find((o) => o.id === packing.orderId)!;
  const customer = db.customers.find((c) => c.id === packing.customerId)!;
  const items = db.packingItems.filter((i) => i.packingId === packingId);
  const finalItems = items.map((i) => ({ ...i, packedQty: i.packedQty ?? i.allocatedQty }));
  const packages = Math.max(1, Math.ceil(finalItems.reduce((s, i) => s + (i.packageType === 'Crate' ? 1 : 0.34), 0)));

  const challan: Challan = {
    id: uid('dc'), challanNo: `DC-2609-${String(++dcSeq).padStart(4, '0')}`, packingId, orderId: order.id, customerId: customer.id,
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

  commit((d) => ({
    challans: d.challans.map((c) => (c.id === challanId ? { ...c, status, deliveredAt: now, receivedByName: input.receivedByName, signature: input.signature, photo: input.photo, deliveryRemarks: input.remarks } : c)),
    orderItems: d.orderItems.map((l) => {
      const res = deliveredMap.get(l.id);
      if (!res) return l;
      return { ...l, qty: { ...l.qty, delivered: res.deliveredQty, customerAccepted: res.deliveredQty }, remarks: res.reason || l.remarks };
    }),
    orders: d.orders.map((o) => {
      if (o.id !== order.id) return o;
      const lines = d.orderItems.filter((l) => l.orderId === o.id);
      const fulfilled = lines.every((l) => l.qty.customerAccepted === l.qty.approved);
      return { ...o, deliveryStatus: status === 'Failed' ? 'Failed' : status, status: fulfilled ? 'Completed' : 'Partially Fulfilled', invoiceStatus: 'Ready' };
    }),
    auditLogs: [auditRow(userId, status === 'Partial' ? 'Delivery confirmed (partial)' : 'Delivery confirmed', 'delivery', challan.challanNo, challan.customerId, 'In Transit', status, status === 'Delivered' ? 'Success' : 'Warning'), ...d.auditLogs],
  }));
}
