import type { Database, Invoice, InvoiceStatus, Order } from '../types/models';
import { daysBetween } from '../lib/format';

export interface InvoiceView extends Invoice {
  paid: number;
  balance: number;
  derivedStatus: InvoiceStatus;
  daysOverdue: number;
}

/** Paid/Partially Paid/Overdue are derived from payments — never stored on the invoice. */
export function invoiceViews(db: Database, today: string): InvoiceView[] {
  const paidBy = new Map<string, number>();
  for (const p of db.payments) paidBy.set(p.invoiceId, (paidBy.get(p.invoiceId) ?? 0) + p.amount);
  return db.invoices.map((inv) => {
    const paid = Math.min(paidBy.get(inv.id) ?? 0, inv.total);
    const balance = Math.max(inv.total - paid, 0);
    const daysOverdue = balance > 0 ? Math.max(daysBetween(inv.dueDate, today), 0) : 0;
    let derivedStatus: InvoiceStatus = inv.status;
    if (balance <= 0) derivedStatus = 'Paid';
    else if (daysOverdue > 0) derivedStatus = 'Overdue';
    else if (paid > 0) derivedStatus = 'Partially Paid';
    return { ...inv, paid, balance, derivedStatus, daysOverdue };
  });
}

export interface OutstandingSummary {
  total: number;
  overdue: number;
  dueToday: number;
  dueSoon: number; // next 7 days
  aging: { label: string; amount: number; count: number }[];
  customers: number;
}

export function outstandingSummary(db: Database, today: string): OutstandingSummary {
  const open = invoiceViews(db, today).filter((i) => i.balance > 0);
  const buckets = [
    { label: '0–30 days', min: 0, max: 30 },
    { label: '31–60 days', min: 31, max: 60 },
    { label: '61–90 days', min: 61, max: 90 },
    { label: '90+ days', min: 91, max: Infinity },
  ];
  return {
    total: open.reduce((s, i) => s + i.balance, 0),
    overdue: open.filter((i) => i.daysOverdue > 0).reduce((s, i) => s + i.balance, 0),
    dueToday: open.filter((i) => i.dueDate === today).reduce((s, i) => s + i.balance, 0),
    dueSoon: open
      .filter((i) => {
        const d = daysBetween(today, i.dueDate);
        return d > 0 && d <= 7;
      })
      .reduce((s, i) => s + i.balance, 0),
    aging: buckets.map((b) => {
      const rows = open.filter((i) => {
        const age = daysBetween(i.invoiceDate, today);
        return age >= b.min && age <= b.max;
      });
      return { label: b.label, amount: rows.reduce((s, i) => s + i.balance, 0), count: rows.length };
    }),
    customers: new Set(open.map((i) => i.customerId)).size,
  };
}

/** Orders that have been delivered/accepted but not yet invoiced — Create Invoice's queue. */
export function ordersReadyToInvoice(db: Database): Order[] {
  return db.orders.filter((o) => o.invoiceStatus === 'Ready' && (o.status === 'Completed' || o.status === 'Partially Fulfilled'));
}

export function customerOutstanding(db: Database, today: string): Map<string, number> {
  const m = new Map<string, number>();
  for (const i of invoiceViews(db, today)) if (i.balance > 0) m.set(i.customerId, (m.get(i.customerId) ?? 0) + i.balance);
  return m;
}

export interface LedgerRow {
  date: string;
  reference: string;
  description: string;
  debit: number;
  credit: number;
  balance: number;
}

/** Running-balance statement for one customer: every invoice (debit) and payment (credit), oldest first. */
export function buildLedger(db: Database, customerId: string, from?: string, to?: string): LedgerRow[] {
  const opening = db.openingBalances.find((o) => o.customerId === customerId)?.amount ?? 0;
  const openingAt = db.openingBalances.find((o) => o.customerId === customerId)?.asOf ?? '2026-01-01';

  type Entry = { date: string; ref: string; desc: string; debit: number; credit: number };
  const entries: Entry[] = [];
  for (const inv of db.invoices.filter((i) => i.customerId === customerId)) {
    entries.push({ date: inv.invoiceDate, ref: inv.invoiceNo, desc: 'Sales invoice', debit: inv.total, credit: 0 });
  }
  for (const p of db.payments.filter((x) => x.customerId === customerId)) {
    const inv = db.invoices.find((i) => i.id === p.invoiceId);
    entries.push({ date: p.paymentDate, ref: p.receiptNo, desc: `Payment received${inv ? ` · ${inv.invoiceNo}` : ''} (${p.mode})`, debit: 0, credit: p.amount });
  }
  entries.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  const rows: LedgerRow[] = [{ date: openingAt, reference: 'Opening', description: 'Opening balance', debit: opening > 0 ? opening : 0, credit: opening < 0 ? -opening : 0, balance: opening }];
  let balance = opening;
  for (const e of entries) {
    balance += e.debit - e.credit;
    rows.push({ date: e.date, reference: e.ref, description: e.desc, debit: e.debit, credit: e.credit, balance });
  }
  return rows.filter((r) => (!from || r.date >= from) && (!to || r.date <= to));
}
