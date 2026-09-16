import { Fragment, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { Bar, BarChart, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import {
  AlertTriangle, ArrowDown, ArrowUp, Bell, Boxes, Check, ChevronRight, ClipboardCheck, ClipboardList, CreditCard,
  IndianRupee, Minus, Package, PackageOpen, ShoppingCart, Truck, Workflow, type LucideIcon,
} from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Badge, StatusBadge } from '../../components/ui/Badge';
import { QuickAdd } from '../../components/shell/QuickAdd';
import { useCurrentUser, useDb } from '../../store/useStore';
import { todayISO, nowISO } from '../../lib/clock';
import { addDays, fmtDate, fmtTime, inr, inrCompact, relativeTime } from '../../lib/format';
import { liveStats, operationsTimeline, orderBoard, requirementRows, type StepState } from '../../domain/ops';
import { salesByCustomer } from '../../domain/reports';
import { deriveNotifications } from '../../domain/notifications';
import { cn } from '../../lib/cn';

const AXIS = { fontSize: 11, fill: '#8a968e' };
const TOOLTIP = { fontSize: 12, borderRadius: 8, border: '1px solid #e3e8e4', boxShadow: '0 4px 12px rgba(16,40,26,0.1)' };

const ORDER_SLICES = [
  { key: 'Submitted', color: '#3b82f6' },
  { key: 'Approved', color: '#22c55e' },
  { key: 'Late', color: '#f59e0b' },
  { key: 'Rejected', color: '#ef4444' },
  { key: 'Draft', color: '#cbd4cf' },
] as const;

const DELIVERY_SLICES = [
  { key: 'Pending', color: '#f59e0b' },
  { key: 'Out for Delivery', color: '#3b82f6' },
  { key: 'Delivered', color: '#22c55e' },
  { key: 'Partial', color: '#f97316' },
  { key: 'Failed', color: '#ef4444' },
] as const;

const ACTIVITY_TONE: Record<string, string> = {
  orders: 'bg-brand-50 text-brand-700', purchase: 'bg-orange-50 text-orange-600', receiving: 'bg-blue-50 text-blue-600',
  packing: 'bg-violet-50 text-violet-600', delivery: 'bg-emerald-50 text-emerald-600', invoices: 'bg-amber-50 text-amber-600',
  payments: 'bg-teal-50 text-teal-600',
};

const STEP_RING: Record<StepState, string> = {
  done: 'bg-emerald-500 text-white', active: 'bg-brand-700 text-white',
  attention: 'bg-red-500 text-white', pending: 'bg-canvas text-subtle border border-line',
};

export function DashboardPage() {
  const db = useDb();
  const user = useCurrentUser()!;
  const nav = useNavigate();
  const today = todayISO();
  const now = nowISO();

  const [trendDays, setTrendDays] = useState(7);
  const [finPeriod, setFinPeriod] = useState<'month' | 'last' | 'year'>('month');

  const stats = liveStats(db, today);
  const prev = db.snapshots.find((s) => s.date === addDays(today, -1));
  const delta = (key: keyof typeof stats) => {
    const p = prev?.[key] as number | undefined;
    const c = stats[key] as number;
    return p ? Math.round(((c - p) / p) * 100) : null;
  };

  const board = orderBoard(db, today);
  const reqs = requirementRows(db, today);
  const notifications = deriveNotifications(db, today, now).slice(0, 6);
  const timeline = operationsTimeline(db, today);
  const custById = useMemo(() => new Map(db.customers.map((c) => [c.id, c])), [db.customers]);
  const itemById = useMemo(() => new Map(db.items.map((i) => [i.id, i])), [db.items]);
  const userById = useMemo(() => new Map(db.users.map((u) => [u.id, u])), [db.users]);
  const routeById = useMemo(() => new Map(db.routes.map((r) => [r.id, r])), [db.routes]);

  /* --------------------------------------------------------------- KPI row */

  const poValue = (date: string) => {
    const ids = new Set(db.purchaseOrders.filter((p) => p.purchaseDate === date).map((p) => p.id));
    return db.purchaseOrderItems.filter((l) => ids.has(l.purchaseOrderId)).reduce((s, l) => s + l.qty * l.rate, 0);
  };
  const purchaseToday = poValue(today);
  const purchaseYesterday = poValue(addDays(today, -1));
  const purchaseDelta = purchaseYesterday ? Math.round(((purchaseToday - purchaseYesterday) / purchaseYesterday) * 100) : null;
  const newCritical = reqs.filter((r) => r.status === 'Critical').length;

  /* ------------------------------------------------------------- the rings */

  const orderRing = ORDER_SLICES.map((s) => ({ name: s.key, value: board[s.key].length, color: s.color }));
  const orderTotal = orderRing.reduce((s, d) => s + d.value, 0);

  const challansToday = db.challans.filter((c) => c.challanDate === today);
  const deliveryCounts: Record<string, number> = {
    Pending: challansToday.filter((c) => c.status === 'Pending' || c.status === 'Ready').length,
    'Out for Delivery': challansToday.filter((c) => c.status === 'Dispatched' || c.status === 'In Transit').length,
    Delivered: challansToday.filter((c) => c.status === 'Delivered').length,
    Partial: challansToday.filter((c) => c.status === 'Partial').length,
    Failed: challansToday.filter((c) => c.status === 'Failed').length,
  };
  const deliveryRing = DELIVERY_SLICES.map((s) => ({ name: s.key, value: deliveryCounts[s.key], color: s.color }));
  const deliveryTotal = challansToday.length;

  /* ------------------------------------------------------- financial block */

  const finRange = useMemo(() => {
    const d = new Date(today);
    if (finPeriod === 'year') return { from: `${d.getFullYear()}-01-01`, to: today, label: 'This Year' };
    const y = d.getFullYear();
    const m = d.getMonth();
    if (finPeriod === 'last') {
      const start = new Date(y, m - 1, 1);
      const end = new Date(y, m, 0);
      return { from: start.toISOString().slice(0, 10), to: end.toISOString().slice(0, 10), label: 'Last Month' };
    }
    return { from: new Date(y, m, 1).toISOString().slice(0, 10), to: today, label: 'This Month' };
  }, [finPeriod, today]);

  const inRange = (d: string) => d >= finRange.from && d <= finRange.to;
  const totalSales = db.invoices.filter((i) => inRange(i.invoiceDate)).reduce((s, i) => s + i.total, 0);
  const poIdsInRange = new Set(db.purchaseOrders.filter((p) => inRange(p.purchaseDate)).map((p) => p.id));
  const totalPurchase = db.purchaseOrderItems.filter((l) => poIdsInRange.has(l.purchaseOrderId)).reduce((s, l) => s + l.qty * l.rate, 0);
  const paymentsIn = db.payments.filter((p) => inRange(p.paymentDate)).reduce((s, p) => s + p.amount, 0);
  const netMargin = totalSales - totalPurchase;

  /* ----------------------------------------------------- charts and tables */

  const trend = useMemo(() => {
    const from = addDays(today, -(trendDays - 1));
    return db.snapshots
      .filter((s) => s.date >= from && s.date <= today)
      .sort((a, b) => (a.date < b.date ? -1 : 1))
      .map((s) => ({ date: fmtDate(s.date).slice(0, 5), orders: s.ordersReceived, deliveries: s.delivered }));
  }, [db.snapshots, today, trendDays]);

  const topCustomers = useMemo(() => salesByCustomer(db, finRange.from, finRange.to).slice(0, 5), [db, finRange]);
  const topMax = topCustomers[0]?.amount ?? 1;

  const activity = [...db.auditLogs].filter((a) => a.at <= now).slice(0, 5);
  const toBuy = reqs.filter((r) => r.toPurchase > 0).sort((a, b) => b.toPurchase - a.toPurchase).slice(0, 5);
  const slotOf = (c: (typeof challansToday)[number]) =>
    c.deliveredAt ?? c.dispatchedAt ?? `${today}T${routeById.get(c.routeId)?.departureTime ?? '23:59'}`;
  const schedule = [...challansToday].sort((a, b) => (slotOf(a) < slotOf(b) ? -1 : 1)).slice(0, 6);

  const hour = new Date(now).getHours();
  const greeting = hour < 12 ? 'Good Morning' : hour < 17 ? 'Good Afternoon' : 'Good Evening';

  return (
    <div className="flex flex-col gap-4">
      {/* ------------------------------------------------------------- hero */}
      <div className="relative overflow-hidden rounded-card border border-brand-100 bg-gradient-to-r from-white via-brand-50/70 to-fresh-100/80 px-5 py-4">
        <div className="absolute -top-16 -right-10 size-56 rounded-full bg-fresh-200/40 blur-2xl" />
        <div className="absolute -right-6 -bottom-20 size-48 rounded-full bg-brand-200/40 blur-2xl" />
        <div className="relative flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-[22px] leading-tight font-semibold tracking-[-0.01em] text-ink">{greeting}, {user.name.split(' ')[0]} 👋</h1>
            <p className="mt-0.5 text-[13px] text-muted">Here's what's happening with your business today.</p>
          </div>
          <p className="hidden flex-1 text-center font-serif text-[19px] leading-tight text-brand-800/70 italic lg:block">
            Fresh Produce<br />Stronger Partnerships
          </p>
          <QuickAdd />
        </div>
      </div>

      {/* -------------------------------------------------------- KPI strip */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 2xl:grid-cols-7">
        <Kpi icon={ClipboardList} tone="bg-brand-50 text-brand-700" value={stats.ordersReceived} label="Today's Orders"
          deltaPct={delta('ordersReceived')} note="vs yesterday" onClick={() => nav('/orders')} />
        <Kpi icon={ShoppingCart} tone="bg-orange-50 text-orange-600" value={inr(purchaseToday)} label="Purchase Value"
          deltaPct={purchaseDelta} note="vs yesterday" onClick={() => nav('/purchase')} />
        <Kpi icon={Truck} tone="bg-amber-50 text-amber-600" value={stats.delivered} label="Deliveries Completed"
          deltaPct={delta('delivered')} note="vs yesterday" onClick={() => nav('/delivery')} />
        <Kpi icon={Package} tone="bg-violet-50 text-violet-600" value={stats.packingPending} label="Packing Pending"
          deltaPct={delta('packingPending')} goodDirection="down" note="vs yesterday" onClick={() => nav('/packing')} />
        <Kpi icon={AlertTriangle} tone="bg-red-50 text-red-600" value={stats.purchaseRequired} label="Items Require Purchase"
          deltaText={newCritical ? `${newCritical} critical` : undefined} deltaGood={!newCritical} note="vs yesterday" onClick={() => nav('/purchase')} />
        <Kpi icon={IndianRupee} tone="bg-yellow-50 text-yellow-600" value={inr(stats.salesValue)} label="Sales Value"
          deltaPct={delta('salesValue')} note="vs yesterday" onClick={() => nav('/invoices')} />
        <Kpi icon={CreditCard} tone="bg-teal-50 text-teal-600" value={inrCompact(stats.outstanding)} label="Outstanding"
          deltaPct={delta('outstanding')} goodDirection="down" note="vs yesterday" onClick={() => nav('/outstanding')} />
      </div>

      {/* --------------------------------- rings, purchase alerts, finance */}
      <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-4">
        <Panel title="Order Status" action={<LinkAll onClick={() => nav('/orders')} />}>
          <Ring data={orderRing} total={orderTotal} caption="Total Orders" onSlice={(k) => nav(`/orders?status=${k}`)} />
        </Panel>

        <Panel title="Delivery Status" action={<LinkAll onClick={() => nav('/delivery')} />}>
          <Ring data={deliveryRing} total={deliveryTotal} caption="Total Deliveries" onSlice={() => nav('/delivery')} />
        </Panel>

        <Panel title="Purchase Alerts" action={<LinkAll onClick={() => nav('/purchase')} />}>
          <div className="flex flex-col gap-2 p-4">
            <AlertRow tone="orange" icon={ShoppingCart} label={`${reqs.filter((r) => r.status !== 'OK').length} Items Require Purchase`} onClick={() => nav('/purchase')} />
            <AlertRow tone="red" icon={AlertTriangle} label={`${reqs.filter((r) => r.shortage > 0).length} Items in Shortage`} onClick={() => nav('/shortage')} />
            <AlertRow tone="blue" icon={Boxes} label={`${reqs.filter((r) => r.excess > 0).length} Items in Excess`} onClick={() => nav('/shortage')} />
            <AlertRow tone="amber" icon={PackageOpen} label={`${newCritical} Items Critical (No Stock)`} onClick={() => nav('/purchase')} />
          </div>
        </Panel>

        <Panel
          title="Financial Summary"
          action={
            <select
              value={finPeriod}
              onChange={(e) => setFinPeriod(e.target.value as typeof finPeriod)}
              className="rounded-lg border border-line bg-white px-2 py-1 text-[11.5px] font-medium text-muted"
            >
              <option value="month">This Month</option>
              <option value="last">Last Month</option>
              <option value="year">This Year</option>
            </select>
          }
        >
          <div className="flex flex-col divide-y divide-line px-4">
            <MoneyRow label="Total Sales" value={totalSales} />
            <MoneyRow label="Total Purchase" value={totalPurchase} />
            <MoneyRow label="Payments Received" value={paymentsIn} />
            <MoneyRow label="Net Margin" value={netMargin} strong />
          </div>
        </Panel>
      </div>

      {/* ------------------------------ activity, trend chart, top customers */}
      <div className="grid gap-4 xl:grid-cols-12">
        <Panel className="xl:col-span-5" title="Today's Activity" action={<LinkAll onClick={() => nav('/audit-logs')} />}>
          <div className="overflow-x-auto">
            <table className="w-full text-[12.5px]">
              <thead className="bg-canvas/70">
                <tr>{['Time', 'Type', 'Reference', 'Customer', 'Details', 'Status'].map((h) => <Th key={h}>{h}</Th>)}</tr>
              </thead>
              <tbody className="divide-y divide-line">
                {activity.map((a) => (
                  <tr key={a.id} className="hover:bg-canvas/50">
                    <td className="tabular px-3 py-2 whitespace-nowrap text-muted">{fmtTime(a.at)}</td>
                    <td className="px-3 py-2">
                      <span className={cn('rounded px-1.5 py-0.5 text-[11px] font-medium capitalize', ACTIVITY_TONE[a.module] ?? 'bg-canvas text-muted')}>
                        {a.module}
                      </span>
                    </td>
                    <td className="px-3 py-2 font-medium whitespace-nowrap text-brand-700">{a.recordRef}</td>
                    <td className="max-w-[9rem] truncate px-3 py-2 text-muted">{a.customerId ? custById.get(a.customerId)?.name ?? '—' : '—'}</td>
                    <td className="max-w-[9rem] truncate px-3 py-2 text-muted">{a.newValue || a.action}</td>
                    <td className="px-3 py-2">
                      <Badge tone={a.status === 'Failed' ? 'red' : a.status === 'Warning' ? 'orange' : 'green'}>{a.status}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>

        <Panel
          className="xl:col-span-4"
          title="Order vs Delivery Trend"
          action={
            <select
              value={trendDays}
              onChange={(e) => setTrendDays(Number(e.target.value))}
              className="rounded-lg border border-line bg-white px-2 py-1 text-[11.5px] font-medium text-muted"
            >
              <option value={7}>Last 7 Days</option>
              <option value={14}>Last 14 Days</option>
              <option value={30}>Last 30 Days</option>
            </select>
          }
        >
          <div className="px-2 pt-3 pb-1">
            <div className="mb-1 flex items-center justify-center gap-4 text-[11.5px] text-muted">
              <Legend color="#2f7f50" label="Orders" />
              <Legend color="#7bc47f" label="Deliveries" />
            </div>
            <ResponsiveContainer width="100%" height={188}>
              <BarChart data={trend} barGap={3}>
                <XAxis dataKey="date" tick={AXIS} axisLine={false} tickLine={false} />
                <YAxis tick={AXIS} axisLine={false} tickLine={false} width={28} />
                <Tooltip contentStyle={TOOLTIP} cursor={{ fill: 'rgba(47,127,80,0.06)' }} />
                <Bar dataKey="orders" name="Orders" fill="#2f7f50" radius={[3, 3, 0, 0]} />
                <Bar dataKey="deliveries" name="Deliveries" fill="#7bc47f" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>

        <Panel
          className="xl:col-span-3"
          title={<>Top Customers <span className="font-normal text-muted">({finRange.label})</span></>}
          action={<LinkAll onClick={() => nav('/reports/sales')} />}
        >
          <div className="flex flex-col gap-2.5 p-4">
            {topCustomers.map((c) => (
              <button key={c.customerId} onClick={() => nav(`/customers/${c.customerId}`)} className="group text-left">
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate text-[11.5px] tracking-wide text-muted uppercase group-hover:text-ink">{c.name}</p>
                  <p className="tabular shrink-0 text-[12px] font-semibold text-ink">{inr(c.amount)}</p>
                </div>
                <div className="mt-1 h-2 overflow-hidden rounded-full bg-canvas">
                  <div className="h-full rounded-full bg-fresh-500" style={{ width: `${Math.max(6, (c.amount / topMax) * 100)}%` }} />
                </div>
              </button>
            ))}
          </div>
        </Panel>
      </div>

      {/* --------------------- to purchase, delivery schedule, notifications */}
      <div className="grid gap-4 xl:grid-cols-3">
        <Panel title="Items to Purchase" action={<LinkAll onClick={() => nav('/purchase')} />}>
          <div className="overflow-x-auto">
            <table className="w-full text-[12.5px]">
              <thead className="bg-canvas/70">
                <tr>{['Item', 'Unit', 'Required', 'In Stock', 'To Purchase', 'Status'].map((h) => <Th key={h}>{h}</Th>)}</tr>
              </thead>
              <tbody className="divide-y divide-line">
                {toBuy.map((r) => (
                  <tr key={r.itemId} className="hover:bg-canvas/50">
                    <td className="max-w-[8rem] truncate px-3 py-2 font-medium text-ink">{itemById.get(r.itemId)?.name ?? r.itemId}</td>
                    <td className="px-3 py-2 text-muted">{r.unit}</td>
                    <td className="tabular px-3 py-2">{r.required}</td>
                    <td className="tabular px-3 py-2">{r.stock}</td>
                    <td className="tabular px-3 py-2 font-semibold text-ink">{r.toPurchase}</td>
                    <td className="px-3 py-2"><Badge tone={r.status === 'Critical' ? 'red' : 'orange'}>{r.status === 'Critical' ? 'Critical' : 'Required'}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>

        <Panel title={<>Delivery Schedule <span className="font-normal text-muted">(Today)</span></>} action={<LinkAll onClick={() => nav('/delivery')} />}>
          <div className="overflow-x-auto">
            <table className="w-full text-[12.5px]">
              <thead className="bg-canvas/70">
                <tr>{['Time', 'Customer', 'Location', 'Driver', 'Status'].map((h) => <Th key={h}>{h}</Th>)}</tr>
              </thead>
              <tbody className="divide-y divide-line">
                {schedule.map((c) => {
                  const cust = custById.get(c.customerId);
                  return (
                    <tr key={c.id} onClick={() => nav(`/challans/${c.id}`)} className="cursor-pointer hover:bg-canvas/50">
                      <td className="tabular px-3 py-2 whitespace-nowrap text-muted">
                        {c.deliveredAt ? fmtTime(c.deliveredAt) : c.dispatchedAt ? fmtTime(c.dispatchedAt) : routeById.get(c.routeId)?.departureTime ?? '—'}
                      </td>
                      <td className="max-w-[8rem] truncate px-3 py-2 font-medium text-ink">{cust?.name ?? '—'}</td>
                      <td className="max-w-[6rem] truncate px-3 py-2 text-muted">{cust?.location ?? '—'}</td>
                      <td className="max-w-[6rem] truncate px-3 py-2 text-muted">{c.driverId ? userById.get(c.driverId)?.name.split(' ')[0] ?? '—' : '—'}</td>
                      <td className="px-3 py-2"><StatusBadge status={c.status} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Panel>

        <Panel title="Alerts & Notifications" action={<LinkAll onClick={() => nav('/notifications')} />}>
          <div className="divide-y divide-line">
            {notifications.map((n) => (
              <button key={n.id} onClick={() => nav(n.link)} className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left hover:bg-canvas/60">
                <span className={cn('grid size-7 shrink-0 place-items-center rounded-lg',
                  n.priority === 'High' ? 'bg-red-50 text-red-600' : n.priority === 'Medium' ? 'bg-orange-50 text-orange-600' : 'bg-brand-50 text-brand-700')}>
                  <Bell size={14} />
                </span>
                <p className="min-w-0 flex-1 truncate text-[12.5px] text-ink">{n.title}</p>
                <span className="shrink-0 text-[11px] text-subtle">{relativeTime(n.at ?? now, now)}</span>
              </button>
            ))}
          </div>
        </Panel>
      </div>

      {/* ---------------------------------------------------- operations flow */}
      <div className="rounded-card border border-line bg-white p-4 shadow-card">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center">
          <div className="flex shrink-0 items-center gap-2.5">
            <span className="grid size-10 place-items-center rounded-xl bg-brand-50 text-brand-700"><Workflow size={19} /></span>
            <div>
              <p className="text-[13.5px] font-semibold text-ink">Today's Operations Flow</p>
              <p className="text-[11.5px] text-muted">Track your daily workflow progress</p>
            </div>
          </div>

          <div className="flex flex-1 items-start overflow-x-auto">
            {timeline.map((step, i) => (
              <Fragment key={step.key}>
                {i > 0 && <span className={cn('mt-3.5 h-0.5 min-w-4 flex-1', step.state === 'pending' ? 'bg-line' : 'bg-emerald-300')} />}
                <button onClick={() => nav(step.link)} className="flex w-20 shrink-0 flex-col items-center gap-1 text-center">
                  <span className={cn('grid size-7 place-items-center rounded-full', STEP_RING[step.state])}>
                    {step.state === 'done' ? <Check size={15} strokeWidth={3} /> : step.state === 'attention' ? <AlertTriangle size={13} /> : <ChevronRight size={14} />}
                  </span>
                  <span className="text-[11.5px] leading-tight font-medium text-ink">{step.label}</span>
                  <span className="text-[10.5px] leading-tight text-muted">{stepNote(step.key, step.state, stats.ordersReceived)}</span>
                </button>
              </Fragment>
            ))}
          </div>

          <Button variant="primary" icon={ClipboardCheck} onClick={() => nav('/consolidation')} className="shrink-0">View Full Workflow</Button>
        </div>
      </div>

      <div className="flex flex-col gap-1 border-t border-line pt-3 text-[11.5px] text-subtle sm:flex-row sm:items-center sm:justify-between">
        <p>© {new Date(today).getFullYear()} SV-PRO AGRO FOODS PVT LTD. All rights reserved.</p>
        <p>Fresh Produce · Reliable Supply · Stronger Partnerships</p>
      </div>
    </div>
  );
}

function stepNote(key: string, state: StepState, orders: number): string {
  if (key === 'orders') return `${orders} Received`;
  return state === 'done' ? 'Completed' : state === 'active' ? 'In Progress' : state === 'attention' ? 'Needs action' : 'Pending';
}

/* ------------------------------------------------------------- small parts */

interface KpiProps {
  icon: LucideIcon;
  tone: string;
  value: React.ReactNode;
  label: string;
  deltaPct?: number | null;
  deltaText?: string;
  deltaGood?: boolean;
  goodDirection?: 'up' | 'down';
  note: string;
  onClick: () => void;
}

function Kpi({ icon: Icon, tone, value, label, deltaPct, deltaText, deltaGood, goodDirection = 'up', note, onClick }: KpiProps) {
  const good = deltaText ? !!deltaGood : deltaPct == null ? true : goodDirection === 'up' ? deltaPct >= 0 : deltaPct <= 0;
  const Trend = deltaText ? ArrowUp : deltaPct == null || deltaPct === 0 ? Minus : deltaPct > 0 ? ArrowUp : ArrowDown;

  return (
    <button onClick={onClick} className="rounded-card border border-line bg-white p-3.5 text-left shadow-card transition-shadow hover:shadow-pop">
      <div className="flex items-center gap-2.5">
        <span className={cn('grid size-10 shrink-0 place-items-center rounded-xl', tone)}><Icon size={19} /></span>
        <div className="min-w-0">
          <p className="tabular truncate text-[19px] leading-none font-semibold text-ink">{value}</p>
          <p className="mt-1 text-[11.5px] leading-tight text-muted">{label}</p>
        </div>
      </div>
      <div className="mt-2.5 flex items-center gap-1.5">
        <span className={cn('flex items-center gap-0.5 text-[11px] font-semibold', good ? 'text-emerald-600' : 'text-red-600')}>
          <Trend size={11} /> {deltaText ?? (deltaPct == null ? '—' : `${Math.abs(deltaPct)}%`)}
        </span>
        <span className="text-[10.5px] text-subtle">{note}</span>
      </div>
    </button>
  );
}

function Panel({ title, action, children, className }: { title: React.ReactNode; action?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('flex flex-col rounded-card border border-line bg-white shadow-card', className)}>
      <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-2.5">
        <h3 className="truncate text-[13.5px] font-semibold text-ink">{title}</h3>
        {action}
      </div>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

function LinkAll({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex shrink-0 items-center gap-0.5 text-[11.5px] font-medium text-brand-700 hover:underline">
      View All <ChevronRight size={13} />
    </button>
  );
}

function Ring({ data, total, caption, onSlice }: { data: { name: string; value: number; color: string }[]; total: number; caption: string; onSlice: (k: string) => void }) {
  return (
    <div className="flex items-center gap-2 p-4">
      <div className="relative size-[132px] shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} dataKey="value" innerRadius={42} outerRadius={64} paddingAngle={2} stroke="none">
              {data.map((d) => <Cell key={d.name} fill={d.color} />)}
            </Pie>
            <Tooltip contentStyle={TOOLTIP} />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <p className="tabular text-[20px] leading-none font-semibold text-ink">{total}</p>
          <p className="mt-0.5 text-[10.5px] text-muted">{caption}</p>
        </div>
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        {data.map((d) => (
          <button key={d.name} onClick={() => onSlice(d.name)} className="flex items-center gap-2 text-left">
            <span className="size-2 shrink-0 rounded-full" style={{ background: d.color }} />
            <span className="min-w-0 flex-1 truncate text-[12px] text-muted">{d.name}</span>
            <span className="tabular shrink-0 text-[12.5px] font-semibold text-ink">{d.value}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function AlertRow({ tone, icon: Icon, label, onClick }: { tone: 'orange' | 'red' | 'blue' | 'amber'; icon: LucideIcon; label: string; onClick: () => void }) {
  const chip = { orange: 'bg-orange-50 text-orange-600', red: 'bg-red-50 text-red-600', blue: 'bg-blue-50 text-blue-600', amber: 'bg-amber-50 text-amber-600' }[tone];
  return (
    <button onClick={onClick} className="flex items-center gap-2.5 rounded-lg border border-line px-3 py-2 text-left hover:bg-canvas/60">
      <span className={cn('grid size-7 shrink-0 place-items-center rounded-lg', chip)}><Icon size={14} /></span>
      <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium text-ink">{label}</span>
    </button>
  );
}

function MoneyRow({ label, value, strong }: { label: string; value: number; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-2 py-2.5">
      <p className="text-[12.5px] text-muted">{label}</p>
      <p className={cn('tabular text-[13px] font-semibold', strong ? (value >= 0 ? 'text-emerald-600' : 'text-red-600') : 'text-ink')}>{inr(value)}</p>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm" style={{ background: color }} />{label}</span>;
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="px-3 py-2 text-left text-[11px] font-semibold tracking-wide text-subtle uppercase">{children}</th>;
}
