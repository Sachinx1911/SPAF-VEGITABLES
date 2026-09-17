import { Fragment, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import {
  AlertTriangle, Boxes, ChevronRight, ClipboardList, Download, Ellipsis, History, Info, Package, PackageOpen,
  Printer, Search, Split, Trash, Wand, type LucideIcon,
} from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Input, Select, Switch, QtyInput } from '../../components/ui/Field';
import { EmptyState } from '../../components/ui/States';
import { useConfirm } from '../../components/ui/ConfirmDialog';
import { useToast } from '../../components/ui/Toast';
import { useCurrentUser, useDb } from '../../store/useStore';
import { autoAllocateItem, setManualAllocation } from '../../store/procurementActions';
import { allocationRows, itemsNeedingAllocation, type AllocationRow } from '../../domain/procurement';
import { CATEGORIES, type Category } from '../../types/models';
import { addDays, fmtTime, num, qty } from '../../lib/format';
import { todayISO } from '../../lib/clock';
import { itemEmoji } from '../orders/orderUi';
import { cn } from '../../lib/cn';

const TABS = [
  { key: 'items', label: 'Item-wise Allocation' },
  { key: 'customers', label: 'Customer-wise View' },
  { key: 'shortage', label: 'Shortage Items' },
  { key: 'excess', label: 'Excess Items' },
] as const;
type TabKey = (typeof TABS)[number]['key'];

/** One row per item: what came in, what every order needs, what has been given out. */
interface ItemRow {
  itemId: string;
  name: string;
  category: Category;
  unit: string;
  available: number;
  required: number;
  allocated: number;
  balance: number;
  status: 'Allocated' | 'Shortage' | 'Pending';
  lines: AllocationRow[];
}

export function AllocationPage() {
  const db = useDb();
  const user = useCurrentUser()!;
  const nav = useNavigate();
  const confirm = useConfirm();
  const toast = useToast();
  const today = todayISO();

  // Open on the day that actually has stock to hand out: tomorrow once the
  // purchase has landed, otherwise today's run which is still being allocated.
  const [date, setDate] = useState(() =>
    allocationRows(db, addDays(today, 1)).some((r) => r.available > 0) ? addDays(today, 1) : today,
  );
  const [tab, setTab] = useState<TabKey>('items');
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [status, setStatus] = useState('');
  const [shortageOnly, setShortageOnly] = useState(false);
  const [override, setOverride] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  const pendingItems = useMemo(() => itemsNeedingAllocation(db, date), [db, date]);
  const lines = useMemo(() => allocationRows(db, date), [db, date]);

  const itemRows: ItemRow[] = useMemo(() => {
    const byItem = new Map<string, ItemRow>();
    for (const l of lines) {
      const row = byItem.get(l.item.id) ?? {
        itemId: l.item.id, name: l.item.name, category: l.item.category, unit: l.unit,
        available: l.available, required: 0, allocated: 0, balance: 0, status: 'Pending' as const, lines: [],
      };
      row.required += l.required;
      row.allocated += l.allocated ?? 0;
      row.lines.push(l);
      byItem.set(l.item.id, row);
    }
    return [...byItem.values()].map((r) => {
      const balance = r.available - r.required;
      const status: ItemRow['status'] = balance < 0 ? 'Shortage' : r.allocated > 0 ? 'Allocated' : 'Pending';
      return { ...r, balance, status };
    });
  }, [lines]);

  const shortageItems = itemRows.filter((r) => r.balance < 0);
  const excessItems = itemRows.filter((r) => r.balance > 0);

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    const base = tab === 'shortage' ? shortageItems : tab === 'excess' ? excessItems : itemRows;
    return base
      .filter((r) => !term || r.name.toLowerCase().includes(term))
      .filter((r) => !category || r.category === category)
      .filter((r) => !status || r.status === status)
      .filter((r) => !shortageOnly || r.balance < 0);
  }, [itemRows, shortageItems, excessItems, tab, search, category, status, shortageOnly]);

  /* ------------------------------------------------------------- numbers */
  const totalAvailable = itemRows.reduce((s, r) => s + r.available, 0);
  const totalRequired = itemRows.reduce((s, r) => s + r.required, 0);
  const totalAllocated = itemRows.reduce((s, r) => s + r.allocated, 0);
  const totalShortage = shortageItems.reduce((s, r) => s + Math.abs(r.balance), 0);
  const unallocated = itemRows.filter((r) => r.allocated === 0 && r.available > 0);
  const allocatedPct = totalRequired ? Math.min(100, Math.round((totalAllocated / totalRequired) * 100)) : 0;

  const recent = useMemo(
    () => db.auditLogs.filter((a) => a.module === 'allocation').slice(0, 5),
    [db.auditLogs],
  );

  /* ------------------------------------------------------------- actions */
  const runAuto = async (id: string) => {
    const item = db.items.find((i) => i.id === id)!;
    const ok = await confirm({
      title: `Auto-allocate ${item.name}?`,
      description: override
        ? 'Override is on: every order gets its full requested quantity even if that exceeds available stock.'
        : 'Distributes available stock proportionally, in route order.',
      tone: override ? 'danger' : 'default',
      confirmLabel: 'Allocate',
    });
    if (!ok) return;
    autoAllocateItem(date, id, user.id, override);
    toast({ tone: 'success', title: 'Allocated', description: item.name });
  };

  const runAutoAll = async () => {
    const targets = rows.filter((r) => r.required > 0);
    const ok = await confirm({
      title: 'Auto-allocate every item?',
      description: override
        ? 'Override is on: orders get their full requested quantity even where stock is short.'
        : 'Each item is distributed proportionally across customers, in route order.',
      tone: override ? 'danger' : 'default',
      confirmLabel: `Allocate ${targets.length} items`,
      details: [{ label: 'Delivery date', value: date }, { label: 'Items', value: targets.length }],
    });
    if (!ok) return;
    targets.forEach((r) => autoAllocateItem(date, r.itemId, user.id, override));
    toast({ tone: 'success', title: 'Auto allocation complete', description: `${targets.length} items allocated.` });
  };

  const clearItem = async (r: ItemRow) => {
    const ok = await confirm({ title: `Clear allocation for ${r.name}?`, tone: 'danger', confirmLabel: 'Clear' });
    if (!ok) return;
    r.lines.forEach((l) => setManualAllocation(l.orderItemId, 0, user.id));
    toast({ tone: 'warning', title: 'Allocation cleared', description: r.name });
  };

  const exportCsv = () => {
    const head = ['Item', 'Unit', 'Available Qty', 'Total Required', 'Total Allocated', 'Balance', 'Status'];
    const body = rows.map((r) => [r.name, r.unit, r.available, r.required, r.allocated, r.balance, r.status]);
    const csv = [head, ...body].map((line) => line.map((v) => `"${String(v)}"`).join(',')).join('\r\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
    a.download = `allocation-${date}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  return (
    <div className="flex flex-col gap-4">
      <nav className="no-print flex items-center gap-1 text-[12.5px] text-muted">
        <span>Operations</span>
        <ChevronRight size={13} className="text-subtle" />
        <span className="font-medium text-ink">Allocation</span>
      </nav>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 max-w-md">
          <h1 className="text-[26px] leading-tight font-bold tracking-[-0.01em] text-ink">Customer-wise Allocation</h1>
          <p className="mt-1 text-[13px] text-muted">Allocate received stock to customer orders based on approved quantities.</p>
        </div>
        <div className="no-print flex flex-wrap items-center gap-2.5">
          <label className="flex items-center gap-2 text-[12.5px] font-medium text-muted">
            Allocation Date
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-9 rounded-lg border border-line bg-white px-2.5 text-[13px] text-ink" />
          </label>
          <Button variant="primary" icon={Wand} onClick={runAutoAll} disabled={!rows.length}>Auto Allocate</Button>
          <Button variant="secondary" icon={History} onClick={() => nav('/audit-logs?module=allocation')}>Allocation History</Button>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex min-w-0 flex-col gap-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <Kpi icon={ClipboardList} tone="bg-blue-50 text-blue-600" value={String(itemRows.length)} label="Total Items" note="in today's allocation" />
            <Kpi icon={Boxes} tone="bg-fresh-50 text-fresh-600" value={num(totalAvailable)} label="Available Stock" note="from receiving" />
            <Kpi icon={Package} tone="bg-violet-50 text-violet-600" value={num(totalAllocated)} label="Allocated" note={`${allocatedPct}% allocated`} />
            <Kpi icon={AlertTriangle} tone="bg-orange-50 text-orange-600" value={num(totalShortage)} label="Shortage" note={`${shortageItems.length} items`} />
            <Kpi icon={PackageOpen} tone="bg-red-50 text-red-500" value={num(unallocated.reduce((s, r) => s + r.available, 0))} label="Unallocated" note={`${unallocated.length} items`} />
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
                  {t.label}
                  {t.key === 'shortage' && shortageItems.length > 0 && <span className="ml-1.5 rounded-full bg-red-50 px-1.5 py-0.5 text-[10.5px] text-red-600">{shortageItems.length}</span>}
                  {t.key === 'excess' && excessItems.length > 0 && <span className="ml-1.5 rounded-full bg-blue-50 px-1.5 py-0.5 text-[10.5px] text-blue-600">{excessItems.length}</span>}
                </button>
              ))}
            </div>

            <div className="no-print flex flex-wrap items-center gap-2.5 border-b border-line px-3 py-3">
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search item (e.g. Tomato, Onion…)" leading={<Search size={15} />} className="w-full sm:w-60" />
              <Select value={category} onChange={(e) => setCategory(e.target.value)} placeholder="All Categories" options={[...CATEGORIES]} className="w-44" />
              <Select value={status} onChange={(e) => setStatus(e.target.value)} placeholder="All Status" options={['Allocated', 'Shortage', 'Pending']} className="w-36" />
              <Switch checked={shortageOnly} onChange={setShortageOnly} label="Show only items with shortage" />
              <div className="ml-auto flex items-center gap-2">
                <Button variant="secondary" size="sm" icon={Download} onClick={exportCsv}>Export</Button>
                <Button variant="secondary" size="sm" icon={Printer} onClick={() => window.print()}>Print</Button>
              </div>
            </div>

            {tab === 'customers' ? (
              <CustomerView lines={lines} override={override} userId={user.id} />
            ) : rows.length === 0 ? (
              <EmptyState
                icon={Split}
                title="Nothing to allocate"
                description="Choose a delivery date with a locked consolidation and received stock."
              />
            ) : (
              <div className="scrollbar-thin overflow-x-auto print-area">
                <table className="w-full border-collapse text-[12.5px]">
                  <thead>
                    <tr className="border-b border-line bg-canvas/70 text-[11px] font-semibold tracking-wide text-subtle uppercase">
                      <th className="w-10 px-2 py-2.5 text-center">#</th>
                      <th className="px-3 py-2.5 text-left">Item</th>
                      <th className="px-3 py-2.5 text-center">Unit</th>
                      <th className="px-3 py-2.5 text-right">Available Qty<br /><span className="normal-case">(from receiving)</span></th>
                      <th className="px-3 py-2.5 text-right">Total Required<br /><span className="normal-case">(from orders)</span></th>
                      <th className="px-3 py-2.5 text-right">Total Allocated</th>
                      <th className="px-3 py-2.5 text-right">Balance</th>
                      <th className="px-3 py-2.5 text-center">Status</th>
                      <th className="px-3 py-2.5 text-center">Action</th>
                      <th className="w-10 px-2 py-2.5" />
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r, i) => (
                      <Fragment key={r.itemId}>
                        <tr className="border-b border-line hover:bg-fresh-50/40">
                          <td className="tabular px-2 py-2.5 text-center text-subtle">{i + 1}</td>
                          <td className="px-3 py-2.5 whitespace-nowrap">
                            <button onClick={() => setExpanded(expanded === r.itemId ? null : r.itemId)} className="text-left">
                              <span className="mr-2 text-[15px]">{itemEmoji(r.name, r.category)}</span>
                              <span className="font-medium text-ink">{r.name}</span>
                            </button>
                          </td>
                          <td className="px-3 py-2.5 text-center text-muted">{r.unit}</td>
                          <td className="tabular px-3 py-2.5 text-right text-ink">{num(r.available)}</td>
                          <td className="tabular px-3 py-2.5 text-right text-ink">{num(r.required)}</td>
                          <td className="tabular px-3 py-2.5 text-right font-semibold text-ink">{num(r.allocated)}</td>
                          <td className="px-3 py-2.5 text-right">
                            <span className={cn('tabular rounded-md px-2 py-0.5 text-[12px] font-semibold', r.balance < 0 ? 'bg-red-50 text-red-600' : 'bg-emerald-50 text-emerald-700')}>
                              {r.balance > 0 ? '+' : ''}{num(r.balance)}
                            </span>
                          </td>
                          <td className="px-3 py-2.5 text-center">
                            <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap',
                              r.status === 'Shortage' ? 'bg-red-50 text-red-600' : r.status === 'Allocated' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700')}>
                              {r.status}
                            </span>
                          </td>
                          <td className="px-3 py-2.5 text-center">
                            <Button variant="primary" size="sm" onClick={() => runAuto(r.itemId)}>Allocate</Button>
                          </td>
                          <td className="px-2 py-2.5 text-center">
                            <button onClick={() => clearItem(r)} title="Clear allocation" className="rounded p-1 text-subtle hover:bg-canvas hover:text-ink"><Ellipsis size={15} /></button>
                          </td>
                        </tr>
                        {expanded === r.itemId && (
                          <tr className="border-b border-line bg-canvas/40">
                            <td />
                            <td colSpan={9} className="px-3 py-2.5">
                              <div className="flex flex-col gap-1.5">
                                {r.lines.map((l) => (
                                  <div key={l.orderItemId} className="flex flex-wrap items-center gap-2.5">
                                    <p className="min-w-[180px] flex-1 truncate text-[12px] text-ink">{l.customer.name}</p>
                                    <p className="tabular w-24 shrink-0 text-right text-[12px] text-muted">needs {qty(l.required, l.unit)}</p>
                                    <QtyInput
                                      value={l.allocated} unit={l.unit} size="sm"
                                      max={override ? undefined : Math.max(l.required, l.allocated ?? 0)}
                                      onChange={(v) => setManualAllocation(l.orderItemId, v ?? 0, user.id)}
                                    />
                                    <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-[10.5px] font-semibold',
                                      l.status === 'Shortage' ? 'bg-red-50 text-red-600' : l.status === 'Partial' ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700')}>
                                      {l.status}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* -------------------------------------------------- bottom cards */}
          <div className="grid gap-4 lg:grid-cols-2">
            <SideCard icon={ClipboardList} title="Allocation Summary">
              <div className="flex flex-col">
                <SummaryRow label="Total Items" value={String(itemRows.length)} />
                <SummaryRow label="Total Available" value={num(totalAvailable)} />
                <SummaryRow label="Total Required" value={num(totalRequired)} />
                <SummaryRow label="Total Allocated" value={num(totalAllocated)} strong />
                <SummaryRow label="Shortage" value={num(totalShortage)} tone="text-red-600" />
                <SummaryRow label="Excess" value={num(excessItems.reduce((s, r) => s + r.balance, 0))} tone="text-blue-600" />
              </div>
            </SideCard>

            <SideCard icon={History} title="Recent Allocation Activity">
              <div className="flex flex-col divide-y divide-line">
                {recent.map((a) => (
                  <div key={a.id} className="flex items-center gap-2.5 px-4 py-2.5">
                    <p className="w-14 shrink-0 text-[11px] text-subtle">{fmtTime(a.at)}</p>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[12px] text-ink">{a.action} · {a.recordRef}</p>
                      <p className="text-[11px] text-subtle">{db.users.find((u) => u.id === a.userId)?.name ?? '—'}</p>
                    </div>
                    <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-[10.5px] font-semibold', a.status === 'Warning' ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700')}>{a.status}</span>
                  </div>
                ))}
                {recent.length === 0 && <p className="px-4 py-3 text-[12.5px] text-muted">No allocation activity yet.</p>}
              </div>
            </SideCard>
          </div>
        </div>

        {/* ================================================ right sidebar */}
        <div className="no-print flex flex-col gap-4">
          <SideCard icon={PackageOpen} title={`Unallocated Stock (${unallocated.length})`}>
            <div className="flex flex-col divide-y divide-line">
              {unallocated.slice(0, 6).map((r) => (
                <div key={r.itemId} className="flex items-center gap-2.5 px-4 py-2.5">
                  <p className="min-w-0 flex-1 truncate text-[12.5px] text-ink">{r.name}</p>
                  <p className="shrink-0 text-[11.5px] text-muted">{r.unit}</p>
                  <p className="tabular shrink-0 text-[12.5px] font-semibold text-ink">{num(r.available)}</p>
                </div>
              ))}
              {unallocated.length === 0 && <p className="px-4 py-3 text-[12.5px] text-muted">Everything received has been allocated.</p>}
            </div>
          </SideCard>

          <SideCard icon={AlertTriangle} title={`Shortage Items (${shortageItems.length})`}>
            <div className="flex flex-col divide-y divide-line">
              {shortageItems.slice(0, 6).map((r) => (
                <div key={r.itemId} className="flex items-center gap-2.5 px-4 py-2.5">
                  <p className="min-w-0 flex-1 truncate text-[12.5px] text-ink">{r.name}</p>
                  <p className="shrink-0 text-[11.5px] text-muted">{r.unit}</p>
                  <p className="tabular shrink-0 text-[12.5px] font-semibold text-red-600">{num(Math.abs(r.balance))}</p>
                </div>
              ))}
              {shortageItems.length === 0 && <p className="px-4 py-3 text-[12.5px] text-muted">No shortages for this date.</p>}
            </div>
            {shortageItems.length > 0 && (
              <div className="p-3">
                <Button variant="secondary" size="sm" className="w-full" onClick={() => nav('/shortage')}>View All Shortage Items</Button>
              </div>
            )}
          </SideCard>

          <SideCard icon={Wand} title="Allocation Actions">
            <div className="flex flex-col divide-y divide-line">
              <ActionRow icon={Wand} title="Auto Allocate" desc="Allocate proportionally, in route order" onClick={runAutoAll} />
              <ActionRow icon={Split} title="Manual Allocation" desc="Open an item row to adjust per customer" onClick={() => setExpanded(rows[0]?.itemId ?? null)} />
              <ActionRow icon={Trash} title="Clear Allocation" desc="Remove allocations for an item" onClick={() => rows[0] && clearItem(rows[0])} />
              <ActionRow icon={ClipboardList} title="Generate Packing List" desc="Create packing list from allocation" onClick={() => nav('/packing')} />
            </div>
            <label className="flex items-center gap-2 border-t border-line px-4 py-3">
              <Switch checked={override} onChange={setOverride} label="Override — ignore shortage, allocate in full" />
            </label>
          </SideCard>

          <div className="rounded-card border border-blue-200 bg-blue-50/60 p-4">
            <div className="flex items-start gap-2.5">
              <Info size={16} className="mt-0.5 shrink-0 text-blue-600" />
              <div className="text-[11.5px] leading-relaxed text-blue-900/80">
                <p className="font-semibold text-blue-900">Important Note</p>
                <ul className="mt-1 list-disc space-y-0.5 pl-4">
                  <li>Allocation can only be done for received stock.</li>
                  <li>Allocating more than the available quantity needs override.</li>
                  <li>Shortage items are highlighted for purchase or substitute.</li>
                  <li>After allocation, you can proceed to Packing.</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>

      {pendingItems.length > 0 && (
        <div className="no-print flex flex-col gap-3 rounded-card border border-line bg-white p-3.5 shadow-card lg:flex-row lg:items-center">
          <p className="min-w-0 flex-1 text-[12.5px] text-muted">
            {pendingItems.length} item{pendingItems.length > 1 ? 's' : ''} still waiting for allocation on {date}.
          </p>
          <Button variant="primary" iconRight={ChevronRight} onClick={() => nav('/packing')}>Go to Packing</Button>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------ customer view */

function CustomerView({ lines, override, userId }: { lines: AllocationRow[]; override: boolean; userId: string }) {
  const byCustomer = useMemo(() => {
    const m = new Map<string, { name: string; routeOrder: number; lines: AllocationRow[] }>();
    for (const l of lines) {
      const cur = m.get(l.customer.id) ?? { name: l.customer.name, routeOrder: l.customer.routeOrder, lines: [] };
      cur.lines.push(l);
      m.set(l.customer.id, cur);
    }
    return [...m.values()].sort((a, b) => a.routeOrder - b.routeOrder);
  }, [lines]);

  if (!byCustomer.length) return <EmptyState icon={Split} title="Nothing to allocate" description="No locked orders for this date." />;

  return (
    <div className="scrollbar-thin overflow-x-auto">
      <table className="w-full border-collapse text-[12.5px]">
        <thead>
          <tr className="border-b border-line bg-canvas/70 text-[11px] font-semibold tracking-wide text-subtle uppercase">
            <th className="px-3 py-2.5 text-left">Customer</th>
            <th className="px-3 py-2.5 text-left">Item</th>
            <th className="px-3 py-2.5 text-right">Required</th>
            <th className="px-3 py-2.5 text-center">Allocated</th>
            <th className="px-3 py-2.5 text-center">Status</th>
          </tr>
        </thead>
        <tbody>
          {byCustomer.map((c) =>
            c.lines.map((l, idx) => (
              <tr key={l.orderItemId} className="border-b border-line last:border-0 hover:bg-fresh-50/40">
                <td className="px-3 py-2 whitespace-nowrap text-ink">{idx === 0 ? c.name : ''}</td>
                <td className="px-3 py-2 whitespace-nowrap text-muted">{l.item.name}</td>
                <td className="tabular px-3 py-2 text-right text-ink">{qty(l.required, l.unit)}</td>
                <td className="px-3 py-2 text-center">
                  <QtyInput
                    value={l.allocated} unit={l.unit} size="sm"
                    max={override ? undefined : Math.max(l.required, l.allocated ?? 0)}
                    onChange={(v) => setManualAllocation(l.orderItemId, v ?? 0, userId)}
                  />
                </td>
                <td className="px-3 py-2 text-center">
                  <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-semibold',
                    l.status === 'Shortage' ? 'bg-red-50 text-red-600' : l.status === 'Partial' ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700')}>
                    {l.status}
                  </span>
                </td>
              </tr>
            )),
          )}
        </tbody>
      </table>
    </div>
  );
}

/* ------------------------------------------------------------ small parts */

function Kpi({ icon: Icon, tone, value, label, note }: { icon: LucideIcon; tone: string; value: string; label: string; note: string }) {
  return (
    <div className="rounded-card border border-line bg-white p-3.5 shadow-card">
      <div className="flex items-center gap-2.5">
        <span className={cn('grid size-10 shrink-0 place-items-center rounded-xl', tone)}><Icon size={18} /></span>
        <div className="min-w-0">
          <p className="tabular text-[19px] leading-none font-bold text-ink">{value}</p>
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

function SummaryRow({ label, value, strong, tone }: { label: string; value: string; strong?: boolean; tone?: string }) {
  return (
    <div className="flex items-center gap-2.5 border-b border-line px-4 py-2.5 last:border-0">
      <p className="min-w-0 flex-1 truncate text-[12.5px] text-muted">{label}</p>
      <p className={cn('tabular shrink-0 text-[12.5px] font-semibold', tone ?? (strong ? 'text-brand-700' : 'text-ink'))}>{value}</p>
    </div>
  );
}

function ActionRow({ icon: Icon, title, desc, onClick }: { icon: LucideIcon; title: string; desc: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left hover:bg-fresh-50/40">
      <Icon size={15} className="shrink-0 text-brand-700" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[12.5px] font-medium text-ink">{title}</p>
        <p className="truncate text-[11px] text-subtle">{desc}</p>
      </div>
      <ChevronRight size={14} className="shrink-0 text-subtle" />
    </button>
  );
}
