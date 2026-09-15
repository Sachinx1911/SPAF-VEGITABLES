import type { Customer, CustomerItemPrice, Item } from '../types/models';
import { useStore } from './useStore';
import { uid } from '../lib/id';
import { nowISO } from '../lib/clock';
import { addDays } from '../lib/format';

/**
 * Business actions. Every mutation goes through here so the single-source-of-truth
 * rule holds: pages never poke store tables directly, and every change is audited.
 */

export function nextCustomerCode(customers: Customer[]): string {
  const n = customers.reduce((max, c) => {
    const m = /^SPC-(\d+)$/.exec(c.code);
    return m ? Math.max(max, Number(m[1])) : max;
  }, 0);
  return `SPC-${String(n + 1).padStart(3, '0')}`;
}

export function nextItemCode(items: Item[], prefix: string): string {
  const n = items.reduce((max, it) => {
    const m = new RegExp(`^${prefix}-(\\d+)$`).exec(it.code);
    return m ? Math.max(max, Number(m[1])) : max;
  }, 0);
  return `${prefix}-${String(n + 1).padStart(3, '0')}`;
}

type NewCustomer = Omit<Customer, 'id' | 'routeCode' | 'shortLabel' | 'routeOrder' | 'createdAt' | 'active'> & { active?: boolean };

export function addCustomer(input: NewCustomer, userId: string): Customer {
  const { db, commit } = useStore.getState();
  const routeCode = `U${db.customers.length + 1}`; // user-added customers get a synthetic route code
  const customer: Customer = {
    ...input,
    id: uid('c'),
    routeCode,
    shortLabel: input.name.split(/\s+/)[0]!.slice(0, 12).toUpperCase(),
    routeOrder: db.customers.length + 1,
    active: input.active ?? true,
    createdAt: nowISO(),
  };
  commit((d) => ({ customers: [...d.customers, customer] }));
  audit(userId, 'Customer created', 'customers', customer.code, customer.id, '', customer.name);
  return customer;
}

export function updateCustomer(id: string, patch: Partial<Customer>, userId: string) {
  const { db, commit } = useStore.getState();
  const before = db.customers.find((c) => c.id === id);
  commit((d) => ({ customers: d.customers.map((c) => (c.id === id ? { ...c, ...patch } : c)) }));
  if (before) {
    const changedKeys = Object.keys(patch).filter((k) => (patch as any)[k] !== (before as any)[k]);
    if (changedKeys.length) {
      audit(
        userId, 'Customer updated', 'customers', before.code, before.id,
        changedKeys.map((k) => `${k}: ${(before as any)[k]}`).join(', '),
        changedKeys.map((k) => `${k}: ${(patch as any)[k]}`).join(', '),
      );
    }
  }
}

export function setCustomerActive(id: string, active: boolean, userId: string) {
  updateCustomer(id, { active }, userId);
}

type NewItem = Omit<Item, 'id' | 'stock' | 'sortOrder' | 'active'> & { active?: boolean };

const CAT_PREFIX: Record<string, string> = {
  'Indian Vegetables': 'IV', 'Imported Produce': 'IP', 'Herbs & Leafy': 'HL', 'Fresh Fruits': 'FF', 'Exotic Vegetables': 'EX',
};

export function addItem(input: NewItem, userId: string): Item {
  const { db, commit } = useStore.getState();
  const item: Item = {
    ...input,
    id: uid('i'),
    stock: 0,
    sortOrder: db.items.length + 1,
    active: input.active ?? true,
  };
  commit((d) => ({ items: [...d.items, item] }));
  audit(userId, 'Item created', 'items', item.code, null, '', `${item.name} (${item.unit})`);
  return item;
}

export function updateItem(id: string, patch: Partial<Item>, userId: string) {
  const { db, commit } = useStore.getState();
  const before = db.items.find((i) => i.id === id);
  commit((d) => ({ items: d.items.map((i) => (i.id === id ? { ...i, ...patch } : i)) }));
  if (before) {
    const changedKeys = Object.keys(patch).filter((k) => (patch as any)[k] !== (before as any)[k]);
    if (changedKeys.length) {
      audit(
        userId, 'Item updated', 'items', before.code, null,
        changedKeys.map((k) => `${k}: ${(before as any)[k]}`).join(', '),
        changedKeys.map((k) => `${k}: ${(patch as any)[k]}`).join(', '),
      );
    }
  }
}

export function setItemActive(id: string, active: boolean, userId: string) {
  updateItem(id, { active }, userId);
}

export function suggestItemCode(category: string, items: Item[]) {
  return nextItemCode(items, CAT_PREFIX[category] ?? 'GN');
}

/** Sets a new customer-specific price, closing out the previous active one (never overwritten in place). */
export function setCustomerPrice(
  input: { customerId: string; itemId: string; unit: CustomerItemPrice['unit']; price: number; effectiveFrom: string },
  userId: string,
) {
  const { db, commit } = useStore.getState();
  const dayBefore = addDays(input.effectiveFrom, -1);
  const newRow: CustomerItemPrice = { id: uid('p'), effectiveTo: null, ...input };
  commit((d) => ({
    prices: [
      ...d.prices.map((p) =>
        p.customerId === input.customerId && p.itemId === input.itemId && p.unit === input.unit && !p.effectiveTo
          ? { ...p, effectiveTo: dayBefore }
          : p,
      ),
      newRow,
    ],
  }));
  const item = db.items.find((i) => i.id === input.itemId);
  audit(userId, 'Price changed', 'prices', `${item?.name} · ${item?.unit}`, input.customerId, '', `₹${input.price.toFixed(2)} from ${input.effectiveFrom}`);
}

function audit(
  userId: string, action: string, module: 'customers' | 'items' | 'prices',
  recordRef: string, customerId: string | null, oldValue: string, newValue: string,
) {
  const { commit } = useStore.getState();
  commit((d) => ({
    auditLogs: [
      { id: uid('a'), at: nowISO(), userId, action, module, recordRef, customerId, oldValue, newValue, device: 'Chrome · Windows', status: 'Success' as const },
      ...d.auditLogs,
    ],
  }));
}
