import type { Customer, Database, Item, Order, OrderItem, Unit } from '../types/models';
import { addDays } from '../lib/format';

export interface FavouriteLine {
  item: Item;
  lastQty: number | null;
  lastRate: number;
  timesOrdered: number;
}

/** Rate a customer actually pays for an item today: their active custom price, else the item default. */
export function rateFor(db: Database, customerId: string, itemId: string, date: string): number {
  const p = db.prices.find((x) => x.customerId === customerId && x.itemId === itemId && x.effectiveFrom <= date && (!x.effectiveTo || x.effectiveTo >= date));
  return p ? p.price : (db.items.find((i) => i.id === itemId)?.defaultSellingPrice ?? 0);
}

/**
 * A customer's ordering basket: every item they have ever ordered (their "favourites"),
 * each with the qty from their most recent order — this is what pre-fills New Order Entry.
 */
export function customerFavourites(db: Database, customerId: string, asOfDate: string): FavouriteLine[] {
  const orderIds = new Set(db.orders.filter((o) => o.customerId === customerId && o.status !== 'Draft' && o.status !== 'Rejected').map((o) => o.id));
  const byItem = new Map<string, { lastQty: number | null; lastDate: string; lastRate: number; times: number }>();
  const ordersById = new Map(db.orders.map((o) => [o.id, o]));

  for (const line of db.orderItems) {
    if (!orderIds.has(line.orderId)) continue;
    const order = ordersById.get(line.orderId)!;
    const cur = byItem.get(line.itemId);
    const entry = cur ?? { lastQty: null, lastDate: '', lastRate: line.rate, times: 0 };
    entry.times += 1;
    if (order.orderDate >= entry.lastDate) {
      entry.lastDate = order.orderDate;
      entry.lastQty = line.qty.ordered;
      entry.lastRate = line.rate;
    }
    byItem.set(line.itemId, entry);
  }

  const itemById = new Map(db.items.map((i) => [i.id, i]));
  return [...byItem.entries()]
    .map(([itemId, v]) => {
      const item = itemById.get(itemId);
      if (!item) return null;
      return { item, lastQty: v.lastQty, lastRate: rateFor(db, customerId, itemId, asOfDate), timesOrdered: v.times };
    })
    .filter((x): x is FavouriteLine => !!x)
    .sort((a, b) => a.item.sortOrder - b.item.sortOrder);
}

/** The customer's most recent non-draft, non-rejected order — what "Repeat Previous Order" repeats. */
export function previousOrder(db: Database, customerId: string): (Order & { lines: OrderItem[] }) | null {
  const orders = db.orders
    .filter((o) => o.customerId === customerId && o.status !== 'Draft' && o.status !== 'Rejected')
    .sort((a, b) => (a.receivedAt < b.receivedAt ? 1 : -1));
  const order = orders[0];
  if (!order) return null;
  return { ...order, lines: db.orderItems.filter((l) => l.orderId === order.id) };
}

/**
 * The order a customer may still change themselves: same delivery date, and not yet
 * locked into a purchase requirement. Approved is still fair game — it just goes back
 * for approval once they touch it.
 */
export function editableOrder(db: Database, customerId: string, deliveryDate: string): (Order & { lines: OrderItem[] }) | null {
  const order = db.orders.find(
    (o) => o.customerId === customerId && o.deliveryDate === deliveryDate &&
      (o.status === 'Submitted' || o.status === 'Late' || o.status === 'Approved'),
  );
  if (!order) return null;
  return { ...order, lines: db.orderItems.filter((l) => l.orderId === order.id) };
}

export function isPastCutoff(nowIso: string, cutoff: string): boolean {
  const hhmm = nowIso.slice(11, 16);
  return hhmm >= cutoff;
}

/** The delivery date a new order lands on: today's cutoff hasn't passed -> tomorrow, else the day after. */
export function nextDeliveryDate(today: string, nowIso: string, cutoff: string): string {
  return addDays(today, isPastCutoff(nowIso, cutoff) ? 2 : 1);
}

export interface ConsolidationRow {
  item: Item;
  byCustomer: Map<string, number>; // customerId -> qty
  total: number;
}

export interface ConsolidationMatrix {
  customers: Customer[]; // in route order, only those with an order on this date
  rows: ConsolidationRow[];
  orders: Order[];
  lineCount: number;
}

/**
 * The Daily Consolidation matrix: items × customers (route order), built from every order
 * line for the delivery date that has reached Approved/Late-approved/Locked status.
 */
export function buildConsolidation(db: Database, deliveryDate: string): ConsolidationMatrix {
  const orders = db.orders.filter(
    (o) => o.deliveryDate === deliveryDate && (o.status === 'Approved' || o.status === 'Locked' || o.status === 'Partially Fulfilled' || o.status === 'Completed'),
  );
  const orderIds = new Set(orders.map((o) => o.id));
  const custIds = new Set(orders.map((o) => o.customerId));
  const customers = db.customers.filter((c) => custIds.has(c.id)).sort((a, b) => a.routeOrder - b.routeOrder);
  const orderByC = new Map(orders.map((o) => [o.customerId, o]));

  const itemMap = new Map<string, ConsolidationRow>();
  let lineCount = 0;
  for (const line of db.orderItems) {
    if (!orderIds.has(line.orderId)) continue;
    const qty = line.qty.approved ?? line.qty.ordered;
    if (!qty) continue;
    const order = orders.find((o) => o.id === line.orderId)!;
    const item = db.items.find((i) => i.id === line.itemId);
    if (!item) continue;
    lineCount++;
    const row = itemMap.get(item.id) ?? { item, byCustomer: new Map(), total: 0 };
    row.byCustomer.set(order.customerId, (row.byCustomer.get(order.customerId) ?? 0) + qty);
    row.total += qty;
    itemMap.set(item.id, row);
  }

  const rows = [...itemMap.values()].sort((a, b) => a.item.sortOrder - b.item.sortOrder);
  void orderByC;
  return { customers, rows, orders, lineCount };
}

export function splitEven<T>(list: T[], maxCols: number): T[][] {
  const n = Math.max(1, Math.ceil(list.length / maxCols));
  const base = Math.floor(list.length / n);
  const rem = list.length % n;
  const out: T[][] = [];
  let i = 0;
  for (let k = 0; k < n; k++) {
    const take = base + (k < rem ? 1 : 0);
    out.push(list.slice(i, i + take));
    i += take;
  }
  return out;
}

export interface ItemQtyReportRow {
  item: Item;
  totalQty: number;
  customerCount: number;
  orderCount: number;
}

export function itemQuantityReport(matrix: ConsolidationMatrix): ItemQtyReportRow[] {
  return matrix.rows.map((r) => ({
    item: r.item,
    totalQty: r.total,
    customerCount: r.byCustomer.size,
    orderCount: r.byCustomer.size,
  }));
}

export const unitOf = (db: Database, itemId: string): Unit => db.items.find((i) => i.id === itemId)?.unit ?? 'Kg';
