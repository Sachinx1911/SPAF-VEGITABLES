import { ArrowRight, Pencil, Trash2 } from 'lucide-react';
import { Modal } from '../../components/ui/Overlay';
import { Button } from '../../components/ui/Button';
import { QtyInput } from '../../components/ui/Field';
import { EmptyState } from '../../components/ui/States';
import { inr } from '../../lib/format';
import { cn } from '../../lib/cn';
import { itemEmoji } from '../orders/orderUi';
import type { BasketLine } from '../orders/useOrderBasket';

interface ReviewOrderModalProps {
  open: boolean;
  onClose: () => void;
  lines: BasketLine[];
  totalAmount: number;
  deliveryLabel: string;
  /** itemId → what changed this sitting; these sort to the top and carry a chip. */
  changed: Map<string, 'added' | 'updated'>;
  amending: boolean;
  onQty: (itemId: string, qty: number | null) => void;
  onConfirm: () => void;
}

/**
 * The last look before anything is sent: every line, still editable. Quantities
 * change the real basket, so "edit and send again" never means starting over.
 */
export function ReviewOrderModal({
  open, onClose, lines, totalAmount, deliveryLabel, changed, amending, onQty, onConfirm,
}: ReviewOrderModalProps) {
  const totalQty = Math.round(lines.reduce((s, l) => s + l.qty, 0) * 100) / 100;

  // Same rule as the order screen: what they touched sits on top.
  const ordered = [...lines].sort((a, b) => {
    const ca = changed.has(a.itemId) ? 1 : 0;
    const cb = changed.has(b.itemId) ? 1 : 0;
    return ca === cb ? a.item.sortOrder - b.item.sortOrder : cb - ca;
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={amending ? 'Review your updated order' : 'Review your order'}
      description={`Delivery ${deliveryLabel} — change anything here before you send it.`}
      size="lg"
      footer={
        <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center">
          <div className="flex flex-1 items-center gap-4 text-[12.5px]">
            <span className="text-muted">Items <b className="tabular text-ink">{lines.length}</b></span>
            <span className="text-muted">Qty <b className="tabular text-ink">{totalQty}</b></span>
            <span className="text-muted">Total <b className="tabular text-ink">{inr(totalAmount)}</b></span>
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" icon={Pencil} onClick={onClose}>Keep editing</Button>
            <Button variant="primary" iconRight={ArrowRight} disabled={!lines.length} onClick={onConfirm}>
              {amending ? 'Confirm & Update' : 'Confirm & Send'}
            </Button>
          </div>
        </div>
      }
    >
      {lines.length === 0 ? (
        <EmptyState title="Nothing on this order" description="Close this and add at least one item." className="py-8" />
      ) : (
        <div className="scrollbar-thin -mx-1 max-h-[55vh] overflow-y-auto px-1">
          <div className="flex flex-col gap-2">
            {ordered.map((l) => {
              const mark = changed.get(l.itemId);
              return (
              <div
                key={l.itemId}
                className={cn('flex items-center gap-3 rounded-xl border p-2.5',
                  mark ? 'border-brand-500 bg-brand-50 ring-1 ring-brand-200' : 'border-line')}
              >
                <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-canvas text-[20px]">
                  {itemEmoji(l.item.name, l.item.category)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13.5px] font-medium text-ink">
                    {l.item.name}
                    {mark && (
                      <span className={cn('ml-1.5 rounded px-1.5 py-0.5 text-[10px] font-bold tracking-wide uppercase',
                        mark === 'added' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700')}>
                        {mark}
                      </span>
                    )}
                  </p>
                  <p className="tabular truncate text-[11.5px] text-muted">{inr(l.rate, true)} / {l.unit} · {inr(l.qty * l.rate)}</p>
                </div>
                <QtyInput value={l.qty} unit={l.unit} onChange={(v) => onQty(l.itemId, v)} size="sm" aria-label={`${l.item.name} quantity`} />
                <button
                  onClick={() => onQty(l.itemId, null)}
                  aria-label={`Remove ${l.item.name}`}
                  className="shrink-0 rounded p-1.5 text-subtle hover:bg-red-50 hover:text-red-600"
                >
                  <Trash2 size={15} />
                </button>
              </div>
              );
            })}
          </div>
        </div>
      )}
    </Modal>
  );
}
