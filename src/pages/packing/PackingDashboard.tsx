import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid } from 'recharts';
import {
  Boxes, CheckCircle2, ChevronRight, ClipboardList, Info, LoaderCircle, Package, PackageCheck, Printer,
  RefreshCw, Search, Settings, Split, Tag, Truck, TriangleAlert, type LucideIcon,
} from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Input, Select } from '../../components/ui/Field';
import { EmptyState } from '../../components/ui/States';
import { useDb } from '../../store/useStore';
import { useOrdersSync, usePackingSync } from '../../store/useApiSync';
import { packingBoard, packingCounts, type PackingBoardRow } from '../../domain/packing';
import { fmtTime, num } from '../../lib/format';
import { todayISO } from '../../lib/clock';
import { itemEmoji } from '../orders/orderUi';
import { cn } from '../../lib/cn';

const TOOLTIP = { fontSize: 12, borderRadius: 8, border: '1px solid #e3e8e4', boxShadow: '0 4px 12px rgba(16,40,26,0.1)' };
const ROUTE_COLOR = ['#22683f', '#3aa64b', '#f59e0b', '#3b82f6', '#8b5cf6', '#ec4899'];

const TABS = [
  { key: 'To Pack', label: 'Orders to Pack' },
  { key: 'Packing', label: 'Packing In Progress' },
  { key: 'Packed', label: 'Packed' },
  { key: 'Issue', label: 'Packing Issues' },
] as const;
type TabKey = (typeof TABS)[number]['key'];

const CHECKLIST = [
  'Verify allocated items',
  'Check item quality',
  'Weigh / count items',
  'Pack as per customer requirement',
  'Label packages',
  'Mark as packed',
];

export function PackingDashboardPage() {
  const db = useDb();
  const nav = useNavigate();

  const [date, setDate] = useState(todayISO());

  const { refresh } = useOrdersSync({ deliveryDate: date });
  usePackingSync(date);
  const [tab, setTab] = useState<TabKey>('To Pack');
  const [search, setSearch] = useState('');
  const [routeId, setRouteId] = useState('');
  const [status, setStatus] = useState('');
  const [priority, setPriority] = useState('');
  const [checked, setChecked] = useState<number[]>([]);

  const allRows = useMemo(() => packingBoard(db, date), [db, date]);
  const counts = packingCounts(allRows);

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return allRows
      .filter((r) => r.status === tab)
      .filter((r) => !term || r.customer.name.toLowerCase().includes(term) || r.order.orderNo.toLowerCase().includes(term))
      .filter((r) => !routeId || r.route?.id === routeId)
      .filter((r) => !status || r.status === status)
      .filter((r) => !priority || r.priority === priority);
  }, [allRows, tab, search, routeId, status, priority]);

  const tabCount = (key: TabKey) => allRows.filter((r) => r.status === key).length;

  /* ------------------------------------------------------------- numbers */
  const packedLinesBy = useMemo(() => {
    const m = new Map<string, number>();
    for (const l of db.orderItems) {
      const q = l.qty.allocated ?? 0;
      if (q > 0) m.set(l.orderId, (m.get(l.orderId) ?? 0) + q);
    }
    return m;
  }, [db.orderItems]);

  const totalQty = allRows.reduce((s, r) => s + (packedLinesBy.get(r.order.id) ?? 0), 0);
  const totalItems = allRows.reduce((s, r) => s + r.allocatedLines, 0);
  const totalPackages = allRows.reduce((s, r) => s + (r.packing?.packages ?? Math.max(1, Math.ceil(r.allocatedLines / 6))), 0);
  const packedPct = allRows.length ? Math.round((counts.packed / allRows.length) * 100) : 0;

  const byRoute = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of allRows) m.set(r.route?.name ?? 'Other', (m.get(r.route?.name ?? 'Other') ?? 0) + 1);
    return [...m.entries()].map(([name, count], i) => ({ name, count, color: ROUTE_COLOR[i % ROUTE_COLOR.length] })).sort((a, b) => b.count - a.count);
  }, [allRows]);

  const topItems = useMemo(() => {
    const orderIds = new Set(allRows.map((r) => r.order.id));
    const m = new Map<string, number>();
    for (const l of db.orderItems) {
      if (!orderIds.has(l.orderId)) continue;
      const q = l.qty.allocated ?? l.qty.approved ?? l.qty.ordered ?? 0;
      if (q > 0) m.set(l.itemId, (m.get(l.itemId) ?? 0) + q);
    }
    return [...m.entries()]
      .map(([itemId, q]) => ({ item: db.items.find((i) => i.id === itemId), q }))
      .filter((r) => r.item)
      .sort((a, b) => b.q - a.q)
      .slice(0, 5);
  }, [allRows, db.orderItems, db.items]);

  const recent = useMemo(() => db.auditLogs.filter((a) => a.module === 'packing').slice(0, 5), [db.auditLogs]);

  return (
    <div className="flex flex-col gap-4">
      <nav className="no-print flex items-center gap-1 text-[12.5px] text-muted">
        <span>Operations</span>
        <ChevronRight size={13} className="text-subtle" />
        <span className="font-medium text-ink">Packing</span>
      </nav>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 max-w-md">
          <h1 className="text-[26px] leading-tight font-bold tracking-[-0.01em] text-ink">Packing Dashboard</h1>
          <p className="mt-1 text-[13px] text-muted">Manage and track customer-wise packing for today's deliveries.</p>
        </div>
        <div className="no-print flex flex-wrap items-center gap-2.5">
          <label className="flex items-center gap-2 text-[12.5px] font-medium text-muted">
            Packing Date
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-9 rounded-lg border border-line bg-white px-2.5 text-[13px] text-ink" />
          </label>
          <Select value={routeId} onChange={(e) => setRouteId(e.target.value)} placeholder="All Routes" className="w-40" options={db.routes.map((r) => ({ value: r.id, label: r.name }))} />
          <Button variant="primary" icon={Printer} onClick={() => window.print()}>Print Packing List</Button>
          <Button variant="secondary" icon={RefreshCw} onClick={() => void refresh()}>Refresh</Button>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex min-w-0 flex-col gap-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <Kpi icon={Package} tone="bg-fresh-50 text-fresh-600" value={String(counts.toPack)} label="Orders to Pack" note={`Total ${allRows.length} orders`} />
            <Kpi icon={LoaderCircle} tone="bg-blue-50 text-blue-600" value={String(counts.packing)} label="Packing In Progress" note={`${packedPct}% of today's packing`} />
            <Kpi icon={PackageCheck} tone="bg-amber-50 text-amber-600" value={String(counts.packed)} label="Orders Packed" note="Ready for dispatch" />
            <Kpi icon={Truck} tone="bg-violet-50 text-violet-600" value={String(totalPackages)} label="Total Packages" note="Today" />
            <Kpi icon={TriangleAlert} tone="bg-red-50 text-red-500" value={String(counts.issue)} label="Packing Issues" note="Items short / replacement" />
          </div>

          <div className="overflow-hidden rounded-card border border-line bg-white shadow-card">
            <div className="no-print flex gap-1 overflow-x-auto border-b border-line px-3 pt-2">
              {TABS.map((t) => (
                <button
                  key={t.key}
                  onClick={() => setTab(t.key)}
                  className={cn(
                    'shrink-0 border-b-2 px-3 pb-2.5 text-[13px] font-semibold whitespace-nowrap transition-colors',
                    tab === t.key ? 'border-brand-700 text-brand-800' : 'border-transparent text-muted hover:text-ink',
                  )}
                >
                  {t.label} <span className="tabular text-[11px] text-subtle">({tabCount(t.key)})</span>
                </button>
              ))}
            </div>

            <div className="no-print flex flex-wrap items-center gap-2.5 border-b border-line px-3 py-3">
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by customer, order no…" leading={<Search size={15} />} className="w-full sm:w-60" />
              <Select value={routeId} onChange={(e) => setRouteId(e.target.value)} placeholder="All Routes" className="w-40" options={db.routes.map((r) => ({ value: r.id, label: r.name }))} />
              <Select value={status} onChange={(e) => setStatus(e.target.value)} placeholder="All Status" options={['To Pack', 'Packing', 'Packed', 'Issue']} className="w-36" />
              <Select value={priority} onChange={(e) => setPriority(e.target.value)} placeholder="All Priority" options={['Urgent', 'Regular']} className="w-32" />
            </div>

            {rows.length === 0 ? (
              <EmptyState icon={PackageCheck} title="Nothing here" description="Orders appear here once stock is allocated." />
            ) : (
              <div className="scrollbar-thin overflow-x-auto print-area">
                <table className="w-full border-collapse text-[12.5px]">
                  <thead>
                    <tr className="border-b border-line bg-canvas/70 text-[11px] font-semibold tracking-wide text-subtle uppercase">
                      <th className="w-10 px-2 py-2.5 text-center">#</th>
                      <th className="px-3 py-2.5 text-left">Order No.</th>
                      <th className="px-3 py-2.5 text-left">Customer</th>
                      <th className="px-3 py-2.5 text-left">Delivery Route</th>
                      <th className="px-3 py-2.5 text-right">Items</th>
                      <th className="px-3 py-2.5 text-right">Total Qty</th>
                      <th className="px-3 py-2.5 text-center">Priority</th>
                      <th className="px-3 py-2.5 text-center">Packing Status</th>
                      <th className="px-3 py-2.5 text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r, i) => (
                      <tr key={r.order.id} className="border-b border-line last:border-0 hover:bg-fresh-50/40">
                        <td className="tabular px-2 py-2.5 text-center text-subtle">{i + 1}</td>
                        <td className="px-3 py-2.5 font-medium whitespace-nowrap text-brand-700">{r.order.orderNo}</td>
                        <td className="px-3 py-2.5 whitespace-nowrap text-ink">{r.customer.name}</td>
                        <td className="px-3 py-2.5 whitespace-nowrap text-muted">{r.route?.name ?? '—'}</td>
                        <td className="tabular px-3 py-2.5 text-right text-ink">{r.allocatedLines}</td>
                        <td className="tabular px-3 py-2.5 text-right text-ink">{num(packedLinesBy.get(r.order.id) ?? 0)}</td>
                        <td className="px-3 py-2.5 text-center">
                          <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-semibold', r.priority === 'Urgent' ? 'bg-red-50 text-red-600' : 'bg-blue-50 text-blue-700')}>
                            {r.priority === 'Urgent' ? 'High' : 'Normal'}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-center">
                          <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap',
                            r.status === 'Packed' ? 'bg-emerald-50 text-emerald-700'
                              : r.status === 'Packing' ? 'bg-blue-50 text-blue-700'
                              : r.status === 'Issue' ? 'bg-red-50 text-red-600' : 'bg-amber-50 text-amber-700')}>
                            {r.status === 'To Pack' ? 'Pending' : r.status === 'Packing' ? 'In Progress' : r.status}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-center">
                          <Button
                            variant={r.status === 'Packing' ? 'secondary' : 'primary'}
                            size="sm"
                            onClick={() => nav(`/packing/${r.order.id}`)}
                          >
                            {r.status === 'Packed' ? 'View' : r.status === 'Packing' ? 'Continue' : 'Start Packing'}
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* -------------------------------------------------- bottom cards */}
          <div className="grid gap-4 lg:grid-cols-3">
            <SideCard icon={Truck} title="Packing by Route">
              <div className="h-44 p-3">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={byRoute}>
                    <CartesianGrid vertical={false} stroke="#e3e8e4" />
                    <XAxis dataKey="name" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} interval={0} />
                    <YAxis tick={{ fontSize: 10 }} axisLine={false} tickLine={false} width={24} />
                    <Tooltip contentStyle={TOOLTIP} />
                    <Bar dataKey="count" radius={[4, 4, 0, 0]} barSize={26} name="Orders">
                      {byRoute.map((r) => <Cell key={r.name} fill={r.color} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </SideCard>

            <SideCard icon={Boxes} title="Top Items to Pack">
              <div className="flex flex-col divide-y divide-line">
                {topItems.map((r, i) => (
                  <div key={r.item!.id} className="flex items-center gap-2.5 px-4 py-2.5">
                    <span className="grid size-5 shrink-0 place-items-center rounded-full bg-brand-50 text-[10.5px] font-bold text-brand-800">{i + 1}</span>
                    <span className="shrink-0 text-[14px]">{itemEmoji(r.item!.name, r.item!.category)}</span>
                    <p className="min-w-0 flex-1 truncate text-[12.5px] text-ink">{r.item!.name}</p>
                    <p className="shrink-0 text-[11.5px] text-muted">{r.item!.unit}</p>
                    <p className="tabular shrink-0 text-[12.5px] font-semibold text-ink">{num(r.q)}</p>
                  </div>
                ))}
                {topItems.length === 0 && <p className="px-4 py-3 text-[12.5px] text-muted">Nothing allocated yet.</p>}
              </div>
            </SideCard>

            <SideCard icon={ClipboardList} title="Recent Packing Activity">
              <div className="flex flex-col divide-y divide-line">
                {recent.map((a) => (
                  <div key={a.id} className="flex items-center gap-2.5 px-4 py-2.5">
                    <p className="w-14 shrink-0 text-[11px] text-subtle">{fmtTime(a.at)}</p>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[12px] text-ink">{a.action}</p>
                      <p className="text-[11px] text-subtle">{db.users.find((u) => u.id === a.userId)?.name ?? '—'}</p>
                    </div>
                    <p className="shrink-0 text-[11.5px] font-medium text-brand-700">{a.recordRef}</p>
                  </div>
                ))}
                {recent.length === 0 && <p className="px-4 py-3 text-[12.5px] text-muted">No packing activity yet.</p>}
              </div>
            </SideCard>
          </div>
        </div>

        {/* ================================================ right sidebar */}
        <div className="no-print flex flex-col gap-4">
          <SideCard icon={ClipboardList} title="Today's Packing Summary">
            <div className="flex flex-col">
              <SummaryRow label="Total Orders" value={String(allRows.length)} />
              <SummaryRow label="Orders to Pack" value={String(counts.toPack)} />
              <SummaryRow label="Packing In Progress" value={String(counts.packing)} />
              <SummaryRow label="Packed" value={String(counts.packed)} strong />
              <SummaryRow label="Total Items" value={String(totalItems)} />
              <SummaryRow label="Total Quantity" value={num(totalQty)} />
              <SummaryRow label="Total Packages" value={String(totalPackages)} />
            </div>
          </SideCard>

          <SideCard icon={CheckCircle2} title="Packing Checklist">
            <div className="flex flex-col divide-y divide-line">
              {CHECKLIST.map((c, i) => (
                <button
                  key={c}
                  onClick={() => setChecked((prev) => (prev.includes(i) ? prev.filter((x) => x !== i) : [...prev, i]))}
                  className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left hover:bg-fresh-50/40"
                >
                  <span className={cn('grid size-5 shrink-0 place-items-center rounded-full text-[10.5px] font-bold',
                    checked.includes(i) ? 'bg-fresh-500 text-white' : 'bg-canvas text-subtle')}>
                    {checked.includes(i) ? '✓' : i + 1}
                  </span>
                  <span className={cn('min-w-0 flex-1 truncate text-[12.5px]', checked.includes(i) ? 'text-subtle line-through' : 'text-ink')}>{c}</span>
                </button>
              ))}
            </div>
            <div className="border-t border-line px-4 py-2 text-right text-[11.5px] text-subtle">{checked.length}/{CHECKLIST.length}</div>
          </SideCard>

          <SideCard icon={Settings} title="Quick Actions">
            <div className="flex flex-col divide-y divide-line">
              {[
                { icon: ClipboardList, label: 'Generate Packing List', action: () => window.print() },
                { icon: Tag, label: 'Print Labels', action: () => window.print() },
                { icon: Split, label: 'View Allocation', action: () => nav('/allocation') },
                { icon: Truck, label: 'Go to Delivery', action: () => nav('/delivery') },
              ].map((q) => (
                <button key={q.label} onClick={q.action} className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left hover:bg-fresh-50/40">
                  <q.icon size={15} className="shrink-0 text-brand-700" />
                  <span className="min-w-0 flex-1 truncate text-[12.5px] text-ink">{q.label}</span>
                  <ChevronRight size={14} className="shrink-0 text-subtle" />
                </button>
              ))}
            </div>
          </SideCard>
        </div>
      </div>

      <div className="no-print flex items-start gap-2.5 rounded-card border border-blue-200 bg-blue-50/60 p-3.5">
        <Info size={16} className="mt-0.5 shrink-0 text-blue-600" />
        <p className="min-w-0 flex-1 text-[12.5px] text-blue-900/80">
          Packing is based on allocated quantities. Any shortage will be highlighted during packing.
        </p>
        <Button variant="secondary" size="sm" onClick={() => nav('/allocation')}>Learn More</Button>
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
          <p className="tabular text-[20px] leading-none font-bold text-ink">{value}</p>
          <p className="mt-1 text-[11.5px] leading-tight font-medium text-ink">{label}</p>
          <p className="text-[10.5px] leading-tight text-subtle">{note}</p>
        </div>
      </div>
    </div>
  );
}

function SideCard({ icon: Icon, title, children }: { icon: LucideIcon; title: string; children: React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded-card border border-line bg-white shadow-card">
      <div className="flex items-center gap-2 border-b border-line px-4 py-3">
        <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-fresh-50 text-fresh-600"><Icon size={15} /></span>
        <h3 className="truncate text-[13.5px] font-semibold text-ink">{title}</h3>
      </div>
      {children}
    </div>
  );
}

function SummaryRow({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-center gap-2.5 border-b border-line px-4 py-2.5 last:border-0">
      <p className="min-w-0 flex-1 truncate text-[12.5px] text-muted">{label}</p>
      <p className={cn('tabular shrink-0 text-[12.5px] font-semibold', strong ? 'text-brand-700' : 'text-ink')}>{value}</p>
    </div>
  );
}
