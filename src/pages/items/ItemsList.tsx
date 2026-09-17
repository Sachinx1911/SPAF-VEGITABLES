import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import {
  AlertTriangle, Boxes, ChevronRight, CircleAlert, Download, Ellipsis, Layers, Package, PackagePlus, Plus,
  Printer, Search, Upload, type LucideIcon,
} from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Input, Select, Switch } from '../../components/ui/Field';
import { EmptyState } from '../../components/ui/States';
import { Menu } from '../../components/ui/Dropdown';
import { ItemForm } from './ItemForm';
import { useDb } from '../../store/useStore';
import { CATEGORIES, UNITS, type Category, type Item } from '../../types/models';
import { fmtDateTime, inr, num } from '../../lib/format';
import { itemEmoji } from '../orders/orderUi';
import { cn } from '../../lib/cn';

const TOOLTIP = { fontSize: 12, borderRadius: 8, border: '1px solid #e3e8e4', boxShadow: '0 4px 12px rgba(16,40,26,0.1)' };
const CATEGORY_COLOR: Record<Category, string> = {
  'Indian Vegetables': '#2f7f50',
  'Fresh Fruits': '#f97316',
  'Herbs & Leafy': '#7bc47f',
  'Imported Produce': '#3b82f6',
  'Exotic Vegetables': '#8b5cf6',
};

type StockState = 'In Stock' | 'Low Stock' | 'Out of Stock' | 'Fresh Daily';

/**
 * Stock state is derived from the item's own reorder level — never stored twice.
 * Most produce is bought fresh for the day and carries no reorder level, so it
 * reads as "Fresh Daily" rather than being wrongly flagged out of stock.
 */
function stockStateOf(i: Item): StockState {
  if (i.minStock <= 0) return i.stock > 0 ? 'In Stock' : 'Fresh Daily';
  if (i.stock <= 0) return 'Out of Stock';
  if (i.stock <= i.reorderLevel) return 'Low Stock';
  return 'In Stock';
}

const STATE_TONE: Record<StockState, string> = {
  'In Stock': 'bg-emerald-50 text-emerald-700',
  'Low Stock': 'bg-amber-50 text-amber-700',
  'Out of Stock': 'bg-red-50 text-red-600',
  'Fresh Daily': 'bg-blue-50 text-blue-700',
};
const STATE_COLOR: Record<StockState, string> = {
  'In Stock': '#22683f', 'Low Stock': '#f59e0b', 'Out of Stock': '#ef4444', 'Fresh Daily': '#60a5fa',
};

export function ItemsListPage() {
  const db = useDb();
  const nav = useNavigate();
  const loc = useLocation();

  const [tab, setTab] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState(() => new URLSearchParams(loc.search).get('category') ?? '');
  const [unit, setUnit] = useState('');
  const [stockStatus, setStockStatus] = useState('');
  const [lowStockOnly, setLowStockOnly] = useState(false);
  const [page, setPage] = useState(1);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Item | null>(null);

  // /items/new opens straight into the add form, then returns to the list.
  useEffect(() => {
    if (loc.pathname === '/items/new') setFormOpen(true);
  }, [loc.pathname]);
  const closeForm = () => {
    setFormOpen(false);
    if (loc.pathname === '/items/new') nav('/items');
  };

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return db.items
      .filter((it) => (tab === 'all' ? true : it.category === tab))
      .filter((it) => {
        if (term && !(it.name.toLowerCase().includes(term) || it.code.toLowerCase().includes(term) || it.category.toLowerCase().includes(term))) return false;
        if (category && it.category !== category) return false;
        if (unit && it.unit !== unit) return false;
        if (stockStatus && stockStateOf(it) !== stockStatus) return false;
        if (lowStockOnly && stockStateOf(it) !== 'Low Stock') return false;
        return true;
      })
      .sort((a, b) => a.sortOrder - b.sortOrder);
  }, [db.items, tab, search, category, unit, stockStatus, lowStockOnly]);

  const pageSize = 10;
  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const pageRows = rows.slice((page - 1) * pageSize, page * pageSize);

  /* ------------------------------------------------------------- numbers */
  const tracked = db.items.filter((i) => i.minStock > 0);
  const inStock = db.items.filter((i) => stockStateOf(i) === 'In Stock').length;
  const lowStock = db.items.filter((i) => stockStateOf(i) === 'Low Stock').length;
  const outOfStock = db.items.filter((i) => stockStateOf(i) === 'Out of Stock').length;
  const stockValue = db.items.reduce((s, i) => s + i.stock * i.defaultPurchasePrice, 0);

  const byState = useMemo(() => {
    const m = new Map<StockState, number>();
    for (const i of db.items) m.set(stockStateOf(i), (m.get(stockStateOf(i)) ?? 0) + 1);
    return [...m.entries()].map(([name, value]) => ({ name, value, color: STATE_COLOR[name] })).sort((a, b) => b.value - a.value);
  }, [db.items]);

  const categoryCounts = useMemo(
    () => CATEGORIES.map((c) => ({ name: c, count: db.items.filter((i) => i.category === c).length, color: CATEGORY_COLOR[c] })),
    [db.items],
  );

  const recentActivity = useMemo(
    () => db.auditLogs.filter((a) => a.module === 'items' || a.module === 'receiving').slice(0, 5),
    [db.auditLogs],
  );

  const exportCsv = () => {
    const head = ['Item Name', 'Code', 'Category', 'Unit', 'Current Stock', 'Min. Stock', 'Status', 'Purchase Price'];
    const body = rows.map((i) => [i.name, i.code, i.category, i.unit, i.stock, i.minStock, stockStateOf(i), i.defaultPurchasePrice]);
    const csv = [head, ...body].map((line) => line.map((v) => `"${String(v)}"`).join(',')).join('\r\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
    a.download = 'items.csv';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  return (
    <div className="flex flex-col gap-4">
      <nav className="no-print flex items-center gap-1 text-[12.5px] text-muted">
        <span>Inventory</span>
        <ChevronRight size={13} className="text-subtle" />
        <span className="font-medium text-ink">Items</span>
      </nav>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 max-w-md">
          <h1 className="text-[26px] leading-tight font-bold tracking-[-0.01em] text-ink">Inventory Management</h1>
          <p className="mt-1 text-[13px] text-muted">Manage your items, categories and stock in real-time.</p>
        </div>
        <Button variant="primary" icon={Plus} onClick={() => setFormOpen(true)}>Add New Item</Button>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex min-w-0 flex-col gap-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Kpi icon={Package} tone="bg-fresh-50 text-fresh-600" value={String(db.items.length)} label="Total Items" note={`Across ${CATEGORIES.length} categories`} />
            <Kpi icon={Layers} tone="bg-blue-50 text-blue-600" value={String(inStock)} label="Items in Stock" note={`${db.items.length ? Math.round((inStock / db.items.length) * 100) : 0}% of total items`} />
            <Kpi icon={AlertTriangle} tone="bg-amber-50 text-amber-600" value={String(lowStock)} label="Low Stock Items" note="Need reordering" />
            <Kpi icon={CircleAlert} tone="bg-red-50 text-red-500" value={String(outOfStock)} label="Out of Stock" note="Currently unavailable" />
          </div>

          <div className="overflow-hidden rounded-card border border-line bg-white shadow-card">
            <div className="no-print flex gap-1 overflow-x-auto border-b border-line px-3 pt-2">
              {[{ key: 'all', label: 'All Items', count: db.items.length }, ...CATEGORIES.map((c) => ({ key: c, label: c, count: db.items.filter((i) => i.category === c).length }))].map((t) => (
                <button
                  key={t.key}
                  onClick={() => { setTab(t.key); setPage(1); }}
                  className={cn(
                    'shrink-0 border-b-2 px-3 pb-2.5 text-[13px] font-semibold whitespace-nowrap transition-colors',
                    tab === t.key ? 'border-brand-700 text-brand-800' : 'border-transparent text-muted hover:text-ink',
                  )}
                >
                  {t.label} <span className="tabular text-[11px] text-subtle">({t.count})</span>
                </button>
              ))}
            </div>

            <div className="no-print flex flex-wrap items-center gap-2.5 border-b border-line px-3 py-3">
              <Input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder="Search item name, code or category…" leading={<Search size={15} />} className="w-full sm:w-60" />
              <Select value={category} onChange={(e) => { setCategory(e.target.value); setPage(1); }} placeholder="All Categories" options={[...CATEGORIES]} className="w-44" />
              <Select value={stockStatus} onChange={(e) => { setStockStatus(e.target.value); setPage(1); }} placeholder="All Stock Status" options={['In Stock', 'Low Stock', 'Out of Stock', 'Fresh Daily']} className="w-40" />
              <Select value={unit} onChange={(e) => { setUnit(e.target.value); setPage(1); }} placeholder="All Units" options={[...UNITS]} className="w-28" />
              <Switch checked={lowStockOnly} onChange={(v) => { setLowStockOnly(v); setPage(1); }} label="Show low stock only" />
              <div className="ml-auto flex items-center gap-2">
                <Button variant="secondary" size="sm" icon={Upload}>Import</Button>
                <Button variant="secondary" size="sm" icon={Download} onClick={exportCsv}>Export</Button>
                <Button variant="secondary" size="sm" icon={Printer} onClick={() => window.print()}>Print</Button>
              </div>
            </div>

            {rows.length === 0 ? (
              <EmptyState icon={Package} title="No items found" description="Try clearing filters, or add a new item." action={<Button size="sm" variant="primary" icon={Plus} onClick={() => setFormOpen(true)} className="mt-1">Add Item</Button>} />
            ) : (
              <>
                <div className="scrollbar-thin overflow-x-auto print-area">
                  <table className="w-full border-collapse text-[12.5px]">
                    <thead>
                      <tr className="border-b border-line bg-canvas/70 text-[11px] font-semibold tracking-wide text-subtle uppercase">
                        <th className="w-10 px-2 py-2.5 text-center">#</th>
                        <th className="px-3 py-2.5 text-left">Item Name</th>
                        <th className="px-3 py-2.5 text-left">Category</th>
                        <th className="px-3 py-2.5 text-center">Unit</th>
                        <th className="px-3 py-2.5 text-right">Current Stock</th>
                        <th className="px-3 py-2.5 text-right">Min. Stock</th>
                        <th className="px-3 py-2.5 text-center">Status</th>
                        <th className="px-3 py-2.5 text-right">Purchase Price</th>
                        <th className="w-10 px-2 py-2.5" />
                      </tr>
                    </thead>
                    <tbody>
                      {pageRows.map((i, idx) => {
                        const state = stockStateOf(i);
                        return (
                          <tr key={i.id} onClick={() => nav(`/items/${i.id}`)} className="cursor-pointer border-b border-line last:border-0 hover:bg-fresh-50/40">
                            <td className="tabular px-2 py-2.5 text-center text-subtle">{(page - 1) * pageSize + idx + 1}</td>
                            <td className="px-3 py-2.5 whitespace-nowrap">
                              <span className="mr-2 text-[15px]">{itemEmoji(i.name, i.category)}</span>
                              <span className="font-medium text-ink">{i.name}</span>
                            </td>
                            <td className="px-3 py-2.5 whitespace-nowrap text-muted">{i.category}</td>
                            <td className="px-3 py-2.5 text-center text-muted">{i.unit}</td>
                            <td className="tabular px-3 py-2.5 text-right font-semibold text-ink">{num(i.stock)}</td>
                            <td className="tabular px-3 py-2.5 text-right text-muted">{i.minStock > 0 ? num(i.minStock) : '—'}</td>
                            <td className="px-3 py-2.5 text-center">
                              <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap', STATE_TONE[state])}>{state}</span>
                            </td>
                            <td className="tabular px-3 py-2.5 text-right text-ink">{inr(i.defaultPurchasePrice, true)}</td>
                            <td className="px-2 py-2.5 text-center" onClick={(e) => e.stopPropagation()}>
                              <Menu
                                align="right"
                                items={[
                                  { key: 'view', label: 'View detail', onClick: () => nav(`/items/${i.id}`) },
                                  { key: 'edit', label: 'Edit', onClick: () => setEditing(i) },
                                ]}
                                trigger={(open) => <button onClick={open} className="rounded p-1 text-subtle hover:bg-canvas hover:text-ink"><Ellipsis size={15} /></button>}
                              />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="no-print flex flex-wrap items-center justify-between gap-2 border-t border-line px-3.5 py-2.5 text-[12.5px] text-muted">
                  <span>Showing {(page - 1) * pageSize + 1} to {Math.min(page * pageSize, rows.length)} of {rows.length} items</span>
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
          <div className="grid gap-4 lg:grid-cols-2">
            <SideCard icon={Boxes} title="Stock Status Distribution">
              <div className="flex items-center gap-3 p-4">
                <div className="relative h-32 w-32 shrink-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={byState} dataKey="value" nameKey="name" innerRadius={38} outerRadius={58} paddingAngle={2}>
                        {byState.map((s) => <Cell key={s.name} fill={s.color} />)}
                      </Pie>
                      <Tooltip contentStyle={TOOLTIP} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
                    <div>
                      <p className="tabular text-[17px] leading-none font-bold text-ink">{db.items.length}</p>
                      <p className="text-[10px] text-subtle">Total Items</p>
                    </div>
                  </div>
                </div>
                <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                  {byState.map((s) => (
                    <div key={s.name} className="flex items-center gap-1.5 text-[11.5px]">
                      <span className="size-2 shrink-0 rounded-full" style={{ background: s.color }} />
                      <span className="min-w-0 flex-1 truncate text-muted">{s.name}</span>
                      <span className="tabular font-semibold text-ink">{s.value} <span className="font-normal text-subtle">({db.items.length ? Math.round((s.value / db.items.length) * 100) : 0}%)</span></span>
                    </div>
                  ))}
                </div>
              </div>
            </SideCard>

            <SideCard icon={PackagePlus} title="Recent Item Activity">
              <div className="flex flex-col divide-y divide-line">
                {recentActivity.map((a) => (
                  <div key={a.id} className="flex items-center gap-2.5 px-4 py-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[12px] text-ink">{a.action}</p>
                      <p className="text-[11px] text-subtle">{a.recordRef} · {db.users.find((u) => u.id === a.userId)?.name ?? '—'}</p>
                    </div>
                    <p className="shrink-0 text-[11px] text-subtle">{fmtDateTime(a.at)}</p>
                  </div>
                ))}
                {recentActivity.length === 0 && <p className="px-4 py-3 text-[12.5px] text-muted">No item activity yet.</p>}
              </div>
            </SideCard>
          </div>
        </div>

        {/* ================================================ right sidebar */}
        <div className="no-print flex flex-col gap-4">
          <SideCard icon={Layers} title="Category Summary">
            <div className="flex flex-col divide-y divide-line">
              {categoryCounts.map((c) => (
                <button key={c.name} onClick={() => { setTab(c.name); setPage(1); }} className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left hover:bg-fresh-50/40">
                  <span className="size-2.5 shrink-0 rounded-full" style={{ background: c.color }} />
                  <p className="min-w-0 flex-1 truncate text-[12.5px] text-ink">{c.name}</p>
                  <p className="tabular shrink-0 text-[12.5px] font-semibold text-ink">{c.count}</p>
                </button>
              ))}
            </div>
          </SideCard>

          <div className="rounded-card border border-line bg-white p-4 shadow-card">
            <p className="text-[12.5px] font-medium text-muted">Stock Value (Est.)</p>
            <p className="tabular mt-1 text-[22px] leading-none font-bold text-ink">{inr(stockValue)}</p>
            <p className="mt-1.5 text-[11.5px] text-subtle">At default purchase price across {tracked.length} tracked items.</p>
          </div>

          <SideCard icon={Package} title="Quick Actions">
            <div className="flex flex-col divide-y divide-line">
              {[
                { icon: Plus, label: 'Add New Item', action: () => setFormOpen(true) },
                { icon: Upload, label: 'Bulk Import (Excel)', action: () => setFormOpen(true) },
                { icon: Boxes, label: 'Update Stock', action: () => nav('/stock') },
                { icon: Layers, label: 'Manage Categories', action: () => nav('/categories') },
                { icon: AlertTriangle, label: 'Low Stock Report', action: () => { setStockStatus('Low Stock'); setPage(1); } },
                { icon: Printer, label: 'Print Item List', action: () => window.print() },
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

      <div className="no-print rounded-card bg-gradient-to-r from-brand-800 to-fresh-600 p-5 text-white">
        <p className="text-[15px] font-semibold">Fresh Inventory, Better Tomorrow</p>
        <p className="text-[12.5px] text-white/80">Keep track of your stock and ensure fresh produce reaches more people.</p>
      </div>

      <ItemForm open={formOpen} onClose={closeForm} />
      <ItemForm open={!!editing} onClose={() => setEditing(null)} item={editing} />
    </div>
  );
}

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
