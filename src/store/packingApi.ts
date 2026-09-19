import { api } from '../lib/api';
import type { PackageType } from '../types/models';

export interface PackingBoardApiRow {
  orderId: string;
  orderNo: string;
  customerId: string;
  customerName: string;
  routeName: string | null;
  items: number;
  totalQty: number;
  packingId: string | null;
  status: string;
  packages: number;
  verified: boolean;
}

export interface PackingBoardApiResponse {
  deliveryDate: string;
  rows: PackingBoardApiRow[];
}

export interface PackingLineApi {
  id: string;
  itemId: string;
  itemName: string;
  unit: string;
  allocatedQty: number;
  packedQty: number | null;
  packageType: PackageType;
}

/** Raw Eloquent model — snake_case keys. */
export interface PackingDetailRaw {
  id: string | number;
  packing_no: string;
  order_id: string | number;
  customer_id: string | number;
  delivery_date: string;
  status: string;
  packages: number;
  packed_by: string | number | null;
  started_at: string | null;
  packed_at: string | null;
  verified: boolean;
  issue: string | null;
}

export interface PackingDetailApiResponse {
  packing: PackingDetailRaw;
  customer: { id: string | number; name: string };
  lines: PackingLineApi[];
}

export interface UpdatePackingLine {
  id: string;
  packed_qty: number;
  package_type?: PackageType;
}

export interface ChallanLineRaw {
  id: string | number;
  challan_id: string | number;
  order_item_id: string | number;
  item_id: string | number;
  unit: string;
  qty: number | string;
}

/** Raw Eloquent model — snake_case keys. */
export interface ChallanRaw {
  id: string | number;
  challan_no: string;
  packing_id: string | number;
  order_id: string | number;
  customer_id: string | number;
  route_id: string | number | null;
  challan_date: string;
  driver_id: string | number | null;
  vehicle_no: string;
  status: string;
  packages: number;
  prepared_by: string | number;
  packed_by: string | number | null;
  dispatched_at: string | null;
  delivered_at: string | null;
  lines: ChallanLineRaw[];
}

export async function fetchPackingBoard(deliveryDate: string): Promise<PackingBoardApiResponse> {
  return api.get<PackingBoardApiResponse>('/packings', { delivery_date: deliveryDate });
}

export async function fetchPackingDetail(orderId: string): Promise<PackingDetailApiResponse> {
  return api.get<PackingDetailApiResponse>(`/packings/${orderId}`);
}

export async function updatePackingApi(packingId: string, lines: UpdatePackingLine[], packages?: number, issue?: string): Promise<void> {
  await api.put(`/packings/${packingId}`, {
    lines,
    ...(packages !== undefined ? { packages } : {}),
    ...(issue !== undefined ? { issue } : {}),
  });
}

export async function verifyPackingApi(packingId: string, vehicleNo?: string, driverId?: string): Promise<{ challan: ChallanRaw }> {
  return api.post<{ challan: ChallanRaw }>(`/packings/${packingId}/verify`, {
    ...(vehicleNo ? { vehicle_no: vehicleNo } : {}),
    ...(driverId ? { driver_id: driverId } : {}),
  });
}
