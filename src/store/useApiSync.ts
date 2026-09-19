import { useCallback, useEffect, useState } from 'react';
import { API_MODE } from '../lib/api';
import { useStore } from './useStore';
import { fetchOrders, type OrderQuery } from './ordersApi';
import { fetchCustomers, fetchItems, fetchRoutes, fetchSuppliers } from './mastersApi';
import { fetchConsolidation } from './consolidationApi';
import { fetchOutstanding } from './financeApi';
import { fetchInvoices } from './financeApi';
import { fetchRequirements, fetchProcurementContext } from './procurementApi';
import type { RequirementStatus } from '../domain/ops';
import type { Unit } from '../types/models';

/**
 * Fills the store from the API so the screens can stay as they are.
 *
 * Every page already reads `db.orders`, `db.customers` and so on. Rather than
 * rewriting each one to fetch and await, the store becomes a cache that the
 * server fills instead of the seed. Pages keep their synchronous reads; only
 * where the data comes from changes.
 *
 * In demo mode these hooks do nothing at all, and the seeded data stands.
 */

export interface SyncState {
  loading: boolean;
  error: string | null;
  /** Re-fetches — call after any write, so the screen reflects the server. */
  refresh: () => Promise<void>;
}

function useSync(run: () => Promise<void>, deps: unknown[]): SyncState {
  const [loading, setLoading] = useState(API_MODE);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!API_MODE) return;
    setLoading(true);
    setError(null);
    try {
      await run();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, deps); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { loading, error, refresh };
}

/**
 * Pulls orders for a query into the store.
 *
 * Replaces only the orders the query covers, and their lines, leaving anything
 * outside it alone — so opening one day's board does not wipe another day that
 * a different screen already loaded.
 */
export function useOrdersSync(query: OrderQuery = {}): SyncState {
  const commit = useStore((s) => s.commit);
  const key = JSON.stringify(query);

  return useSync(async () => {
    const { orders, lines } = await fetchOrders(query);
    const ids = new Set(orders.map((o) => o.id));

    commit((db) => ({
      orders: [...db.orders.filter((o) => !ids.has(o.id)), ...orders],
      orderItems: [...db.orderItems.filter((l) => !ids.has(l.orderId)), ...lines],
    }));
  }, [key, commit]);
}

/**
 * Loads the reference tables once, after sign-in.
 *
 * Customers, items and routes are read by nearly every screen and change rarely,
 * so they are fetched together rather than per page. Until they land the app has
 * only the seeded copies, which is why the shell waits on this.
 */
export function useMastersSync(): SyncState {
  const commit = useStore((s) => s.commit);
  const signedIn = useStore((s) => !!s.session);

  return useSync(async () => {
    if (!signedIn) return;

    const [customers, items, routes, suppliers] = await Promise.all([
      fetchCustomers(),
      fetchItems(),
      fetchRoutes(),
      // A warehouse or accounts login cannot see suppliers, and that is not an
      // error — the rest of the masters still load.
      fetchSuppliers().catch(() => []),
    ]);

    commit(() => ({ customers, items, routes, suppliers }));
  }, [signedIn, commit]);
}

/**
 * Loads a day's consolidation matrix.
 *
 * The matrix itself is returned by the server rather than summed here — the
 * same arithmetic feeds the purchase requirement, and computing it twice in two
 * languages is how the two quietly drift apart.
 */
export function useConsolidationSync(deliveryDate: string) {
  const [matrix, setMatrix] = useState<Awaited<ReturnType<typeof fetchConsolidation>> | null>(null);
  const state = useSync(async () => {
    setMatrix(await fetchConsolidation(deliveryDate));
  }, [deliveryDate]);

  return { ...state, matrix };
}

/** Customer-wise dues with their aging buckets, worked out server-side. */
export function useOutstandingSync(asOf?: string) {
  const [data, setData] = useState<Awaited<ReturnType<typeof fetchOutstanding>> | null>(null);
  const state = useSync(async () => {
    setData(await fetchOutstanding(asOf));
  }, [asOf]);

  return { ...state, data };
}

/**
 * The purchase requirement for a delivery date, worked out server-side after the
 * consolidation is locked.
 *
 * Returns rows in the same shape the demo build's `requirementRows` produces, so
 * the page renders one or the other without knowing which. `null` while it loads
 * or in demo mode, where the page falls back to the local computation.
 */
export interface RequirementViewRow {
  itemId: string;
  unit: Unit;
  required: number;
  stock: number;
  purchased: number;
  toPurchase: number;
  status: RequirementStatus;
}

export function useRequirementsSync(deliveryDate: string) {
  const commit = useStore((s) => s.commit);
  const [rows, setRows] = useState<RequirementViewRow[] | null>(null);
  const state = useSync(async () => {
    const res = await fetchRequirements(deliveryDate);

    // Also push the requirements into the store so allocationRows() — which
    // reads db.requirements for the on-hand stock figure — works in API mode.
    const nowISO = new Date().toISOString();
    commit((db) => ({
      requirements: [
        ...db.requirements.filter((r) => r.deliveryDate !== deliveryDate),
        ...res.rows.map((r) => ({
          id: `req-${r.itemId}-${deliveryDate}`,
          deliveryDate,
          itemId: r.itemId,
          unit: r.unit as Unit,
          requiredQty: r.requiredQty,
          stockQty: r.stockQty,
          generatedAt: nowISO,
        })),
      ],
    }));

    setRows(res.rows.map((r) => {
      // The server calls a fully-covered line OK and anything short Required;
      // the demo build additionally flags a line Critical when most of it is
      // still to buy. Re-derive that here so both paths colour the same.
      const ratio = r.requiredQty > 0 ? r.toBuyQty / r.requiredQty : 0;
      const status: RequirementStatus =
        r.toBuyQty <= 0 ? 'OK' : ratio > 0.3 ? 'Critical' : 'Purchase Required';
      return {
        itemId: r.itemId, unit: r.unit as Unit, required: r.requiredQty, stock: r.stockQty,
        purchased: r.purchasedQty, toPurchase: r.toBuyQty, status,
      };
    }));
  }, [deliveryDate, commit]);

  return { ...state, rows };
}

/**
 * Fills the store with the procurement tables — purchase orders, receivings and
 * quality checks — so the Receiving and QC screens' queue logic runs off the
 * same tables the demo build uses. Returns `refresh` to call after a receive or
 * a QC so the queues reflect the write.
 */
export function useProcurementSync(): SyncState {
  const commit = useStore((s) => s.commit);

  return useSync(async () => {
    const ctx = await fetchProcurementContext();
    commit(() => ({
      purchaseOrders: ctx.purchaseOrders,
      purchaseOrderItems: ctx.purchaseOrderItems,
      receivings: ctx.receivings,
      receivingItems: ctx.receivingItems,
      qualityChecks: ctx.qualityChecks,
    }));
  }, [commit]);
}

/** Invoices, with the derived status the server computes on the way out. */
export function useInvoicesSync(query: Parameters<typeof fetchInvoices>[0] = {}) {
  const [data, setData] = useState<Awaited<ReturnType<typeof fetchInvoices>> | null>(null);
  const key = JSON.stringify(query);
  const state = useSync(async () => {
    setData(await fetchInvoices(query));
  }, [key]);

  return { ...state, data };
}
