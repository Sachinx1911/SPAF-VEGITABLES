import type { Customer, Database, Item, PurchaseOrder, PurchaseOrderItem, ReceivingItem, Unit } from '../types/models';

export interface ReceivingQueueRow {
  po: PurchaseOrder;
  supplierName: string;
  lineCount: number;
  totalQty: number;
}

/** Purchase orders still waiting on a GRN (fully or partially). */
export function receivingQueue(db: Database): ReceivingQueueRow[] {
  return db.purchaseOrders
    // A partially received order still has stock outstanding, so it stays in the
    // queue until it is fully received — the same rule the server applies.
    .filter((po) => po.status === 'Confirmed' || po.status === 'Draft' || po.status === 'Partially Received')
    .map((po) => {
      const lines = db.purchaseOrderItems.filter((l) => l.purchaseOrderId === po.id);
      return { po, supplierName: db.suppliers.find((s) => s.id === po.supplierId)?.name ?? '—', lineCount: lines.length, totalQty: lines.reduce((s, l) => s + l.qty, 0) };
    })
    .sort((a, b) => (a.po.purchaseDate < b.po.purchaseDate ? -1 : 1));
}

export interface QcQueueRow {
  receivingItem: ReceivingItem;
  item: Item;
  supplierName: string;
  grnNo: string;
  receivedAt: string;
}

/** Every received line that has not yet had a quality check recorded against it. */
export function qcQueue(db: Database): QcQueueRow[] {
  const checked = new Set(db.qualityChecks.map((qc) => qc.receivingItemId));
  return db.receivingItems
    .filter((ri) => !checked.has(ri.id) && ri.receivedQty > 0)
    .map((ri) => {
      // In API mode the procurement tables and the item masters are fetched by
      // different hooks, so for a moment a received line can be in hand before
      // its item or GRN is. Skip such a line rather than dereferencing a gap.
      const grn = db.receivings.find((g) => g.id === ri.receivingId);
      const item = db.items.find((i) => i.id === ri.itemId);
      if (!grn || !item) return null;
      const po = db.purchaseOrders.find((p) => p.id === grn.purchaseOrderId);
      return { receivingItem: ri, item, supplierName: db.suppliers.find((s) => s.id === po?.supplierId)?.name ?? '—', grnNo: grn.grnNo, receivedAt: grn.receivedAt };
    })
    .filter((row): row is QcQueueRow => row !== null)
    .sort((a, b) => (a.receivedAt < b.receivedAt ? -1 : 1));
}

export interface AllocationRow {
  item: Item;
  customer: Customer;
  orderItemId: string;
  unit: Unit;
  required: number;
  allocated: number | null;
  available: number;
  status: 'Shortage' | 'Partial' | 'Available';
}

/** Per-item, per-customer allocation view for one delivery date, in route order. */
export function allocationRows(db: Database, deliveryDate: string, itemId?: string): AllocationRow[] {
  const orders = db.orders.filter((o) => o.deliveryDate === deliveryDate && (o.status === 'Locked' || o.status === 'Approved'));
  const orderById = new Map(orders.map((o) => [o.id, o]));
  const custById = new Map(db.customers.map((c) => [c.id, c]));
  const itemById = new Map(db.items.map((i) => [i.id, i]));
  const availableByItem = new Map(
    db.requirements.filter((r) => r.deliveryDate === deliveryDate).map((r) => {
      const poIds = new Set(db.purchaseOrders.filter((p) => p.forDeliveryDate === deliveryDate).map((p) => p.id));
      const poLineIds = new Set(db.purchaseOrderItems.filter((l) => poIds.has(l.purchaseOrderId) && l.itemId === r.itemId).map((l) => l.id));
      const riToPoLine = new Map(db.receivingItems.map((ri) => [ri.id, ri.purchaseOrderItemId]));
      const accepted = db.qualityChecks.filter((qc) => qc.itemId === r.itemId && poLineIds.has(riToPoLine.get(qc.receivingItemId) ?? '')).reduce((s, qc) => s + qc.acceptedQty, 0);
      return [r.itemId, r.stockQty + accepted];
    }),
  );

  return db.orderItems
    .filter((l) => orderById.has(l.orderId) && l.qty.approved != null && (!itemId || l.itemId === itemId))
    .map((l) => {
      const order = orderById.get(l.orderId)!;
      const item = itemById.get(l.itemId)!;
      const customer = custById.get(order.customerId)!;
      const available = availableByItem.get(l.itemId) ?? 0;
      const required = l.qty.approved!;
      const allocated = l.qty.allocated;
      const status: AllocationRow['status'] = allocated == null ? (available >= required ? 'Available' : 'Shortage') : allocated >= required ? 'Available' : 'Partial';
      return { item, customer, orderItemId: l.id, unit: l.unit, required, allocated, available, status };
    })
    .sort((a, b) => a.item.sortOrder - b.item.sortOrder || a.customer.routeOrder - b.customer.routeOrder);
}

export function itemsNeedingAllocation(db: Database, deliveryDate: string): Item[] {
  const ids = new Set(db.requirements.filter((r) => r.deliveryDate === deliveryDate).map((r) => r.itemId));
  return db.items.filter((i) => ids.has(i.id)).sort((a, b) => a.sortOrder - b.sortOrder);
}
