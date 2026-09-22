import { useCallback, useEffect, useState } from 'react';
import { API_MODE } from '../lib/api';
import { useStore } from './useStore';
import { fetchOrders, type OrderQuery } from './ordersApi';
import { fetchCustomers, fetchItems, fetchRoutes, fetchSuppliers } from './mastersApi';
import { fetchUsers } from './adminApi';
import { fetchPortalCatalogue, fetchPortalInvoices, fetchPortalLedger, fetchPortalOrders, fetchPortalSummary, fetchPortalTemplates } from './portalApi';
import { fetchConsolidation } from './consolidationApi';
import { fetchOutstanding, fetchInvoices, fetchLedger, fetchPayments } from './financeApi';
import type { Payment } from '../types/models';
import { fetchRequirements, fetchProcurementContext } from './procurementApi';
import { fetchPackingBoard } from './packingApi';
import { mapChallanRaw } from './packingApi';
import { fetchChallans } from './deliveryApi';
import type { RequirementStatus } from '../domain/ops';
import type { Packing, Unit } from '../types/models';

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
 * Fills the store for a customer-portal login.
 *
 * The portal screens read the same tables as the office screens, but none of
 * the endpoints those tables normally come from will answer a portal token —
 * it holds `portal` permission and nothing else. So this is the portal's
 * equivalent of useMastersSync plus useOrdersSync, in one pass, and every row
 * it fetches is already scoped to the customer on the token.
 */
export function usePortalSync(): SyncState {
  const commit = useStore((s) => s.commit);
  const signedIn = useStore((s) => !!s.session);

  return useSync(async () => {
    if (!signedIn) return;

    const [summary, catalogue, orders, templates] = await Promise.all([
      fetchPortalSummary(),
      fetchPortalCatalogue(),
      fetchPortalOrders(),
      fetchPortalTemplates(),
    ]);

    commit((d) => ({
      // One customer, because that is all a portal login can ever see.
      customers: [summary.customer],
      settings: { ...d.settings, orderCutoffTime: summary.cutoffTime },
      items: catalogue.items,
      prices: catalogue.prices,
      orders: orders.orders,
      orderItems: orders.lines,
      standingTemplates: templates,
    }));
  }, [signedIn, commit]);
}

/**
 * Pulls the real logins into the store.
 *
 * Kept out of useMastersSync because only a users,view role may read them —
 * every other screen would take a 403 on every load for data it never shows.
 */
export function useUsersSync(enabled = true): SyncState {
  const commit = useStore((s) => s.commit);

  return useSync(async () => {
    if (!enabled) return;
    const users = await fetchUsers();
    commit(() => ({ users }));
  }, [enabled, commit]);
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

/**
 * Fills db.packings for a delivery date so PackingDashboard's packingBoard()
 * shows real statuses without the page needing to know where data came from.
 *
 * Only rows that already have a packing record on the server (packingId !== null)
 * are committed — orders with no packing yet will show "To Pack" via the
 * domain function's fallback.
 */
export function usePackingSync(deliveryDate: string): SyncState {
  const commit = useStore((s) => s.commit);

  return useSync(async () => {
    const { rows } = await fetchPackingBoard(deliveryDate);
    const stubs: Packing[] = rows
      .filter((r) => r.packingId !== null)
      .map((r): Packing => ({
        id: r.packingId!,
        packingNo: '',
        orderId: r.orderId,
        customerId: r.customerId,
        deliveryDate,
        status: r.status as Packing['status'],
        packages: r.packages,
        packedBy: null,
        startedAt: null,
        packedAt: null,
        verified: r.verified,
        issue: '',
      }));

    const orderIds = new Set(rows.map((r) => r.orderId));
    commit((d) => ({
      // Keep packings outside this date, plus any detail-loaded packings for
      // this date (those have packingItems and must not be overwritten).
      packings: [
        ...d.packings.filter((p) => !orderIds.has(p.orderId) || d.packingItems.some((i) => i.packingId === p.id)),
        // Only add stubs where there is no detail-loaded entry yet.
        ...stubs.filter((s) => !d.packingItems.some((i) => i.packingId === s.id)),
      ],
    }));
  }, [deliveryDate, commit]);
}

/**
 * Fills db.challans for a delivery date from the challan list endpoint.
 * Lines are set to [] for board-level stubs; ChallanDetail fetches the full
 * record with lines when it opens.
 */
export function useChallansSync(challanDate?: string): SyncState {
  const commit = useStore((s) => s.commit);

  return useSync(async () => {
    const { challans: raw } = await fetchChallans(challanDate);
    const mapped = raw.map(mapChallanRaw);
    const ids = new Set(mapped.map((c) => c.id));

    commit((d) => ({
      // Keep challans outside this date, plus any detail-loaded entries for
      // this date (those have lines populated and must not be overwritten).
      challans: [
        ...d.challans.filter((c) => !ids.has(c.id) || c.lines.length > 0),
        ...mapped.filter((c) => !d.challans.some((ex) => ex.id === c.id && ex.lines.length > 0)),
      ],
    }));
  }, [challanDate, commit]);
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

/**
 * The portal's own invoices and ledger.
 *
 * Separate from the two hooks below only because the staff endpoints they call
 * refuse a portal token. The shapes returned are identical, so the screens
 * render them the same way.
 */
export function usePortalInvoicesSync() {
  const [data, setData] = useState<Awaited<ReturnType<typeof fetchPortalInvoices>> | null>(null);
  const state = useSync(async () => {
    setData(await fetchPortalInvoices());
  }, []);

  return { ...state, data };
}

export function usePortalLedgerSync() {
  const [data, setData] = useState<Awaited<ReturnType<typeof fetchPortalLedger>> | null>(null);
  const state = useSync(async () => {
    setData(await fetchPortalLedger());
  }, []);

  return { ...state, data };
}

/** Running ledger for one customer, computed server-side to handle opening balances. */
export function useLedgerSync(customerId: string, from?: string, to?: string) {
  const [data, setData] = useState<Awaited<ReturnType<typeof fetchLedger>> | null>(null);
  const state = useSync(async () => {
    if (!customerId) return;
    setData(await fetchLedger(customerId, from, to));
  }, [customerId, from, to]);

  return { ...state, data };
}

/**
 * Fills db.payments from the API so PaymentsList reads real receipts.
 * Replaces all payments in the store (payments list is short and fully replaced).
 */
export function usePaymentsSync(q: Parameters<typeof fetchPayments>[0] = {}): SyncState {
  const commit = useStore((s) => s.commit);
  const key = JSON.stringify(q);

  return useSync(async () => {
    const { data } = await fetchPayments(q);
    const payments: Payment[] = data.map((r) => ({
      id: r.id,
      receiptNo: r.receiptNo,
      customerId: r.customerId,
      invoiceId: r.invoiceId,
      paymentDate: r.paymentDate,
      mode: r.mode as Payment['mode'],
      reference: r.reference,
      amount: r.amount,
      remarks: r.remarks,
      recordedBy: r.recordedBy,
      recordedAt: r.recordedAt,
    }));
    const ids = new Set(payments.map((p) => p.id));
    commit((d) => ({
      payments: [...d.payments.filter((p) => !ids.has(p.id)), ...payments],
    }));
  }, [key, commit]);
}
