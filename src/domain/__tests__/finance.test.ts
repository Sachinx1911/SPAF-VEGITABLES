import { describe, expect, it } from 'vitest';
import { generateSeed } from '../../data/seed/generate';
import { buildLedger, customerAgingRows, invoiceViews, outstandingAsOf, outstandingSummary } from '../finance';
import type { Database } from '../../types/models';

const TODAY = '2026-09-13';

/** A tiny hand-built database, so each assertion has one obvious cause. */
function fixture(): Database {
  const db = generateSeed();
  const customerId = db.customers[0].id;
  return {
    ...db,
    invoices: [
      // paid in full
      { ...db.invoices[0], id: 'inv_paid', invoiceNo: 'INV-PAID', customerId, invoiceDate: '2026-09-01', dueDate: '2026-09-10', total: 1000 },
      // half paid, not yet due
      { ...db.invoices[0], id: 'inv_part', invoiceNo: 'INV-PART', customerId, invoiceDate: '2026-09-10', dueDate: '2026-09-20', total: 2000 },
      // untouched and overdue by 13 days
      { ...db.invoices[0], id: 'inv_late', invoiceNo: 'INV-LATE', customerId, invoiceDate: '2026-08-20', dueDate: '2026-08-31', total: 500 },
    ],
    payments: [
      { ...db.payments[0], id: 'p1', invoiceId: 'inv_paid', customerId, paymentDate: '2026-09-05', amount: 1000 },
      { ...db.payments[0], id: 'p2', invoiceId: 'inv_part', customerId, paymentDate: '2026-09-12', amount: 800 },
    ],
    openingBalances: [{ customerId, amount: 0, asOf: '2026-01-01' }],
  };
}

describe('invoice status is derived, never stored', () => {
  const views = invoiceViews(fixture(), TODAY);
  const byNo = (no: string) => views.find((v) => v.invoiceNo === no)!;

  it('marks a fully settled invoice Paid with no balance', () => {
    const v = byNo('INV-PAID');
    expect(v.derivedStatus).toBe('Paid');
    expect(v.balance).toBe(0);
    expect(v.daysOverdue).toBe(0);
  });

  it('marks a part-paid invoice that is not yet due Partially Paid', () => {
    const v = byNo('INV-PART');
    expect(v.derivedStatus).toBe('Partially Paid');
    expect(v.paid).toBe(800);
    expect(v.balance).toBe(1200);
  });

  it('marks an unpaid invoice past its due date Overdue, with the day count', () => {
    const v = byNo('INV-LATE');
    expect(v.derivedStatus).toBe('Overdue');
    expect(v.balance).toBe(500);
    expect(v.daysOverdue).toBe(13);
  });

  it('never lets recorded payments push the balance below zero', () => {
    const db = fixture();
    db.payments.push({ ...db.payments[0], id: 'p3', invoiceId: 'inv_paid', amount: 9999 });
    const v = invoiceViews(db, TODAY).find((x) => x.invoiceNo === 'INV-PAID')!;
    expect(v.balance).toBe(0);
    expect(v.paid).toBe(1000);
  });
});

describe('outstanding', () => {
  const db = fixture();

  it('totals only the unpaid balances', () => {
    expect(outstandingSummary(db, TODAY).total).toBe(1700); // 1200 + 500
  });

  it('counts only overdue balances as overdue', () => {
    expect(outstandingSummary(db, TODAY).overdue).toBe(500);
  });

  it('splits a customer into aging buckets that add up to their total', () => {
    const row = customerAgingRows(db, TODAY)[0];
    expect(row.total).toBe(1700);
    expect(row.current).toBe(1200); // not yet due
    expect(row.d1_30).toBe(500); // 13 days late
    expect(row.current + row.d1_30 + row.d31_60 + row.d61_90 + row.d90plus).toBe(row.total);
    expect(row.status).toBe('Overdue');
  });

  it('reconstructs a past balance from dated invoices and payments', () => {
    // On 02-09 only the first invoice existed and nothing had been paid yet.
    expect(outstandingAsOf(db, '2026-09-02')).toBe(1000 + 500);
    // By 13-09 both later payments have landed.
    expect(outstandingAsOf(db, TODAY)).toBe(1700);
  });
});

describe('customer ledger', () => {
  const db = fixture();
  const rows = buildLedger(db, db.customers[0].id);

  it('opens with the opening balance and ends at the outstanding amount', () => {
    expect(rows[0].type).toBe('Opening');
    expect(rows.at(-1)!.balance).toBe(1700);
  });

  it('keeps the running balance consistent with every debit and credit', () => {
    let running = rows[0].balance;
    for (const r of rows.slice(1)) {
      running += r.debit - r.credit;
      expect(r.balance).toBeCloseTo(running, 4);
    }
  });

  it('labels invoices as debits and payments as credits', () => {
    const inv = rows.find((r) => r.reference === 'INV-LATE')!;
    const pay = rows.find((r) => r.type === 'Payment')!;
    expect(inv.debit).toBe(500);
    expect(inv.credit).toBe(0);
    expect(pay.credit).toBeGreaterThan(0);
    expect(pay.debit).toBe(0);
  });

  it('honours a date range', () => {
    const ranged = buildLedger(db, db.customers[0].id, '2026-09-01', '2026-09-11');
    expect(ranged.every((r) => r.date >= '2026-09-01' && r.date <= '2026-09-11')).toBe(true);
  });
});
