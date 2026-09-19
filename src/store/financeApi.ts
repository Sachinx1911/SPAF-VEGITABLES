import { api } from '../lib/api';
import type { InvoiceStatus, PaymentMode, Unit } from '../types/models';

/**
 * Invoices, payments, outstanding and the ledger, against the server.
 *
 * Every figure here is worked out server-side on the way out. Invoice status is
 * never stored — it is derived from the payments and the due date each time —
 * and the running ledger balance is recomputed rather than kept, because a
 * stored balance drifts the moment a back-dated payment lands.
 */

/* -------------------------------------------------------------- invoices */

export interface InvoiceRow {
  id: string;
  invoiceNo: string;
  customerId: string;
  customerName: string | null;
  orderId: string;
  invoiceDate: string;
  dueDate: string;
  subtotal: number;
  taxAmount: number;
  total: number;
  paid: number;
  balance: number;
  daysOverdue: number;
  status: InvoiceStatus;
}

export interface InvoiceQuery {
  customerId?: string;
  status?: string;
  from?: string;
  to?: string;
  perPage?: number;
}

export function fetchInvoices(q: InvoiceQuery = {}): Promise<{
  data: InvoiceRow[];
  total: number;
  currentPage: number;
  lastPage: number;
}> {
  return api.get('/invoices', {
    customer_id: q.customerId,
    status: q.status,
    from: q.from,
    to: q.to,
    per_page: q.perPage ?? 100,
  });
}

export interface InvoiceLine {
  itemName: string;
  unit: Unit;
  qty: number;
  rate: number;
  taxRate: number;
  amount: number;
}

export function fetchInvoice(id: string): Promise<{
  invoice: InvoiceRow;
  customer: unknown;
  lines: InvoiceLine[];
  payments: unknown[];
}> {
  return api.get(`/invoices/${id}`);
}

/** Orders delivered but not yet billed. */
export function fetchInvoiceable(): Promise<{
  orders: { orderId: string; orderNo: string; customerName: string; deliveryDate: string; value: number }[];
}> {
  return api.get('/invoices/ready');
}

/**
 * Bills an order. The quantities are not sent: the server bills what was
 * delivered, so a customer who refused crates at the door is not charged for
 * them, and a browser cannot decide otherwise.
 */
export async function generateInvoiceApi(orderId: string, invoiceDate?: string): Promise<InvoiceRow> {
  const res = await api.post<{ invoice: InvoiceRow }>('/invoices', {
    order_id: orderId,
    invoice_date: invoiceDate,
  });

  return res.invoice;
}

/* -------------------------------------------------------------- payments */

export interface PaymentPayload {
  invoiceId: string;
  amount: number;
  paymentDate: string;
  mode: PaymentMode;
  reference?: string;
  remarks?: string;
}

/**
 * Records money against an invoice. The server refuses anything above the
 * balance — an overpayment is nearly always a duplicate entry, and it would
 * corrupt every outstanding figure downstream.
 */
export function recordPaymentApi(input: PaymentPayload): Promise<{
  payment: { id: string | number; receipt_no: string };
  invoiceStatus: InvoiceStatus;
  balance: number;
}> {
  return api.post('/payments', {
    invoice_id: input.invoiceId,
    amount: input.amount,
    payment_date: input.paymentDate,
    mode: input.mode,
    reference: input.reference ?? '',
    remarks: input.remarks ?? '',
  });
}

export function fetchPayments(q: { customerId?: string; mode?: string; from?: string; to?: string } = {}): Promise<{
  data: unknown[];
  total: number;
}> {
  return api.get('/payments', {
    customer_id: q.customerId,
    mode: q.mode,
    from: q.from,
    to: q.to,
    per_page: 100,
  });
}

/* ----------------------------------------------------------- outstanding */

export interface OutstandingRow {
  customerId: string;
  customerName: string;
  customerCode: string;
  city: string;
  type: string;
  creditLimit: number;
  total: number;
  current: number;
  d1_30: number;
  d31_60: number;
  d61_90: number;
  d90plus: number;
  invoiceCount: number;
  oldestDueDate: string;
  status: 'Current' | 'Overdue';
}

export function fetchOutstanding(asOf?: string): Promise<{
  asOf: string;
  rows: OutstandingRow[];
  summary: {
    total: number;
    customers: number;
    overdue: number;
    over60: number;
    buckets: Record<string, number>;
  };
}> {
  return api.get('/outstanding', { as_of: asOf });
}

/* ---------------------------------------------------------------- ledger */

export interface LedgerRowApi {
  date: string;
  type: 'Opening' | 'Invoice' | 'Payment';
  reference: string;
  description: string;
  debit: number;
  credit: number;
  balance: number;
  status: string;
}

export function fetchLedger(customerId: string, from?: string, to?: string): Promise<{
  customer: unknown;
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
  return api.get(`/ledger/${customerId}`, { from, to });
}
