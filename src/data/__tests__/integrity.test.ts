import { describe, expect, it } from 'vitest';
import { generateSeed } from '../seed/generate';

/**
 * Whole-dataset invariants. These are the checks that would otherwise only be
 * caught by clicking through the app, so they run on every build instead.
 */
describe('dataset integrity', () => {
  const db = generateSeed();

  it('is deterministic — the same seed produces the same data twice', () => {
    const again = generateSeed();
    expect(again.orders.length).toBe(db.orders.length);
    expect(again.orderItems.length).toBe(db.orderItems.length);
    expect(again.invoices.length).toBe(db.invoices.length);
    expect(again.customers.map((c) => c.code)).toEqual(db.customers.map((c) => c.code));
  });

  it('treats Item + Unit as one unique SKU', () => {
    const skus = db.items.map((i) => `${i.name}|${i.unit}`);
    expect(new Set(skus).size).toBe(skus.length);
  });

  it('gives every customer and item a unique code', () => {
    expect(new Set(db.customers.map((c) => c.code)).size).toBe(db.customers.length);
    expect(new Set(db.items.map((i) => i.code)).size).toBe(db.items.length);
  });

  it('gives every order, invoice and payment a unique number', () => {
    expect(new Set(db.orders.map((o) => o.orderNo)).size).toBe(db.orders.length);
    expect(new Set(db.invoices.map((i) => i.invoiceNo)).size).toBe(db.invoices.length);
    expect(new Set(db.payments.map((p) => p.receiptNo)).size).toBe(db.payments.length);
  });

  it('points every order line at a real order and a real item', () => {
    const orderIds = new Set(db.orders.map((o) => o.id));
    const itemIds = new Set(db.items.map((i) => i.id));
    expect(db.orderItems.filter((l) => !orderIds.has(l.orderId))).toEqual([]);
    expect(db.orderItems.filter((l) => !itemIds.has(l.itemId))).toEqual([]);
  });

  it('points every order at a real customer, and every customer at a real route', () => {
    const customerIds = new Set(db.customers.map((c) => c.id));
    const routeIds = new Set(db.routes.map((r) => r.id));
    expect(db.orders.filter((o) => !customerIds.has(o.customerId))).toEqual([]);
    expect(db.customers.filter((c) => !routeIds.has(c.routeId))).toEqual([]);
  });

  it('points every payment at a real invoice and customer', () => {
    const invoiceIds = new Set(db.invoices.map((i) => i.id));
    const customerIds = new Set(db.customers.map((c) => c.id));
    expect(db.payments.filter((p) => !invoiceIds.has(p.invoiceId))).toEqual([]);
    expect(db.payments.filter((p) => !customerIds.has(p.customerId))).toEqual([]);
  });

  it('never collects more against an invoice than the invoice is worth', () => {
    const paidBy = new Map<string, number>();
    for (const p of db.payments) paidBy.set(p.invoiceId, (paidBy.get(p.invoiceId) ?? 0) + p.amount);
    const overpaid = db.invoices.filter((inv) => (paidBy.get(inv.id) ?? 0) > inv.total + 0.5);
    expect(overpaid.map((i) => i.invoiceNo)).toEqual([]);
  });

  it('gives every challan a matching order and customer', () => {
    const orderIds = new Set(db.orders.map((o) => o.id));
    const customerIds = new Set(db.customers.map((c) => c.id));
    expect(db.challans.filter((c) => !orderIds.has(c.orderId))).toEqual([]);
    expect(db.challans.filter((c) => !customerIds.has(c.customerId))).toEqual([]);
  });

  it('assigns every user a role that exists', () => {
    const roleKeys = new Set(db.roles.map((r) => r.key));
    expect(db.users.filter((u) => !roleKeys.has(u.role))).toEqual([]);
  });

  it('links every customer-portal user to a real customer', () => {
    const customerIds = new Set(db.customers.map((c) => c.id));
    const portalUsers = db.users.filter((u) => u.role === 'customer');
    expect(portalUsers.length).toBeGreaterThan(0);
    expect(portalUsers.filter((u) => !u.customerId || !customerIds.has(u.customerId))).toEqual([]);
  });

  it('never prices an item at or below zero', () => {
    expect(db.items.filter((i) => i.defaultSellingPrice <= 0)).toEqual([]);
    expect(db.prices.filter((p) => p.price <= 0)).toEqual([]);
  });

  it('records an audit trail', () => {
    expect(db.auditLogs.length).toBeGreaterThan(0);
    const userIds = new Set(db.users.map((u) => u.id));
    expect(db.auditLogs.filter((a) => !userIds.has(a.userId))).toEqual([]);
  });
});
