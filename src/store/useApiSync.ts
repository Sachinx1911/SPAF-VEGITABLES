import { useCallback, useEffect, useState } from 'react';
import { API_MODE } from '../lib/api';
import { useStore } from './useStore';
import { fetchOrders, type OrderQuery } from './ordersApi';

/**
 * Fills the store from the API so the screens can stay as they are.
 *
 * Every page already reads `db.orders`, `db.orderItems` and so on. Rather than
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
