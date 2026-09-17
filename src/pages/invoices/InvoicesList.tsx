import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { Bar, Cell, ComposedChart, Line, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid } from 'recharts';
import {
  AlertTriangle, ChevronRight, Clock, Download, Ellipsis, FileText, Filter, Grid3x3, IndianRupee, Plus,
  Receipt, Search, Settings, TrendingUp, Upload, Wallet, type LucideIcon,
} from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Input, Select } from '../../components/ui/Field';
import { EmptyState } from '../../components/ui/States';
import { useDb } from '../../store/useStore';
import { invoiceViews } from '../../domain/finance';
import { addDays, fmtDate, inr, inrCompact } from '../../lib/format';
import { todayISO } from '../../lib/clock';
import { cn } from '../../lib/cn';

const TOOLTIP = { fontSize: 12, borderRadius: 8, border: '1px solid #e3e8e4', boxShadow: '0 4px 12px rgba(16,40,26,0.1)' };
const STATUS_TONE: Record<string, string> = {
  Paid: 'bg-emerald-50 text-emerald-700',
  'Partially Paid': 'bg-amber-50 text-amber-700',
  Overdue: 'bg-red-50 text-red-600',
  Sent: 'bg-blue-50 text-blue-700',
  Generated: 'bg-blue-50 text-blue-700',
  Draft: 'bg-canvas text-muted',
  Cancelled: 'bg-canvas text-subtle',
};
const STATUS_COLOR: Record<string, string> = {
  Paid: '#22683f', 'Partially Paid': '#f59e0b', Sent: '#3b82f6', Generated: '#60a5fa', Overdue: '#ef4444', Draft: '#cbd4cf', Cancelled: '#94a3b8',
};

const TABS = [
  { key: 'all', label: 'All Invoices' },
  { key: 'Draft', label: 'Draft' },
  { key: 'Sent', label: 'Sent' },
  { key: 'Partially Paid', label: 'Partially Paid' },
  { key: 'Paid', label: 'Paid' },
  { key: 'Overdue', label: 'Overdue' },
] as const;
type TabKey = (typeof TABS)[number]['key'];

export function InvoicesListPage() {
  const db = useDb();
  const nav = useNavigate();
  const today = todayISO();

  const [tab, setTab] = useState<TabKey>('all');
  const [search, setSearch] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [status, setStatus] = useState('');
  const [from, setFrom] = useState(addDays(today, -60));
  const [to, setTo] = useState(today);
  const [page, setPage] = useState(1);

  const views = useMemo(() => invoiceViews(db, today), [db, today]);
  const custById = useMemo(() => new Map(db.customers.map((c) => [c.id, c])), [db.customers]);

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return views
      .filter((i) => (tab === 'all' ? true : i.derivedStatus === tab))
      .filter((i) => {
        const cust = custById.get(i.customerId);
        if (term && !(i.invoiceNo.toLowerCase().includes(term) || (cust?.name ?? '').toLowerCase().includes(term))) return false;
        if (status && i.derivedStatus !== status) return false;
        if (customerId && i.customerId !== customerId) return false;
        if (i.invoiceDate < from || i.invoiceDate > to) return false;
        return true;
      })
      .sort((a, b) => (a.invoiceDate < b.invoiceDate ? 1 : a.invoiceDate > b.invoiceDate ? -1 : b.invoiceNo.localeCompare(a.invoiceNo)));
  }, [views, tab, search, status, customerId, from, to, custById]);

  const pageSize = 10;
  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const pageRows = rows.slice((page - 1) * pageSize, page * pageSize);
  const tabCount = (key: TabKey) => (key === 'all' ? views.length : views.filter((i) => i.derivedStatus === key).length);

  /* ------------------------------------------------------------- numbers */
  const totalValue = views.reduce((s, i) => s + i.total, 0);
  const paidAmount = views.reduce((s, i) => s + i.paid, 0);
  const outstanding = views.reduce((s, i) => s + i.balance, 0);
  const overdue = views.filter((i) => i.derivedStatus === 'Overdue').reduce((s, i) => s + i.balance, 0);

  const byStatus = useMemo(() => {
    const m = new Map<string, number>();
    for (const i of views) m.set(i.derivedStatus, (m.get(i.derivedStatus) ?? 0) + 1);
    return [...m.entries()]
      .map(([name, value]) => ({ name, value, color: STATUS_COLOR[name] ?? '#94a3b8' }))
      .sort((a, b) => b.value - a.value);
  }, [views]);

  const trend = useMemo(() => {
    const out: { label: string; value: number; outstanding: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const month = addDays(today, -30 * i).slice(0, 7);
      const list = views.filter((v) => v.invoiceDate.slice(0, 7) === month);
      out.push({
        label: new Date(`${month}-01`).toLocaleDateString('en-IN', { month: 'short' }),
        value: list.reduce((s, v) => s + v.total, 0),
        outstanding: list.reduce((s, v) => s + v.balance, 0),
      });
    }
    return out;
  }, [views, today]);

  const topCustomers = useMemo(() => {
    const m = new Map<string, number>();
    for (const i of views) m.set(i.customerId, (m.get(i.customerId) ?? 0) + i.total);
    const max = Math.max(...m.values(), 1);
    return [...m.entries()]
      .map(([id, value]) => ({ customer: custById.get(id), value, pct: Math.round((value / max) * 100) }))
      .filter((r) => r.customer)
      .sort((a, b) => b.value - a.value)
      .slice(0, 5);
  }, [views, custById]);

  const aging = useMemo(() => {
    const buckets = [
      { label: '0 - 30 Days', min: 0, max: 30, color: '#3aa64b' },
      { label: '31 - 60 Days', min: 31, max: 60, color: '#f59e0b' },
      { label: '61 - 90 Days', min: 61, max: 90, color: '#f97316' },
      { label: '> 90 Days', min: 91, max: Infinity, color: '#ef4444' },
    ];
    return buckets.map((b) => {
      const amount = views
        .filter((i) => i.balance > 0)
        .filter((i) => {
          const age = Math.max(i.daysOverdue, 0);
          return age >= b.min && age <= b.max;
        })
        .reduce((s, i) => s + i.balance, 0);
      return { ...b, amount, pct: outstanding ? Math.round((amount / outstanding) * 100) : 0 };
    });
  }, [views, outstanding]);

  const exportCsv = () => {
    const head = ['Invoice No.', 'Customer', 'Invoice Date', 'Due Date', 'Total Amount', 'Paid Amount', 'Balance', 'Status'];
    const body = rows.map((i) => [i.invoiceNo, custById.get(i.customerId)?.name ?? '', fmtDate(i.invoiceDate), fmtDate(i.dueDate), i.total, i.paid, i.balance, i.derivedStatus]);
    const csv = [head, ...body].map((line) => line.map((v) => `"${String(v)}"`).join(',')).join('\r\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
    a.download = `invoices-${today}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  return (
    <div className="flex flex-col gap-4">
      <nav className="flex items-center gap-1 text-[12.5px] text-muted">
        <span>Finance</span>
        <ChevronRight size={13} className="text-subtle" />
        <span className="font-medium text-ink">Invoices</span>
      </nav>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 max-w-md">
          <h1 className="text-[26px] leading-tight font-bold tracking-[-0.01em] text-ink">Invoice Management</h1>
          <p className="mt-1 text-[13px] text-muted">Create and manage sales invoices, track payments and monitor outstanding amounts.</p>
        </div>
        <Button variant="primary" icon={Plus} onClick={() => nav('/invoices/new')}>Create Invoice</Button>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex min-w-0 flex-col gap-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Kpi icon={FileText} tone="bg-fresh-50 text-fresh-600" value={String(views.length)} label="Total Invoices" note={`${tabCount('Paid')} fully paid`} />
            <Kpi icon={IndianRupee} tone="bg-blue-50 text-blue-600" value={inr(totalValue)} label="Total Invoice Value" note="all invoices" />
            <Kpi icon={Wallet} tone="bg-violet-50 text-violet-600" value={inr(paidAmount)} label="Paid Amount" note={`${totalValue ? Math.round((paidAmount / totalValue) * 100) : 0}% of total`} />
            <Kpi icon={AlertTriangle} tone="bg-red-50 text-red-500" value={inr(overdue)} label="Overdue Amount" note={`${tabCount('Overdue')} invoices`} />
          </div>

          <div className="overflow-hidden rounded-card border border-line bg-white shadow-card">
            <div className="flex gap-1 overflow-x-auto border-b border-line px-3 pt-2">
              {TABS.map((t) => (
                <button
                  key={t.key}
                  onClick={() => { setTab(t.key); setPage(1); }}
                  className={cn(
                    'shrink-0 border-b-2 px-3 pb-2.5 text-[13px] font-semibold whitespace-nowrap transition-colors',
                    tab === t.key ? 'border-brand-700 text-brand-800' : 'border-transparent text-muted hover:text-ink',
                  )}
                >
                  {t.label} <span className="tabular text-[11px] text-subtle">({tabCount(t.key)})</span>
                </button>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-2.5 border-b border-line px-3 py-3">
              <Input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder="Search by invoice no., customer name, or reference…" leading={<Search size={15} />} className="w-full sm:w-64" />
              <Select value={customerId} onChange={(e) => { setCustomerId(e.target.value); setPage(1); }} placeholder="All Customers" className="w-44" options={db.customers.map((c) => ({ value: c.id, label: c.name }))} />
              <Select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} placeholder="All Status" options={['Draft', 'Generated', 'Sent', 'Partially Paid', 'Paid', 'Overdue']} className="w-36" />
              <label className="flex items-center gap-1.5 text-[12.5px] text-muted">
                <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-9 rounded-lg border border-line bg-white px-2 text-[12.5px] text-ink" />
                <span>→</span>
                <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-9 rounded-lg border border-line bg-white px-2 text-[12.5px] text-ink" />
              </label>
              <Button variant="secondary" size="sm" icon={Filter}>Filters</Button>
              <Button variant="secondary" size="sm" icon={Download} onClick={exportCsv} className="ml-auto">Export</Button>
            </div>

            {rows.length === 0 ? (
              <EmptyState icon={FileText} title="No invoices found" description="Invoices generate from delivered orders." action={<Button size="sm" variant="primary" icon={Plus} onClick={() => nav('/invoices/new')} className="mt-1">Create Invoice</Button>} />
            ) : (
              <>
                <div className="scrollbar-thin overflow-x-auto">
                  <table className="w-full border-collapse text-[12.5px]">
                    <thead>
                      <tr className="border-b border-line bg-canvas/70 text-[11px] font-semibold tracking-wide text-subtle uppercase">
                        <th className="w-10 px-2 py-2.5 text-center">#</th>
                        <th className="px-3 py-2.5 text-left">Invoice No.</th>
                        <th className="px-3 py-2.5 text-left">Customer Name</th>
                        <th className="px-3 py-2.5 text-left">Invoice Date</th>
                        <th className="px-3 py-2.5 text-left">Due Date</th>
                        <th className="px-3 py-2.5 text-right">Total Amount (₹)</th>
                        <th className="px-3 py-2.5 text-right">Paid Amount (₹)</th>
                        <th className="px-3 py-2.5 text-right">Balance (₹)</th>
                        <th className="px-3 py-2.5 text-center">Status</th>
                        <th className="w-10 px-2 py-2.5" />
                      </tr>
                    </thead>
                    <tbody>
                      {pageRows.map((i, idx) => (
                        <tr key={i.id} onClick={() => nav(`/invoices/${i.id}`)} className="cursor-pointer border-b border-line last:border-0 hover:bg-fresh-50/40">
                          <td className="tabular px-2 py-2.5 text-center text-subtle">{(page - 1) * pageSize + idx + 1}</td>
                          <td className="px-3 py-2.5 font-medium whitespace-nowrap text-brand-700">{i.invoiceNo}</td>
                          <td className="px-3 py-2.5 whitespace-nowrap text-ink">{custById.get(i.customerId)?.name ?? '—'}</td>
                          <td className="px-3 py-2.5 whitespace-nowrap text-muted">{fmtDate(i.invoiceDate)}</td>
                          <td className="px-3 py-2.5 whitespace-nowrap text-muted">{fmtDate(i.dueDate)}</td>
                          <td className="tabular px-3 py-2.5 text-right font-semibold text-ink">{inr(i.total)}</td>
                          <td className="tabular px-3 py-2.5 text-right text-muted">{i.paid ? inr(i.paid) : '0'}</td>
                          <td className={cn('tabular px-3 py-2.5 text-right font-medium', i.balance ? 'text-orange-600' : 'text-muted')}>{i.balance ? inr(i.balance) : '0'}</td>
                          <td className="px-3 py-2.5 text-center">
                            <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap', STATUS_TONE[i.derivedStatus] ?? 'bg-canvas text-muted')}>{i.derivedStatus}</span>
                          </td>
                          <td className="px-2 py-2.5 text-center text-subtle" onClick={(e) => e.stopPropagation()}><Ellipsis size={15} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line px-3.5 py-2.5 text-[12.5px] text-muted">
                  <span>Showing {(page - 1) * pageSize + 1} to {Math.min(page * pageSize, rows.length)} of {rows.length} invoices</span>
                  <div className="flex items-center gap-1">
                    <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>‹</Button>
                    {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => i + 1).map((p) => (
                      <button key={p} onClick={() => setPage(p)} className={cn('grid size-7 place-items-center rounded-md text-[12.5px] font-medium', p === page ? 'bg-brand-800 text-white' : 'text-muted hover:bg-canvas')}>{p}</button>
                    ))}
                    <Button variant="secondary" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>›</Button>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* -------------------------------------------------- bottom cards */}
          <div className="grid gap-4 lg:grid-cols-3">
            <SideCard icon={FileText} title="Invoice Status Distribution">
              <div className="flex items-center gap-3 p-4">
                <div className="relative h-32 w-32 shrink-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={byStatus} dataKey="value" nameKey="name" innerRadius={38} outerRadius={58} paddingAngle={2}>
                        {byStatus.map((s) => <Cell key={s.name} fill={s.color} />)}
                      </Pie>
                      <Tooltip contentStyle={TOOLTIP} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
                    <div>
                      <p className="tabular text-[17px] leading-none font-bold text-ink">{views.length}</p>
                      <p className="text-[10px] text-subtle">Total Invoices</p>
                    </div>
                  </div>
                </div>
                <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                  {byStatus.map((s) => (
                    <div key={s.name} className="flex items-center gap-1.5 text-[11.5px]">
                      <span className="size-2 shrink-0 rounded-full" style={{ background: s.color }} />
                      <span className="min-w-0 flex-1 truncate text-muted">{s.name}</span>
                      <span className="tabular font-semibold text-ink">{s.value} <span className="font-normal text-subtle">({views.length ? Math.round((s.value / views.length) * 100) : 0}%)</span></span>
                    </div>
                  ))}
                </div>
              </div>
            </SideCard>

            <SideCard icon={TrendingUp} title="Invoice Value Trend">
              <div className="h-44 p-3">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={trend}>
                    <CartesianGrid vertical={false} stroke="#e3e8e4" />
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={(v) => inrCompact(v)} width={44} />
                    <Tooltip contentStyle={TOOLTIP} formatter={(v: any) => inr(Number(v))} />
                    <Bar dataKey="value" fill="#3aa64b" radius={[4, 4, 0, 0]} barSize={18} name="Invoice Value" />
                    <Line type="monotone" dataKey="outstanding" stroke="#f59e0b" strokeWidth={2} dot={{ r: 3 }} name="Outstanding" />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </SideCard>

            <SideCard icon={Receipt} title="Top Customers by Invoice Value">
              <div className="flex flex-col gap-2.5 px-4 py-3.5">
                {topCustomers.map((r, i) => (
                  <div key={r.customer!.id}>
                    <div className="flex items-center justify-between gap-2">
                      <p className="min-w-0 truncate text-[12px] text-ink">{i + 1}. {r.customer!.name}</p>
                      <p className="tabular shrink-0 text-[12px] font-semibold text-ink">{inr(r.value)}</p>
                    </div>
                    <div className="mt-1 h-2 overflow-hidden rounded-full bg-canvas">
                      <div className="h-full rounded-full bg-fresh-500" style={{ width: `${Math.max(3, r.pct)}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </SideCard>
          </div>
        </div>

        {/* ================================================ right sidebar */}
        <div className="flex flex-col gap-4">
          <SideCard icon={FileText} title="Invoice Summary">
            <div className="flex flex-col">
              <SummaryRow icon={FileText} label="Total Invoices" value={String(views.length)} />
              <SummaryRow icon={IndianRupee} label="Total Invoice Value" value={inr(totalValue)} />
              <SummaryRow icon={Wallet} label="Paid Amount" value={inr(paidAmount)} />
              <SummaryRow icon={Clock} label="Outstanding Amount" value={inr(outstanding)} strong />
              <SummaryRow icon={AlertTriangle} label="Overdue Amount" value={inr(overdue)} strong />
            </div>
          </SideCard>

          <SideCard icon={Clock} title="Aging Analysis (Outstanding)">
            <div className="flex flex-col gap-3 px-4 py-3.5">
              {aging.map((b) => (
                <div key={b.label}>
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[12.5px] text-ink">{b.label}</p>
                    <p className="tabular text-[12.5px] font-semibold text-ink">{inr(b.amount)} <span className="font-normal text-muted">({b.pct}%)</span></p>
                  </div>
                  <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-canvas">
                    <div className="h-full rounded-full" style={{ width: `${Math.max(2, b.pct)}%`, background: b.color }} />
                  </div>
                </div>
              ))}
            </div>
          </SideCard>

          <SideCard icon={Settings} title="Quick Actions">
            <div className="flex flex-col divide-y divide-line">
              {[
                { icon: Plus, label: 'Create New Invoice', action: () => nav('/invoices/new') },
                { icon: Upload, label: 'Bulk Invoice Upload', action: () => nav('/invoices/new') },
                { icon: Wallet, label: 'View Outstanding', action: () => nav('/outstanding') },
                { icon: Receipt, label: 'Payment Receipts', action: () => nav('/payments') },
                { icon: Download, label: 'Export Invoices', action: exportCsv },
                { icon: Settings, label: 'Invoice Settings', action: () => nav('/settings') },
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

      <div className="rounded-card bg-gradient-to-r from-brand-800 to-fresh-600 p-5 text-white">
        <p className="text-[15px] font-semibold">Healthy Finances. Stronger Partnerships.</p>
        <p className="text-[12.5px] text-white/80">Track your receivables, get paid faster and grow your business with better financial visibility.</p>
      </div>
    </div>
  );
}

function Kpi({ icon: Icon, tone, value, label, note }: { icon: LucideIcon; tone: string; value: string; label: string; note: string }) {
  return (
    <div className="rounded-card border border-line bg-white p-3.5 shadow-card">
      <div className="flex items-center gap-3">
        <span className={cn('grid size-11 shrink-0 place-items-center rounded-xl', tone)}><Icon size={20} /></span>
        <div className="min-w-0">
          <p className="tabular text-[19px] leading-none font-bold text-ink">{value}</p>
          <p className="mt-1 text-[12px] leading-tight font-medium text-ink">{label}</p>
          <p className="text-[11px] leading-tight text-subtle">{note}</p>
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

function SummaryRow({ icon: Icon, label, value, strong }: { icon: LucideIcon; label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-center gap-2.5 border-b border-line px-4 py-2.5 last:border-0">
      <Icon size={14} className="shrink-0 text-subtle" />
      <p className="min-w-0 flex-1 truncate text-[12.5px] text-muted">{label}</p>
      <p className={cn('tabular shrink-0 text-[12.5px] font-semibold', strong ? 'text-brand-700' : 'text-ink')}>{value}</p>
    </div>
  );
}
