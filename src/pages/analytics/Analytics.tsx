import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart, ResponsiveContainer,
  Tooltip, XAxis, YAxis,
} from 'recharts';
import {
  AlertTriangle, ChartBar, ChevronRight, Download, IndianRupee, Package, ShoppingCart, Users, type LucideIcon,
} from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { useDb } from '../../store/useStore';
import { deliveryReport, purchaseVsSales, salesByCustomer, salesByItem } from '../../domain/reports';
import { CATEGORIES, type Category } from '../../types/models';
import { addDays, fmtTime, inr, inrCompact, num } from '../../lib/format';
import { todayISO } from '../../lib/clock';
import { itemEmoji } from '../orders/orderUi';
import { cn } from '../../lib/cn';

const GREEN = '#2f7f50';
const FRESH = '#3aa64b';
const ORANGE = '#f97316';
const AXIS = { fontSize: 11, fill: '#8a968e' };
const TOOLTIP = { fontSize: 12, borderRadius: 8, border: '1px solid #e3e8e4', boxShadow: '0 4px 12px rgba(16,40,26,0.1)' };

const CATEGORY_COLOR: Record<Category, string> = {
  'Indian Vegetables': '#2f7f50',
  'Fresh Fruits': '#f97316',
  'Herbs & Leafy': '#7bc47f',
  'Imported Produce': '#3b82f6',
  'Exotic Vegetables': '#8b5cf6',
};

const TABS = [
  { key: 'overview', label: 'Overview' },
  { key: 'sales', label: 'Sales Reports' },
  { key: 'purchase', label: 'Purchase Reports' },
  { key: 'inventory', label: 'Inventory Reports' },
  { key: 'customers', label: 'Customer Reports' },
] as const;
type TabKey = (typeof TABS)[number]['key'];

export function AnalyticsPage() {
  const db = useDb();
  const nav = useNavigate();
  const today = todayISO();

  const [tab, setTab] = useState<TabKey>('overview');
  const [from, setFrom] = useState(addDays(today, -29));
  const [to, setTo] = useState(today);

  /* ------------------------------------------------------------- numbers */
  const sales = useMemo(() => salesByCustomer(db, from, to), [db, from, to]);
  const items = useMemo(() => salesByItem(db, from, to), [db, from, to]);
  const pvs = useMemo(() => purchaseVsSales(db, from, to), [db, from, to]);
  const delivery = useMemo(() => deliveryReport(db, from, to), [db, from, to]);

  const totalSales = sales.reduce((s, c) => s + c.amount, 0);
  const totalPurchase = pvs.reduce((s, r) => s + r.purchase, 0);
  const orderCount = db.orders.filter((o) => o.orderDate >= from && o.orderDate <= to).length;
  const activeCustomers = sales.filter((c) => c.amount > 0).length;
  const lowStockItems = db.items.filter((i) => i.minStock > 0 && i.stock > 0 && i.stock <= i.reorderLevel).length;

  const prevFrom = addDays(from, -(Number(new Date(to).getTime() - new Date(from).getTime()) / 86400000 + 1));
  const prevSales = useMemo(() => salesByCustomer(db, prevFrom, addDays(from, -1)).reduce((s, c) => s + c.amount, 0), [db, prevFrom, from]);
  const delta = (cur: number, prev: number) => (prev ? Math.max(-99, Math.min(99, Math.round(((cur - prev) / prev) * 100))) : 0);

  const salesVsPurchase = useMemo(
    () => pvs.map((r) => ({ date: r.date.slice(5), sales: r.sales, purchase: r.purchase })),
    [pvs],
  );

  const salesByCategory = useMemo(() => {
    const m = new Map<Category, number>();
    for (const i of items) {
      const item = db.items.find((x) => x.id === i.itemId);
      if (!item) continue;
      m.set(item.category, (m.get(item.category) ?? 0) + i.amount);
    }
    return CATEGORIES.map((c) => ({ name: c, value: m.get(c) ?? 0, color: CATEGORY_COLOR[c] })).filter((c) => c.value > 0);
  }, [items, db.items]);

  const topItems = useMemo(() => {
    const max = Math.max(...items.map((i) => i.qty), 1);
    return items.slice(0, 5).map((i) => ({ ...i, pct: Math.round((i.qty / max) * 100), item: db.items.find((x) => x.id === i.itemId) }));
  }, [items, db.items]);

  const topCustomers = useMemo(
    () => sales.slice(0, 5).map((c) => ({ ...c, orders: db.orders.filter((o) => o.customerId === c.customerId && o.orderDate >= from && o.orderDate <= to).length })),
    [sales, db.orders, from, to],
  );

  const stockStatus = useMemo(
    () => db.items.filter((i) => i.stock > 0).sort((a, b) => b.stock - a.stock).slice(0, 5),
    [db.items],
  );

  const fulfillment = useMemo(() => delivery.map((d) => ({ date: d.date.slice(5), pct: d.onTimePct })), [delivery]);
  const deliveryTrend = useMemo(() => delivery.map((d) => ({ date: d.date.slice(5), delivered: d.delivered, partial: d.partial, failed: d.failed })), [delivery]);
  const outstandingTrend = useMemo(
    () => db.snapshots.filter((s) => s.date >= from && s.date <= to).map((s) => ({ date: s.date.slice(5), outstanding: s.outstanding })).sort((a, b) => (a.date < b.date ? -1 : 1)),
    [db.snapshots, from, to],
  );
  const orderVolume = useMemo(
    () => db.snapshots.filter((s) => s.date >= from && s.date <= to).map((s) => ({ date: s.date.slice(5), orders: s.ordersReceived })).sort((a, b) => (a.date < b.date ? -1 : 1)),
    [db.snapshots, from, to],
  );

  const recent = useMemo(() => db.auditLogs.slice(0, 5), [db.auditLogs]);

  const exportCsv = () => {
    const head = ['Customer', 'Orders', 'Sales'];
    const body = topCustomers.map((c) => [c.name, c.orders, c.amount]);
    const csv = [head, ...body].map((line) => line.map((v) => `"${String(v)}"`).join(',')).join('\r\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
    a.download = `analytics-${from}-to-${to}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  return (
    <div className="flex flex-col gap-4">
      <nav className="flex items-center gap-1 text-[12.5px] text-muted">
        <span>Reports</span>
        <ChevronRight size={13} className="text-subtle" />
        <span className="font-medium text-ink">Analytics</span>
      </nav>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 max-w-md">
          <h1 className="text-[26px] leading-tight font-bold tracking-[-0.01em] text-ink">Reports &amp; Analytics</h1>
          <p className="mt-1 text-[13px] text-muted">Get insights into your business performance and make better decisions.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <label className="flex items-center gap-1.5 text-[12.5px] text-muted">
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-9 rounded-lg border border-line bg-white px-2 text-[12.5px] text-ink" />
            <span>→</span>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-9 rounded-lg border border-line bg-white px-2 text-[12.5px] text-ink" />
          </label>
          <Button variant="primary" icon={Download} onClick={exportCsv}>Download Report</Button>
        </div>
      </div>

      <div className="overflow-hidden rounded-card border border-line bg-white shadow-card">
        <div className="flex gap-1 overflow-x-auto px-3 pt-2">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={cn(
                'shrink-0 border-b-2 px-3 pb-2.5 text-[13px] font-semibold whitespace-nowrap transition-colors',
                tab === t.key ? 'border-brand-700 text-brand-800' : 'border-transparent text-muted hover:text-ink',
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Kpi icon={ChartBar} tone="bg-fresh-50 text-fresh-600" value={inr(totalSales)} label="Total Sales" note={`${delta(totalSales, prevSales) >= 0 ? '↑' : '↓'} ${Math.abs(delta(totalSales, prevSales))}% vs last period`} />
        <Kpi icon={ShoppingCart} tone="bg-blue-50 text-blue-600" value={inr(totalPurchase)} label="Total Purchase" note={`${totalSales ? Math.round((totalPurchase / totalSales) * 100) : 0}% of sales`} />
        <Kpi icon={Package} tone="bg-orange-50 text-orange-600" value={String(orderCount)} label="Total Orders" note="in this period" />
        <Kpi icon={Users} tone="bg-violet-50 text-violet-600" value={String(activeCustomers)} label="Active Customers" note={`of ${db.customers.length} total`} />
        <Kpi icon={AlertTriangle} tone="bg-red-50 text-red-500" value={String(lowStockItems)} label="Low Stock Items" note="need attention" />
      </div>

      {tab === 'overview' && (
        <>
          <div className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)]">
            <ChartCard title="Sales vs Purchase Trend" legend={[{ label: 'Sales', color: FRESH }, { label: 'Purchase', color: ORANGE }]}>
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={salesVsPurchase}>
                  <defs>
                    <linearGradient id="salesFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={FRESH} stopOpacity={0.3} />
                      <stop offset="100%" stopColor={FRESH} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e3e8e4" vertical={false} />
                  <XAxis dataKey="date" tick={AXIS} axisLine={false} tickLine={false} />
                  <YAxis tick={AXIS} axisLine={false} tickLine={false} tickFormatter={(v) => inrCompact(v)} width={52} />
                  <Tooltip contentStyle={TOOLTIP} formatter={(v: any) => inr(Number(v))} />
                  <Area type="monotone" dataKey="sales" stroke={GREEN} strokeWidth={2} fill="url(#salesFill)" name="Sales" />
                  <Line type="monotone" dataKey="purchase" stroke={ORANGE} strokeWidth={2} dot={false} name="Purchase" />
                </AreaChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="Top Selling Items" action={<button onClick={() => nav('/reports/sales')} className="text-[12px] font-medium text-brand-700">View All →</button>}>
              <div className="flex flex-col gap-2.5">
                {topItems.map((i) => (
                  <div key={i.itemId}>
                    <div className="flex items-center gap-2">
                      <span className="shrink-0 text-[14px]">{i.item ? itemEmoji(i.item.name, i.item.category) : '🥬'}</span>
                      <p className="min-w-0 flex-1 truncate text-[12px] text-ink">{i.name}</p>
                      <p className="tabular shrink-0 text-[12px] font-semibold text-ink">{num(i.qty)} {i.unit}</p>
                    </div>
                    <div className="mt-1 h-2 overflow-hidden rounded-full bg-canvas">
                      <div className="h-full rounded-full bg-fresh-500" style={{ width: `${Math.max(3, i.pct)}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </ChartCard>

            <ChartCard title="Sales by Category">
              <div className="flex items-center gap-3">
                <div className="relative h-32 w-32 shrink-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={salesByCategory} dataKey="value" nameKey="name" innerRadius={38} outerRadius={58} paddingAngle={2}>
                        {salesByCategory.map((s) => <Cell key={s.name} fill={s.color} />)}
                      </Pie>
                      <Tooltip contentStyle={TOOLTIP} formatter={(v: any) => inr(Number(v))} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
                    <div>
                      <p className="tabular text-[13px] leading-none font-bold text-ink">{inrCompact(totalSales)}</p>
                      <p className="text-[10px] text-subtle">Total Sales</p>
                    </div>
                  </div>
                </div>
                <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                  {salesByCategory.map((s) => (
                    <div key={s.name} className="flex items-center gap-1.5 text-[11.5px]">
                      <span className="size-2 shrink-0 rounded-full" style={{ background: s.color }} />
                      <span className="min-w-0 flex-1 truncate text-muted">{s.name}</span>
                      <span className="tabular font-semibold text-ink">{totalSales ? Math.round((s.value / totalSales) * 100) : 0}%</span>
                    </div>
                  ))}
                </div>
              </div>
            </ChartCard>
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <ChartCard title="Top Customers" action={<button onClick={() => nav('/customers')} className="text-[12px] font-medium text-brand-700">View All →</button>}>
              <table className="w-full text-[12.5px]">
                <thead>
                  <tr className="border-b border-line text-[11px] font-semibold tracking-wide text-subtle uppercase">
                    <th className="w-8 py-2 text-center">#</th>
                    <th className="py-2 text-left">Customer Name</th>
                    <th className="py-2 text-right">Orders</th>
                    <th className="py-2 text-right">Total Purchase (₹)</th>
                  </tr>
                </thead>
                <tbody>
                  {topCustomers.map((c, i) => (
                    <tr key={c.customerId} className="border-b border-line last:border-0">
                      <td className="tabular py-2 text-center text-subtle">{i + 1}</td>
                      <td className="max-w-[150px] truncate py-2 text-ink">{c.name}</td>
                      <td className="tabular py-2 text-right text-muted">{c.orders}</td>
                      <td className="tabular py-2 text-right font-semibold text-ink">{inr(c.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </ChartCard>

            <ChartCard title="Stock Status" action={<button onClick={() => nav('/stock')} className="text-[12px] font-medium text-brand-700">View All →</button>}>
              <table className="w-full text-[12.5px]">
                <thead>
                  <tr className="border-b border-line text-[11px] font-semibold tracking-wide text-subtle uppercase">
                    <th className="w-8 py-2 text-center">#</th>
                    <th className="py-2 text-left">Item</th>
                    <th className="py-2 text-right">Current Stock</th>
                    <th className="py-2 text-center">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {stockStatus.map((i, idx) => {
                    const low = i.minStock > 0 && i.stock <= i.reorderLevel;
                    return (
                      <tr key={i.id} className="border-b border-line last:border-0">
                        <td className="tabular py-2 text-center text-subtle">{idx + 1}</td>
                        <td className="max-w-[140px] truncate py-2 text-ink">{itemEmoji(i.name, i.category)} {i.name}</td>
                        <td className="tabular py-2 text-right text-ink">{num(i.stock)} {i.unit}</td>
                        <td className="py-2 text-center">
                          <span className={cn('rounded-full px-2 py-0.5 text-[10.5px] font-semibold', low ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700')}>
                            {low ? 'Low' : 'Good'}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </ChartCard>

            <ChartCard title="Recent Activities" action={<button onClick={() => nav('/audit-logs')} className="text-[12px] font-medium text-brand-700">View All →</button>}>
              <table className="w-full text-[12.5px]">
                <thead>
                  <tr className="border-b border-line text-[11px] font-semibold tracking-wide text-subtle uppercase">
                    <th className="py-2 text-left">Time</th>
                    <th className="py-2 text-left">Activity</th>
                    <th className="py-2 text-left">User</th>
                  </tr>
                </thead>
                <tbody>
                  {recent.map((a) => (
                    <tr key={a.id} className="border-b border-line last:border-0">
                      <td className="py-2 whitespace-nowrap text-subtle">{fmtTime(a.at)}</td>
                      <td className="max-w-[150px] truncate py-2 text-ink">{a.action}</td>
                      <td className="max-w-[90px] truncate py-2 text-muted">{db.users.find((u) => u.id === a.userId)?.name ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </ChartCard>
          </div>
        </>
      )}

      {tab === 'sales' && (
        <div className="grid gap-4 lg:grid-cols-2">
          <ChartCard title="Daily Order Volume">
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={orderVolume}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e3e8e4" vertical={false} />
                <XAxis dataKey="date" tick={AXIS} axisLine={false} tickLine={false} />
                <YAxis tick={AXIS} axisLine={false} tickLine={false} width={28} />
                <Tooltip contentStyle={TOOLTIP} />
                <Line type="monotone" dataKey="orders" stroke={GREEN} strokeWidth={2} dot={false} name="Orders" />
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>
          <ChartCard title="Sales by Customer (Top 8)">
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={sales.slice(0, 8).map((c) => ({ name: c.name.length > 14 ? `${c.name.slice(0, 13)}…` : c.name, amount: c.amount }))} layout="vertical" margin={{ left: 12 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e3e8e4" horizontal={false} />
                <XAxis type="number" tick={AXIS} axisLine={false} tickLine={false} tickFormatter={(v) => inrCompact(v)} />
                <YAxis type="category" dataKey="name" tick={AXIS} axisLine={false} tickLine={false} width={96} />
                <Tooltip contentStyle={TOOLTIP} formatter={(v: any) => inr(Number(v))} />
                <Bar dataKey="amount" fill={FRESH} radius={[0, 4, 4, 0]} barSize={14} name="Sales" />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
          <ChartCard title="Outstanding Trend">
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={outstandingTrend}>
                <defs>
                  <linearGradient id="outFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={ORANGE} stopOpacity={0.3} />
                    <stop offset="100%" stopColor={ORANGE} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e3e8e4" vertical={false} />
                <XAxis dataKey="date" tick={AXIS} axisLine={false} tickLine={false} />
                <YAxis tick={AXIS} axisLine={false} tickLine={false} tickFormatter={(v) => inrCompact(v)} width={52} />
                <Tooltip contentStyle={TOOLTIP} formatter={(v: any) => inr(Number(v))} />
                <Area type="monotone" dataKey="outstanding" stroke={ORANGE} strokeWidth={2} fill="url(#outFill)" name="Outstanding" />
              </AreaChart>
            </ResponsiveContainer>
          </ChartCard>
          <ChartCard title="Sales by Item (Top 8)">
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={items.slice(0, 8).map((i) => ({ name: i.name.length > 14 ? `${i.name.slice(0, 13)}…` : i.name, amount: i.amount }))} layout="vertical" margin={{ left: 12 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e3e8e4" horizontal={false} />
                <XAxis type="number" tick={AXIS} axisLine={false} tickLine={false} tickFormatter={(v) => inrCompact(v)} />
                <YAxis type="category" dataKey="name" tick={AXIS} axisLine={false} tickLine={false} width={96} />
                <Tooltip contentStyle={TOOLTIP} formatter={(v: any) => inr(Number(v))} />
                <Bar dataKey="amount" fill={GREEN} radius={[0, 4, 4, 0]} barSize={14} name="Sales" />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>
      )}

      {tab === 'purchase' && (
        <div className="grid gap-4 lg:grid-cols-2">
          <ChartCard title="Purchase vs Sales" legend={[{ label: 'Sales', color: FRESH }, { label: 'Purchase', color: ORANGE }]}>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={salesVsPurchase}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e3e8e4" vertical={false} />
                <XAxis dataKey="date" tick={AXIS} axisLine={false} tickLine={false} />
                <YAxis tick={AXIS} axisLine={false} tickLine={false} tickFormatter={(v) => inrCompact(v)} width={52} />
                <Tooltip contentStyle={TOOLTIP} formatter={(v: any) => inr(Number(v))} />
                <Bar dataKey="sales" fill={FRESH} radius={[4, 4, 0, 0]} name="Sales" />
                <Bar dataKey="purchase" fill={ORANGE} radius={[4, 4, 0, 0]} name="Purchase" />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
          <ChartCard title="Margin Trend">
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={pvs.map((r) => ({ date: r.date.slice(5), margin: r.sales - r.purchase }))}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e3e8e4" vertical={false} />
                <XAxis dataKey="date" tick={AXIS} axisLine={false} tickLine={false} />
                <YAxis tick={AXIS} axisLine={false} tickLine={false} tickFormatter={(v) => inrCompact(v)} width={52} />
                <Tooltip contentStyle={TOOLTIP} formatter={(v: any) => inr(Number(v))} />
                <Line type="monotone" dataKey="margin" stroke={GREEN} strokeWidth={2} dot={false} name="Margin" />
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>
      )}

      {tab === 'inventory' && (
        <div className="grid gap-4 lg:grid-cols-2">
          <ChartCard title="Delivery Outcome by Day" legend={[{ label: 'Delivered', color: FRESH }, { label: 'Partial', color: ORANGE }, { label: 'Failed', color: '#ef4444' }]}>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={deliveryTrend}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e3e8e4" vertical={false} />
                <XAxis dataKey="date" tick={AXIS} axisLine={false} tickLine={false} />
                <YAxis tick={AXIS} axisLine={false} tickLine={false} width={28} />
                <Tooltip contentStyle={TOOLTIP} />
                <Bar dataKey="delivered" stackId="d" fill={FRESH} name="Delivered" />
                <Bar dataKey="partial" stackId="d" fill={ORANGE} name="Partial" />
                <Bar dataKey="failed" stackId="d" fill="#ef4444" radius={[4, 4, 0, 0]} name="Failed" />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
          <ChartCard title="On-time Fulfilment %">
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={fulfillment}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e3e8e4" vertical={false} />
                <XAxis dataKey="date" tick={AXIS} axisLine={false} tickLine={false} />
                <YAxis tick={AXIS} axisLine={false} tickLine={false} domain={[0, 100]} width={34} />
                <Tooltip contentStyle={TOOLTIP} formatter={(v: any) => `${v}%`} />
                <Line type="monotone" dataKey="pct" stroke={GREEN} strokeWidth={2} dot={false} name="On time" />
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>
      )}

      {tab === 'customers' && (
        <div className="grid gap-4 lg:grid-cols-2">
          <ChartCard title="Sales by Customer (Top 8)">
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={sales.slice(0, 8).map((c) => ({ name: c.name.length > 14 ? `${c.name.slice(0, 13)}…` : c.name, amount: c.amount }))} layout="vertical" margin={{ left: 12 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e3e8e4" horizontal={false} />
                <XAxis type="number" tick={AXIS} axisLine={false} tickLine={false} tickFormatter={(v) => inrCompact(v)} />
                <YAxis type="category" dataKey="name" tick={AXIS} axisLine={false} tickLine={false} width={96} />
                <Tooltip contentStyle={TOOLTIP} formatter={(v: any) => inr(Number(v))} />
                <Bar dataKey="amount" fill={FRESH} radius={[0, 4, 4, 0]} barSize={16} name="Sales" />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
          <ChartCard title="Outstanding Trend">
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={outstandingTrend}>
                <defs>
                  <linearGradient id="outFill2" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={ORANGE} stopOpacity={0.3} />
                    <stop offset="100%" stopColor={ORANGE} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e3e8e4" vertical={false} />
                <XAxis dataKey="date" tick={AXIS} axisLine={false} tickLine={false} />
                <YAxis tick={AXIS} axisLine={false} tickLine={false} tickFormatter={(v) => inrCompact(v)} width={52} />
                <Tooltip contentStyle={TOOLTIP} formatter={(v: any) => inr(Number(v))} />
                <Area type="monotone" dataKey="outstanding" stroke={ORANGE} strokeWidth={2} fill="url(#outFill2)" name="Outstanding" />
              </AreaChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>
      )}

      <div className="flex flex-col gap-3 rounded-card bg-gradient-to-r from-brand-800 to-fresh-600 p-5 text-white sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-[15px] font-semibold">Fresh Insights for a Better Tomorrow</p>
          <p className="text-[12.5px] text-white/80">Use data to reduce waste, improve supply chain efficiency, and serve fresh produce to more people.</p>
        </div>
        <Button variant="secondary" icon={ChartBar} onClick={() => nav('/reports/operations')}>Generate Custom Report</Button>
      </div>
    </div>
  );
}

function Kpi({ icon: Icon, tone, value, label, note }: { icon: LucideIcon; tone: string; value: string; label: string; note: string }) {
  return (
    <div className="rounded-card border border-line bg-white p-3.5 shadow-card">
      <div className="flex items-center gap-2.5">
        <span className={cn('grid size-10 shrink-0 place-items-center rounded-xl', tone)}><Icon size={18} /></span>
        <div className="min-w-0">
          <p className="tabular text-[17px] leading-none font-bold text-ink">{value}</p>
          <p className="mt-1 text-[11.5px] leading-tight font-medium text-ink">{label}</p>
          <p className="text-[10.5px] leading-tight text-subtle">{note}</p>
        </div>
      </div>
    </div>
  );
}

function ChartCard({ title, children, legend, action }: {
  title: string;
  children: React.ReactNode;
  legend?: { label: string; color: string }[];
  action?: React.ReactNode;
}) {
  return (
    <div className="rounded-card border border-line bg-white p-4 shadow-card">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="truncate text-[14px] font-semibold text-ink">{title}</h3>
        {legend ? (
          <div className="flex shrink-0 items-center gap-2.5">
            {legend.map((l) => (
              <span key={l.label} className="flex items-center gap-1 text-[11px] text-muted">
                <span className="size-2 rounded-full" style={{ background: l.color }} />
                {l.label}
              </span>
            ))}
          </div>
        ) : action}
      </div>
      {children}
    </div>
  );
}
