import type { Invoice, InvoiceItem, Payment, PaymentMode } from '../types/models';
import { useStore } from './useStore';
import { uid } from '../lib/id';
import { nowISO, todayISO } from '../lib/clock';
import { addDays } from '../lib/format';
import { API_MODE } from '../lib/api';
import { generateInvoiceApi, recordPaymentApi, type PaymentPayload } from './financeApi';

function auditRow(userId: string, action: string, module: string, recordRef: string, customerId: string | null, oldValue: string, newValue: string) {
  return { id: uid('a'), at: nowISO(), userId, action, module: module as any, recordRef, customerId, oldValue, newValue, device: 'Chrome · Windows', status: 'Success' as const };
}

let invSeq = 2000;
let rcptSeq = 500;

/**
 * Generates an invoice from an order's delivered quantities.
 *
 * In API mode: the server looks up the delivered quantities and prices — the
 * browser never supplies quantities, so it cannot manufacture an invoice for
 * produce that was refused at the door.
 */
export async function generateInvoice(orderId: string, userId: string): Promise<Invoice> {
  if (API_MODE) {
    const apiInv = await generateInvoiceApi(orderId);
    // Map the API row to a minimal Invoice for the store so InvoiceDetail can open it.
    const { commit } = useStore.getState();
    const invoice: Invoice = {
      id: String(apiInv.id), invoiceNo: apiInv.invoiceNo, customerId: String(apiInv.customerId),
      orderId: String(apiInv.orderId), challanId: null,
      invoiceDate: apiInv.invoiceDate, dueDate: apiInv.dueDate,
      subtotal: apiInv.subtotal, taxAmount: apiInv.taxAmount, total: apiInv.total,
      status: 'Generated', createdBy: userId, createdAt: nowISO(),
    };
    commit((d) => ({
      invoices: [...d.invoices.filter((i) => i.orderId !== orderId), invoice],
      orders: d.orders.map((o) => (o.id === orderId ? { ...o, invoiceStatus: 'Invoiced' } : o)),
    }));
    return invoice;
  }

  return generateInvoiceLocal(orderId, userId);
}

function generateInvoiceLocal(orderId: string, userId: string): Invoice {
  const { db, commit } = useStore.getState();
  const order = db.orders.find((o) => o.id === orderId)!;
  const customer = db.customers.find((c) => c.id === order.customerId)!;
  const lines = db.orderItems.filter((l) => l.orderId === orderId && (l.qty.customerAccepted ?? 0) > 0);
  const itemById = new Map(db.items.map((i) => [i.id, i]));

  const invoice: Invoice = {
    id: uid('inv'), invoiceNo: `${db.settings.invoicePrefix}${++invSeq}`, customerId: customer.id, orderId, challanId: db.challans.find((c) => c.orderId === orderId)?.id ?? null,
    invoiceDate: todayISO(), dueDate: addDays(todayISO(), customer.paymentTermsDays), subtotal: 0, taxAmount: 0, total: 0, status: 'Generated', createdBy: userId, createdAt: nowISO(),
  };
  const items: InvoiceItem[] = lines.map((l) => {
    const item = itemById.get(l.itemId)!;
    const amount = Math.round(l.qty.customerAccepted! * l.rate * 100) / 100;
    invoice.subtotal += amount;
    invoice.taxAmount += Math.round((amount * item.taxRate) / 100 * 100) / 100;
    return { id: uid('ii'), invoiceId: invoice.id, orderItemId: l.id, itemId: l.itemId, unit: l.unit, qty: l.qty.customerAccepted!, rate: l.rate, taxRate: item.taxRate, amount };
  });
  invoice.subtotal = Math.round(invoice.subtotal * 100) / 100;
  invoice.total = Math.round(invoice.subtotal + invoice.taxAmount);

  commit((d) => ({
    invoices: [...d.invoices, invoice],
    invoiceItems: [...d.invoiceItems, ...items],
    orderItems: d.orderItems.map((l) => (lines.some((x) => x.id === l.id) ? { ...l, qty: { ...l.qty, invoiced: l.qty.customerAccepted } } : l)),
    orders: d.orders.map((o) => (o.id === orderId ? { ...o, invoiceStatus: 'Invoiced' } : o)),
    auditLogs: [auditRow(userId, 'Invoice generated', 'invoices', invoice.invoiceNo, customer.id, '', `₹${invoice.total.toLocaleString('en-IN')}`), ...d.auditLogs],
  }));
  return invoice;
}

export async function recordPayment(
  input: { customerId: string; invoiceId: string; paymentDate: string; mode: PaymentMode; reference: string; amount: number; remarks: string },
  userId: string,
): Promise<Payment> {
  if (API_MODE) {
    const res = await recordPaymentApi({
      invoiceId: input.invoiceId,
      amount: input.amount,
      paymentDate: input.paymentDate,
      mode: input.mode,
      reference: input.reference,
      remarks: input.remarks,
    } satisfies PaymentPayload);
    // Return a minimal Payment for the toast. The next list sync will refresh the balances.
    return {
      id: String(res.payment.id),
      receiptNo: res.payment.receipt_no,
      customerId: input.customerId,
      invoiceId: input.invoiceId,
      paymentDate: input.paymentDate,
      mode: input.mode,
      reference: input.reference,
      amount: input.amount,
      remarks: input.remarks,
      recordedBy: userId,
      recordedAt: nowISO(),
    } as Payment;
  }

  return recordPaymentLocal(input, userId);
}

function recordPaymentLocal(
  input: { customerId: string; invoiceId: string; paymentDate: string; mode: PaymentMode; reference: string; amount: number; remarks: string },
  userId: string,
): Payment {
  const { db, commit } = useStore.getState();
  const invoice = db.invoices.find((i) => i.id === input.invoiceId);
  const payment: Payment = { id: uid('pay'), receiptNo: `RCPT-${String(++rcptSeq).padStart(4, '0')}`, recordedBy: userId, recordedAt: nowISO(), ...input };

  commit((d) => {
    const paidTotal = d.payments.filter((p) => p.invoiceId === input.invoiceId).reduce((s, p) => s + p.amount, 0) + input.amount;
    const fullyPaid = invoice ? paidTotal >= invoice.total : false;
    return {
      payments: [...d.payments, payment],
      orderItems: fullyPaid && invoice
        ? d.orderItems.map((l) => (d.invoiceItems.some((ii) => ii.invoiceId === invoice.id && ii.orderItemId === l.id) ? { ...l, qty: { ...l.qty, paid: l.qty.invoiced } } : l))
        : d.orderItems,
      auditLogs: [auditRow(userId, 'Payment recorded', 'payments', payment.receiptNo, input.customerId, invoice?.invoiceNo ?? '', `₹${input.amount.toLocaleString('en-IN')} · ${input.mode}`), ...d.auditLogs],
    };
  });
  return payment;
}
