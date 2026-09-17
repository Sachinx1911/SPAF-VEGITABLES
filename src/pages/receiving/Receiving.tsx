import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import {
  ArrowLeft, Camera, CheckCircle2, ChevronRight, ClipboardCheck, ClipboardList, FileText, Package, Printer,
  Search, TriangleAlert, Truck, type LucideIcon,
} from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Input, Select, Switch, QtyInput, Textarea } from '../../components/ui/Field';
import { EmptyState } from '../../components/ui/States';
import { SignaturePad } from '../../components/ui/SignaturePad';
import { DataTable, type Column } from '../../components/ui/DataTable';
import { StatusBadge } from '../../components/ui/Badge';
import { useConfirm } from '../../components/ui/ConfirmDialog';
import { useToast } from '../../components/ui/Toast';
import { useCurrentUser, useDb } from '../../store/useStore';
import { receiveStock, type ReceiveLine } from '../../store/procurementActions';
import { receivingQueue, type ReceivingQueueRow } from '../../domain/procurement';
import { CATEGORIES } from '../../types/models';
import type { PurchaseOrder } from '../../types/models';
import { fmtDate, fmtDateTime, inr, num } from '../../lib/format';
import { nowISO } from '../../lib/clock';
import { itemEmoji } from '../orders/orderUi';
import { cn } from '../../lib/cn';

const TABS = [
  { key: 'items', label: 'Item Receiving' },
  { key: 'qc', label: 'Quality Check' },
  { key: 'photos', label: 'Photos' },
  { key: 'documents', label: 'Documents' },
  { key: 'notes', label: 'Notes' },
] as const;
type TabKey = (typeof TABS)[number]['key'];

export function ReceivingPage() {
  const db = useDb();
  const [po, setPo] = useState<PurchaseOrder | null>(null);
  const queue = useMemo(() => receivingQueue(db), [db]);

  if (po) return <ReceivingDetail po={po} onBack={() => setPo(null)} />;
  return <ReceivingQueue queue={queue} onOpen={setPo} />;
}

/* ------------------------------------------------------------------ queue */

function ReceivingQueue({ queue, onOpen }: { queue: ReceivingQueueRow[]; onOpen: (po: PurchaseOrder) => void }) {
  const db = useDb();
  const poById = new Map(db.purchaseOrders.map((p) => [p.id, p]));
  const recentGrns = [...db.receivings].sort((a, b) => (a.receivedAt < b.receivedAt ? 1 : -1)).slice(0, 15);

  const columns: Column<ReceivingQueueRow>[] = [
    { key: 'po', header: 'PO No', render: (r) => <span className="font-medium text-brand-700">{r.po.poNo}</span> },
    { key: 'supplier', header: 'Supplier', render: (r) => r.supplierName },
    { key: 'date', header: 'Purchase Date', render: (r) => fmtDate(r.po.purchaseDate), sortValue: (r) => r.po.purchaseDate },
    { key: 'delivery', header: 'For Delivery', render: (r) => fmtDate(r.po.forDeliveryDate), hideBelow: 'md' },
    { key: 'lines', header: 'Items', align: 'right', render: (r) => r.lineCount },
    { key: 'qty', header: 'Total Qty', align: 'right', render: (r) => num(r.totalQty), hideBelow: 'lg' },
    { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.po.status} /> },
    { key: 'actions', header: '', align: 'right', render: (r) => <Button size="xs" variant="primary" onClick={() => onOpen(r.po)}>Receive</Button> },
  ];

  const grnCols: Column<(typeof recentGrns)[number]>[] = [
    { key: 'grn', header: 'GRN No', render: (g) => <span className="font-medium text-brand-700">{g.grnNo}</span> },
    { key: 'po', header: 'PO No', render: (g) => db.purchaseOrders.find((p) => p.id === g.purchaseOrderId)?.poNo ?? '—' },
    { key: 'date', header: 'Received At', render: (g) => fmtDate(g.receivedAt), sortValue: (g) => g.receivedAt },
    { key: 'status', header: 'Status', render: (g) => <StatusBadge status={g.status} /> },
    {
      key: 'actions', header: '', align: 'right',
      render: (g) => {
        const po = poById.get(g.purchaseOrderId);
        return po ? <Button size="xs" variant="secondary" onClick={() => onOpen(po)}>View</Button> : null;
      },
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <nav className="flex items-center gap-1 text-[12.5px] text-muted">
        <span>Purchase</span>
        <ChevronRight size={13} className="text-subtle" />
        <span className="font-medium text-ink">Receiving</span>
      </nav>

      <div className="min-w-0">
        <h1 className="text-[26px] leading-tight font-bold tracking-[-0.01em] text-ink">Purchase Receiving</h1>
        <p className="mt-1 text-[13px] text-muted">{queue.length} purchase order{queue.length === 1 ? '' : 's'} waiting for a GRN.</p>
      </div>

      <div className="overflow-hidden rounded-card border border-line bg-white shadow-card">
        <DataTable
          columns={columns} rows={queue} rowKey={(r) => r.po.id}
          emptyTitle="Nothing to receive" emptyDescription="Every confirmed purchase has been received."
          cardRender={(r) => (
            <div>
              <div className="flex items-center justify-between gap-2">
                <p className="text-[13.5px] font-medium text-brand-700">{r.po.poNo}</p>
                <StatusBadge status={r.po.status} />
              </div>
              <p className="mt-0.5 text-xs text-muted">{r.supplierName} · {r.lineCount} items · {num(r.totalQty)} qty</p>
              <Button size="xs" variant="primary" className="mt-2" onClick={() => onOpen(r.po)}>Receive</Button>
            </div>
          )}
        />
      </div>

      <div className="overflow-hidden rounded-card border border-line bg-white shadow-card">
        <div className="border-b border-line px-4 py-3"><p className="text-[13px] font-semibold text-ink">Recent GRNs</p></div>
        <DataTable columns={grnCols} rows={recentGrns} rowKey={(g) => g.id} emptyTitle="No GRNs yet" pageSize={10} />
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------- detail */

interface Row extends ReceiveLine {
  poItemId: string;
  name: string;
  category: string;
  rate: number;
  remarks: string;
  touched: boolean;
}

function ReceivingDetail({ po, onBack }: { po: PurchaseOrder; onBack: () => void }) {
  const db = useDb();
  const user = useCurrentUser()!;
  const nav = useNavigate();
  const toast = useToast();
  const confirm = useConfirm();

  const [tab, setTab] = useState<TabKey>('items');
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [status, setStatus] = useState('');
  const [pendingOnly, setPendingOnly] = useState(false);
  const [notes, setNotes] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);
  const [receiverName, setReceiverName] = useState(user.name);
  const [receivedAt, setReceivedAt] = useState(nowISO().slice(0, 16));
  const [signature, setSignature] = useState<string | null>(null);
  const [rows, setRows] = useState<Row[]>([]);

  const supplier = db.suppliers.find((s) => s.id === po.supplierId);
  const lines = useMemo(() => db.purchaseOrderItems.filter((l) => l.purchaseOrderId === po.id), [db.purchaseOrderItems, po.id]);
  const itemById = useMemo(() => new Map(db.items.map((i) => [i.id, i])), [db.items]);

  useEffect(() => {
    setRows(lines.map((l) => {
      const item = itemById.get(l.itemId)!;
      return {
        purchaseOrderItemId: l.id, poItemId: l.id, itemId: l.itemId, unit: l.unit,
        orderedQty: l.qty, receivedQty: l.qty, condition: 'Good' as const,
        name: item.name, category: item.category, rate: l.rate, remarks: '', touched: false,
      };
    }));
  }, [po.id, lines, itemById]);

  const setRow = (id: string, patch: Partial<Row>) => setRows((rs) => rs.map((r) => (r.poItemId === id ? { ...r, ...patch, touched: true } : r)));

  /** Status follows the quantity itself: nothing in yet, short, or matched in full. */
  const rowStatus = (r: Row) => (r.receivedQty <= 0 ? 'Pending' : r.receivedQty >= r.orderedQty ? 'Completed' : 'Received');

  const visibleRows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return rows
      .filter((r) => !term || r.name.toLowerCase().includes(term))
      .filter((r) => !category || r.category === category)
      .filter((r) => !status || rowStatus(r) === status)
      .filter((r) => !pendingOnly || rowStatus(r) === 'Pending');
  }, [rows, search, category, status, pendingOnly]);

  /* ------------------------------------------------------------- numbers */
  const totalOrdered = rows.reduce((s, r) => s + r.orderedQty, 0);
  const totalReceived = rows.reduce((s, r) => s + r.receivedQty, 0);
  const shortageRows = rows.filter((r) => r.receivedQty < r.orderedQty);
  const excessRows = rows.filter((r) => r.receivedQty > r.orderedQty);
  const shortage = shortageRows.reduce((s, r) => s + (r.orderedQty - r.receivedQty), 0);
  const excess = excessRows.reduce((s, r) => s + (r.receivedQty - r.orderedQty), 0);
  const receivedCount = rows.filter((r) => r.receivedQty > 0).length;
  const pendingCount = rows.length - receivedCount;
  const receivedPct = totalOrdered ? Math.round((totalReceived / totalOrdered) * 100) : 0;
  const poStatusLabel = totalReceived === 0 ? 'Not Received' : shortage > 0 ? 'Partially Received' : 'Fully Received';

  /* ------------------------------------------------------------- actions */
  const bulkFull = () => {
    setRows((rs) => rs.map((r) => ({ ...r, receivedQty: r.orderedQty, touched: true })));
    toast({ tone: 'info', title: 'All lines set to ordered quantity' });
  };

  const complete = async () => {
    const ok = await confirm({
      title: 'Complete receiving?',
      description: shortage > 0 ? `${shortageRows.length} item(s) received short of the ordered quantity.` : undefined,
      confirmLabel: 'Complete receiving',
      details: [
        { label: 'PO', value: po.poNo },
        { label: 'Supplier', value: supplier?.name ?? '—' },
        { label: 'Items', value: rows.length },
        { label: 'Received', value: `${num(totalReceived)} of ${num(totalOrdered)}` },
      ],
    });
    if (!ok) return;
    receiveStock(po.id, rows.map(({ purchaseOrderItemId, itemId, unit, orderedQty, receivedQty, condition }) =>
      ({ purchaseOrderItemId, itemId, unit, orderedQty, receivedQty, condition })), user.id);
    toast({ tone: 'success', title: 'Stock received', description: 'Move to Quality Check to accept or reject.' });
    onBack();
  };

  return (
    <div className="flex flex-col gap-4">
      <nav className="no-print flex items-center gap-1 text-[12.5px] text-muted">
        <span>Purchase</span>
        <ChevronRight size={13} className="text-subtle" />
        <span className="font-medium text-ink">Receiving</span>
      </nav>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 max-w-md">
          <h1 className="text-[26px] leading-tight font-bold tracking-[-0.01em] text-ink">Purchase Receiving</h1>
          <p className="mt-1 text-[13px] text-muted">Record received quantities and perform quality check for purchased items.</p>
        </div>
        <div className="no-print flex flex-wrap items-center gap-2.5">
          <Button variant="secondary" icon={ArrowLeft} onClick={onBack}>Back to Purchase List</Button>
          <Button variant="secondary" icon={Printer} onClick={() => window.print()}>Print GRN</Button>
          <Button variant="primary" icon={CheckCircle2} onClick={complete}>Complete Receiving</Button>
        </div>
      </div>

      {/* ------------------------------------------------ details + KPIs */}
      <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <div className="rounded-card border border-line bg-white p-4 shadow-card">
          <div className="flex items-center gap-2">
            <h2 className="text-[15px] font-bold text-ink">Purchase Details</h2>
            <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-semibold',
              poStatusLabel === 'Fully Received' ? 'bg-emerald-50 text-emerald-700' : poStatusLabel === 'Partially Received' ? 'bg-amber-50 text-amber-700' : 'bg-canvas text-muted')}>
              {poStatusLabel}
            </span>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
            <Detail label="Purchase No." value={po.poNo} />
            <Detail label="Supplier" value={supplier?.name ?? '—'} />
            <Detail label="Purchase Date" value={fmtDate(po.purchaseDate)} />
            <Detail label="For Delivery" value={fmtDate(po.forDeliveryDate)} />
            <Detail label="Bill No." value={po.supplierInvoiceNo || '—'} />
            <Detail label="Bill Amount" value={inr(lines.reduce((s, l) => s + l.qty * l.rate, 0) + po.taxAmount)} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Kpi icon={ClipboardList} tone="bg-fresh-50 text-fresh-600" value={String(rows.length)} label="Total Items" note={`${receivedCount} received, ${pendingCount} pending`} />
          <Kpi icon={Package} tone="bg-blue-50 text-blue-600" value={num(totalOrdered)} label="Total Ordered" note="as per purchase order" />
          <Kpi icon={CheckCircle2} tone="bg-emerald-50 text-emerald-600" value={num(totalReceived)} label="Total Received" note={`${receivedPct}%`} />
          <Kpi icon={TriangleAlert} tone="bg-red-50 text-red-500" value={num(shortage)} label="Shortage" note={`${shortageRows.length} items`} />
        </div>
      </div>

      {/* ------------------------------------------------------ tabs + body */}
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
              {t.key === 'photos' && photos.length > 0 && <span className="ml-1.5 rounded-full bg-fresh-50 px-1.5 py-0.5 text-[10.5px] text-brand-800">{photos.length}</span>}
            </button>
          ))}
        </div>

        {tab === 'items' && (
          <>
            <div className="no-print flex flex-wrap items-center gap-2.5 border-b border-line px-3 py-3">
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search item by name or code…" leading={<Search size={15} />} className="w-full sm:w-60" />
              <Select value={category} onChange={(e) => setCategory(e.target.value)} placeholder="All Categories" options={[...CATEGORIES]} className="w-44" />
              <Select value={status} onChange={(e) => setStatus(e.target.value)} placeholder="All Status" options={['Pending', 'Received', 'Completed']} className="w-36" />
              <Switch checked={pendingOnly} onChange={setPendingOnly} label="Show only pending items" />
              <Button variant="secondary" size="sm" icon={ClipboardCheck} onClick={bulkFull} className="ml-auto">Bulk Update</Button>
            </div>

            {visibleRows.length === 0 ? (
              <EmptyState icon={Package} title="No items match" description="Try another search or filter." />
            ) : (
              <div className="scrollbar-thin overflow-x-auto print-area">
                <table className="w-full border-collapse text-[12.5px]">
                  <thead>
                    <tr className="border-b border-line bg-canvas/70 text-[11px] font-semibold tracking-wide text-subtle uppercase">
                      <th className="w-10 px-2 py-2.5 text-center">#</th>
                      <th className="px-3 py-2.5 text-left">Item</th>
                      <th className="px-3 py-2.5 text-left">Category</th>
                      <th className="px-3 py-2.5 text-center">Unit</th>
                      <th className="px-3 py-2.5 text-right">Ordered Qty</th>
                      <th className="px-3 py-2.5 text-center">Received Qty</th>
                      <th className="px-3 py-2.5 text-center">Shortage / Excess</th>
                      <th className="px-3 py-2.5 text-center">Condition</th>
                      <th className="px-3 py-2.5 text-center">Status</th>
                      <th className="px-3 py-2.5 text-left">Remarks</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleRows.map((r, i) => {
                      const diff = r.receivedQty - r.orderedQty;
                      const st = rowStatus(r);
                      return (
                        <tr key={r.poItemId} className="border-b border-line last:border-0 hover:bg-fresh-50/40">
                          <td className="tabular px-2 py-2 text-center text-subtle">{i + 1}</td>
                          <td className="px-3 py-2 whitespace-nowrap">
                            <span className="mr-2 text-[15px]">{itemEmoji(r.name, r.category as never)}</span>
                            <span className="font-medium text-ink">{r.name}</span>
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap text-muted">{r.category}</td>
                          <td className="px-3 py-2 text-center text-muted">{r.unit}</td>
                          <td className="tabular px-3 py-2 text-right text-ink">{num(r.orderedQty)}</td>
                          <td className="px-3 py-2">
                            <div className="flex justify-center">
                              <QtyInput value={r.receivedQty} unit={r.unit} size="sm" onChange={(v) => setRow(r.poItemId, { receivedQty: v ?? 0 })} />
                            </div>
                          </td>
                          <td className="px-3 py-2 text-center">
                            {diff === 0 ? (
                              <span className="tabular rounded-md bg-canvas px-2 py-0.5 text-[12px] font-semibold text-muted">0</span>
                            ) : (
                              <span className={cn('tabular rounded-md px-2 py-0.5 text-[12px] font-semibold', diff < 0 ? 'bg-red-50 text-red-600' : 'bg-blue-50 text-blue-700')}>
                                {diff > 0 ? '+' : ''}{num(diff)}
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-2">
                            <Select
                              value={r.condition}
                              onChange={(e) => setRow(r.poItemId, { condition: e.target.value as Row['condition'] })}
                              options={['Good', 'Average', 'Damaged']}
                              className="w-28"
                            />
                          </td>
                          <td className="px-3 py-2 text-center">
                            <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap',
                              st === 'Completed' ? 'bg-emerald-50 text-emerald-700' : st === 'Received' ? 'bg-fresh-50 text-brand-800' : 'bg-amber-50 text-amber-700')}>
                              {st}
                            </span>
                          </td>
                          <td className="px-3 py-2">
                            <Input value={r.remarks} onChange={(e) => setRow(r.poItemId, { remarks: e.target.value })} placeholder="-" className="w-40" />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}

        {tab === 'qc' && (
          <div className="flex flex-col gap-3 p-4">
            <p className="text-[12.5px] text-muted">
              Quality check happens after receiving is completed — only the accepted quantity is credited to stock.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button variant="primary" size="sm" onClick={() => nav('/quality-check')}>Open Quality Check</Button>
              <Button variant="secondary" size="sm" onClick={complete}>Complete receiving first</Button>
            </div>
          </div>
        )}

        {tab === 'photos' && (
          <div className="grid gap-3 p-4 sm:grid-cols-4">
            {photos.map((p, i) => (
              <img key={i} src={p} alt={`Receiving ${i + 1}`} className="h-28 w-full rounded-lg border border-line object-cover" />
            ))}
            <label className="grid h-28 cursor-pointer place-items-center rounded-lg border border-dashed border-line text-center text-[12px] text-muted hover:bg-fresh-50/40">
              <input
                type="file" accept="image/*" className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  const reader = new FileReader();
                  reader.onload = () => setPhotos((ps) => [...ps, String(reader.result)]);
                  reader.readAsDataURL(file);
                }}
              />
              <span><Camera size={18} className="mx-auto mb-1 text-subtle" />Add Photos</span>
            </label>
          </div>
        )}

        {tab === 'documents' && (
          <div className="flex flex-col gap-2 p-4">
            <p className="text-[12.5px] text-muted">Supplier bill and weighment slips for {po.poNo}.</p>
            <div className="flex items-center gap-2.5 rounded-lg border border-line px-3.5 py-3">
              <FileText size={16} className="shrink-0 text-brand-700" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[12.5px] font-medium text-ink">Supplier bill {po.supplierInvoiceNo || '—'}</p>
                <p className="text-[11px] text-subtle">{supplier?.name} · {fmtDate(po.purchaseDate)}</p>
              </div>
              <Button variant="secondary" size="sm" onClick={() => window.print()}>Print</Button>
            </div>
          </div>
        )}

        {tab === 'notes' && (
          <div className="p-4">
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={5} placeholder="Note anything unusual about this delivery…" />
          </div>
        )}
      </div>

      {/* --------------------------------------------------- bottom panels */}
      <div className="grid gap-4 lg:grid-cols-4">
        <Panel icon={ClipboardList} title="Receiving Summary">
          <div className="flex flex-col">
            <SummaryRow label="Total Items" value={String(rows.length)} />
            <SummaryRow label="Received" value={String(receivedCount)} />
            <SummaryRow label="Pending" value={String(pendingCount)} />
            <SummaryRow label="Total Ordered" value={num(totalOrdered)} />
            <SummaryRow label="Total Received" value={num(totalReceived)} strong />
            <SummaryRow label="Shortage" value={num(shortage)} tone="text-red-600" />
            <SummaryRow label="Excess" value={num(excess)} tone="text-blue-600" />
          </div>
        </Panel>

        <Panel icon={FileText} title="Receiving Notes">
          <div className="p-3">
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={6} placeholder="Received most items in good condition…" />
          </div>
        </Panel>

        <Panel icon={Camera} title="Upload Photos">
          <div className="grid grid-cols-3 gap-2 p-3">
            {photos.map((p, i) => (
              <img key={i} src={p} alt={`Receiving ${i + 1}`} className="h-20 w-full rounded-lg border border-line object-cover" />
            ))}
            <label className="grid h-20 cursor-pointer place-items-center rounded-lg border border-dashed border-line text-center text-[10.5px] text-muted hover:bg-fresh-50/40">
              <input
                type="file" accept="image/*" className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  const reader = new FileReader();
                  reader.onload = () => setPhotos((ps) => [...ps, String(reader.result)]);
                  reader.readAsDataURL(file);
                }}
              />
              <span><Camera size={16} className="mx-auto mb-0.5 text-subtle" />Add Photos</span>
            </label>
          </div>
        </Panel>

        <Panel icon={Truck} title="Received By">
          <div className="flex flex-col gap-2.5 p-3">
            <label className="text-[11.5px] font-medium text-muted">
              Name
              <Input value={receiverName} onChange={(e) => setReceiverName(e.target.value)} className="mt-1" />
            </label>
            <label className="text-[11.5px] font-medium text-muted">
              Date &amp; Time
              <input
                type="datetime-local" value={receivedAt} onChange={(e) => setReceivedAt(e.target.value)}
                className="mt-1 h-9 w-full rounded-lg border border-line bg-white px-2.5 text-[13px] text-ink"
              />
            </label>
            <SignaturePad value={signature} onChange={setSignature} label="Signature" height={90} />
          </div>
        </Panel>
      </div>

      <div className="no-print flex flex-col gap-3 rounded-card border border-line bg-white p-3.5 shadow-card lg:flex-row lg:items-center">
        <p className="min-w-0 flex-1 text-[12.5px] text-muted">
          Received quantity is recorded as its own step — the ordered quantity stays untouched, and only what quality check accepts is credited to stock.
          {receivedAt && <> Receiving stamped {fmtDateTime(`${receivedAt}:00`)}.</>}
        </p>
        <Button variant="primary" iconRight={ChevronRight} onClick={complete}>Complete Receiving</Button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ small parts */

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] text-subtle">{label}</p>
      <p className="truncate text-[13px] font-semibold text-ink">{value}</p>
    </div>
  );
}

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

function Panel({ icon: Icon, title, children }: { icon: LucideIcon; title: string; children: React.ReactNode }) {
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
    <div className="flex items-center gap-2.5 border-b border-line px-4 py-2 last:border-0">
      <p className="min-w-0 flex-1 truncate text-[12.5px] text-muted">{label}</p>
      <p className={cn('tabular shrink-0 text-[12.5px] font-semibold', tone ?? (strong ? 'text-brand-700' : 'text-ink'))}>{value}</p>
    </div>
  );
}
