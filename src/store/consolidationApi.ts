import { api } from '../lib/api';
import type { Category, Unit } from '../types/models';

/**
 * The day's consolidation, read from the server.
 *
 * The matrix is built server-side rather than in the browser: it sums approved
 * quantities across every customer, and that arithmetic has to agree with what
 * the purchase requirement is generated from. Computing it twice, in two
 * languages, is how the two quietly drift apart.
 */

export interface ConsolidationCustomer {
  id: string;
  name: string;
  shortLabel: string;
  routeOrder: number;
}

export interface ConsolidationRow {
  itemId: string;
  name: string;
  unit: Unit;
  category: Category;
  /** Quantity per customer id. Absent means that customer ordered none. */
  byCustomer: Record<string, number>;
  total: number;
}

export interface ConsolidationMatrix {
  deliveryDate: string;
  locked: boolean;
  lockedAt: string | null;
  customers: ConsolidationCustomer[];
  rows: ConsolidationRow[];
  orderCount: number;
  pendingApproval: number;
}

export function fetchConsolidation(deliveryDate: string): Promise<ConsolidationMatrix> {
  return api.get<ConsolidationMatrix>('/consolidation', { delivery_date: deliveryDate });
}

export interface LockResult {
  message: string;
  deliveryDate: string;
  orders: number;
  requirements: number;
}

/**
 * Freezes the day and writes the purchase requirement.
 *
 * One call, because the server does both in a single transaction — a locked day
 * with no requirement would leave the buyer with nothing to act on.
 */
export function lockConsolidationApi(deliveryDate: string): Promise<LockResult> {
  return api.post<LockResult>('/consolidation/lock', { delivery_date: deliveryDate });
}

/** Unlocks and locks again in one call, picking up whatever changed since. */
export function relockConsolidationApi(deliveryDate: string): Promise<LockResult> {
  return api.post<LockResult>('/consolidation/relock', { delivery_date: deliveryDate });
}

export interface ItemQuantityRow {
  item_id: string;
  name: string;
  category: Category;
  unit: Unit;
  total: number;
  customers: number;
}

export function fetchItemQuantity(deliveryDate: string): Promise<{ deliveryDate: string; rows: ItemQuantityRow[] }> {
  return api.get('/consolidation/item-quantity', { delivery_date: deliveryDate });
}
