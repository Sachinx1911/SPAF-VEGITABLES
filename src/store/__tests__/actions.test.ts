import { beforeEach, describe, expect, it } from 'vitest';
import { useStore } from '../useStore';
import { generateSeed } from '../../data/seed/generate';
import { approveOrder, createOrder, lockConsolidation, rejectOrder } from '../orderActions';
import { recordPayment } from '../financeActions';
import { invoiceViews } from '../../domain/finance';
import type { Database } from '../../types/models';

/** Each test starts from a clean seed so one test cannot colour the next. */
function reset(): Database {
  const db = generateSeed();
  useStore.setState({ db, session: null });
  return db;
}

const USER = 'u_ops';

describe('createOrder', () => {
  beforeEach(reset);

  it('records the ordered quantity and leaves every later stage empty', async () => {
    const db = useStore.getState().db;
    const item = db.items[0];
    const order = await createOrder(
      {
        customerId: db.customers[0].id,
        deliveryDate: '2026-09-20',
        lines: [{ itemId: item.id, unit: item.unit, qty: 7, rate: 50 }],
      },
      USER,
    );
    const line = useStore.getState().db.orderItems.find((l) => l.orderId === order.id)!;
    expect(line.qty.ordered).toBe(7);
    expect(line.qty.approved).toBeNull();
    expect(line.qty.delivered).toBeNull();
    expect(line.qty.paid).toBeNull();
  });

  it('writes an audit entry for the new order', async () => {
    const db = useStore.getState().db;
    const before = db.auditLogs.length;
    const order = await createOrder(
      { customerId: db.customers[0].id, deliveryDate: '2026-09-20', lines: [{ itemId: db.items[0].id, unit: db.items[0].unit, qty: 1, rate: 10 }] },
      USER,
    );
    const after = useStore.getState().db;
    expect(after.auditLogs.length).toBe(before + 1);
    expect(after.auditLogs[0].recordRef).toBe(order.orderNo);
  });

  it('parks a draft without flagging it late', async () => {
    const db = useStore.getState().db;
    const order = await createOrder(
      { customerId: db.customers[0].id, deliveryDate: '2026-09-20', draft: true, lines: [{ itemId: db.items[0].id, unit: db.items[0].unit, qty: 1, rate: 10 }] },
      USER,
    );
    expect(order.status).toBe('Draft');
    expect(order.isLate).toBe(false);
  });
});

describe('approveOrder', () => {
  beforeEach(reset);

  it('fills approved without touching ordered', async () => {
    const db = useStore.getState().db;
    const order = db.orders.find((o) => o.status === 'Submitted' || o.status === 'Late')!;
    const before = db.orderItems.filter((l) => l.orderId === order.id).map((l) => l.qty.ordered);

    await approveOrder(order.id, USER);

    const after = useStore.getState().db.orderItems.filter((l) => l.orderId === order.id);
    expect(after.map((l) => l.qty.ordered)).toEqual(before);
    expect(after.every((l) => l.qty.approved === l.qty.ordered)).toBe(true);
  });

  it('stamps who approved it and when', async () => {
    const db = useStore.getState().db;
    const order = db.orders.find((o) => o.status === 'Submitted' || o.status === 'Late')!;
    await approveOrder(order.id, USER);
    const updated = useStore.getState().db.orders.find((o) => o.id === order.id)!;
    expect(updated.status).toBe('Approved');
    expect(updated.approvedBy).toBe(USER);
    expect(updated.approvedAt).toBeTruthy();
  });

  it('honours a reduced quantity while still preserving what was ordered', async () => {
    const db = useStore.getState().db;
    const order = db.orders.find((o) => o.status === 'Submitted' || o.status === 'Late')!;
    const line = db.orderItems.find((l) => l.orderId === order.id)!;
    const ordered = line.qty.ordered!;

    await approveOrder(order.id, USER, { [line.id]: ordered - 1 });

    const after = useStore.getState().db.orderItems.find((l) => l.id === line.id)!;
    expect(after.qty.ordered).toBe(ordered);
    expect(after.qty.approved).toBe(ordered - 1);
  });
});

describe('rejectOrder', () => {
  beforeEach(reset);

  it('marks the order rejected, keeps the reason, and never fills approved', async () => {
    const db = useStore.getState().db;
    const order = db.orders.find((o) => o.status === 'Submitted' || o.status === 'Late')!;
    await rejectOrder(order.id, 'Cutoff missed', USER);
    const after = useStore.getState().db;
    const updated = after.orders.find((o) => o.id === order.id)!;
    expect(updated.status).toBe('Rejected');
    expect(updated.remarks).toBe('Cutoff missed');
    expect(after.orderItems.filter((l) => l.orderId === order.id).every((l) => l.qty.approved === null)).toBe(true);
  });
});

describe('lockConsolidation', () => {
  beforeEach(reset);

  it('locks the approved orders for the date and generates a requirement from them', async () => {
    const db = useStore.getState().db;
    const date = '2026-09-21';
    const item = db.items[0];
    const a = await createOrder({ customerId: db.customers[0].id, deliveryDate: date, lines: [{ itemId: item.id, unit: item.unit, qty: 4, rate: 10 }] }, USER);
    const b = await createOrder({ customerId: db.customers[1].id, deliveryDate: date, lines: [{ itemId: item.id, unit: item.unit, qty: 6, rate: 10 }] }, USER);
    await approveOrder(a.id, USER);
    await approveOrder(b.id, USER);

    await lockConsolidation(date, USER);

    const after = useStore.getState().db;
    expect(after.orders.find((o) => o.id === a.id)!.status).toBe('Locked');
    expect(after.orders.find((o) => o.id === b.id)!.status).toBe('Locked');

    const requirement = after.requirements.find((r) => r.deliveryDate === date && r.itemId === item.id)!;
    expect(requirement.requiredQty).toBe(10); // both orders summed
  });

  it('leaves orders that were never approved out of the lock', async () => {
    const db = useStore.getState().db;
    const date = '2026-09-22';
    const item = db.items[0];
    const pending = await createOrder({ customerId: db.customers[0].id, deliveryDate: date, lines: [{ itemId: item.id, unit: item.unit, qty: 5, rate: 10 }] }, USER);

    await lockConsolidation(date, USER);

    expect(useStore.getState().db.orders.find((o) => o.id === pending.id)!.status).not.toBe('Locked');
  });
});

describe('recordPayment', () => {
  beforeEach(reset);

  it('moves an invoice to Paid once the balance is cleared', async () => {
    const db = useStore.getState().db;
    const open = invoiceViews(db, '2026-09-13').find((i) => i.balance > 0)!;
    await recordPayment(
      { invoiceId: open.id, customerId: open.customerId, amount: open.balance, mode: 'UPI', reference: 'TEST-1', paymentDate: '2026-09-13', remarks: '' },
      USER,
    );
    const after = invoiceViews(useStore.getState().db, '2026-09-13').find((i) => i.id === open.id)!;
    expect(after.balance).toBe(0);
    expect(after.derivedStatus).toBe('Paid');
  });

  it('leaves an invoice Partially Paid when only part of the balance is settled', async () => {
    const db = useStore.getState().db;
    const open = invoiceViews(db, '2026-09-13').find((i) => i.balance > 100 && i.dueDate >= '2026-09-13')!;
    await recordPayment(
      { invoiceId: open.id, customerId: open.customerId, amount: 50, mode: 'Cash', reference: 'TEST-2', paymentDate: '2026-09-13', remarks: '' },
      USER,
    );
    const after = invoiceViews(useStore.getState().db, '2026-09-13').find((i) => i.id === open.id)!;
    expect(after.paid).toBe(open.paid + 50);
    expect(after.derivedStatus).toBe('Partially Paid');
  });
});
