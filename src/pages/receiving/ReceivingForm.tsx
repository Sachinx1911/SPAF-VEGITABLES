import { useEffect, useState } from 'react';
import { Drawer } from '../../components/ui/Overlay';
import { Button } from '../../components/ui/Button';
import { Select, QtyInput } from '../../components/ui/Field';
import { Badge } from '../../components/ui/Badge';
import { useDb, useCurrentUser } from '../../store/useStore';
import { receiveStock, type ReceiveLine } from '../../store/procurementActions';
import { useToast } from '../../components/ui/Toast';
import { useConfirm } from '../../components/ui/ConfirmDialog';
import { fmtDate, inr, qty } from '../../lib/format';
import type { PurchaseOrder } from '../../types/models';

export function ReceivingForm({ po, onClose }: { po: PurchaseOrder | null; onClose: () => void }) {
  const db = useDb();
  const user = useCurrentUser()!;
  const toast = useToast();
  const confirm = useConfirm();
  const [rows, setRows] = useState<ReceiveLine[]>([]);

  const lines = po ? db.purchaseOrderItems.filter((l) => l.purchaseOrderId === po.id) : [];
  const supplier = po ? db.suppliers.find((s) => s.id === po.supplierId) : null;
  const itemById = new Map(db.items.map((i) => [i.id, i]));

  useEffect(() => {
    setRows(lines.map((l) => ({ purchaseOrderItemId: l.id, itemId: l.itemId, unit: l.unit, orderedQty: l.qty, receivedQty: l.qty, condition: 'Good' })));
  }, [po?.id]);

  if (!po) return null;

  const setRow = (id: string, patch: Partial<ReceiveLine>) => setRows((rs) => rs.map((r) => (r.purchaseOrderItemId === id ? { ...r, ...patch } : r)));

  const submit = async (mode: 'full' | 'partial') => {
    const finalRows = mode === 'full' ? rows.map((r) => ({ ...r, receivedQty: r.orderedQty })) : rows;
    const shortages = finalRows.filter((r) => r.receivedQty < r.orderedQty);
    const ok = await confirm({
      title: 'Confirm stock received?',
      description: shortages.length ? `${shortages.length} item(s) received short of the ordered quantity.` : undefined,
      confirmLabel: 'Confirm receiving',
      details: [{ label: 'PO', value: po.poNo }, { label: 'Lines', value: finalRows.length }],
    });
    if (!ok) return;
    receiveStock(po.id, finalRows, user.id);
    toast({ tone: 'success', title: 'Stock received', description: `Move to Quality Check to accept/reject.` });
    onClose();
  };

  const reject = async () => {
    const ok = await confirm({ title: 'Reject this entire delivery?', tone: 'danger', confirmLabel: 'Reject delivery', description: `${po.poNo} · ${supplier?.name}` });
    if (!ok) return;
    receiveStock(po.id, rows.map((r) => ({ ...r, receivedQty: 0, condition: 'Damaged' })), user.id);
    toast({ tone: 'warning', title: 'Delivery rejected', description: po.poNo });
    onClose();
  };

  return (
    <Drawer open={!!po} onClose={onClose} title={`Receive · ${po.poNo}`} description={`${supplier?.name} · ordered ${fmtDate(po.purchaseDate)}`} width="640px"
      footer={
        <>
          <Button variant="danger" onClick={reject}>Reject</Button>
          <Button variant="secondary" onClick={() => submit('partial')}>Partial Receive</Button>
          <Button variant="primary" onClick={() => submit('full')}>Receive All</Button>
        </>
      }
    >
      <div className="flex flex-col gap-2">
        {lines.map((l) => {
          const item = itemById.get(l.itemId)!;
          const row = rows.find((r) => r.purchaseOrderItemId === l.id);
          if (!row) return null;
          const shortage = row.receivedQty < l.qty;
          return (
            <div key={l.id} className="rounded-lg border border-line p-3">
              <div className="mb-2 flex items-center justify-between gap-3">
                <p className="font-medium text-ink">{item.name} <Badge tone="neutral" className="ml-1">{item.unit}</Badge></p>
                <p className="text-xs text-muted">Ordered {qty(l.qty, l.unit)} · {inr(l.rate, true)}/{l.unit}</p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <div>
                  <label className="mb-1 block text-[11px] text-muted">Received qty</label>
                  <QtyInput value={row.receivedQty} unit={item.unit} onChange={(v) => setRow(l.id, { receivedQty: v ?? 0 })} size="sm" max={l.qty * 1.05} />
                </div>
                <div>
                  <label className="mb-1 block text-[11px] text-muted">Condition</label>
                  <Select value={row.condition} onChange={(e) => setRow(l.id, { condition: e.target.value as any })} options={['Good', 'Average', 'Damaged']} className="w-32" />
                </div>
                {shortage && <p className="text-[11.5px] text-orange-600">Shortage: {qty(l.qty - row.receivedQty, l.unit)}</p>}
                {row.receivedQty > l.qty && <p className="text-[11.5px] text-blue-600">Excess: {qty(row.receivedQty - l.qty, l.unit)}</p>}
              </div>
            </div>
          );
        })}
      </div>
    </Drawer>
  );
}
