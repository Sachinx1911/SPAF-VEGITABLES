import type { Database } from '../types/models';

export interface DailyOrderRow {
  date: string;
  orders: number;
  customers: number;
  lines: number;
  amount: number;
}

export function dailyOrdersReport(db: Database, from: string, to: string): DailyOrderRow[] {
  const byDate = new Map<string, { orders: Set<string>; customers: Set<string>; lines: number; amount: number }>();
  for (const o of db.orders) {
    if (o.orderDate < from || o.orderDate > to || o.status === 'Draft' || o.status === 'Rejected') continue;
    const cur = byDate.get(o.orderDate) ?? { orders: new Set(), customers: new Set(), lines: 0, amount: 0 };
    cur.orders.add(o.id);
    cur.customers.add(o.customerId);
    byDate.set(o.orderDate, cur);
  }
  for (const l of db.orderItems) {
    const order = db.orders.find((o) => o.id === l.orderId);
    if (!order || !byDate.has(order.orderDate)) continue;
    const cur = byDate.get(order.orderDate)!;
    cur.lines += 1;
    cur.amount += (l.qty.ordered ?? 0) * l.rate;
  }
  return [...byDate.entries()].map(([date, v]) => ({ date, orders: v.orders.size, customers: v.customers.size, lines: v.lines, amount: Math.round(v.amount) })).sort((a, b) => (a.date < b.date ? 1 : -1));
}

export interface CustomerSalesRow {
  customerId: string;
  name: string;
  orders: number;
  qty: number;
  amount: number;
}

export function salesByCustomer(db: Database, from: string, to: string): CustomerSalesRow[] {
  const invoices = db.invoices.filter((i) => i.invoiceDate >= from && i.invoiceDate <= to);
  const byCust = new Map<string, CustomerSalesRow>();
  for (const inv of invoices) {
    const cust = db.customers.find((c) => c.id === inv.customerId);
    if (!cust) continue;
    const cur = byCust.get(cust.id) ?? { customerId: cust.id, name: cust.name, orders: 0, qty: 0, amount: 0 };
    cur.orders += 1;
    cur.amount += inv.total;
    cur.qty += db.invoiceItems.filter((ii) => ii.invoiceId === inv.id).reduce((s, ii) => s + ii.qty, 0);
    byCust.set(cust.id, cur);
  }
  return [...byCust.values()].sort((a, b) => b.amount - a.amount);
}

export interface ItemSalesRow {
  itemId: string;
  name: string;
  unit: string;
  qty: number;
  amount: number;
  customers: number;
}

export function salesByItem(db: Database, from: string, to: string): ItemSalesRow[] {
  const invIds = new Set(db.invoices.filter((i) => i.invoiceDate >= from && i.invoiceDate <= to).map((i) => i.id));
  const byItem = new Map<string, ItemSalesRow & { custSet: Set<string> }>();
  for (const ii of db.invoiceItems) {
    if (!invIds.has(ii.invoiceId)) continue;
    const item = db.items.find((i) => i.id === ii.itemId);
    if (!item) continue;
    const inv = db.invoices.find((i) => i.id === ii.invoiceId)!;
    const cur = byItem.get(item.id) ?? { itemId: item.id, name: item.name, unit: item.unit, qty: 0, amount: 0, customers: 0, custSet: new Set<string>() };
    cur.qty += ii.qty;
    cur.amount += ii.amount;
    cur.custSet.add(inv.customerId);
    byItem.set(item.id, cur);
  }
  return [...byItem.values()].map((v) => ({ ...v, customers: v.custSet.size })).sort((a, b) => b.amount - a.amount);
}

export interface PurchaseReportRow {
  poNo: string;
  supplier: string;
  date: string;
  items: number;
  qty: number;
  amount: number;
  status: string;
}

export function purchaseReport(db: Database, from: string, to: string): PurchaseReportRow[] {
  return db.purchaseOrders
    .filter((po) => po.purchaseDate >= from && po.purchaseDate <= to)
    .map((po) => {
      const lines = db.purchaseOrderItems.filter((l) => l.purchaseOrderId === po.id);
      return {
        poNo: po.poNo, supplier: db.suppliers.find((s) => s.id === po.supplierId)?.name ?? '—', date: po.purchaseDate,
        items: lines.length, qty: lines.reduce((s, l) => s + l.qty, 0), amount: lines.reduce((s, l) => s + l.qty * l.rate, 0), status: po.status,
      };
    })
    .sort((a, b) => (a.date < b.date ? 1 : -1));
}

export interface PurchaseVsSalesRow {
  date: string;
  purchase: number;
  sales: number;
  margin: number;
}

export function purchaseVsSales(db: Database, from: string, to: string): PurchaseVsSalesRow[] {
  const byDate = new Map<string, { purchase: number; sales: number }>();
  for (const po of db.purchaseOrders) {
    if (po.purchaseDate < from || po.purchaseDate > to) continue;
    const amt = db.purchaseOrderItems.filter((l) => l.purchaseOrderId === po.id).reduce((s, l) => s + l.qty * l.rate, 0);
    const cur = byDate.get(po.purchaseDate) ?? { purchase: 0, sales: 0 };
    cur.purchase += amt;
    byDate.set(po.purchaseDate, cur);
  }
  for (const inv of db.invoices) {
    if (inv.invoiceDate < from || inv.invoiceDate > to) continue;
    const cur = byDate.get(inv.invoiceDate) ?? { purchase: 0, sales: 0 };
    cur.sales += inv.total;
    byDate.set(inv.invoiceDate, cur);
  }
  return [...byDate.entries()].map(([date, v]) => ({ date, purchase: Math.round(v.purchase), sales: Math.round(v.sales), margin: Math.round(v.sales - v.purchase) })).sort((a, b) => (a.date < b.date ? -1 : 1));
}

export interface ReceivingReportRow {
  grnNo: string;
  poNo: string;
  supplier: string;
  date: string;
  lines: number;
  shortageLines: number;
  status: string;
}

export function receivingReport(db: Database, from: string, to: string): ReceivingReportRow[] {
  return db.receivings
    .filter((g) => g.receivedAt.slice(0, 10) >= from && g.receivedAt.slice(0, 10) <= to)
    .map((g) => {
      const po = db.purchaseOrders.find((p) => p.id === g.purchaseOrderId);
      const lines = db.receivingItems.filter((ri) => ri.receivingId === g.id);
      return {
        grnNo: g.grnNo, poNo: po?.poNo ?? '—', supplier: db.suppliers.find((s) => s.id === po?.supplierId)?.name ?? '—',
        date: g.receivedAt.slice(0, 10), lines: lines.length, shortageLines: lines.filter((l) => l.receivedQty < l.orderedQty).length, status: g.status,
      };
    })
    .sort((a, b) => (a.date < b.date ? 1 : -1));
}

export interface DeliveryReportRow {
  date: string;
  total: number;
  delivered: number;
  partial: number;
  failed: number;
  onTimePct: number;
}

export function deliveryReport(db: Database, from: string, to: string): DeliveryReportRow[] {
  const byDate = new Map<string, DeliveryReportRow>();
  for (const c of db.challans) {
    if (c.challanDate < from || c.challanDate > to) continue;
    const cur = byDate.get(c.challanDate) ?? { date: c.challanDate, total: 0, delivered: 0, partial: 0, failed: 0, onTimePct: 0 };
    cur.total += 1;
    if (c.status === 'Delivered') cur.delivered += 1;
    if (c.status === 'Partial') cur.partial += 1;
    if (c.status === 'Failed') cur.failed += 1;
    byDate.set(c.challanDate, cur);
  }
  return [...byDate.values()].map((r) => ({ ...r, onTimePct: r.total ? Math.round(((r.delivered + r.partial) / r.total) * 100) : 0 })).sort((a, b) => (a.date < b.date ? 1 : -1));
}
