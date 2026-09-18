import { useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import {
  ArrowDown, ArrowUp, Check, CheckCircle2, ChevronDown, ClipboardList, Clock, Eye, FileUp, Filter, MoreHorizontal,
  Pencil, Plus, Printer, Repeat, SlidersHorizontal, XCircle,
} from 'lucide-react';
import { Button, IconButton } from '../../components/ui/Button';
import { Select, SearchInput } from '../../components/ui/Field';
import { Badge, StatusBadge } from '../../components/ui/Badge';
import { Breadcrumb } from '../../components/ui/Breadcrumb';
import { EmptyState } from '../../components/ui/States';
import { Menu } from '../../components/ui/Dropdown';
import { useConfirm } from '../../components/ui/ConfirmDialog';
import { useToast } from '../../components/ui/Toast';
import { useCurrentUser, useDb } from '../../store/useStore';
import { approveOrder } from '../../store/orderActions';
import { useOrdersSync } from '../../store/useApiSync';
import { can } from '../../lib/nav';
import type { Order } from '../../types/models';
import { addDays, fmtDate, fmtTime, inr } from '../../lib/format';
import { todayISO } from '../../lib/clock';
import { cn } from '../../lib/cn';
import { RejectOrderModal } from './RejectOrderModal';
import { downloadCsv } from './orderUi';

const TABS = [
  { key: 'all', label: 'All Orders', tone: '' },
  { key: 'pending', label: 'Pending Approval', tone: 'bg-orange-500' },
  { key: 'approved', label: 'Approved', tone: 'bg-emerald-500' },
  { key: 'late', label: 'Late Orders', tone: 'bg-amber-500' },
  { key: 'rejected', label: 'Rejected', tone: 'bg-red-500' },
  { key: 'drafts', label: 'Drafts', tone: 'bg-[#9aa8a0]' },
] as const;

type TabKey = (typeof TABS)[number]['key'];

const MATCHES: Record<TabKey, (o: Order) => boolean> = {
  all: () => true,
  pending: (o) => o.status === 'Submitted',
  approved: (o) => o.status === 'Approved' || o.status === 'Locked' || o.status === 'Completed' || o.status === 'Partially Fulfilled',
  late: (o) => o.status === 'Late',
  rejected: (o) => o.status === 'Rejected',
  drafts: (o) => o.status === 'Draft',
};

export function OrdersListPage() {
  // Orders come from the server when one is configured; the page keeps its
  // synchronous reads either way.
  useOrdersSync();

  const db = useDb();
  const user = useCurrentUser()!;
  const nav = useNavigate();
  const loc = useLocation();
  const confirm = useConfirm();
  const toast = useToast();
  const canApprove = can(db, user.role, 'orders', 'approve');
  const today = todayISO();

  const initialStatus = new URLSearchParams(loc.search).get('status') ?? '';
  const [tab, setTab] = useState<TabKey>(() => {
    const t = TABS.find((x) => x.label.toLowerCase().startsWith(initialStatus.toLowerCase()));
    return initialStatus === 'Submitted' ? 'pending' : initialStatus === 'Late' ? 'late' : t?.key ?? 'all';
  });
  const [search, setSearch] = useState('');
  const [from, setFrom] = useState(addDays(today, -1));
  const [to, setTo] = useState(today);
  const [customerId, setCustomerId] = useState('');
  const [status, setStatus] = useState('');
  const [deliveryStatus, setDeliveryStatus] = useState('');
  const [dateOn, setDateOn] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [rejecting, setRejecting] = useState<Order | null>(null);

  const custById = useMemo(() => new Map(db.customers.map((c) => [c.id, c])), [db.customers]);
  const userById = useMemo(() => new Map(db.users.map((u) => [u.id, u])), [db.users]);

  const totals = useMemo(() => {
    const m = new Map<string, { count: number; qty: number; amount: number }>();
    for (const l of db.orderItems) {
      const cur = m.get(l.orderId) ?? { count: 0, qty: 0, amount: 0 };
      cur.count += 1;
      cur.qty += l.qty.ordered ?? 0;
      cur.amount += (l.qty.ordered ?? 0) * l.rate;
      m.set(l.orderId, cur);
    }
    return m;
  }, [db.orderItems]);

  /* ----------------------------------------------------------- KPI deltas */

  const onDate = (d: string) => db.orders.filter((o) => o.orderDate === d);
  const kpiFor = (list: Order[]) => ({
    total: list.length,
    pending: list.filter(MATCHES.pending).length,
    approved: list.filter(MATCHES.approved).length,
    late: list.filter(MATCHES.late).length,
    rejected: list.filter(MATCHES.rejected).length,
  });
  const kToday = kpiFor(onDate(today));
  const kPrev = kpiFor(onDate(addDays(today, -1)));
  const pctDelta = (a: number, b: number) => (b ? Math.round(((a - b) / b) * 100) : null);

  /* --------------------------------------------------------------- filters */

  /** Everything the filter bar allows, before the tab narrows it — so the tab counts track the filters. */
  const scoped = useMemo(() => {
    const term = search.trim().toLowerCase();
    return db.orders
      .filter((o) => {
        const cust = custById.get(o.customerId);
        if (term && !(o.orderNo.toLowerCase().includes(term) || (cust?.name ?? '').toLowerCase().includes(term))) return false;
        if (dateOn && (o.orderDate < from || o.orderDate > to)) return false;
        if (customerId && o.customerId !== customerId) return false;
        if (status && o.status !== status) return false;
        if (deliveryStatus && o.deliveryStatus !== deliveryStatus) return false;
        return true;
      })
      .sort((a, b) => (a.receivedAt < b.receivedAt ? 1 : -1));
  }, [db.orders, search, dateOn, from, to, customerId, status, deliveryStatus, custById]);

  const filtered = useMemo(() => scoped.filter(MATCHES[tab]), [scoped, tab]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, pageCount);
  const rows = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

  const tabCount = (k: TabKey) => scoped.filter(MATCHES[k]).length;

  /* --------------------------------------------------------------- actions */

  const doApprove = async (o: Order) => {
    const ok = await confirm({ title: 'Approve this order?', description: `${o.orderNo} · ${custById.get(o.customerId)?.name}`, confirmLabel: 'Approve' });
    if (!ok) return;
    try {
      await approveOrder(o.id, user.id);
      toast({ tone: 'success', title: 'Order approved', description: o.orderNo });
    } catch (e) {
      // The server can refuse — an order already locked, for instance — and the
      // operator has to know that rather than see a success they did not get.
      toast({ tone: 'error', title: 'Could not approve', description: (e as Error).message });
    }
  };

  const approveSelected = async () => {
    const list = filtered.filter((o) => selected.has(o.id) && (o.status === 'Submitted' || o.status === 'Late'));
    if (!list.length) return toast({ tone: 'error', title: 'Nothing to approve in the selection' });
    const ok = await confirm({ title: `Approve ${list.length} orders?`, confirmLabel: 'Approve all' });
    if (!ok) return;
    const results = await Promise.allSettled(list.map((o) => approveOrder(o.id, user.id)));
    const failed = results.filter((r) => r.status === 'rejected').length;
    setSelected(new Set());

    // Reported honestly: a partial success is not a success.
    if (failed === 0) toast({ tone: 'success', title: `${list.length} orders approved` });
    else if (failed === list.length) toast({ tone: 'error', title: 'None could be approved' });
    else toast({ tone: 'warning', title: `${list.length - failed} approved, ${failed} failed` });
  };

  const exportCsv = () =>
    downloadCsv(
      'orders',
      ['Order No', 'Customer', 'Order Date', 'Delivery Date', 'Items', 'Total Qty', 'Estimated Value', 'Status', 'Packing', 'Delivery', 'Invoice'],
      filtered.map((o) => {
        const t = totals.get(o.id);
        return [o.orderNo, custById.get(o.customerId)?.name ?? '', o.orderDate, o.deliveryDate, t?.count ?? 0, t?.qty ?? 0, Math.round(t?.amount ?? 0), o.status, o.packingStatus, o.deliveryStatus, o.invoiceStatus];
      }),
    );

  const toggleAll = () =>
    setSelected((s) => (rows.every((o) => s.has(o.id)) ? new Set() : new Set(rows.map((o) => o.id))));

  /* --------------------------------------------------- bottom-strip panels */

  const recent = [...db.orders].sort((a, b) => (a.receivedAt < b.receivedAt ? 1 : -1)).slice(0, 5);
  const todays = onDate(today);
  const ringData = [
    { name: 'Approved', value: todays.filter(MATCHES.approved).length, color: '#22c55e' },
    { name: 'Pending', value: todays.filter((o) => o.status === 'Submitted').length, color: '#f59e0b' },
    { name: 'Late', value: todays.filter(MATCHES.late).length, color: '#f97316' },
    { name: 'Draft', value: todays.filter(MATCHES.drafts).length, color: '#cbd4cf' },
    { name: 'Rejected', value: todays.filter(MATCHES.rejected).length, color: '#ef4444' },
  ];
  const ringTotal = ringData.reduce((s, d) => s + d.value, 0);

  const [topPeriod, setTopPeriod] = useState<'month' | 'week'>('month');
  const topFrom = topPeriod === 'week' ? addDays(today, -6) : today.slice(0, 8) + '01';
  const topCustomers = useMemo(() => {
    const m = new Map<string, number>();
    for (const o of db.orders) {
      if (o.orderDate < topFrom || o.orderDate > today) continue;
      m.set(o.customerId, (m.get(o.customerId) ?? 0) + (totals.get(o.id)?.amount ?? 0));
    }
    return [...m.entries()].map(([id, amount]) => ({ id, name: custById.get(id)?.name ?? id, amount })).sort((a, b) => b.amount - a.amount).slice(0, 5);
  }, [db.orders, totals, topFrom, today, custById]);
  const topMax = topCustomers[0]?.amount ?? 1;

  return (
    <div className="flex flex-col gap-4">
      {/* -------------------------------------------------------- page head */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <Breadcrumb items={[{ label: 'Dashboard', to: '/' }, { label: 'Orders' }]} />
          <h1 className="mt-1.5 text-[24px] leading-tight font-semibold tracking-[-0.01em] text-ink">Orders</h1>
          <p className="mt-0.5 text-[13px] text-muted">Manage customer orders, approvals and delivery planning.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="primary" icon={Plus} onClick={() => nav('/orders/new')}>New Order</Button>
          <Button variant="secondary" icon={FileUp} onClick={() => toast({ tone: 'info', title: 'Bulk import is not wired up yet', description: 'Use New Order, or export the current list to CSV.' })}>
            Import Orders
          </Button>
          <Menu
            align="right"
            items={[
              { key: 'export', label: 'Export CSV', onClick: exportCsv },
              { key: 'print', label: 'Print list', onClick: () => window.print() },
              { key: 'consolidation', label: 'Open consolidation', onClick: () => nav('/consolidation') },
            ]}
            trigger={(open, isOpen) => (
              <Button variant="secondary" icon={MoreHorizontal} iconRight={ChevronDown} onClick={open} className={cn(isOpen && 'bg-canvas')}>More</Button>
            )}
          />
        </div>
      </div>

      {/* ------------------------------------------------------------- tabs */}
      <div className="scrollbar-thin flex gap-5 overflow-x-auto border-b border-line">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => { setTab(t.key); setPage(1); }}
            className={cn(
              'relative flex shrink-0 items-center gap-1.5 pb-2.5 text-[13px] font-medium whitespace-nowrap',
              tab === t.key ? 'text-brand-800' : 'text-muted hover:text-ink',
            )}
          >
            {t.label}
            {t.key !== 'all' && (
              <span className={cn('grid min-w-[18px] place-items-center rounded-full px-1 text-[10.5px] font-semibold text-white', t.tone)}>
                {tabCount(t.key)}
              </span>
            )}
            {tab === t.key && <span className="absolute inset-x-0 -bottom-px h-[2px] rounded-full bg-brand-700" />}
          </button>
        ))}
      </div>

      {/* ----------------------------------------------------- filter strip */}
      <div className="flex flex-wrap items-center gap-2 rounded-card border border-line bg-white p-3 shadow-card">
        <SearchInput value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder="Search by order no, customer, item…" className="min-w-56 flex-1" />
        <div className={cn('flex h-9 items-center gap-1.5 rounded-lg border px-2 text-[12.5px]', dateOn ? 'border-brand-300 bg-brand-50/50 text-ink' : 'border-line text-muted')}>
          <input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setDateOn(true); }} className="bg-transparent outline-none" />
          <span>–</span>
          <input type="date" value={to} onChange={(e) => { setTo(e.target.value); setDateOn(true); }} className="bg-transparent outline-none" />
          {dateOn && <IconButton icon={XCircle} label="Clear dates" size="sm" onClick={() => setDateOn(false)} />}
        </div>
        <Select value={customerId} onChange={(e) => { setCustomerId(e.target.value); setPage(1); }} placeholder="All Customers" className="w-44"
          options={db.customers.map((c) => ({ value: c.id, label: c.name }))} />
        <Select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} placeholder="All Status" className="w-36"
          options={['Draft', 'Submitted', 'Approved', 'Late', 'Rejected', 'Locked', 'Partially Fulfilled', 'Completed']} />
        <Select value={deliveryStatus} onChange={(e) => { setDeliveryStatus(e.target.value); setPage(1); }} placeholder="All Delivery Status" className="w-44"
          options={['Pending', 'Ready', 'Dispatched', 'In Transit', 'Delivered', 'Partial', 'Failed']} />
        <Button variant="primary" icon={Filter} onClick={() => setDateOn(true)}>Filter</Button>
      </div>

      {/* --------------------------------------------------------- KPI cards */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <Kpi icon={ClipboardList} tone="bg-brand-50 text-brand-700" value={kToday.total} label="Total Orders" delta={pctDelta(kToday.total, kPrev.total)} />
        <Kpi icon={Clock} tone="bg-orange-50 text-orange-600" value={kToday.pending} label="Pending Approval" delta={pctDelta(kToday.pending, kPrev.pending)} goodDown />
        <Kpi icon={CheckCircle2} tone="bg-emerald-50 text-emerald-600" value={kToday.approved} label="Approved" delta={pctDelta(kToday.approved, kPrev.approved)} />
        <Kpi icon={Clock} tone="bg-amber-50 text-amber-600" value={kToday.late} label="Late Orders" delta={pctDelta(kToday.late, kPrev.late)} goodDown />
        <Kpi icon={XCircle} tone="bg-red-50 text-red-600" value={kToday.rejected} label="Rejected" delta={pctDelta(kToday.rejected, kPrev.rejected)} goodDown />
      </div>

      {/* -------------------------------------------------------- main table */}
      <div className="rounded-card border border-line bg-white shadow-card">
        {selected.size > 0 && (
          <div className="flex items-center gap-3 border-b border-line bg-brand-50/60 px-4 py-2 text-[12.5px]">
            <span className="font-medium text-brand-900">{selected.size} selected</span>
            {canApprove && <Button size="xs" variant="primary" icon={Check} onClick={approveSelected}>Approve selected</Button>}
            <button onClick={() => setSelected(new Set())} className="text-muted hover:text-ink">Clear</button>
          </div>
        )}

        <div className="scrollbar-thin overflow-x-auto">
          <table className="w-full border-collapse text-[12.5px]">
            <thead>
              <tr className="border-b border-line bg-canvas/70 text-[11px] font-semibold tracking-wide text-subtle uppercase">
                <th className="w-9 px-3 py-2.5">
                  <input type="checkbox" checked={rows.length > 0 && rows.every((o) => selected.has(o.id))} onChange={toggleAll} className="size-3.5 accent-[#2f7f50]" aria-label="Select all" />
                </th>
                {['Order No', 'Customer', 'Order Date', 'Delivery Date', 'Items', 'Total Qty', 'Estimated Value', 'Status', 'Approval', 'Packing', 'Delivery', 'Invoice'].map((h) => (
                  <th key={h} className={cn('px-3 py-2.5 text-left whitespace-nowrap', ['Items', 'Total Qty', 'Estimated Value'].includes(h) && 'text-right')}>{h}</th>
                ))}
                <th className="px-3 py-2.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((o) => {
                const t = totals.get(o.id);
                const pending = o.status === 'Submitted' || o.status === 'Late';
                return (
                  <tr key={o.id} onClick={() => nav(`/orders/${o.id}`)} className="cursor-pointer border-b border-line last:border-0 hover:bg-brand-50/30">
                    <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={selected.has(o.id)}
                        onChange={() => setSelected((s) => { const n = new Set(s); n.has(o.id) ? n.delete(o.id) : n.add(o.id); return n; })}
                        className="size-3.5 accent-[#2f7f50]"
                        aria-label={`Select ${o.orderNo}`}
                      />
                    </td>
                    <td className="px-3 py-2.5 font-medium whitespace-nowrap text-brand-700">{o.orderNo}</td>
                    <td className="max-w-[12rem] truncate px-3 py-2.5 text-ink">{custById.get(o.customerId)?.name ?? '—'}</td>
                    <td className="tabular px-3 py-2.5 whitespace-nowrap text-muted">{fmtDate(o.orderDate)}</td>
                    <td className="tabular px-3 py-2.5 whitespace-nowrap text-muted">{fmtDate(o.deliveryDate)}</td>
                    <td className="tabular px-3 py-2.5 text-right">{t?.count ?? 0}</td>
                    <td className="tabular px-3 py-2.5 text-right">{Math.round(t?.qty ?? 0)}</td>
                    <td className="tabular px-3 py-2.5 text-right font-medium text-ink">{inr(t?.amount ?? 0)}</td>
                    <td className="px-3 py-2.5"><StatusBadge status={o.status} /></td>
                    <td className="px-3 py-2.5">
                      {o.status === 'Rejected' ? <Badge tone="red">Rejected</Badge>
                        : pending ? <Badge tone="orange">Pending</Badge>
                        : o.status === 'Draft' ? <span className="text-subtle">-</span>
                        : <Check size={15} className="text-emerald-600" />}
                    </td>
                    <td className="px-3 py-2.5">{o.packingStatus === 'Not Started' ? <span className="text-subtle">-</span> : <StatusBadge status={o.packingStatus} />}</td>
                    <td className="px-3 py-2.5">{o.deliveryStatus === 'Pending' ? <span className="text-subtle">-</span> : <StatusBadge status={o.deliveryStatus} />}</td>
                    <td className="px-3 py-2.5">{o.invoiceStatus === 'Not Ready' ? <span className="text-subtle">-</span> : <StatusBadge status={o.invoiceStatus} />}</td>
                    <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-0.5">
                        <IconButton icon={Eye} label="View" size="sm" onClick={() => nav(`/orders/${o.id}`)} />
                        <IconButton icon={Pencil} label="Edit" size="sm" onClick={() => nav(`/orders/${o.id}`)} />
                        <IconButton icon={Printer} label="Print" size="sm" onClick={() => window.print()} />
                        <Menu
                          align="right"
                          items={[
                            ...(canApprove && pending ? [{ key: 'approve', label: 'Approve', icon: <Check size={14} />, onClick: () => doApprove(o) }] : []),
                            ...(canApprove && pending ? [{ key: 'reject', label: 'Reject', icon: <XCircle size={14} />, danger: true, onClick: () => setRejecting(o) }] : []),
                            { key: 'repeat', label: 'Repeat this order', icon: <Repeat size={14} />, onClick: () => nav(`/orders/new?customer=${o.customerId}`) },
                          ]}
                          trigger={(open) => <button onClick={open} className="rounded p-1.5 text-subtle hover:bg-canvas hover:text-ink"><MoreHorizontal size={15} /></button>}
                        />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {rows.length === 0 && (
          <EmptyState
            icon={SlidersHorizontal}
            title="No orders found"
            description="Try clearing the filters, or create the first order."
            action={<Button size="sm" variant="primary" icon={Plus} onClick={() => nav('/orders/new')} className="mt-1">New Order</Button>}
            className="py-10"
          />
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-2.5 text-[12.5px] text-muted">
          <span>
            Showing {filtered.length === 0 ? 0 : (safePage - 1) * pageSize + 1} to {Math.min(safePage * pageSize, filtered.length)} of {filtered.length} orders
          </span>
          <div className="flex items-center gap-1">
            <button disabled={safePage <= 1} onClick={() => setPage(safePage - 1)} className="rounded-md border border-line px-2.5 py-1 disabled:opacity-40">Previous</button>
            {Array.from({ length: pageCount }, (_, i) => i + 1).slice(0, 6).map((n) => (
              <button key={n} onClick={() => setPage(n)} className={cn('grid size-7 place-items-center rounded-md font-medium', n === safePage ? 'bg-brand-700 text-white' : 'hover:bg-canvas')}>{n}</button>
            ))}
            <button disabled={safePage >= pageCount} onClick={() => setPage(safePage + 1)} className="rounded-md border border-line px-2.5 py-1 disabled:opacity-40">Next</button>
          </div>
          <div className="flex items-center gap-2">
            Rows per page
            <Select value={String(pageSize)} onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }} className="h-7 w-16" options={['10', '25', '50', '100']} />
          </div>
        </div>
      </div>

      {/* ------------------------------------------------------ bottom strip */}
      <div className="grid gap-4 xl:grid-cols-12">
        <Panel className="xl:col-span-5" title="Recent Orders" action={<LinkAll onClick={() => { setTab('all'); setSearch(''); }} />}>
          <div className="overflow-x-auto">
            <table className="w-full text-[12.5px]">
              <thead className="bg-canvas/70">
                <tr>{['Time', 'Order No', 'Customer', 'Items', 'Status', 'Created By'].map((h) => (
                  <th key={h} className="px-3 py-2 text-left text-[11px] font-semibold tracking-wide text-subtle uppercase">{h}</th>
                ))}</tr>
              </thead>
              <tbody className="divide-y divide-line">
                {recent.map((o) => (
                  <tr key={o.id} onClick={() => nav(`/orders/${o.id}`)} className="cursor-pointer hover:bg-canvas/50">
                    <td className="tabular px-3 py-2 whitespace-nowrap text-muted">{fmtTime(o.receivedAt)}</td>
                    <td className="px-3 py-2 font-medium whitespace-nowrap text-brand-700">{o.orderNo}</td>
                    <td className="max-w-[10rem] truncate px-3 py-2">{custById.get(o.customerId)?.name ?? '—'}</td>
                    <td className="tabular px-3 py-2">{totals.get(o.id)?.count ?? 0}</td>
                    <td className="px-3 py-2"><StatusBadge status={o.status} /></td>
                    <td className="max-w-[7rem] truncate px-3 py-2 text-muted">{userById.get(o.createdBy)?.name.split(' ')[0] ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>

        <Panel className="xl:col-span-3" title="Orders by Status">
          <div className="flex items-center gap-3 p-4">
            <div className="relative size-[124px] shrink-0">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={ringData} dataKey="value" innerRadius={40} outerRadius={60} paddingAngle={2} stroke="none">
                    {ringData.map((d) => <Cell key={d.name} fill={d.color} />)}
                  </Pie>
                  <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e3e8e4' }} />
                </PieChart>
              </ResponsiveContainer>
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                <p className="tabular text-[19px] leading-none font-semibold text-ink">{ringTotal}</p>
                <p className="mt-0.5 text-[10px] text-muted">Total Orders</p>
              </div>
            </div>
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              {ringData.map((d) => (
                <div key={d.name} className="flex items-center gap-2">
                  <span className="size-2 shrink-0 rounded-full" style={{ background: d.color }} />
                  <span className="min-w-0 flex-1 truncate text-[12px] text-muted">{d.name}</span>
                  <span className="tabular text-[12.5px] font-semibold text-ink">{d.value}</span>
                  <span className="tabular w-8 text-right text-[11.5px] text-subtle">{ringTotal ? Math.round((d.value / ringTotal) * 100) : 0}%</span>
                </div>
              ))}
            </div>
          </div>
        </Panel>

        <Panel
          className="xl:col-span-4"
          title={<>Top Customers <span className="font-normal text-muted">(By Order Value)</span></>}
          action={
            <Select value={topPeriod} onChange={(e) => setTopPeriod(e.target.value as 'month' | 'week')} className="h-7 w-28"
              options={[{ value: 'month', label: 'This Month' }, { value: 'week', label: 'This Week' }]} />
          }
        >
          <div className="flex flex-col gap-2.5 p-4">
            {topCustomers.map((c) => (
              <button key={c.id} onClick={() => nav(`/customers/${c.id}`)} className="group flex items-center gap-3 text-left">
                <span className="w-36 shrink-0 truncate text-[11.5px] tracking-wide text-muted uppercase group-hover:text-ink">{c.name}</span>
                <span className="h-2.5 flex-1 overflow-hidden rounded-full bg-canvas">
                  <span className="block h-full rounded-full bg-fresh-500" style={{ width: `${Math.max(6, (c.amount / topMax) * 100)}%` }} />
                </span>
                <span className="tabular w-20 shrink-0 text-right text-[12px] font-semibold text-ink">{inr(c.amount)}</span>
              </button>
            ))}
            {topCustomers.length === 0 && <p className="py-4 text-center text-[12.5px] text-subtle">No orders in this period.</p>}
          </div>
        </Panel>
      </div>

      <RejectOrderModal order={rejecting} onClose={() => setRejecting(null)} />
    </div>
  );
}

/* ------------------------------------------------------------- small parts */

function Kpi({ icon: Icon, tone, value, label, delta, goodDown }: {
  icon: typeof ClipboardList; tone: string; value: number; label: string; delta: number | null; goodDown?: boolean;
}) {
  const good = delta == null ? true : goodDown ? delta <= 0 : delta >= 0;
  const Trend = delta == null || delta === 0 ? ArrowUp : delta > 0 ? ArrowUp : ArrowDown;
  return (
    <div className="rounded-card border border-line bg-white p-3.5 shadow-card">
      <div className="flex items-center gap-3">
        <span className={cn('grid size-11 shrink-0 place-items-center rounded-full', tone)}><Icon size={20} /></span>
        <div className="min-w-0">
          <p className="tabular text-[21px] leading-none font-semibold text-ink">{value}</p>
          <p className="mt-1 text-[12px] leading-tight text-muted">{label}</p>
        </div>
      </div>
      <div className="mt-2.5 flex items-center gap-1.5">
        <span className={cn('flex items-center gap-0.5 text-[11px] font-semibold', good ? 'text-emerald-600' : 'text-red-600')}>
          <Trend size={11} /> {delta == null ? '—' : `${Math.abs(delta)}%`}
        </span>
        <span className="text-[10.5px] text-subtle">vs yesterday</span>
      </div>
    </div>
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
  return <button onClick={onClick} className="shrink-0 text-[11.5px] font-medium text-brand-700 hover:underline">View All →</button>;
}
