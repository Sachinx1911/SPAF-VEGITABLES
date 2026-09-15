import type { Database } from '../types/models';
import { addDays, fmtDate, inr, qty } from '../lib/format';
import { invoiceViews } from './finance';
import { requirementRows } from './ops';

export type NotificationType =
  | 'Late Order'
  | 'Pending Approval'
  | 'Purchase Required'
  | 'Shortage'
  | 'Packing Pending'
  | 'Packing Issue'
  | 'Dispatch Pending'
  | 'Payment Due'
  | 'Overdue Invoice';

export interface AppNotification {
  id: string;
  type: NotificationType;
  priority: 'High' | 'Medium' | 'Low';
  title: string;
  message: string;
  at: string;
  link: string;
}

/**
 * Notifications are derived from live data, not stored — they disappear on their
 * own when the underlying condition is resolved. Only read-state is persisted.
 */
export function deriveNotifications(db: Database, today: string, nowIso: string): AppNotification[] {
  const out: AppNotification[] = [];
  const cust = new Map(db.customers.map((c) => [c.id, c]));
  const item = new Map(db.items.map((i) => [i.id, i]));

  for (const o of db.orders.filter((x) => x.status === 'Late')) {
    out.push({
      id: `late:${o.id}`, type: 'Late Order', priority: 'High',
      title: `Late order · ${cust.get(o.customerId)?.name}`,
      message: `${o.orderNo} received after ${db.settings.orderCutoffTime} cutoff for ${fmtDate(o.deliveryDate)} delivery. Approve or reject.`,
      at: o.receivedAt, link: `/orders?status=Late`,
    });
  }

  const pending = db.orders.filter((o) => o.status === 'Submitted' && o.deliveryDate >= today);
  if (pending.length) {
    out.push({
      id: `pending:${today}:${pending.length}`, type: 'Pending Approval', priority: 'Medium',
      title: `${pending.length} orders awaiting approval`,
      message: `For delivery on ${fmtDate(addDays(today, 1))}. Consolidation locks at ${db.settings.orderCutoffTime}.`,
      at: pending.map((o) => o.receivedAt).sort().at(-1)!, link: '/orders?status=Submitted',
    });
  }

  const reqs = requirementRows(db, today);
  for (const r of reqs.filter((x) => x.status !== 'OK')) {
    const it = item.get(r.itemId)!;
    out.push({
      id: `purchase:${today}:${r.itemId}`, type: 'Purchase Required', priority: r.status === 'Critical' ? 'High' : 'Medium',
      title: `${it.name} — ${qty(r.toPurchase, r.unit)} still to buy`,
      message: `Required ${qty(r.required, r.unit)}, purchased ${qty(r.purchased, r.unit)}. ${r.status === 'Critical' ? 'Customers will be short.' : ''}`,
      at: `${today}T05:10:00`, link: '/purchase',
    });
  }
  for (const r of reqs.filter((x) => x.shortage > 0)) {
    const it = item.get(r.itemId)!;
    const affected = db.allocations.filter((a) => a.deliveryDate === today && a.itemId === r.itemId && a.allocatedQty < a.requiredQty).length;
    out.push({
      id: `short:${today}:${r.itemId}`, type: 'Shortage', priority: 'High',
      title: `Shortage · ${it.name} (${r.unit})`,
      message: `${qty(r.shortage, r.unit)} short after QC — ${affected} customer${affected === 1 ? '' : 's'} allocated less than ordered.`,
      at: `${today}T05:55:00`, link: '/allocation',
    });
  }

  const packs = db.packings.filter((p) => p.deliveryDate === today);
  for (const p of packs.filter((x) => x.status === 'Issue')) {
    out.push({
      id: `packissue:${p.id}`, type: 'Packing Issue', priority: 'High',
      title: `Packing issue · ${cust.get(p.customerId)?.name}`, message: p.issue,
      at: p.startedAt ?? nowIso, link: '/packing',
    });
  }
  const toPack = packs.filter((p) => p.status === 'To Pack' || p.status === 'Packing');
  if (toPack.length) {
    out.push({
      id: `topack:${today}:${toPack.length}`, type: 'Packing Pending', priority: 'Medium',
      title: `${toPack.length} orders not yet packed`,
      message: `Route 4 departs 11:45 and Route 5 departs 12:30.`,
      at: nowIso, link: '/packing',
    });
  }
  const ready = db.challans.filter((c) => c.challanDate === today && c.status === 'Ready');
  if (ready.length) {
    out.push({
      id: `dispatch:${today}:${ready.length}`, type: 'Dispatch Pending', priority: 'Medium',
      title: `${ready.length} packed orders waiting for dispatch`,
      message: `Challans are generated — assign driver and mark dispatched.`,
      at: nowIso, link: '/delivery',
    });
  }

  const inv = invoiceViews(db, today).filter((i) => i.balance > 0);
  const dueSoon = inv.filter((i) => i.daysOverdue === 0 && i.dueDate <= addDays(today, 2));
  if (dueSoon.length) {
    out.push({
      id: `due:${today}:${dueSoon.length}`, type: 'Payment Due', priority: 'Low',
      title: `${dueSoon.length} invoices due in the next 2 days`,
      message: `${inr(dueSoon.reduce((s, i) => s + i.balance, 0))} expected. Send reminders from Outstanding.`,
      at: `${today}T08:00:00`, link: '/outstanding',
    });
  }
  const overdueBy = new Map<string, { amount: number; days: number; count: number }>();
  for (const i of inv.filter((x) => x.daysOverdue > 30)) {
    const cur = overdueBy.get(i.customerId) ?? { amount: 0, days: 0, count: 0 };
    overdueBy.set(i.customerId, { amount: cur.amount + i.balance, days: Math.max(cur.days, i.daysOverdue), count: cur.count + 1 });
  }
  for (const [customerId, v] of overdueBy) {
    out.push({
      id: `overdue:${customerId}:${v.count}`, type: 'Overdue Invoice', priority: v.days > 60 ? 'High' : 'Medium',
      title: `${cust.get(customerId)?.name} · ${inr(v.amount)} overdue`,
      message: `${v.count} invoice${v.count > 1 ? 's' : ''}, oldest ${v.days} days past due.`,
      at: `${today}T08:00:00`, link: '/outstanding',
    });
  }

  const rank = { High: 0, Medium: 1, Low: 2 };
  return out.sort((a, b) => rank[a.priority] - rank[b.priority] || (a.at < b.at ? 1 : -1));
}
