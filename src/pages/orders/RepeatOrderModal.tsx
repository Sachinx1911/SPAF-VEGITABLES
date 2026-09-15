import { useEffect, useState } from 'react';
import { Modal } from '../../components/ui/Overlay';
import { Button } from '../../components/ui/Button';
import { Checkbox, QtyInput } from '../../components/ui/Field';
import { Badge } from '../../components/ui/Badge';
import { fmtDate } from '../../lib/format';
import { useDb } from '../../store/useStore';
import type { Order, OrderItem } from '../../types/models';

interface RepeatOrderModalProps {
  open: boolean;
  onClose: () => void;
  previous: (Order & { lines: OrderItem[] }) | null;
  onApply: (quantities: Record<string, number>) => void;
}

/** Shows the customer's last order so staff/customer can select-all, drop a few lines, tweak quantities — then creates a brand-new order. The original is never touched. */
export function RepeatOrderModal({ open, onClose, previous, onApply }: RepeatOrderModalProps) {
  const db = useDb();
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [qtys, setQtys] = useState<Record<string, number>>({});

  useEffect(() => {
    if (open && previous) {
      const sel: Record<string, boolean> = {};
      const q: Record<string, number> = {};
      previous.lines.forEach((l) => {
        sel[l.itemId] = true;
        q[l.itemId] = l.qty.ordered ?? 0;
      });
      setSelected(sel);
      setQtys(q);
    }
  }, [open, previous]);

  if (!previous) return null;
  const allChecked = previous.lines.every((l) => selected[l.itemId]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Repeat previous order"
      description={`${previous.orderNo} · delivered ${fmtDate(previous.deliveryDate)} — this creates a new order, the original is unchanged.`}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            onClick={() => {
              const out: Record<string, number> = {};
              previous.lines.forEach((l) => { if (selected[l.itemId] && qtys[l.itemId] > 0) out[l.itemId] = qtys[l.itemId]; });
              onApply(out);
            }}
          >
            Create New Order
          </Button>
        </>
      }
    >
      <div className="mb-2 flex items-center justify-between">
        <Checkbox
          label={allChecked ? 'Unselect all' : 'Select all'}
          checked={allChecked}
          onChange={() => {
            const next: Record<string, boolean> = {};
            previous.lines.forEach((l) => (next[l.itemId] = !allChecked));
            setSelected(next);
          }}
        />
        <span className="text-xs text-muted">{previous.lines.length} items</span>
      </div>
      <div className="scrollbar-thin flex max-h-96 flex-col divide-y divide-line overflow-y-auto rounded-lg border border-line">
        {previous.lines.map((l) => {
          const item = db.items.find((i) => i.id === l.itemId);
          if (!item) return null;
          return (
            <div key={l.id} className="flex items-center gap-3 px-3 py-2">
              <Checkbox checked={!!selected[l.itemId]} onChange={(e) => setSelected((s) => ({ ...s, [l.itemId]: e.target.checked }))} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-medium text-ink">{item.name} <Badge tone="neutral" className="ml-1">{item.unit}</Badge></p>
              </div>
              <QtyInput value={qtys[l.itemId] ?? 0} unit={item.unit} onChange={(v) => setQtys((q) => ({ ...q, [l.itemId]: v ?? 0 }))} size="sm" disabled={!selected[l.itemId]} />
            </div>
          );
        })}
      </div>
    </Modal>
  );
}
