import { api } from '../lib/api';
import type { Order, OrderItem, QtyChain } from '../types/models';

/**
 * Orders, read from and written to the server.
 *
 * The server already speaks the front end's own shape — `toPortableArray()`
 * mirrors the `Order` interface — so rows arrive ready to use and the only work
 * here is splitting an order from its lines, which the store keeps in separate
 * tables exactly as MySQL does.
 */

/** One order as the API sends it: the order, plus what a list row needs. */
interface ApiOrder extends Omit<Order, 'id'> {
  id: string;
  customerName?: string;
  customerCode?: string;
  lineCount?: number;
  value?: number;
  lines?: ApiOrderLine[];
}

interface ApiOrderLine {
  id: string;
  orderId: string;
  itemId: string;
  unit: string;
  rate: number;
  qty: QtyChain;
  remarks: string;
}

interface Paginated<T> {
  data: T[];
  total: number;
  current_page: number;
  last_page: number;
}

export interface OrderQuery {
  deliveryDate?: string;
  from?: string;
  to?: string;
  status?: string;
  customerId?: string;
  perPage?: number;
}

const toLine = (l: ApiOrderLine): OrderItem => ({
  id: l.id,
  orderId: l.orderId,
  itemId: l.itemId,
  unit: l.unit as OrderItem['unit'],
  rate: l.rate,
  qty: l.qty,
  remarks: l.remarks ?? '',
});

/** Strips the list-only extras so what lands in the store is exactly an Order. */
function toOrder(o: ApiOrder): Order {
  const { customerName, customerCode, lineCount, value, lines, ...order } = o;
  void customerName; void customerCode; void lineCount; void value; void lines;

  return order as Order;
}

export async function fetchOrders(q: OrderQuery = {}): Promise<{ orders: Order[]; lines: OrderItem[]; total: number }> {
  const page = await api.get<Paginated<ApiOrder>>('/orders', {
    delivery_date: q.deliveryDate,
    from: q.from,
    to: q.to,
    status: q.status,
    customer_id: q.customerId,
    per_page: q.perPage ?? 100,
  });

  return {
    orders: page.data.map(toOrder),
    lines: page.data.flatMap((o) => (o.lines ?? []).map(toLine)),
    total: page.total,
  };
}

export async function fetchOrder(id: string): Promise<{ order: Order; lines: OrderItem[] }> {
  const res = await api.get<{ order: ApiOrder; lines: (ApiOrderLine & { itemName: string })[] }>(`/orders/${id}`);

  return { order: toOrder(res.order), lines: res.lines.map(toLine) };
}

export interface NewOrderPayload {
  customerId: string;
  deliveryDate: string;
  orderType?: Order['orderType'];
  source?: Order['source'];
  draft?: boolean;
  remarks?: string;
  lines: { itemId: string; qty: number; remarks?: string }[];
}

/**
 * Creates an order. The rate is not sent: the server looks up the customer's
 * price for that delivery date itself, so a stale price sitting in a browser
 * tab cannot be billed.
 */
export async function createOrderApi(input: NewOrderPayload): Promise<Order> {
  const res = await api.post<{ order: ApiOrder }>('/orders', {
    customer_id: input.customerId,
    delivery_date: input.deliveryDate,
    order_type: input.orderType,
    source: input.source,
    draft: input.draft,
    remarks: input.remarks,
    lines: input.lines.map((l) => ({ item_id: l.itemId, qty: l.qty, remarks: l.remarks })),
  });

  return toOrder(res.order);
}

/** Approves an order. `adjustments` is keyed by order-line id. */
export async function approveOrderApi(orderId: string, adjustments?: Record<string, number>): Promise<Order> {
  const res = await api.post<{ order: ApiOrder }>(`/orders/${orderId}/approve`, { adjustments });

  return toOrder(res.order);
}

export async function rejectOrderApi(orderId: string, reason: string): Promise<Order> {
  const res = await api.post<{ order: ApiOrder }>(`/orders/${orderId}/reject`, { reason });

  return toOrder(res.order);
}

export async function amendOrderApi(orderId: string, lines: { itemId: string; qty: number }[]): Promise<Order> {
  const res = await api.put<{ order: ApiOrder }>(`/orders/${orderId}`, {
    lines: lines.map((l) => ({ item_id: l.itemId, qty: l.qty })),
  });

  return toOrder(res.order);
}
