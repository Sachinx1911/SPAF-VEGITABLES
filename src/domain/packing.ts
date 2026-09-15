import type { Customer, Database, Order, Packing, PackingStatus, Route } from '../types/models';

export interface PackingBoardRow {
  order: Order;
  customer: Customer;
  route: Route | undefined;
  packing: Packing | null;
  status: PackingStatus;
  allocatedLines: number;
  priority: 'Urgent' | 'Regular';
}

/** Orders ready to pack for a delivery date: locked/approved orders that have at least one allocated line. */
export function packingBoard(db: Database, date: string): PackingBoardRow[] {
  const orders = db.orders.filter((o) => o.deliveryDate === date && (o.status === 'Locked' || o.status === 'Approved' || o.status === 'Partially Fulfilled' || o.status === 'Completed'));
  const custById = new Map(db.customers.map((c) => [c.id, c]));
  const routeById = new Map(db.routes.map((r) => [r.id, r]));
  const packingByOrder = new Map(db.packings.map((p) => [p.orderId, p]));

  return orders
    .map((order) => {
      const lines = db.orderItems.filter((l) => l.orderId === order.id);
      const allocatedLines = lines.filter((l) => l.qty.allocated != null).length;
      if (!allocatedLines) return null;
      const customer = custById.get(order.customerId)!;
      const packing = packingByOrder.get(order.id) ?? null;
      return {
        order, customer, route: routeById.get(customer.routeId), packing,
        status: packing?.status ?? 'To Pack', allocatedLines,
        priority: order.orderType === 'Urgent' ? 'Urgent' : 'Regular',
      } as PackingBoardRow;
    })
    .filter((r): r is PackingBoardRow => !!r)
    .sort((a, b) => a.customer.routeOrder - b.customer.routeOrder);
}

export function packingCounts(rows: PackingBoardRow[]) {
  return {
    toPack: rows.filter((r) => r.status === 'To Pack').length,
    packing: rows.filter((r) => r.status === 'Packing').length,
    packed: rows.filter((r) => r.status === 'Packed').length,
    issue: rows.filter((r) => r.status === 'Issue').length,
  };
}

export interface DeliveryBoardRow {
  challan: Database['challans'][number];
  order: Order | undefined;
  customer: Customer | undefined;
  route: Route | undefined;
  driverName: string;
}

export function deliveryRows(db: Database, date: string): DeliveryBoardRow[] {
  const custById = new Map(db.customers.map((c) => [c.id, c]));
  const routeById = new Map(db.routes.map((r) => [r.id, r]));
  const userById = new Map(db.users.map((u) => [u.id, u]));
  return db.challans
    .filter((c) => c.challanDate === date)
    .map((c) => ({
      challan: c, order: db.orders.find((o) => o.id === c.orderId), customer: custById.get(c.customerId),
      route: routeById.get(c.routeId), driverName: c.driverId ? (userById.get(c.driverId)?.name ?? '—') : '—',
    }))
    .sort((a, b) => (a.customer?.routeOrder ?? 0) - (b.customer?.routeOrder ?? 0));
}
