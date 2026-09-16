import { useMemo, useState } from 'react';
import { Plus, Search } from 'lucide-react';
import { Modal } from '../../components/ui/Overlay';
import { Button } from '../../components/ui/Button';
import { SearchInput } from '../../components/ui/Field';
import { Badge } from '../../components/ui/Badge';
import { EmptyState } from '../../components/ui/States';
import { CATEGORIES, type Category, type Item } from '../../types/models';
import { inr } from '../../lib/format';
import { cn } from '../../lib/cn';
import { CATEGORY_EMOJI, itemEmoji } from './orderUi';

interface AddItemModalProps {
  open: boolean;
  onClose: () => void;
  items: Item[];
  /** Already on the order — shown as "Added" rather than offered again. */
  addedIds: Set<string>;
  rateFor: (itemId: string) => number;
  onAdd: (itemId: string) => void;
}

const ALL = 'All Items';

export function AddItemModal({ open, onClose, items, addedIds, rateFor, onAdd }: AddItemModalProps) {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<string>(ALL);

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return items
      .filter((i) => category === ALL || i.category === category)
      .filter((i) => !term || i.name.toLowerCase().includes(term) || i.code.toLowerCase().includes(term))
      .sort((a, b) => a.sortOrder - b.sortOrder);
  }, [items, category, search]);

  return (
    <Modal open={open} onClose={onClose} title="Add items" description="Pick from the catalogue — the customer's own rate is applied." size="lg">
      <div className="flex flex-col gap-3">
        <SearchInput value={search} onChange={setSearch} placeholder="Search items by name or code…" autoFocus />

        <div className="scrollbar-thin -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
          {[ALL, ...CATEGORIES].map((c) => (
            <button
              key={c}
              onClick={() => setCategory(c)}
              className={cn(
                'flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12.5px] font-medium whitespace-nowrap',
                category === c ? 'border-brand-700 bg-brand-700 text-white' : 'border-line bg-white text-muted hover:text-ink',
              )}
            >
              {c !== ALL && <span>{CATEGORY_EMOJI[c as Category]}</span>}
              {c}
            </button>
          ))}
        </div>

        <div className="scrollbar-thin max-h-80 overflow-y-auto rounded-lg border border-line">
          {rows.length === 0 ? (
            <EmptyState icon={Search} title="No items match" className="py-8" />
          ) : (
            rows.map((i) => {
              const added = addedIds.has(i.id);
              return (
                <div key={i.id} className="flex items-center gap-3 border-b border-line px-3 py-2 last:border-0">
                  <span className="text-[15px]">{itemEmoji(i.name, i.category)}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-medium text-ink">{i.name}</p>
                    <p className="truncate text-[11.5px] text-muted">{i.code} · {i.category}</p>
                  </div>
                  <Badge tone="neutral">{i.unit}</Badge>
                  <span className="tabular w-20 text-right text-[12.5px] text-muted">{inr(rateFor(i.id), true)}</span>
                  <Button size="xs" variant={added ? 'subtle' : 'primary'} icon={added ? undefined : Plus} disabled={added} onClick={() => onAdd(i.id)}>
                    {added ? 'Added' : 'Add'}
                  </Button>
                </div>
              );
            })
          )}
        </div>
      </div>
    </Modal>
  );
}
