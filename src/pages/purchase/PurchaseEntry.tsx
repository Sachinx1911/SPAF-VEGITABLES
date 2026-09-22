import { useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { ArrowLeft, TriangleAlert } from 'lucide-react';
import { PageHeader, Card, CardBody, CardHeader } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Select, PriceInput, QtyInput, Switch } from '../../components/ui/Field';
import { EmptyState, LoadingState } from '../../components/ui/States';
import { useConfirm } from '../../components/ui/ConfirmDialog';
import { useToast } from '../../components/ui/Toast';
import { useCurrentUser, useDb } from '../../store/useStore';
import { createPurchaseOrder } from '../../store/procurementActions';
import { useRequirementsSync } from '../../store/useApiSync';
import { requirementRows } from '../../domain/ops';
import { addDays, inr, qty } from '../../lib/format';
import { todayISO } from '../../lib/clock';
import { cn } from '../../lib/cn';

/** What the buyer has typed for one item, over the pre-filled figures. */
interface Edit {
  qty?: number | null;
  supplierId?: string;
  rate?: number | null;
}

/**
 * The whole day's buying on one screen.
 *
 * Every item the day needs is listed at once, each already carrying the
 * quantity still to buy, the supplier it came from last time and what it cost
 * then. The buyer changes the few that differ — short deliveries, a new
 * supplier — and confirms once. One purchase order is written per supplier.
 */
export function PurchaseEntryPage() {
  const db = useDb();
  const user = useCurrentUser()!;
  const nav = useNavigate();
  const loc = useLocation();
  const confirm = useConfirm();
  const toast = useToast();
  const today = todayISO();

  const [forDeliveryDate, setForDeliveryDate] = useState(() => new URLSearchParams(loc.search).get('date') ?? addDays(today, 1));
  const [invoiceNo, setInvoiceNo] = useState('');
  const [showCovered, setShowCovered] = useState(false);
  const [edits, setEdits] = useState<Record<string, Edit>>({});
  const [saving, setSaving] = useState(false);

  const { rows: apiRows, loading } = useRequirementsSync(forDeliveryDate);
  const localRows = useMemo(() => requirementRows(db, forDeliveryDate), [db, forDeliveryDate]);
  const reqRows = apiRows ?? localRows;

  const itemById = useMemo(() => new Map(db.items.map((i) => [i.id, i])), [db.items]);
  const supplierOptions = useMemo(() => db.suppliers.map((s) => ({ value: s.id, label: s.name })), [db.suppliers]);

  /** Each row as it stands: the pre-filled figures with anything typed on top. */
  const rows = useMemo(() => {
    return reqRows
      .map((r) => {
        const item = itemById.get(r.itemId);
        if (!item) return null;
        const e = edits[r.itemId] ?? {};
        return {
          req: r,
          item,
          // Buy what is still missing. Nothing missing, nothing pre-filled.
          qty: e.qty !== undefined ? e.qty : (r.toPurchase > 0 ? r.toPurchase : null),
          supplierId: e.supplierId ?? r.lastSupplierId ?? '',
          rate: e.rate !== undefined ? e.rate : (r.lastRate ?? item.defaultPurchasePrice ?? null),
        };
      })
      .filter((r): r is NonNullable<typeof r> => !!r)
      .filter((r) => showCovered || r.req.toPurchase > 0)
      .sort((a, b) => a.item.sortOrder - b.item.sortOrder);
  }, [reqRows, itemById, edits, showCovered]);

  const setEdit = (itemId: string, patch: Edit) => setEdits((e) => ({ ...e, [itemId]: { ...e[itemId], ...patch } }));

  /** Rows that will actually be bought, grouped the way they will be written. */
  const bySupplier = useMemo(() => {
    const groups = new Map<string, { supplierName: string; lines: typeof rows; total: number }>();
    for (const r of rows) {
      if (!r.qty || !r.rate || !r.supplierId) continue;
      const name = db.suppliers.find((s) => s.id === r.supplierId)?.name ?? 'Unknown';
      const g = groups.get(r.supplierId) ?? { supplierName: name, lines: [], total: 0 };
      g.lines.push(r);
      g.total += r.qty * r.rate;
      groups.set(r.supplierId, g);
    }
    return groups;
  }, [rows, db.suppliers]);

  const lineCount = [...bySupplier.values()].reduce((n, g) => n + g.lines.length, 0);
  const grandTotal = [...bySupplier.values()].reduce((n, g) => n + g.total, 0);
  // Something is being bought but nobody is selected to buy it from.
  const missingSupplier = rows.filter((r) => r.qty && r.rate && !r.supplierId);

  const save = async () => {
    if (missingSupplier.length) {
      return toast({ tone: 'error', title: 'Choose a supplier', description: `${missingSupplier.length} item(s) have a quantity but no supplier.` });
    }
    if (!lineCount) return toast({ tone: 'error', title: 'Nothing to buy', description: 'Enter a quantity against at least one item.' });

    const overs = rows.filter((r) => r.qty && r.req.toPurchase > 0 && r.qty > r.req.toPurchase);
    const ok = await confirm({
      title: `Confirm ${bySupplier.size === 1 ? 'this purchase' : `${bySupplier.size} purchases`}?`,
      description: overs.length
        ? `${overs.length} item(s) exceed what is still required for ${forDeliveryDate} — double-check before confirming.`
        : 'One purchase order is written per supplier.',
      confirmLabel: 'Confirm',
      tone: overs.length ? 'danger' : 'default',
      details: [
        ...[...bySupplier.values()].map((g) => ({ label: g.supplierName, value: `${g.lines.length} items · ${inr(g.total)}` })),
        { label: 'Total', value: inr(grandTotal) },
      ],
    });
    if (!ok) return;

    setSaving(true);
    const done: string[] = [];
    try {
      // Sequential on purpose: each order takes the next PO number, and a
      // failure half-way leaves the ones already written intact and named.
      for (const [supplierId, g] of bySupplier) {
        const po = await createPurchaseOrder(
          {
            supplierId,
            purchaseDate: today,
            forDeliveryDate,
            supplierInvoiceNo: invoiceNo || `PENDING-${Date.now().toString(36).toUpperCase()}`,
            lines: g.lines.map((r) => ({ itemId: r.item.id, unit: r.item.unit, qty: r.qty!, rate: r.rate!, remarks: '' })),
          },
          user.id,
        );
        done.push(po.poNo);
      }
    } catch (e) {
      setSaving(false);
      return toast({
        tone: 'error',
        title: done.length ? `Saved ${done.length}, then failed` : 'Could not save the purchase',
        description: `${(e as Error).message}${done.length ? ` — ${done.join(', ')} were written.` : ''}`,
      });
    }

    setSaving(false);
    toast({ tone: 'success', title: `${done.length} purchase${done.length === 1 ? '' : 's'} confirmed`, description: done.join(', ') });
    nav('/purchase');
  };

  return (
    <div>
      <PageHeader
        title="Purchase Entry"
        description="Everything the day needs, with last time's supplier and price already filled in. Change what differs, confirm once."
        actions={<Button variant="secondary" icon={ArrowLeft} onClick={() => nav('/purchase')}>Back</Button>}
      />

      <Card className="mb-4">
        <CardBody className="grid gap-3 sm:grid-cols-3">
          <div>
            <label className="mb-1.5 block text-[12.5px] font-medium text-ink">For delivery date</label>
            <input type="date" value={forDeliveryDate} onChange={(e) => { setForDeliveryDate(e.target.value); setEdits({}); }} className="h-9 w-full rounded-lg border border-line px-3 text-[13px]" />
          </div>
          <div>
            <label className="mb-1.5 block text-[12.5px] font-medium text-ink">Supplier invoice no.</label>
            <input value={invoiceNo} onChange={(e) => setInvoiceNo(e.target.value)} placeholder="Optional — applies to every order" className="h-9 w-full rounded-lg border border-line px-3 text-[13px]" />
          </div>
          <div className="flex items-end pb-1">
            <Switch checked={showCovered} onChange={setShowCovered} label="Show items already covered" />
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title={`Items (${rows.length})`}
          actions={lineCount > 0 ? <span className="text-[12.5px] text-muted">{lineCount} lines · {bySupplier.size} supplier{bySupplier.size === 1 ? '' : 's'}</span> : undefined}
        />

        {loading && !apiRows ? (
          <LoadingState label="Loading the day's requirement…" />
        ) : rows.length === 0 ? (
          <EmptyState
            title={showCovered ? 'No requirement for this date' : 'Nothing left to buy'}
            description={showCovered ? 'Lock the day in Consolidation to generate the purchase requirement.' : 'Every item for this date is already covered by stock or an existing purchase.'}
          />
        ) : (
          <div className="scrollbar-thin overflow-x-auto">
            <table className="w-full border-collapse text-[13px]">
              <thead>
                <tr className="border-b border-line bg-canvas/70 text-[11.5px] font-semibold uppercase text-muted">
                  <th className="px-3 py-2 text-left">Item</th>
                  <th className="px-3 py-2 text-right">Required</th>
                  <th className="px-3 py-2 text-right">To buy</th>
                  <th className="w-36 px-3 py-2 text-right">Qty</th>
                  <th className="w-48 px-3 py-2 text-left">Supplier</th>
                  <th className="w-32 px-3 py-2 text-right">Rate</th>
                  <th className="px-3 py-2 text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const over = r.qty != null && r.req.toPurchase > 0 && r.qty > r.req.toPurchase;
                  const needsSupplier = !!r.qty && !!r.rate && !r.supplierId;
                  return (
                    <tr key={r.item.id} className={cn('border-b border-line last:border-0', r.req.toPurchase <= 0 && 'opacity-55')}>
                      <td className="px-3 py-2">
                        <span className="font-medium text-ink">{r.item.name}</span>
                        <span className="ml-1 text-muted">({r.item.unit})</span>
                      </td>
                      <td className="px-3 py-2 text-right tabular text-muted">{qty(r.req.required, r.req.unit)}</td>
                      <td className="px-3 py-2 text-right tabular font-medium">{r.req.toPurchase > 0 ? qty(r.req.toPurchase, r.req.unit) : '—'}</td>
                      <td className="px-3 py-2">
                        <QtyInput value={r.qty} unit={r.item.unit} onChange={(v) => setEdit(r.item.id, { qty: v })} size="sm" invalid={over} />
                      </td>
                      <td className="px-3 py-2">
                        <Select
                          value={r.supplierId}
                          onChange={(e) => setEdit(r.item.id, { supplierId: e.target.value })}
                          placeholder="Select…"
                          options={supplierOptions}
                          invalid={needsSupplier}
                        />
                      </td>
                      <td className="px-3 py-2"><PriceInput value={r.rate} onChange={(v) => setEdit(r.item.id, { rate: v })} /></td>
                      <td className="px-3 py-2 text-right tabular font-medium">
                        {r.qty && r.rate ? inr(r.qty * r.rate) : '—'}
                        {over && <p className="mt-0.5 flex items-center justify-end gap-1 text-[11px] font-normal text-red-600"><TriangleAlert size={11} /> over</p>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {lineCount > 0 && (
          <div className="flex flex-col gap-1 border-t border-line p-4 text-[13px]">
            {[...bySupplier.values()].map((g) => (
              <div key={g.supplierName} className="flex justify-end gap-6">
                <span className="text-muted">{g.supplierName} · {g.lines.length} items</span>
                <span className="tabular w-28 text-right">{inr(g.total)}</span>
              </div>
            ))}
            <div className="mt-1 flex justify-end gap-6 border-t border-line pt-1.5 text-[15px] font-semibold">
              <span>Total</span>
              <span className="tabular w-28 text-right">{inr(grandTotal)}</span>
            </div>
          </div>
        )}
      </Card>

      <div className="mt-4 flex items-center justify-end gap-3">
        {missingSupplier.length > 0 && (
          <p className="flex items-center gap-1.5 text-[12.5px] text-red-600">
            <TriangleAlert size={14} /> {missingSupplier.length} item(s) need a supplier
          </p>
        )}
        <Button variant="primary" size="lg" onClick={save} disabled={saving || !lineCount}>
          {saving ? 'Saving…' : `Confirm ${lineCount || ''} ${lineCount === 1 ? 'Line' : 'Lines'}`}
        </Button>
      </div>
    </div>
  );
}
