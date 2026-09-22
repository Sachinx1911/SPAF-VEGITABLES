import { api } from '../lib/api';
import { toLine, toOrder } from './ordersApi';
import type { InvoiceRow, LedgerRowApi } from './financeApi';
import type { Customer, CustomerItemPrice, Item, Order, OrderItem, StandingOrderTemplate } from '../types/models';

/**
 * The customer's own portal.
 *
 * A portal login holds `portal` permission and nothing else, so none of the
 * staff endpoints will answer it. These return the same shapes their staff
 * counterparts do — the portal screens read the same store tables as the office
 * screens, and a portal-only shape would mean a second set of mappings to keep
 * in step with the first.
 *
 * No customer id is ever sent: the server takes it from the token.
 */

export interface PortalSummary {
  customer: Customer;
  cutoffTime: string;
  nextDeliveryDate: string;
  pendingOrder: { id: string; orderNo: string; status: string; lines: number } | null;
  arrivingToday: boolean;
  outstanding: number;
}

export async function fetchPortalSummary(): Promise<PortalSummary> {
  return api.get<PortalSummary>('/portal/summary');
}

export async function fetchPortalCatalogue(forDate?: string): Promise<{ items: Item[]; prices: CustomerItemPrice[] }> {
  const res = await api.get<{ items: Item[]; prices: CustomerItemPrice[] }>('/portal/catalogue', { for_date: forDate });
  return { items: res.items, prices: res.prices };
}

export async function fetchPortalOrders(): Promise<{ orders: Order[]; lines: OrderItem[] }> {
  const res = await api.get<{ orders: Parameters<typeof toOrder>[0][] }>('/portal/orders');

  return {
    orders: res.orders.map(toOrder),
    lines: res.orders.flatMap((o) => (o.lines ?? []).map(toLine)),
  };
}

export async function fetchPortalInvoices(): Promise<InvoiceRow[]> {
  const res = await api.get<{ data: InvoiceRow[] }>('/portal/invoices', { per_page: 200 });
  return res.data;
}

export function fetchPortalLedger(): Promise<{
  rows: LedgerRowApi[];
  summary: {
    openingBalance: number;
    totalInvoiced: number;
    totalPaid: number;
    closingBalance: number;
    creditLimit: number;
    availableCredit: number;
  };
}> {
  return api.get('/portal/ledger');
}

export async function fetchPortalTemplates(): Promise<StandingOrderTemplate[]> {
  const res = await api.get<{ templates: StandingOrderTemplate[] }>('/portal/templates');
  return res.templates;
}

export async function savePortalTemplateApi(name: string, lines: { itemId: string; unit: string; qty: number }[]): Promise<StandingOrderTemplate> {
  const res = await api.post<{ template: StandingOrderTemplate }>('/portal/templates', {
    name,
    lines: lines.map((l) => ({ item_id: l.itemId, unit: l.unit, qty: l.qty })),
  });

  return res.template;
}

export async function deletePortalTemplateApi(id: string): Promise<void> {
  await api.delete(`/portal/templates/${id}`);
}
