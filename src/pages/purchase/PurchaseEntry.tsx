import { useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { ArrowLeft, Plus, Trash, TriangleAlert } from 'lucide-react';
import { PageHeader, Card, CardBody, CardHeader } from '../../components/ui/Card';
import { Button, IconButton } from '../../components/ui/Button';
import { Select, PriceInput, QtyInput } from '../../components/ui/Field';
import { useConfirm } from '../../components/ui/ConfirmDialog';
import { useToast } from '../../components/ui/Toast';
import { useCurrentUser, useDb } from '../../store/useStore';
import { createPurchaseOrder } from '../../store/procurementActions';
import { useRequirementsSync } from '../../store/useApiSync';
import { requirementRows } from '../../domain/ops';
import { addDays, inr, qty } from '../../lib/format';
import { todayISO } from '../../lib/clock';

interface Line {
  itemId: string;
  qty: number | null;
  rate: number | null;
  remarks: string;
}

export function PurchaseEntryPage() {
  const db = useDb();
  const user = useCurrentUser()!;
  const nav = useNavigate();
  const loc = useLocation();
  const confirm = useConfirm();
  const toast = useToast();
  const today = todayISO();

  const [supplierId, setSupplierId] = useState('');
  const [forDeliveryDate, setForDeliveryDate] = useState(() => new URLSearchParams(loc.search).get('date') ?? addDays(today, 1));
  const [invoiceNo, setInvoiceNo] = useState('');
  const [lines, setLines] = useState<Line[]>([{ itemId: '', qty: null, rate: null, remarks: '' }]);

  // Drives the "you are buying more than is still needed" warning. Server-side
  // in API mode, from the local store in demo mode.
  const { rows: apiReqs } = useRequirementsSync(forDeliveryDate);
  const localReqs = useMemo(() => requirementRows(db, forDeliveryDate), [db, forDeliveryDate]);
  const reqByItem = new Map((apiReqs ?? localReqs).map((r) => [r.itemId, r]));
  const itemById = new Map(db.items.map((i) => [i.id, i]));
  const items = db.items.filter((i) => i.active && (!supplierId || true));

  const setLine = (i: number, patch: Partial<Line>) => setLines((ls) => ls.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  const addLine = () => setLines((ls) => [...ls, { itemId: '', qty: null, rate: null, remarks: '' }]);
  const removeLine = (i: number) => setLines((ls) => ls.filter((_, idx) => idx !== i));

  const subtotal = lines.reduce((s, l) => s + (l.qty ?? 0) * (l.rate ?? 0), 0);
  const taxAmount = lines.reduce((s, l) => {
    const item = itemById.get(l.itemId);
    return s + ((l.qty ?? 0) * (l.rate ?? 0) * (item?.taxRate ?? 0)) / 100;
  }, 0);

  const validLines = lines.filter((l) => l.itemId && l.qty && l.rate);

  const save = async () => {
    if (!supplierId) return toast({ tone: 'error', title: 'Choose a supplier' });
    if (!validLines.length) return toast({ tone: 'error', title: 'Add at least one item with quantity and rate' });
    const overs = validLines.filter((l) => {
      const r = reqByItem.get(l.itemId);
      return r && l.qty! > r.toPurchase && r.toPurchase > 0;
    });
    const ok = await confirm({
      title: 'Confirm this purchase?',
      description: overs.length ? `${overs.length} item(s) exceed what's still required for ${forDeliveryDate} — double-check before confirming.` : undefined,
      confirmLabel: 'Confirm purchase',
      tone: overs.length ? 'danger' : 'default',
      details: [{ label: 'Items', value: validLines.length }, { label: 'Total', value: inr(subtotal + taxAmount) }],
    });
    if (!ok) return;
    let po;
    try {
      po = await createPurchaseOrder(
        {
          supplierId, purchaseDate: today, forDeliveryDate, supplierInvoiceNo: invoiceNo || `PENDING-${Date.now().toString(36).toUpperCase()}`,
          lines: validLines.map((l) => ({ itemId: l.itemId, unit: itemById.get(l.itemId)!.unit, qty: l.qty!, rate: l.rate!, remarks: l.remarks })),
        },
        user.id,
      );
    } catch (e) {
      toast({ tone: 'error', title: 'Could not save the purchase', description: (e as Error).message });
      return;
    }
    toast({ tone: 'success', title: 'Purchase confirmed', description: po.poNo });
    nav('/purchase');
  };

  return (
    <div>
      <PageHeader title="Purchase Entry" description="Buy against the purchase requirement — quantities and rates get recorded per supplier invoice." actions={<Button variant="secondary" icon={ArrowLeft} onClick={() => nav('/purchase')}>Back</Button>} />

      <Card className="mb-4">
        <CardBody className="grid gap-3 sm:grid-cols-3">
          <div>
            <label className="mb-1.5 block text-[12.5px] font-medium text-ink">Supplier</label>
            <Select value={supplierId} onChange={(e) => setSupplierId(e.target.value)} placeholder="Select supplier…" options={db.suppliers.map((s) => ({ value: s.id, label: s.name }))} />
          </div>
          <div>
            <label className="mb-1.5 block text-[12.5px] font-medium text-ink">For delivery date</label>
            <input type="date" value={forDeliveryDate} onChange={(e) => setForDeliveryDate(e.target.value)} className="h-9 w-full rounded-lg border border-line px-3 text-[13px]" />
          </div>
          <div>
            <label className="mb-1.5 block text-[12.5px] font-medium text-ink">Supplier invoice no.</label>
            <input value={invoiceNo} onChange={(e) => setInvoiceNo(e.target.value)} placeholder="Optional" className="h-9 w-full rounded-lg border border-line px-3 text-[13px]" />
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Items" actions={<Button size="sm" variant="secondary" icon={Plus} onClick={addLine}>Add line</Button>} />
        <div className="scrollbar-thin overflow-x-auto">
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr className="border-b border-line bg-canvas/70 text-[11.5px] font-semibold uppercase text-muted">
                <th className="px-3 py-2 text-left">Item</th>
                <th className="px-3 py-2 text-right">Required</th>
                <th className="w-36 px-3 py-2 text-right">Qty</th>
                <th className="w-36 px-3 py-2 text-right">Rate</th>
                <th className="px-3 py-2 text-right">Amount</th>
                <th className="px-3 py-2 text-left">Remarks</th>
                <th className="w-10"></th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l, i) => {
                const item = itemById.get(l.itemId);
                const req = reqByItem.get(l.itemId);
                const over = req && l.qty && l.qty > req.toPurchase && req.toPurchase > 0;
                return (
                  <tr key={i} className="border-b border-line last:border-0">
                    <td className="px-3 py-2">
                      <Select value={l.itemId} onChange={(e) => setLine(i, { itemId: e.target.value, rate: itemById.get(e.target.value)?.defaultPurchasePrice ?? null })} placeholder="Select item…" options={items.map((it) => ({ value: it.id, label: `${it.name} (${it.unit})` }))} className="w-56" />
                    </td>
                    <td className="px-3 py-2 text-right text-muted">{req ? qty(req.toPurchase, req.unit) : '—'}</td>
                    <td className="px-3 py-2">{item && <QtyInput value={l.qty} unit={item.unit} onChange={(v) => setLine(i, { qty: v })} size="sm" invalid={!!over} />}</td>
                    <td className="px-3 py-2"><PriceInput value={l.rate} onChange={(v) => setLine(i, { rate: v })} /></td>
                    <td className="px-3 py-2 text-right tabular font-medium">{l.qty && l.rate ? inr(l.qty * l.rate) : '—'}</td>
                    <td className="px-3 py-2">
                      <input value={l.remarks} onChange={(e) => setLine(i, { remarks: e.target.value })} placeholder="Optional" className="h-8 w-full rounded-md border border-line px-2 text-[12.5px]" />
                      {over && <p className="mt-1 flex items-center gap-1 text-[11px] text-red-600"><TriangleAlert size={11} /> Exceeds requirement</p>}
                    </td>
                    <td className="px-2 py-2 text-center">
                      <IconButton icon={Trash} label="Remove line" size="sm" onClick={() => removeLine(i)} disabled={lines.length === 1} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="flex flex-col items-end gap-1 border-t border-line p-4 text-[13px]">
          <div className="flex w-56 justify-between"><span className="text-muted">Subtotal</span><span className="tabular">{inr(subtotal)}</span></div>
          <div className="flex w-56 justify-between"><span className="text-muted">Tax</span><span className="tabular">{inr(taxAmount)}</span></div>
          <div className="flex w-56 justify-between text-[15px] font-semibold"><span>Total</span><span className="tabular">{inr(subtotal + taxAmount)}</span></div>
        </div>
      </Card>

      <div className="mt-4 flex justify-end">
        <Button variant="primary" size="lg" onClick={save}>Confirm Purchase</Button>
      </div>
    </div>
  );
}
