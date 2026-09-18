import { api } from '../lib/api';
import type { Category, Unit } from '../types/models';

/**
 * Allocation, packing, challan and delivery, against the server.
 *
 * Two rules live behind these calls and neither is enforceable in the browser:
 * a shortage is split proportionally down the route rather than first come
 * first served, and the challan's quantities are copied from what was packed
 * rather than typed in again.
 */

/* ------------------------------------------------------------ allocation */

export interface AllocationItemRow {
  itemId: string;
  name: string;
  category: Category;
  unit: Unit;
  availableQty: number;
  requiredQty: number;
  allocatedQty: number;
  /** Negative means the day is short of this item. */
  balance: number;
  status: 'Allocated' | 'Shortage' | 'Pending';
}

export interface AllocationTotals {
  items: number;
  available: number;
  required: number;
  allocated: number;
  shortage: number;
}

export function fetchAllocations(deliveryDate: string): Promise<{
  deliveryDate: string;
  rows: AllocationItemRow[];
  totals: AllocationTotals;
}> {
  return api.get('/allocations', { delivery_date: deliveryDate });
}

export interface AllocationLine {
  orderItemId: string;
  customerId: string;
  customerName: string;
  unit: Unit;
  requiredQty: number;
  allocatedQty: number | null;
  status: 'Pending' | 'Available' | 'Partial' | 'Shortage';
}

/** The per-customer split for one item, in route order. */
export function fetchAllocationLines(deliveryDate: string, itemId: string): Promise<{ lines: AllocationLine[] }> {
  return api.get('/allocations/lines', { delivery_date: deliveryDate, item_id: itemId });
}

export interface AutoAllocateResult {
  allocated: number;
  results: { itemId: string; lines: number; available: number; allocated: number; short: number }[];
}

/**
 * Runs the proportional split. Without `itemId` it covers every item of the day.
 * `override` deliberately promises more than arrived — used when a substitute
 * is on the way — and is recorded as an override.
 */
export function autoAllocateApi(deliveryDate: string, itemId?: string, override = false): Promise<AutoAllocateResult> {
  return api.post<AutoAllocateResult>('/allocations/auto', {
    delivery_date: deliveryDate,
    item_id: itemId,
    override,
  });
}

export function setManualAllocationApi(orderItemId: string, allocatedQty: number): Promise<{ allocatedQty: number }> {
  return api.put(`/allocations/${orderItemId}`, { allocated_qty: allocatedQty });
}

/* --------------------------------------------------------------- packing */

export interface PackingBoardRow {
  orderId: string;
  orderNo: string;
  customerId: string;
  customerName: string;
  routeName: string | null;
  items: number;
  totalQty: number;
  status: string;
  packages: number;
  verified: boolean;
}

export function fetchPackingBoard(deliveryDate: string, routeId?: string): Promise<{
  deliveryDate: string;
  rows: PackingBoardRow[];
}> {
  return api.get('/packings', { delivery_date: deliveryDate, route_id: routeId });
}

export interface PackingLine {
  id: string;
  itemId: string;
  itemName: string;
  unit: Unit;
  allocatedQty: number;
  packedQty: number | null;
  packageType: string;
}

export function fetchPacking(orderId: string): Promise<{
  packing: { id: number; packing_no: string; status: string; packages: number; verified: boolean };
  lines: PackingLine[];
}> {
  return api.get(`/packings/${orderId}`);
}

export function savePackingApi(
  packingId: string,
  lines: { id: string; packedQty: number; packageType?: string }[],
  packages?: number,
  issue?: string,
): Promise<unknown> {
  return api.put(`/packings/${packingId}`, {
    lines: lines.map((l) => ({ id: l.id, packed_qty: l.packedQty, package_type: l.packageType })),
    packages,
    issue,
  });
}

/** Verifying issues the challan; the server copies the packed quantities onto it. */
export async function verifyPackingApi(
  packingId: string,
  vehicleNo?: string,
  driverId?: string,
): Promise<{ challanNo: string; status: string }> {
  const res = await api.post<{ challan: { challan_no: string; status: string } }>(
    `/packings/${packingId}/verify`,
    { vehicle_no: vehicleNo, driver_id: driverId },
  );

  return { challanNo: res.challan.challan_no, status: res.challan.status };
}

/* --------------------------------------------------------------- challan */

export function fetchChallans(params: {
  challanDate?: string;
  routeId?: string;
  driverId?: string;
  status?: string;
}): Promise<{ challans: unknown[] }> {
  return api.get('/challans', {
    challan_date: params.challanDate,
    route_id: params.routeId,
    driver_id: params.driverId,
    status: params.status,
  });
}

export function dispatchChallanApi(challanId: string, driverId?: string, vehicleNo?: string): Promise<unknown> {
  return api.post(`/challans/${challanId}/dispatch`, { driver_id: driverId, vehicle_no: vehicleNo });
}

/* ---------------------------------------------------------- driver app */

export function fetchDriverRun(date?: string): Promise<{
  date: string;
  driver: { id: string; name: string };
  stops: unknown[];
  summary: { total: number; delivered: number; pending: number; failed: number };
}> {
  return api.get('/driver/today', { date });
}

export interface DeliveryConfirmation {
  outcome: 'Delivered' | 'Partial' | 'Failed';
  receivedByName?: string;
  remarks?: string;
  lines?: { id: string; deliveredQty: number; reason?: string }[];
  /** Data URLs from the signature pad and camera; the server stores the files. */
  signature?: string | null;
  photo?: string | null;
}

export function confirmDeliveryApi(challanId: string, input: DeliveryConfirmation): Promise<unknown> {
  return api.post(`/driver/challans/${challanId}/confirm`, {
    outcome: input.outcome,
    received_by_name: input.receivedByName,
    remarks: input.remarks,
    lines: input.lines?.map((l) => ({ id: l.id, delivered_qty: l.deliveredQty, reason: l.reason })),
    signature: input.signature,
    photo: input.photo,
  });
}
