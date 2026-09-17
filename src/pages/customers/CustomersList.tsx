import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { Bar, BarChart, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid } from 'recharts';
import {
  ChevronRight, Download, Ellipsis, Handshake, IndianRupee, Mail, MapPin, Phone, Plus, Receipt, Search,
  ShoppingCart, TrendingUp, Upload, Users, type LucideIcon,
} from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Input, Select } from '../../components/ui/Field';
import { EmptyState } from '../../components/ui/States';
import { Menu } from '../../components/ui/Dropdown';
import { CustomerForm } from './CustomerForm';
import { ImportModal } from '../../components/ui/ImportModal';
import { useToast } from '../../components/ui/Toast';
import { addCustomer, nextCustomerCode } from '../../store/actions';
import { pick } from '../../lib/csv';
import { useCurrentUser, useDb, useStore } from '../../store/useStore';
import { CUSTOMER_TYPES, type Customer } from '../../types/models';
import { addDays, fmtDate, inr, inrCompact } from '../../lib/format';
import { customerOutstanding } from '../../domain/finance';
import { todayISO } from '../../lib/clock';
import { cn } from '../../lib/cn';

const TOOLTIP = { fontSize: 12, borderRadius: 8, border: '1px solid #e3e8e4', boxShadow: '0 4px 12px rgba(16,40,26,0.1)' };
const TYPE_COLOR: Record<string, string> = { Hotel: '#22683f', Restaurant: '#f59e0b', Cafe: '#3b82f6', Caterer: '#8b5cf6', Corporate: '#ec4899', Other: '#94a3b8' };

const TABS = [
  { key: 'all', label: 'All Customers' },
  { key: 'active', label: 'Active' },
  { key: 'inactive', label: 'Inactive' },
  { key: 'top', label: 'Top Customers' },
] as const;
type TabKey = (typeof TABS)[number]['key'];

export function CustomersListPage() {
  const db = useDb();
  const user = useCurrentUser()!;
  const toast = useToast();
  const nav = useNavigate();
  const location_ = useLocation();
  const today = todayISO();

  const [tab, setTab] = useState<TabKey>('all');
  const [search, setSearch] = useState('');
  const [type, setType] = useState('');
  const [location, setLocation] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);

  // /customers/new opens straight into the add form, then returns to the list.
  useEffect(() => {
    if (location_.pathname === '/customers/new') setFormOpen(true);
  }, [location_.pathname]);
  const closeForm = () => {
    setFormOpen(false);
    if (location_.pathname === '/customers/new') nav('/customers');
  };

  const outstandingBy = useMemo(() => customerOutstanding(db, today), [db, today]);
  const orderCountBy = useMemo(() => {
    const m = new Map<string, number>();
    for (const o of db.orders) m.set(o.customerId, (m.get(o.customerId) ?? 0) + 1);
    return m;
  }, [db.orders]);
  const salesBy = useMemo(() => {
    const byOrder = new Map<string, string>(db.orders.map((o) => [o.id, o.customerId]));
    const m = new Map<string, number>();
    for (const l of db.orderItems) {
      const cid = byOrder.get(l.orderId);
      if (!cid) continue;
      const q = l.qty.delivered ?? l.qty.packed ?? l.qty.ordered ?? 0;
      m.set(cid, (m.get(cid) ?? 0) + q * l.rate);
    }
    return m;
  }, [db.orders, db.orderItems]);

  const locations = useMemo(() => [...new Set(db.customers.map((c) => c.location))].sort(), [db.customers]);
  const topIds = useMemo(
    () => new Set([...salesBy.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([id]) => id)),
    [salesBy],
  );
  const newCustomers = useMemo(
    () => db.customers.filter((c) => (c.createdAt ?? '').slice(0, 10) >= addDays(today, -30)).length,
    [db.customers, today],
  );

  const inTab = (c: Customer) =>
    tab === 'active' ? c.active : tab === 'inactive' ? !c.active : tab === 'top' ? topIds.has(c.id) : true;

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return db.customers
      .filter(inTab)
      .filter((c) => {
        if (term && !(c.name.toLowerCase().includes(term) || c.code.toLowerCase().includes(term) || c.legalName.toLowerCase().includes(term) || c.contactPerson.toLowerCase().includes(term))) return false;
        if (type && c.type !== type) return false;
        if (location && c.location !== location) return false;
        if (status === 'active' && !c.active) return false;
        if (status === 'inactive' && c.active) return false;
        return true;
      })
      .sort((a, b) => (salesBy.get(b.id) ?? 0) - (salesBy.get(a.id) ?? 0));
  }, [db.customers, search, type, location, status, tab, topIds, salesBy]);

  const pageSize = 10;
  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const pageRows = rows.slice((page - 1) * pageSize, page * pageSize);
  const tabCount = (key: TabKey) => db.customers.filter((c) => (key === 'active' ? c.active : key === 'inactive' ? !c.active : key === 'top' ? topIds.has(c.id) : true)).length;

  const detail = db.customers.find((c) => c.id === selectedId) ?? pageRows[0] ?? null;
  const detailOrders = useMemo(
    () => (detail ? db.orders.filter((o) => o.customerId === detail.id).sort((a, b) => (a.orderDate < b.orderDate ? 1 : -1)).slice(0, 5) : []),
    [db.orders, detail],
  );

  const totalSales = [...salesBy.values()].reduce((s, v) => s + v, 0);
  const byType = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of db.customers) m.set(c.type, (m.get(c.type) ?? 0) + 1);
    return [...m.entries()].map(([name, value]) => ({ name, value, color: TYPE_COLOR[name] ?? '#94a3b8' })).sort((a, b) => b.value - a.value);
  }, [db.customers]);

  const topCustomers = useMemo(() => {
    const max = Math.max(...salesBy.values(), 1);
    return [...salesBy.entries()]
      .map(([id, value]) => ({ customer: db.customers.find((c) => c.id === id), value, pct: Math.round((value / max) * 100) }))
      .filter((r) => r.customer)
      .sort((a, b) => b.value - a.value)
      .slice(0, 5);
  }, [salesBy, db.customers]);

  const growth = useMemo(() => {
    const out: { label: string; count: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const cutoff = addDays(today, -30 * i);
      out.push({
        label: new Date(cutoff).toLocaleDateString('en-IN', { month: 'short' }),
        count: db.customers.filter((c) => (c.createdAt ?? '2026-01-01').slice(0, 10) <= cutoff).length,
      });
    }
    return out;
  }, [db.customers, today]);

  const exportCsv = () => {
    const head = ['Customer Name', 'Customer Code', 'Type', 'City', 'Contact Person', 'Phone', 'Total Orders', 'Total Purchase', 'Outstanding', 'Status'];
    const body = rows.map((c) => [c.name, c.code, c.type, c.location, c.contactPerson, c.mobile, orderCountBy.get(c.id) ?? 0, Math.round(salesBy.get(c.id) ?? 0), Math.round(outstandingBy.get(c.id) ?? 0), c.active ? 'Active' : 'Inactive']);
    const csv = [head, ...body].map((line) => line.map((v) => `"${String(v)}"`).join(',')).join('\r\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
    a.download = `customers-${today}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  return (
    <div className="flex flex-col gap-4">
      <nav className="flex items-center gap-1 text-[12.5px] text-muted">
        <span>Customers</span>
        <ChevronRight size={13} className="text-subtle" />
        <span className="font-medium text-ink">Customer Management</span>
      </nav>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 max-w-md">
          <h1 className="text-[26px] leading-tight font-bold tracking-[-0.01em] text-ink">Customer Management</h1>
          <p className="mt-1 text-[13px] text-muted">Manage your customers, view order history and build stronger relationships.</p>
        </div>
        <Button variant="primary" icon={Plus} onClick={() => setFormOpen(true)}>Add New Customer</Button>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex min-w-0 flex-col gap-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Kpi icon={Users} tone="bg-fresh-50 text-fresh-600" value={String(db.customers.length)} label="Total Customers" note={`${tabCount('active')} active`} />
            <Kpi icon={Handshake} tone="bg-blue-50 text-blue-600" value={String(newCustomers)} label="New Customers (30 Days)" note="recently onboarded" />
            <Kpi icon={ShoppingCart} tone="bg-violet-50 text-violet-600" value={String(db.orders.length)} label="Total Orders" note="all time" />
            <Kpi icon={IndianRupee} tone="bg-orange-50 text-orange-600" value={inr(totalSales)} label="Total Sales" note="delivered value" />
          </div>

          <div className="overflow-hidden rounded-card border border-line bg-white shadow-card">
            <div className="flex flex-wrap items-center gap-1 border-b border-line px-3 pt-2">
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
              <div className="ml-auto flex items-center gap-2 pb-2">
                <Button variant="secondary" size="sm" icon={Upload} onClick={() => setImportOpen(true)}>Import</Button>
                <Button variant="secondary" size="sm" icon={Download} onClick={exportCsv}>Export</Button>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2.5 border-b border-line px-3 py-3">
              <Input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder="Search by customer name, code, city, or contact…" leading={<Search size={15} />} className="w-full sm:w-64" />
              <Select value={type} onChange={(e) => { setType(e.target.value); setPage(1); }} placeholder="All Customer Types" options={[...CUSTOMER_TYPES]} className="w-44" />
              <Select value={location} onChange={(e) => { setLocation(e.target.value); setPage(1); }} placeholder="All Cities" options={locations} className="w-36" />
              <Select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} placeholder="All Status" options={[{ value: 'active', label: 'Active' }, { value: 'inactive', label: 'Inactive' }]} className="w-32" />
              <Button variant="secondary" size="sm" onClick={() => { setSearch(''); setType(''); setLocation(''); setStatus(''); }}>Reset</Button>
            </div>

            {rows.length === 0 ? (
              <EmptyState icon={Users} title="No customers found" description="Try clearing filters, or add your first customer." action={<Button size="sm" variant="primary" icon={Plus} onClick={() => setFormOpen(true)} className="mt-1">Add Customer</Button>} />
            ) : (
              <>
                <div className="scrollbar-thin overflow-x-auto">
                  <table className="w-full border-collapse text-[12.5px]">
                    <thead>
                      <tr className="border-b border-line bg-canvas/70 text-[11px] font-semibold tracking-wide text-subtle uppercase">
                        <th className="w-10 px-2 py-2.5 text-center">#</th>
                        <th className="px-3 py-2.5 text-left">Customer Name</th>
                        <th className="px-3 py-2.5 text-left">Customer Code</th>
                        <th className="px-3 py-2.5 text-left">Type</th>
                        <th className="px-3 py-2.5 text-left">City</th>
                        <th className="px-3 py-2.5 text-left">Contact Person</th>
                        <th className="px-3 py-2.5 text-left">Phone</th>
                        <th className="px-3 py-2.5 text-right">Total Orders</th>
                        <th className="px-3 py-2.5 text-right">Total Purchase (₹)</th>
                        <th className="px-3 py-2.5 text-center">Status</th>
                        <th className="w-10 px-2 py-2.5" />
                      </tr>
                    </thead>
                    <tbody>
                      {pageRows.map((c, i) => (
                        <tr
                          key={c.id}
                          onClick={() => setSelectedId(c.id)}
                          className={cn('cursor-pointer border-b border-line last:border-0 hover:bg-fresh-50/40', detail?.id === c.id && 'bg-fresh-50/60')}
                        >
                          <td className="tabular px-2 py-2.5 text-center text-subtle">{(page - 1) * pageSize + i + 1}</td>
                          <td className="px-3 py-2.5 font-medium whitespace-nowrap text-ink">{c.name}</td>
                          <td className="px-3 py-2.5 text-muted">{c.code}</td>
                          <td className="px-3 py-2.5 whitespace-nowrap text-muted">{c.type}</td>
                          <td className="px-3 py-2.5 whitespace-nowrap text-muted">{c.location}</td>
                          <td className="px-3 py-2.5 whitespace-nowrap text-muted">{c.contactPerson}</td>
                          <td className="tabular px-3 py-2.5 whitespace-nowrap text-muted">{c.mobile}</td>
                          <td className="tabular px-3 py-2.5 text-right text-ink">{orderCountBy.get(c.id) ?? 0}</td>
                          <td className="tabular px-3 py-2.5 text-right font-semibold text-ink">{inr(salesBy.get(c.id) ?? 0)}</td>
                          <td className="px-3 py-2.5 text-center">
                            <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold', c.active ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600')}>
                              <span className={cn('size-1.5 rounded-full', c.active ? 'bg-emerald-500' : 'bg-red-500')} />
                              {c.active ? 'Active' : 'Inactive'}
                            </span>
                          </td>
                          <td className="px-2 py-2.5 text-center" onClick={(e) => e.stopPropagation()}>
                            <Menu
                              align="right"
                              items={[
                                { key: 'view', label: 'View detail', onClick: () => nav(`/customers/${c.id}`) },
                                { key: 'edit', label: 'Edit', onClick: () => setEditing(c) },
                                { key: 'order', label: 'New order for customer', onClick: () => nav(`/orders/new?customer=${c.id}`) },
                              ]}
                              trigger={(open) => <button onClick={open} className="rounded p-1 text-subtle hover:bg-canvas hover:text-ink"><Ellipsis size={15} /></button>}
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line px-3.5 py-2.5 text-[12.5px] text-muted">
                  <span>Showing {(page - 1) * pageSize + 1} to {Math.min(page * pageSize, rows.length)} of {rows.length} customers</span>
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
            <SideCard icon={Users} title="Customer Type Distribution">
              <div className="flex items-center gap-3 p-4">
                <div className="relative h-32 w-32 shrink-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={byType} dataKey="value" nameKey="name" innerRadius={38} outerRadius={58} paddingAngle={2}>
                        {byType.map((s) => <Cell key={s.name} fill={s.color} />)}
                      </Pie>
                      <Tooltip contentStyle={TOOLTIP} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
                    <div>
                      <p className="tabular text-[17px] leading-none font-bold text-ink">{db.customers.length}</p>
                      <p className="text-[10px] text-subtle">Customers</p>
                    </div>
                  </div>
                </div>
                <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                  {byType.map((s) => (
                    <div key={s.name} className="flex items-center gap-1.5 text-[11.5px]">
                      <span className="size-2 shrink-0 rounded-full" style={{ background: s.color }} />
                      <span className="min-w-0 flex-1 truncate text-muted">{s.name}</span>
                      <span className="tabular font-semibold text-ink">{s.value} <span className="font-normal text-subtle">({db.customers.length ? Math.round((s.value / db.customers.length) * 100) : 0}%)</span></span>
                    </div>
                  ))}
                </div>
              </div>
            </SideCard>

            <SideCard icon={TrendingUp} title="Top Customers by Purchase">
              <div className="flex flex-col gap-2.5 px-4 py-3.5">
                {topCustomers.map((r) => (
                  <div key={r.customer!.id}>
                    <div className="flex items-center justify-between gap-2">
                      <p className="min-w-0 truncate text-[12px] text-ink">{r.customer!.name}</p>
                      <p className="tabular shrink-0 text-[12px] font-semibold text-ink">{inr(r.value)}</p>
                    </div>
                    <div className="mt-1 h-2 overflow-hidden rounded-full bg-canvas">
                      <div className="h-full rounded-full bg-fresh-500" style={{ width: `${Math.max(3, r.pct)}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </SideCard>

            <SideCard icon={Users} title="Customer Growth">
              <div className="h-44 p-3">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={growth}>
                    <CartesianGrid vertical={false} stroke="#e3e8e4" />
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 10 }} axisLine={false} tickLine={false} width={28} />
                    <Tooltip contentStyle={TOOLTIP} />
                    <Bar dataKey="count" fill="#3aa64b" radius={[4, 4, 0, 0]} barSize={22} name="Customers" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </SideCard>
          </div>
        </div>

        {/* ================================================ right sidebar */}
        <div className="flex flex-col gap-4">
          {detail && (
            <>
              <SideCard icon={Users} title="Customer Details">
                <div className="flex items-center gap-3 border-b border-line px-4 py-3">
                  <span className="grid size-10 shrink-0 place-items-center rounded-full bg-fresh-50 text-[15px] font-bold text-brand-800">{detail.name.slice(0, 1)}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13.5px] font-bold text-ink">{detail.name}</p>
                    <p className="text-[11.5px] text-muted">{detail.code}</p>
                  </div>
                  <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold', detail.active ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600')}>
                    {detail.active ? 'Active' : 'Inactive'}
                  </span>
                </div>
                <div className="flex flex-col">
                  <DetailRow icon={Receipt} label="Type" value={detail.type} />
                  <DetailRow icon={Users} label="Contact Person" value={detail.contactPerson} />
                  <DetailRow icon={Phone} label="Phone" value={detail.mobile} />
                  <DetailRow icon={Mail} label="Email" value={detail.email} />
                  <DetailRow icon={MapPin} label="Address" value={`${detail.deliveryAddress || detail.location}`} />
                  <DetailRow icon={Receipt} label="GST Number" value={detail.gstin || '—'} />
                  <DetailRow icon={IndianRupee} label="Credit Limit" value={inr(detail.creditLimit)} />
                  <DetailRow icon={IndianRupee} label="Payment Terms" value={`${detail.paymentTermsDays} Days`} />
                </div>
                <div className="p-3">
                  <Button variant="secondary" size="sm" className="w-full" onClick={() => nav(`/customers/${detail.id}`)}>View Full Details</Button>
                </div>
              </SideCard>

              <SideCard icon={ShoppingCart} title="Recent Orders">
                <div className="flex flex-col divide-y divide-line">
                  {detailOrders.map((o) => (
                    <button key={o.id} onClick={() => nav(`/orders/${o.id}`)} className="flex w-full items-center gap-2 px-4 py-2.5 text-left hover:bg-fresh-50/40">
                      <p className="min-w-0 flex-1 truncate text-[12px] font-medium text-brand-700">{o.orderNo}</p>
                      <p className="shrink-0 text-[11.5px] text-muted">{fmtDate(o.orderDate)}</p>
                      <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-[10.5px] font-semibold', o.deliveryStatus === 'Delivered' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700')}>
                        {o.deliveryStatus === 'Delivered' ? 'Delivered' : o.status}
                      </span>
                    </button>
                  ))}
                  {detailOrders.length === 0 && <p className="px-4 py-3 text-[12.5px] text-muted">No orders yet.</p>}
                </div>
              </SideCard>
            </>
          )}
        </div>
      </div>

      <div className="rounded-card bg-gradient-to-r from-brand-800 to-fresh-600 p-5 text-white">
        <p className="text-[15px] font-semibold">Build Long-Term Partnerships</p>
        <p className="text-[12.5px] text-white/80">Happy customers grow your business. Serve fresh, stay fresh.</p>
      </div>

      <ImportModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        title="Import Customers"
        columns={['Name', 'Type', 'City', 'Contact Person', 'Phone', 'Email', 'GSTIN', 'Credit Limit', 'Payment Terms Days']}
        sampleRow={['Sunrise Hotel', 'Hotel', 'Andheri West', 'Ramesh Shah', '98200 11111', 'orders@sunrise.in', '27AAAAA0000A1Z5', '200000', '15']}
        validate={(rec) => {
          const name = pick(rec, 'name', 'customer name', 'customername');
          if (!name) return { error: 'Name is required.' };
          // A name already on file is skipped rather than silently duplicated.
          if (db.customers.some((c) => c.name.toLowerCase() === name.toLowerCase())) {
            return { error: `"${name}" already exists.` };
          }
          const type = pick(rec, 'type', 'customer type') || 'Restaurant';
          if (!CUSTOMER_TYPES.includes(type as never)) {
            return { error: `Type "${type}" is not one of ${CUSTOMER_TYPES.join(', ')}.` };
          }
          return { value: { rec, name, type } };
        }}
        onImport={(rows) => {
          let created = 0;
          const seen = new Set<string>();
          for (const { rec, name, type } of rows) {
            // Guard against the same name twice inside one file.
            if (seen.has(name.toLowerCase())) continue;
            seen.add(name.toLowerCase());
            addCustomer({
              code: nextCustomerCode(useStore.getState().db.customers),
              name,
              legalName: pick(rec, 'legal name', 'legalname') || name,
              type: type as never,
              location: pick(rec, 'city', 'location'),
              contactPerson: pick(rec, 'contact person', 'contactperson'),
              mobile: pick(rec, 'phone', 'mobile'),
              altMobile: '',
              email: pick(rec, 'email'),
              billingAddress: pick(rec, 'address', 'billing address'),
              deliveryAddress: pick(rec, 'delivery address') || pick(rec, 'address'),
              gstin: pick(rec, 'gstin', 'gst number', 'gst'),
              pan: pick(rec, 'pan'),
              paymentTermsDays: Number(pick(rec, 'payment terms days', 'payment terms')) || 15,
              creditLimit: Number(pick(rec, 'credit limit', 'creditlimit')) || 0,
              routeId: db.routes[0]?.id ?? '',
              orderFrequency: 'Daily',
              preferredOrderTime: '',
              preferredDeliveryTime: '',
              specialInstructions: '',
            }, user.id);
            created++;
          }
          toast({ tone: 'success', title: `${created} customers imported` });
          return created;
        }}
      />

      <CustomerForm open={formOpen} onClose={closeForm} />
      <CustomerForm open={!!editing} onClose={() => setEditing(null)} customer={editing} />
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

function DetailRow({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
  return (
    <div className="flex items-start gap-2.5 border-b border-line px-4 py-2 last:border-0">
      <Icon size={13} className="mt-0.5 shrink-0 text-subtle" />
      <p className="w-24 shrink-0 text-[12px] text-muted">{label}</p>
      <p className="min-w-0 flex-1 text-[12.5px] font-medium break-words text-ink">{value}</p>
    </div>
  );
}
