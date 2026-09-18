import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import {
  Boxes, ChevronRight, CircleCheck, Download, FileSpreadsheet, Info, LayoutGrid, ListChecks, Lock, Package,
  Printer, Search, Send, ShoppingCart, TrendingUp, Users, type LucideIcon,
} from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Input, Select, Switch } from '../../components/ui/Field';
import { EmptyState } from '../../components/ui/States';
import { useConfirm } from '../../components/ui/ConfirmDialog';
import { useToast } from '../../components/ui/Toast';
import { useCurrentUser, useDb } from '../../store/useStore';
import { lockConsolidation } from '../../store/orderActions';
import { useOrdersSync } from '../../store/useApiSync';
import { buildConsolidation } from '../../domain/orders';
import { CATEGORIES, UNITS, type Category } from '../../types/models';
import { addDays, fmtDate, inr, num } from '../../lib/format';
import { todayISO } from '../../lib/clock';
import { cn } from '../../lib/cn';

const CATEGORY_COLOR: Record<Category, string> = {
  'Indian Vegetables': '#2f7f50',
  'Fresh Fruits': '#f97316',
  'Herbs & Leafy': '#7bc47f',
  'Imported Produce': '#3b82f6',
  'Exotic Vegetables': '#8b5cf6',
};

const TABS = [
  { key: 'matrix', label: 'Customer-wise Matrix' },
  { key: 'items', label: 'Item Summary' },
  { key: 'categories', label: 'Category Summary' },
  { key: 'export', label: 'Export / Print', icon: FileSpreadsheet },
] as const;

type TabKey = (typeof TABS)[number]['key'];

export function ConsolidationPage() {
  const db = useDb();
  const user = useCurrentUser()!;
  const nav = useNavigate();
  const confirm = useConfirm();
  const toast = useToast();
  const today = todayISO();

  const [date, setDate] = useState(addDays(today, 1));
  const [orderStatus, setOrderStatus] = useState('approved');
  const [tab, setTab] = useState<TabKey>('matrix');
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [unit, setUnit] = useState('');
  const [onlyWithQty, setOnlyWithQty] = useState(true);

  // In API mode this fills the store with the day's orders and their lines, so
  // buildConsolidation works off the same tables the demo build uses. In demo
  // mode it does nothing and the seeded orders stand.
  const { refresh: refreshOrders } = useOrdersSync({ deliveryDate: date });

  const matrix = useMemo(() => buildConsolidation(db, date), [db, date]);
  const lock = db.locks.find((l) => l.deliveryDate === date);
  // Locked either by a demo-mode lock record, or — in API mode, where no such
  // record is kept — by the orders themselves having been moved to Locked. The
  // latter survives a reload, so a locked day still reads as locked.
  const isLocked = !!lock || matrix.orders.some((o) => o.status === 'Locked');
  const pendingOrders = db.orders.filter((o) => o.deliveryDate === date && (o.status === 'Submitted' || o.status === 'Late'));

  /* ---------------------------------------------------------------- rows */

  const allRows = useMemo(() => {
    if (onlyWithQty) return matrix.rows;
    // Toggle off: show every active item, even the ones nobody ordered today.
    const shown = new Set(matrix.rows.map((r) => r.item.id));
    const empty = db.items
      .filter((i) => i.active && !shown.has(i.id))
      .map((item) => ({ item, byCustomer: new Map<string, number>(), total: 0 }));
    return [...matrix.rows, ...empty].sort((a, b) => a.item.sortOrder - b.item.sortOrder);
  }, [matrix.rows, onlyWithQty, db.items]);

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return allRows.filter((r) => {
      if (term && !r.item.name.toLowerCase().includes(term)) return false;
      if (category && r.item.category !== category) return false;
      if (unit && r.item.unit !== unit) return false;
      return true;
    });
  }, [allRows, search, category, unit]);

  /* ------------------------------------------------------------- numbers */

  const totalQuantity = matrix.rows.reduce((s, r) => s + r.total, 0);
  const ordersIncludedPct = matrix.orders.length + pendingOrders.length
    ? Math.round((matrix.orders.length / (matrix.orders.length + pendingOrders.length)) * 100)
    : 0;

  const estimatedValue = useMemo(() => {
    const ids = new Set(matrix.orders.map((o) => o.id));
    return db.orderItems
      .filter((l) => ids.has(l.orderId))
      .reduce((s, l) => s + (l.qty.approved ?? l.qty.ordered ?? 0) * l.rate, 0);
  }, [db.orderItems, matrix.orders]);

  const categoryTotals = useMemo(() => {
    const byCat = new Map<Category, number>();
    for (const r of matrix.rows) byCat.set(r.item.category, (byCat.get(r.item.category) ?? 0) + r.total);
    return [...byCat.entries()]
      .map(([name, qty]) => ({ name, qty, pct: totalQuantity ? Math.round((qty / totalQuantity) * 100) : 0, color: CATEGORY_COLOR[name] }))
      .sort((a, b) => b.qty - a.qty);
  }, [matrix.rows, totalQuantity]);

  const topItems = useMemo(() => [...matrix.rows].sort((a, b) => b.total - a.total).slice(0, 5), [matrix.rows]);

  const columnTotals = useMemo(
    () => matrix.customers.map((c) => rows.reduce((s, r) => s + (r.byCustomer.get(c.id) ?? 0), 0)),
    [matrix.customers, rows],
  );
  const grandTotal = rows.reduce((s, r) => s + r.total, 0);

  /* ------------------------------------------------------------ actions */

  const generateRequirement = async () => {
    if (isLocked) return nav('/purchase');
    const ok = await confirm({
      title: 'Generate purchase requirement?',
      description: 'Orders for this delivery date get locked, and the purchase requirement is created from these quantities.',
      confirmLabel: 'Generate',
      details: [
        { label: 'Delivery date', value: fmtDate(date) },
        { label: 'Orders', value: matrix.orders.length },
        { label: 'Items', value: matrix.rows.length },
      ],
    });
    if (!ok) return;
    try {
      await lockConsolidation(date, user.id);
      await refreshOrders();
    } catch (e) {
      toast({ tone: 'error', title: 'Could not lock consolidation', description: (e as Error).message });
      return;
    }
    toast({ tone: 'success', title: 'Purchase requirement generated', description: 'Consolidation locked for this date.' });
  };

  const downloadExcel = () => {
    const head = ['#', 'Item', 'Unit', ...matrix.customers.map((c) => c.name), 'Total'];
    const body = rows.map((r, i) => [
      i + 1, r.item.name, r.item.unit,
      ...matrix.customers.map((c) => r.byCustomer.get(c.id) ?? ''),
      r.total,
    ]);
    const csv = [head, ...body, ['', 'Total (Selected)', '', ...columnTotals, grandTotal]]
      .map((line) => line.map((v) => `"${String(v)}"`).join(','))
      .join('\r\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
    a.download = `consolidation-${date}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    toast({ tone: 'success', title: 'Excel downloaded', description: `consolidation-${date}.csv` });
  };

  return (
    <div className="flex flex-col gap-4">
      {/* ------------------------------------------------------- breadcrumb */}
      <nav className="no-print flex items-center gap-1 text-[12.5px] text-muted">
        <span>Operations</span>
        <ChevronRight size={13} className="text-subtle" />
        <span className="font-medium text-ink">Consolidation</span>
      </nav>

      {/* ------------------------------------------------------- title row */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 max-w-md">
          <h1 className="text-[26px] leading-tight font-bold tracking-[-0.01em] text-ink">Daily Consolidation</h1>
          <p className="mt-1 text-[13px] text-muted">
            Customer-wise item quantities from approved orders. Review and generate purchase requirement.
          </p>
        </div>

        <div className="no-print flex flex-wrap items-center gap-2.5">
          <label className="flex items-center gap-2 text-[12.5px] font-medium text-muted">
            Date
            <input
              type="date" value={date} onChange={(e) => setDate(e.target.value)}
              className="h-9 rounded-lg border border-line bg-white px-2.5 text-[13px] text-ink"
            />
          </label>
          <label className="flex items-center gap-2 text-[12.5px] font-medium whitespace-nowrap text-muted">
            Order Status
            <Select
              value={orderStatus}
              onChange={(e) => setOrderStatus(e.target.value)}
              className="w-36"
              options={[
                { value: 'approved', label: 'Approved Orders' },
                { value: 'all', label: 'All Orders' },
              ]}
            />
          </label>
          <Button variant="primary" icon={Send} onClick={generateRequirement} disabled={!matrix.orders.length}>
            Generate Purchase Requirement
          </Button>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        {/* =================================================== main column */}
        <div className="flex min-w-0 flex-col gap-4">
          {/* ------------------------------------------------- KPI cards */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Kpi icon={Boxes} tone="bg-fresh-50 text-fresh-600" value={String(matrix.customers.length)} label="Customers" note="from approved orders" />
            <Kpi icon={Package} tone="bg-blue-50 text-blue-600" value={String(matrix.rows.length)} label="Total Items" note="with demand" />
            <Kpi icon={ShoppingCart} tone="bg-orange-50 text-orange-600" value={num(totalQuantity)} label="Total Quantity" note="(mixed units)" />
            <Kpi icon={Users} tone="bg-red-50 text-red-500" value={`${ordersIncludedPct}%`} label="Orders Included" note={`${pendingOrders.length} pending`} />
          </div>

          {/* --------------------------------------------- tabs + table */}
          <div className="overflow-hidden rounded-card border border-line bg-white shadow-card">
            <div className="no-print flex gap-1 overflow-x-auto border-b border-line px-3 pt-2">
              {TABS.map((t) => (
                <button
                  key={t.key}
                  onClick={() => setTab(t.key)}
                  className={cn(
                    'flex shrink-0 items-center gap-1.5 border-b-2 px-3 pb-2.5 text-[13px] font-semibold whitespace-nowrap transition-colors',
                    tab === t.key ? 'border-brand-700 text-brand-800' : 'border-transparent text-muted hover:text-ink',
                  )}
                >
                  {'icon' in t && t.icon ? <t.icon size={14} /> : null}
                  {t.label}
                </button>
              ))}
            </div>

            {tab !== 'export' && (
              <div className="no-print flex flex-wrap items-center gap-2.5 border-b border-line px-3 py-3">
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search item (e.g. Tomato, Onion...)"
                  leading={<Search size={15} />}
                  className="w-full sm:w-64"
                />
                <Select value={category} onChange={(e) => setCategory(e.target.value)} placeholder="All Categories" options={[...CATEGORIES]} className="w-40" />
                <Select value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="All Units" options={[...UNITS]} className="w-32" />
                <Switch checked={onlyWithQty} onChange={setOnlyWithQty} label="Show only items with quantity" />
                <div className="ml-auto flex items-center gap-2">
                  <Button variant="secondary" size="sm" icon={Download} onClick={downloadExcel}>Download Excel</Button>
                  <Button variant="secondary" size="sm" icon={Printer} onClick={() => window.print()}>Print</Button>
                </div>
              </div>
            )}

            {matrix.orders.length === 0 ? (
              <EmptyState
                title="No approved orders yet"
                description={`Nothing is approved for ${fmtDate(date)} delivery. Approve orders first — they appear here automatically.`}
                action={<Button size="sm" variant="primary" onClick={() => nav('/orders?status=Submitted')} className="mt-1">Review pending orders</Button>}
              />
            ) : (
              <div className="print-area">
                {tab === 'matrix' && (
                  <MatrixTable rows={rows} customers={matrix.customers} columnTotals={columnTotals} grandTotal={grandTotal} />
                )}
                {tab === 'items' && <ItemSummary rows={rows} />}
                {tab === 'categories' && <CategorySummary totals={categoryTotals} rows={matrix.rows} />}
                {tab === 'export' && <ExportPanel onExcel={downloadExcel} onPrint={() => window.print()} onReport={() => nav('/reports/operations')} date={date} />}
              </div>
            )}
          </div>
        </div>

        {/* ================================================ right sidebar */}
        <div className="no-print flex flex-col gap-4">
          {isLocked ? (
            <div className="rounded-card border border-emerald-200 bg-emerald-50/70 p-4">
              <div className="flex items-start gap-2.5">
                <CircleCheck size={19} className="mt-0.5 shrink-0 text-emerald-600" />
                <div className="min-w-0">
                  <p className="text-[13.5px] font-semibold text-emerald-900">Consolidation Locked</p>
                  <p className="mt-0.5 text-[12.5px] leading-relaxed text-emerald-800/80">
                    Orders for {fmtDate(date)} are locked and included in purchase planning.
                  </p>
                  <Button variant="secondary" size="sm" className="mt-2.5" onClick={() => nav('/orders')}>View Order List</Button>
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-card border border-amber-200 bg-amber-50/70 p-4">
              <div className="flex items-start gap-2.5">
                <Lock size={18} className="mt-0.5 shrink-0 text-amber-600" />
                <div className="min-w-0">
                  <p className="text-[13.5px] font-semibold text-amber-900">Open for changes</p>
                  <p className="mt-0.5 text-[12.5px] leading-relaxed text-amber-800/80">
                    {pendingOrders.length
                      ? `${pendingOrders.length} order${pendingOrders.length > 1 ? 's' : ''} still awaiting approval for ${fmtDate(date)}.`
                      : `Orders for ${fmtDate(date)} are not locked yet.`}
                  </p>
                  <Button variant="secondary" size="sm" className="mt-2.5" onClick={() => nav('/orders?status=Submitted')}>Review Orders</Button>
                </div>
              </div>
            </div>
          )}

          <SideCard icon={ListChecks} title="Consolidation Summary">
            <SummaryRow icon={Users} label="Total Customers" value={String(matrix.customers.length)} />
            <SummaryRow icon={Package} label="Total Items" value={String(matrix.rows.length)} />
            <SummaryRow icon={Boxes} label="Total Quantity (Mixed Units)" value={num(totalQuantity)} />
            <SummaryRow icon={TrendingUp} label="Total Estimated Value" value={inr(estimatedValue)} strong />
          </SideCard>

          <SideCard icon={LayoutGrid} title="Category Wise Totals">
            <div className="flex flex-col gap-3 px-4 py-3.5">
              {categoryTotals.map((c) => (
                <div key={c.name}>
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-[12.5px] text-ink">{c.name}</p>
                    <p className="tabular shrink-0 text-[12.5px] font-semibold text-ink">
                      {num(c.qty)} <span className="font-normal text-muted">({c.pct}%)</span>
                    </p>
                  </div>
                  <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-canvas">
                    <div className="h-full rounded-full" style={{ width: `${Math.max(3, c.pct)}%`, background: c.color }} />
                  </div>
                </div>
              ))}
            </div>
          </SideCard>

          <SideCard icon={Boxes} title="Top 5 Items by Quantity">
            <div className="flex flex-col divide-y divide-line">
              {topItems.map((r, i) => (
                <div key={r.item.id} className="flex items-center gap-2.5 px-4 py-2.5">
                  <span className="grid size-5 shrink-0 place-items-center rounded-full bg-brand-50 text-[10.5px] font-bold text-brand-800">{i + 1}</span>
                  <p className="min-w-0 flex-1 truncate text-[12.5px] text-ink">{r.item.name} <span className="text-muted">({r.item.unit})</span></p>
                  <p className="tabular shrink-0 text-[12.5px] font-semibold text-ink">{num(r.total)}</p>
                </div>
              ))}
            </div>
          </SideCard>
        </div>
      </div>

      {/* ------------------------------------------------------ bottom bar */}
      <div className="no-print flex flex-col gap-3 rounded-card border border-line bg-white p-3.5 shadow-card lg:flex-row lg:items-center">
        <div className="flex min-w-0 flex-1 items-start gap-2.5">
          <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-blue-50 text-blue-600"><Info size={15} /></span>
          <p className="text-[12.5px] leading-relaxed text-muted">
            This consolidation includes only approved orders. Use 'Generate Purchase Requirement' to create purchase list from these quantities.
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <Button variant="secondary" onClick={() => nav('/reports/operations')}>View Item Quantity Report</Button>
          <Button variant="primary" iconRight={ChevronRight} onClick={generateRequirement} disabled={!matrix.orders.length}>
            Generate Purchase Requirement
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ table */

type Row = ReturnType<typeof buildConsolidation>['rows'][number];

function MatrixTable({ rows, customers, columnTotals, grandTotal }: {
  rows: Row[];
  customers: ReturnType<typeof buildConsolidation>['customers'];
  columnTotals: number[];
  grandTotal: number;
}) {
  if (!rows.length) return <EmptyState icon={Search} title="No items match" description="Try another search, category or unit." />;

  return (
    <div className="scrollbar-thin overflow-x-auto">
      <table className="w-full border-collapse text-[12.5px]">
        <thead>
          <tr className="border-b border-line bg-canvas/70">
            <th className="w-10 px-2 py-2.5 text-center text-[11px] font-semibold text-subtle">#</th>
            <th className="sticky left-0 z-10 min-w-[150px] bg-canvas/70 px-3 py-2.5 text-left text-[11px] font-semibold tracking-wide text-subtle uppercase">Item</th>
            <th className="w-14 px-2 py-2.5 text-center text-[11px] font-semibold tracking-wide text-subtle uppercase">Unit</th>
            {customers.map((c) => (
              <th key={c.id} className="min-w-[86px] px-2 py-2.5 text-center text-[10.5px] leading-tight font-semibold text-subtle uppercase" title={c.name}>
                {c.name}
              </th>
            ))}
            <th className="min-w-[70px] bg-fresh-50 px-2 py-2.5 text-center text-[11px] font-semibold tracking-wide text-brand-800 uppercase">Total</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.item.id} className="border-b border-line last:border-0 hover:bg-fresh-50/40">
              <td className="tabular px-2 py-2 text-center text-subtle">{i + 1}</td>
              <td className="sticky left-0 z-10 bg-white px-3 py-2 font-medium whitespace-nowrap text-ink">{r.item.name}</td>
              <td className="px-2 py-2 text-center text-muted">{r.item.unit}</td>
              {customers.map((c) => {
                const v = r.byCustomer.get(c.id);
                return (
                  <td key={c.id} className="tabular px-2 py-2 text-center text-ink">
                    {v ? num(v) : <span className="text-subtle">–</span>}
                  </td>
                );
              })}
              <td className="tabular bg-fresh-50/60 px-2 py-2 text-center font-semibold text-brand-800">{num(r.total)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-line bg-canvas/70 font-semibold">
            <td />
            <td className="sticky left-0 z-10 bg-canvas/70 px-3 py-2.5 whitespace-nowrap text-ink">Total (Selected)</td>
            <td />
            {columnTotals.map((t, i) => (
              <td key={i} className="tabular px-2 py-2.5 text-center text-ink">{num(t)}</td>
            ))}
            <td className="tabular bg-fresh-100/70 px-2 py-2.5 text-center text-brand-800">{num(grandTotal)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

function ItemSummary({ rows }: { rows: Row[] }) {
  if (!rows.length) return <EmptyState icon={Search} title="No items match" />;
  return (
    <div className="scrollbar-thin overflow-x-auto">
      <table className="w-full border-collapse text-[12.5px]">
        <thead>
          <tr className="border-b border-line bg-canvas/70 text-[11px] font-semibold tracking-wide text-subtle uppercase">
            <th className="w-10 px-2 py-2.5 text-center">#</th>
            <th className="px-3 py-2.5 text-left">Item</th>
            <th className="px-3 py-2.5 text-left">Category</th>
            <th className="px-3 py-2.5 text-center">Unit</th>
            <th className="px-3 py-2.5 text-right">Customers</th>
            <th className="px-3 py-2.5 text-right">Total Quantity</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.item.id} className="border-b border-line last:border-0 hover:bg-fresh-50/40">
              <td className="tabular px-2 py-2 text-center text-subtle">{i + 1}</td>
              <td className="px-3 py-2 font-medium text-ink">{r.item.name}</td>
              <td className="px-3 py-2 text-muted">{r.item.category}</td>
              <td className="px-3 py-2 text-center text-muted">{r.item.unit}</td>
              <td className="tabular px-3 py-2 text-right text-muted">{r.byCustomer.size}</td>
              <td className="tabular px-3 py-2 text-right font-semibold text-ink">{num(r.total)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CategorySummary({ totals, rows }: { totals: { name: Category; qty: number; pct: number; color: string }[]; rows: Row[] }) {
  return (
    <div className="scrollbar-thin overflow-x-auto">
      <table className="w-full border-collapse text-[12.5px]">
        <thead>
          <tr className="border-b border-line bg-canvas/70 text-[11px] font-semibold tracking-wide text-subtle uppercase">
            <th className="px-3 py-2.5 text-left">Category</th>
            <th className="px-3 py-2.5 text-right">Items</th>
            <th className="px-3 py-2.5 text-right">Total Quantity</th>
            <th className="px-3 py-2.5 text-right">Share</th>
            <th className="w-40 px-3 py-2.5 text-left">Split</th>
          </tr>
        </thead>
        <tbody>
          {totals.map((c) => (
            <tr key={c.name} className="border-b border-line last:border-0">
              <td className="px-3 py-2.5 font-medium text-ink">{c.name}</td>
              <td className="tabular px-3 py-2.5 text-right text-muted">{rows.filter((r) => r.item.category === c.name).length}</td>
              <td className="tabular px-3 py-2.5 text-right font-semibold text-ink">{num(c.qty)}</td>
              <td className="tabular px-3 py-2.5 text-right text-muted">{c.pct}%</td>
              <td className="px-3 py-2.5">
                <div className="h-2 overflow-hidden rounded-full bg-canvas">
                  <div className="h-full rounded-full" style={{ width: `${Math.max(3, c.pct)}%`, background: c.color }} />
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ExportPanel({ onExcel, onPrint, onReport, date }: { onExcel: () => void; onPrint: () => void; onReport: () => void; date: string }) {
  const options = [
    { icon: FileSpreadsheet, title: 'Download Excel (CSV)', desc: 'Customer-wise matrix with column totals, exactly as shown.', action: onExcel, label: 'Download' },
    { icon: Printer, title: 'Print consolidation sheet', desc: 'Print-friendly layout — navigation stripped, matrix only.', action: onPrint, label: 'Print' },
    { icon: ListChecks, title: 'Item Quantity Report', desc: 'Item-wise totals for the weighing floor.', action: onReport, label: 'Open' },
  ];
  return (
    <div className="flex flex-col gap-3 p-4">
      <p className="text-[12.5px] text-muted">Exports cover delivery date {fmtDate(date)}.</p>
      {options.map((o) => (
        <div key={o.title} className="flex items-center gap-3 rounded-lg border border-line px-3.5 py-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-700"><o.icon size={17} /></span>
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-semibold text-ink">{o.title}</p>
            <p className="text-[12px] text-muted">{o.desc}</p>
          </div>
          <Button variant="secondary" size="sm" onClick={o.action}>{o.label}</Button>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------ small parts */

function Kpi({ icon: Icon, tone, value, label, note }: { icon: LucideIcon; tone: string; value: string; label: string; note: string }) {
  return (
    <div className="rounded-card border border-line bg-white p-3.5 shadow-card">
      <div className="flex items-center gap-3">
        <span className={cn('grid size-11 shrink-0 place-items-center rounded-xl', tone)}><Icon size={20} /></span>
        <div className="min-w-0">
          <p className="tabular text-[22px] leading-none font-bold text-ink">{value}</p>
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
