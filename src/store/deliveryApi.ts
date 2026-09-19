import { api } from '../lib/api';
import type { ChallanRaw } from './packingApi';

export interface ChallansApiResponse {
  challans: ChallanRaw[];
}

export async function fetchChallans(challanDate?: string, routeId?: string, status?: string): Promise<ChallansApiResponse> {
  return api.get<ChallansApiResponse>('/challans', {
    challan_date: challanDate,
    route_id: routeId,
    status: status,
  });
}

export async function fetchChallanDetail(challanId: string): Promise<{ challan: ChallanRaw }> {
  return api.get<{ challan: ChallanRaw }>(`/challans/${challanId}`);
}

export async function dispatchChallanApi(challanId: string, driverId?: string, vehicleNo?: string): Promise<{ challan: ChallanRaw }> {
  return api.post<{ challan: ChallanRaw }>(`/challans/${challanId}/dispatch`, {
    ...(driverId ? { driver_id: driverId } : {}),
    ...(vehicleNo ? { vehicle_no: vehicleNo } : {}),
  });
}
