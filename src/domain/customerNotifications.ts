import type { Database } from '../types/models';
import { addDays, fmtDate, fmtTime, inr } from '../lib/format';
import { invoiceViews } from './finance';

export type CustomerNotificationTone = 'green' | 'blue' | 'amber' | 'red' | 'neutral';

export interface CustomerNotification {
  id: string;
  title: string;
  message: string;
  at: string;
  link: string;
  tone: CustomerNotificationTone;
}

/**
 * What a customer should hear about, derived from live data — the same way staff
 * notifications work. Nothing is stored except which ones they have opened.
 */
export function deriveCustomerNotifications(db: Database, customerId: string, today: string): CustomerNotification[] {
  const out: CustomerNotification[] = [];
  const since = addDays(today, -3);
  const userName = (id: string | null) => (id ? db.users.find((u) => u.id === id)?.name ?? null : null);

  for (const o of db.orders.filter((x) => x.customerId === customerId && x.deliveryDate >= since)) {
    const lineCount = db.orderItems.filter((l) => l.orderId === o.id).length;
    const kind = o.orderType === 'Top-up' ? 'Top-up order' : 'Order';

    if (o.status === 'Rejected') {
      out.push({
        id: `rejected:${o.id}`, tone: 'red', title: `${kind} ${o.orderNo} could not be accepted`,
        message: o.remarks ? `Reason: ${o.remarks}. Call us if you need this delivery.` : 'Please call us if you need this delivery.',
        at: o.approvedAt ?? o.receivedAt, link: '/portal/orders',
      });
      continue;
    }

    if (o.approvedAt) {
      const by = userName(o.approvedBy);
      out.push({
        id: `approved:${o.id}:${o.approvedAt}`, tone: 'green', title: `${kind} ${o.orderNo} confirmed`,
        message: `${lineCount} item${lineCount === 1 ? '' : 's'} for ${fmtDate(o.deliveryDate)} delivery${by ? ` · confirmed by ${by}` : ''}.`,
        at: o.approvedAt, link: '/portal/orders',
      });
    } else if (o.status === 'Submitted' || o.status === 'Late') {
      out.push({
        id: `received:${o.id}`, tone: 'amber', title: `${kind} ${o.orderNo} received`,
        message: o.status === 'Late' ? `Came in after the ${db.settings.orderCutoffTime} cutoff — our team is checking it.` : 'Waiting for our team to confirm it.',
        at: o.receivedAt, link: '/portal/orders',
      });
    }

    if (o.lockedAt && o.deliveryStatus === 'Pending') {
      out.push({
        id: `locked:${o.id}`, tone: 'blue', title: `${o.orderNo} is being prepared`,
        message: `Locked for ${fmtDate(o.deliveryDate)} — quantities are now fixed. Extra items go as a top-up order.`,
        at: o.lockedAt, link: '/portal/orders',
      });
    }

    const challan = db.challans.find((c) => c.orderId === o.id);
    if (challan?.dispatchedAt && (challan.status === 'Dispatched' || challan.status === 'In Transit')) {
      const driver = userName(challan.driverId);
      out.push({
        id: `dispatched:${o.id}`, tone: 'blue', title: `${o.orderNo} is out for delivery`,
        message: `Left at ${fmtTime(challan.dispatchedAt)}${driver ? ` with ${driver}` : ''} · ${challan.packages} package${challan.packages === 1 ? '' : 's'}.`,
        at: challan.dispatchedAt, link: '/portal/orders',
      });
    }
    if (challan?.deliveredAt && (challan.status === 'Delivered' || challan.status === 'Partial' || challan.status === 'Failed')) {
      out.push({
        id: `delivered:${o.id}`, tone: challan.status === 'Delivered' ? 'green' : challan.status === 'Partial' ? 'amber' : 'red',
        title: challan.status === 'Delivered' ? `${o.orderNo} delivered` : challan.status === 'Partial' ? `${o.orderNo} partly delivered` : `${o.orderNo} delivery failed`,
        message: `${fmtTime(challan.deliveredAt)}${challan.receivedByName ? ` · received by ${challan.receivedByName}` : ''}${challan.deliveryRemarks ? ` · ${challan.deliveryRemarks}` : ''}`,
        at: challan.deliveredAt, link: '/portal/orders',
      });
    }
  }

  for (const inv of invoiceViews(db, today).filter((i) => i.customerId === customerId)) {
    if (inv.invoiceDate >= addDays(today, -7)) {
      out.push({
        id: `invoice:${inv.id}`, tone: 'neutral', title: `Invoice ${inv.invoiceNo} · ${inr(inv.total)}`,
        message: inv.balance > 0 ? `Due by ${fmtDate(inv.dueDate)}.` : 'Paid — thank you.',
        at: inv.createdAt, link: '/portal/invoices',
      });
    }
    if (inv.daysOverdue > 0) {
      out.push({
        id: `overdue:${inv.id}:${inv.daysOverdue}`, tone: 'red', title: `Invoice ${inv.invoiceNo} is overdue`,
        message: `${inr(inv.balance)} was due on ${fmtDate(inv.dueDate)} (${inv.daysOverdue} day${inv.daysOverdue === 1 ? '' : 's'} ago).`,
        at: `${today}T08:00:00`, link: '/portal/invoices',
      });
    }
  }

  return out.sort((a, b) => (a.at < b.at ? 1 : -1)).slice(0, 30);
}
