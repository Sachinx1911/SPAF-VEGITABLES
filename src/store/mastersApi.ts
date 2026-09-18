import { api } from '../lib/api';
import type { Customer, Item, Route, Supplier } from '../types/models';

/**
 * Customers, items, prices, routes and suppliers.
 *
 * These are the tables every other screen reads through, so they are fetched
 * once after sign-in and kept in the store. The server already returns the
 * front end's own shape, so nothing is translated here.
 */

interface Paginated<T> {
  data: T[];
  total: number;
}

export async function fetchCustomers(): Promise<Customer[]> {
  const page = await api.get<Paginated<Customer>>('/customers', { per_page: 500 });
  return page.data;
}

export async function fetchItems(): Promise<Item[]> {
  const page = await api.get<Paginated<Item & { stockState: string }>>('/items', { per_page: 500 });
  return page.data;
}

export async function fetchRoutes(): Promise<Route[]> {
  const res = await api.get<{ routes: Route[] }>('/routes');
  return res.routes;
}

export async function fetchSuppliers(): Promise<Supplier[]> {
  const res = await api.get<{ suppliers: Supplier[] }>('/suppliers');
  return res.suppliers;
}

export async function fetchSettings(): Promise<Record<string, string>> {
  const res = await api.get<{ settings: Record<string, string> }>('/settings');
  return res.settings;
}

/* ------------------------------------------------------------- customers */

export type NewCustomerPayload = Partial<Customer> & { name: string; type: string; routeId: string };

export async function createCustomerApi(input: NewCustomerPayload): Promise<Customer> {
  const res = await api.post<{ customer: Customer }>('/customers', {
    name: input.name,
    code: input.code,
    legal_name: input.legalName,
    type: input.type,
    route_id: input.routeId,
    location: input.location,
    contact_person: input.contactPerson,
    mobile: input.mobile,
    email: input.email,
    billing_address: input.billingAddress,
    delivery_address: input.deliveryAddress,
    gstin: input.gstin,
    pan: input.pan,
    payment_terms_days: input.paymentTermsDays,
    credit_limit: input.creditLimit,
  });

  return res.customer;
}

export async function updateCustomerApi(id: string, patch: Partial<Customer>): Promise<Customer> {
  const res = await api.put<{ customer: Customer }>(`/customers/${id}`, {
    name: patch.name,
    type: patch.type,
    route_id: patch.routeId,
    location: patch.location,
    contact_person: patch.contactPerson,
    mobile: patch.mobile,
    email: patch.email,
    gstin: patch.gstin,
    payment_terms_days: patch.paymentTermsDays,
    credit_limit: patch.creditLimit,
    active: patch.active,
  });

  return res.customer;
}

/* ----------------------------------------------------------------- items */

export type NewItemPayload = {
  name: string;
  unit: string;
  category: string;
  defaultPurchasePrice: number;
  defaultSellingPrice?: number;
  minStock?: number;
  reorderLevel?: number;
  taxRate?: number;
};

export async function createItemApi(input: NewItemPayload): Promise<Item> {
  const res = await api.post<{ item: Item }>('/items', {
    name: input.name,
    // Item + Unit is the SKU, and the server enforces the pair is unique.
    unit: input.unit,
    category: input.category,
    default_purchase_price: input.defaultPurchasePrice,
    default_selling_price: input.defaultSellingPrice,
    min_stock: input.minStock,
    reorder_level: input.reorderLevel,
    tax_rate: input.taxRate,
  });

  return res.item;
}

export async function updateItemApi(id: string, patch: Partial<Item>): Promise<Item> {
  const res = await api.put<{ item: Item }>(`/items/${id}`, {
    name: patch.name,
    category: patch.category,
    default_purchase_price: patch.defaultPurchasePrice,
    default_selling_price: patch.defaultSellingPrice,
    min_stock: patch.minStock,
    reorder_level: patch.reorderLevel,
    tax_rate: patch.taxRate,
    active: patch.active,
  });

  return res.item;
}

/* ---------------------------------------------------------------- prices */

/**
 * Sets a customer price from a date. The previous one is closed off rather than
 * edited, so an invoice raised last week still explains itself at the rate that
 * applied then.
 */
export function setCustomerPriceApi(customerId: string, itemId: string, price: number, effectiveFrom: string): Promise<unknown> {
  return api.post('/prices', {
    customer_id: customerId,
    item_id: itemId,
    price,
    effective_from: effectiveFrom,
  });
}

export function fetchStock(): Promise<{ rows: { itemId: string; name: string; unit: string; stock: number; state: string }[] }> {
  return api.get('/stock');
}
