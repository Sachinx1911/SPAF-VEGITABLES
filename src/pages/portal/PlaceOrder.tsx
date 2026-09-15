import { useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { Check, ChevronDown, Search } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { SearchInput, QtyInput } from '../../components/ui/Field';
import { Badge } from '../../components/ui/Badge';
import { EmptyState } from '../../components/ui/States';
import { useConfirm } from '../../components/ui/ConfirmDialog';
import { useToast } from '../../components/ui/Toast';
import { useCurrentUser, useDb } from '../../store/useStore';
import { createOrder } from '../../store/orderActions';
import { CATEGORIES } from '../../types/models';
import { isPastCutoff, nextDeliveryDate, previousOrder } from '../../domain/orders';
import { todayISO, nowISO } from '../../lib/clock';
import { fmtDate, inr, qty, weekday } from '../../lib/format';
import { useOrderBasket } from '../orders/useOrderBasket';
import { cn } from '../../lib/cn';
import { RepeatOrderModal } from '../orders/RepeatOrderModal';

const ALL = 'All';

export function PlaceOrderPage() {
  const db = useDb();
  const user = useCurrentUser()!;
  const nav = useNavigate();
  const loc = useLocation();
  const confirm = useConfirm();
  const toast = useToast();
  const customer = db.customers.find((c) => c.id === user.customerId)!;
  const today = todayISO();
  const deliveryDate = nextDeliveryDate(today, nowISO(), db.settings.orderCutoffTime);

  const basket = useOrderBasket(db, customer.id, deliveryDate);
  const [category, setCategory] = useState(ALL);
  const [search, setSearch] = useState('');
  const [showAll, setShowAll] = useState(false);
  const [repeatOpen, setRepeatOpen] = useState(() => new URLSearchParams(loc.search).get('repeat') === '1');
  const [submitted, setSubmitted] = useState(false);

  const prev = previousOrder(db, customer.id);
  const pastCutoff = isPastCutoff(nowISO(), db.settings.orderCutoffTime);

  const term = search.trim().toLowerCase();
  const visibleFavourites = useMemo(() => {
    return basket.favourites
      .filter((f) => f.timesOrdered > 0)
      .filter((f) => category === ALL || f.item.category === category)
      .filter((f) => !term || f.item.name.toLowerCase().includes(term));
  }, [basket.favourites, category, term]);

  const catalogExtra = useMemo(() => {
    const shownIds = new Set(visibleFavourites.map((f) => f.item.id));
    const pool = category === ALL ? db.items.filter((i) => i.active) : (basket.catalogByCategory.get(category) ?? []);
    return pool.filter((i) => !shownIds.has(i.id)).filter((i) => !term || i.name.toLowerCase().includes(term));
  }, [category, db.items, basket.catalogByCategory, visibleFavourites, term]);

  if (submitted) {
    return (
      <div className="flex min-h-[70vh] flex-col items-center justify-center gap-3 text-center">
        <div className="grid size-16 place-items-center rounded-full bg-emerald-50 text-emerald-600"><Check size={32} /></div>
        <h2 className="text-[18px] font-semibold text-ink">Order submitted!</h2>
        <p className="max-w-xs text-[13.5px] text-muted">We'll confirm your order before the {db.settings.orderCutoffTime} cutoff. You'll see it in Orders once approved.</p>
        <div className="mt-3 flex gap-2">
          <Button variant="secondary" onClick={() => nav('/portal/orders')}>View orders</Button>
          <Button variant="primary" onClick={() => nav('/portal')}>Back home</Button>
        </div>
      </div>
    );
  }

  const submit = async () => {
    if (!basket.lines.length) return toast({ tone: 'error', title: 'Add at least one item first' });
    const ok = await confirm({
      title: 'Send this order?',
      description: `Delivery on ${weekday(deliveryDate)}, ${fmtDate(deliveryDate)}`,
      confirmLabel: 'Send order',
      details: [{ label: 'Items', value: basket.totalItems }, { label: 'Estimated total', value: inr(basket.totalAmount) }],
    });
    if (!ok) return;
    createOrder(
      { customerId: customer.id, deliveryDate, source: 'Customer Portal', lines: basket.lines.map((l) => ({ itemId: l.itemId, unit: l.unit, qty: l.qty, rate: l.rate })) },
      user.id,
    );
    setSubmitted(true);
  };

  return (
    <div className="flex flex-col gap-3 pb-24">
      <div>
        <h1 className="text-[18px] font-semibold text-ink">Place order</h1>
        <p className="text-[12.5px] text-muted">Delivery {weekday(deliveryDate)}, {fmtDate(deliveryDate)}{pastCutoff ? ' · today\'s cutoff has passed' : ''}</p>
      </div>

      {prev && (
        <button onClick={() => setRepeatOpen(true)} className="rounded-lg border border-dashed border-brand-300 bg-brand-50 px-3 py-2.5 text-left text-[13px] font-medium text-brand-800">
          Load quantities from your last order ({fmtDate(prev.deliveryDate)}) →
        </button>
      )}

      <SearchInput value={search} onChange={setSearch} placeholder="Search for an item…" />

      <div className="scrollbar-thin -mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
        {[ALL, ...CATEGORIES].map((c) => (
          <button
            key={c}
            onClick={() => setCategory(c)}
            className={cn('shrink-0 rounded-full border px-3.5 py-1.5 text-[12.5px] font-medium whitespace-nowrap', category === c ? 'border-brand-700 bg-brand-700 text-white' : 'border-line bg-white text-muted')}
          >
            {c}
          </button>
        ))}
      </div>

      {visibleFavourites.length === 0 && catalogExtra.length === 0 && (
        <EmptyState icon={Search} title="No items match" description="Try another search or category." />
      )}

      {visibleFavourites.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="mt-1 text-[11px] font-semibold tracking-wide text-subtle uppercase">Your usual items</p>
          {visibleFavourites.map((f) => (
            <ItemRow key={f.item.id} name={f.item.name} unit={f.item.unit} lastQty={f.lastQty} value={basket.quantities[f.item.id] ?? null} onChange={(v) => basket.setQty(f.item.id, v)} />
          ))}
        </div>
      )}

      {catalogExtra.length > 0 && (
        <div className="flex flex-col gap-2">
          <button onClick={() => setShowAll((v) => !v)} className="mt-2 flex items-center justify-between text-[11px] font-semibold tracking-wide text-subtle uppercase">
            {category === ALL ? 'More items' : `More in ${category}`} ({catalogExtra.length})
            <ChevronDown size={14} className={cn('transition-transform', showAll && 'rotate-180')} />
          </button>
          {showAll && catalogExtra.map((item) => (
            <ItemRow key={item.id} name={item.name} unit={item.unit} lastQty={null} value={basket.quantities[item.id] ?? null} onChange={(v) => basket.setQty(item.id, v)} />
          ))}
        </div>
      )}

      {basket.totalItems > 0 && (
        <div className="fixed inset-x-0 bottom-16 z-20 mx-auto w-full max-w-lg border-t border-line bg-white/95 px-4 py-3 backdrop-blur">
          <div className="flex items-center justify-between gap-3">
            <div className="text-[13px]">
              <p className="font-semibold text-ink">{basket.totalItems} items</p>
              <p className="tabular text-muted">Est. {inr(basket.totalAmount)}</p>
            </div>
            <Button variant="primary" size="lg" onClick={submit}>Submit Order</Button>
          </div>
        </div>
      )}

      <RepeatOrderModal
        open={repeatOpen}
        onClose={() => setRepeatOpen(false)}
        previous={prev}
        onApply={(qtys) => {
          Object.entries(qtys).forEach(([itemId, q]) => basket.setQty(itemId, q));
          setRepeatOpen(false);
          toast({ tone: 'success', title: 'Loaded — review and submit' });
        }}
      />
    </div>
  );
}

function ItemRow({ name, unit, lastQty, value, onChange }: { name: string; unit: any; lastQty: number | null; value: number | null; onChange: (v: number | null) => void }) {
  return (
    <div className={cn('flex items-center gap-3 rounded-lg border p-2.5', value ? 'border-brand-300 bg-brand-50/40' : 'border-line bg-white')}>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13.5px] font-medium text-ink">{name}</p>
        <div className="mt-0.5 flex items-center gap-1.5">
          <Badge tone="neutral">{unit}</Badge>
          {lastQty != null && (
            <button onClick={() => onChange(lastQty)} className="text-[11px] text-brand-700 underline decoration-dotted">last: {qty(lastQty, unit)}</button>
          )}
        </div>
      </div>
      <QtyInput value={value} unit={unit} onChange={onChange} size="lg" aria-label={`${name} quantity`} />
    </div>
  );
}
