import { useEffect, useMemo, useRef, useState } from 'react';
import { Plus, Search, X } from 'lucide-react';
import { Modal } from '../../components/ui/Overlay';
import { Button } from '../../components/ui/Button';
import { Input, QtyInput } from '../../components/ui/Field';
import { EmptyState } from '../../components/ui/States';
import type { Category, Item } from '../../types/models';
import { inr } from '../../lib/format';
import { cn } from '../../lib/cn';
import { itemEmoji } from '../orders/orderUi';

/** The mockup's shorter pills, mapped onto the real catalogue categories. */
const PILLS: { label: string; category: Category }[] = [
  { label: 'Vegetables', category: 'Indian Vegetables' },
  { label: 'Fruits', category: 'Fresh Fruits' },
  { label: 'Herbs', category: 'Herbs & Leafy' },
  { label: 'Imported', category: 'Imported Produce' },
  { label: 'Others', category: 'Exotic Vegetables' },
];

interface AddMoreItemsModalProps {
  open: boolean;
  onClose: () => void;
  /** Catalogue minus whatever is already on the order. */
  items: Item[];
  rateOf: (itemId: string) => number;
  onAdd: (itemId: string, qty: number) => void;
}

/**
 * Type a name, pick it from the list that drops down, set a quantity, then Add —
 * nothing reaches the order until that last tap.
 */
export function AddMoreItemsModal({ open, onClose, items, rateOf, onAdd }: AddMoreItemsModalProps) {
  const [search, setSearch] = useState('');
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [picked, setPicked] = useState<Item | null>(null);
  const [pill, setPill] = useState<Category>('Indian Vegetables');
  const [qty, setQty] = useState<Record<string, number | null>>({});
  const wrap = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) { setSearch(''); setPicked(null); setSuggestOpen(false); setQty({}); }
  }, [open]);

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setSuggestOpen(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const term = search.trim().toLowerCase();
  const suggestions = useMemo(
    () => (term ? items.filter((i) => i.name.toLowerCase().includes(term)).slice(0, 8) : []),
    [items, term],
  );
  const list = useMemo(
    () => items.filter((i) => i.category === pill).sort((a, b) => a.sortOrder - b.sortOrder),
    [items, pill],
  );

  const add = (item: Item) => {
    const q = qty[item.id];
    if (!q) return;
    onAdd(item.id, q);
    setQty((s) => ({ ...s, [item.id]: null }));
    if (picked?.id === item.id) setPicked(null);
  };

  return (
    <Modal open={open} onClose={onClose} title="Add more items" description="Search or browse, set the quantity, then add." size="lg">
      <div className="flex flex-col gap-3">
        <div ref={wrap} className="relative">
          <Input
            value={search}
            onChange={(e) => { setSearch(e.target.value); setSuggestOpen(true); }}
            onFocus={() => setSuggestOpen(true)}
            placeholder="Type an item name…"
            leading={<Search size={16} />}
            autoFocus
            trailing={search ? (
              <button type="button" aria-label="Clear search" onClick={() => { setSearch(''); setSuggestOpen(false); }} className="rounded p-1 hover:bg-canvas">
                <X size={14} />
              </button>
            ) : null}
          />

          {suggestOpen && term.length > 0 && (
            <div className="absolute inset-x-0 top-full z-30 mt-1 max-h-60 overflow-y-auto rounded-xl border border-line bg-white shadow-pop">
              {suggestions.length === 0 ? (
                <p className="px-3 py-3 text-center text-[12.5px] text-subtle">No item matches "{search}"</p>
              ) : suggestions.map((i) => (
                <button
                  key={i.id}
                  onClick={() => { setPicked(i); setSearch(''); setSuggestOpen(false); }}
                  className="flex w-full items-center gap-2.5 border-b border-line px-3 py-2.5 text-left last:border-0 hover:bg-canvas/60"
                >
                  <span className="text-[18px]">{itemEmoji(i.name, i.category)}</span>
                  <span className="min-w-0 flex-1 truncate text-[13.5px] font-medium text-ink">{i.name}</span>
                  <span className="tabular shrink-0 text-[11.5px] text-muted">{inr(rateOf(i.id), true)} / {i.unit}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="scrollbar-thin -mx-1 flex gap-2 overflow-x-auto px-1">
          {PILLS.map((p) => (
            <button
              key={p.label}
              onClick={() => setPill(p.category)}
              className={cn('shrink-0 rounded-full border px-3.5 py-1.5 text-[12.5px] font-medium whitespace-nowrap',
                pill === p.category ? 'border-brand-700 bg-brand-700 text-white' : 'border-line bg-white text-muted')}
            >
              {p.label}
            </button>
          ))}
        </div>

        {picked && (
          <Row item={picked} rate={rateOf(picked.id)} value={qty[picked.id] ?? null}
            onChange={(v) => setQty((s) => ({ ...s, [picked.id]: v }))} onAdd={() => add(picked)}
            onDismiss={() => setPicked(null)} highlight />
        )}

        <div className="scrollbar-thin max-h-[46vh] overflow-y-auto">
          {list.length === 0 ? (
            <EmptyState icon={Search} title="Nothing left in this category" description="Everything here is already on your order." className="py-8" />
          ) : (
            <div className="flex flex-col gap-2">
              {list.map((item) => (
                <Row key={item.id} item={item} rate={rateOf(item.id)} value={qty[item.id] ?? null}
                  onChange={(v) => setQty((s) => ({ ...s, [item.id]: v }))} onAdd={() => add(item)} />
              ))}
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}

/**
 * Two lines on purpose: a phone row cannot hold a name, a stepper and an Add button
 * side by side without crushing the name to a few pixels.
 */
function Row({ item, rate, value, onChange, onAdd, onDismiss, highlight }: {
  item: Item; rate: number; value: number | null; onChange: (v: number | null) => void;
  onAdd: () => void; onDismiss?: () => void; highlight?: boolean;
}) {
  return (
    <div className={cn('rounded-2xl border bg-white p-2.5',
      highlight ? 'border-brand-500 bg-brand-50 ring-1 ring-brand-200' : value ? 'border-brand-300' : 'border-line')}>
      <div className="flex items-center gap-2.5">
        <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-canvas text-[23px]">{itemEmoji(item.name, item.category)}</span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[14px] font-semibold text-ink">{item.name}</p>
          <p className="tabular truncate text-[12px] text-muted">{inr(rate, true)} / {item.unit}</p>
        </div>
        {onDismiss && <button onClick={onDismiss} aria-label="Dismiss" className="shrink-0 rounded p-1 text-subtle hover:text-ink"><X size={16} /></button>}
      </div>

      <div className="mt-2 flex items-center gap-2">
        <QtyInput value={value} unit={item.unit} onChange={onChange} showUnit={false} widthClass="w-[116px]" aria-label={`${item.name} quantity`} />
        <span className="w-7 shrink-0 text-[12.5px] font-medium text-muted">{item.unit}</span>
        <Button size="md" variant={value ? 'primary' : 'subtle'} icon={Plus} disabled={!value} onClick={onAdd} className="ml-auto">Add</Button>
      </div>
    </div>
  );
}
