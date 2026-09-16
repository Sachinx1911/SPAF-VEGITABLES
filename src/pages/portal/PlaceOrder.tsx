import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import {
  ArrowRight, Check, ChevronRight, ListChecks, Package, Plus, RefreshCw, Save, Search, ShoppingCart, Sprout, Trash2,
} from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { QtyInput } from '../../components/ui/Field';
import { EmptyState } from '../../components/ui/States';
import { useConfirm } from '../../components/ui/ConfirmDialog';
import { useToast } from '../../components/ui/Toast';
import { useCurrentUser, useDb } from '../../store/useStore';
import { amendOrder, createOrder } from '../../store/orderActions';
import { saveTemplate, deleteTemplate } from '../../store/templateActions';
import type { Item } from '../../types/models';
import { editableOrder, isPastCutoff, nextDeliveryDate, previousOrder, rateFor } from '../../domain/orders';
import { todayISO, nowISO } from '../../lib/clock';
import { fmtDate, inr, weekday } from '../../lib/format';
import { useOrderBasket } from '../orders/useOrderBasket';
import { itemEmoji } from '../orders/orderUi';
import { cn } from '../../lib/cn';
import { RepeatOrderModal } from '../orders/RepeatOrderModal';
import { SaveTemplateModal } from './SaveTemplateModal';
import { ReviewOrderModal } from './ReviewOrderModal';
import { AddMoreItemsModal } from './AddMoreItemsModal';

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

  // An order already in for this delivery date turns the screen into "add to it"
  // instead of starting a second one — the basket opens holding what they asked for.
  const [existing] = useState(() => editableOrder(db, customer.id, deliveryDate));
  const basket = useOrderBasket(
    db, customer.id, deliveryDate,
    existing ? existing.lines.map((l) => ({ itemId: l.itemId, qty: l.qty.ordered ?? 0 })) : undefined,
  );

  const [mode, setMode] = useState<'regular' | 'new'>(() => (new URLSearchParams(loc.search).get('mode') === 'new' ? 'new' : 'regular'));
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [addOpen, setAddOpen] = useState(false);
  const [repeatOpen, setRepeatOpen] = useState(() => new URLSearchParams(loc.search).get('repeat') === '1');
  const [saveOpen, setSaveOpen] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [appliedTemplate, setAppliedTemplate] = useState(false);

  const prev = previousOrder(db, customer.id);
  const pastCutoff = isPastCutoff(nowISO(), db.settings.orderCutoffTime);
  const templates = db.standingTemplates.filter((t) => t.customerId === customer.id);

  /* --------------------------------------------- tracking what they changed */

  /** The basket as it opened — everything is measured against this. */
  const baseline = useRef<Record<string, number | null> | null>(null);
  if (baseline.current === null) baseline.current = { ...basket.quantities };

  /** Order in which rows were last touched, so the newest edit sits on top. */
  const [touchedAt, setTouchedAt] = useState<Record<string, number>>({});
  const tick = useRef(0);

  const setQty = (itemId: string, qty: number | null) => {
    basket.setQty(itemId, qty);
    tick.current += 1;
    setTouchedAt((t) => ({ ...t, [itemId]: tick.current }));
  };

  /**
   * Loading a template, a previous order or switching mode replaces the whole basket, so
   * it becomes the new starting point — otherwise every one of those lines would light up.
   */
  const [rebaseSeq, setRebaseSeq] = useState(0);
  useEffect(() => {
    if (rebaseSeq === 0) return;
    baseline.current = { ...basket.quantities };
    setTouchedAt({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rebaseSeq]);

  /** itemId → what happened to it this sitting. Reverting a quantity clears the flag. */
  const changed = useMemo(() => {
    const base = baseline.current ?? {};
    const m = new Map<string, 'added' | 'updated'>();
    for (const [id, q] of Object.entries(basket.quantities)) {
      if (q == null) continue;
      if (!(id in base) || base[id] == null) m.set(id, 'added');
      else if (base[id] !== q) m.set(id, 'updated');
    }
    return m;
  }, [basket.quantities]);

  // ?template=<id> from Home's quick-launch cards loads it straight in, no extra tap.
  useEffect(() => {
    if (appliedTemplate) return;
    const tplId = new URLSearchParams(loc.search).get('template');
    const tpl = tplId ? templates.find((t) => t.id === tplId) : null;
    if (tpl) {
      if (!existing) basket.clear();
      tpl.lines.forEach((l) => basket.setQty(l.itemId, l.qty));
      setRebaseSeq((n) => n + 1);
      setAppliedTemplate(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loc.search]);

  /* ------------------------------------------------- regular / new switch */

  const regularSeed = useMemo(
    () => (existing
      ? existing.lines.map((l) => ({ itemId: l.itemId, qty: l.qty.ordered ?? 0 }))
      : basket.favourites.filter((f) => f.timesOrdered > 0).map((f) => ({ itemId: f.item.id, qty: f.lastQty ?? 0 }))),
    [existing, basket.favourites],
  );

  const switchMode = async (next: 'regular' | 'new') => {
    if (next === mode) return;
    if (next === 'new' && basket.totalItems > 0) {
      const ok = await confirm({
        title: 'Start a fresh list?',
        description: existing
          ? `This clears the ${basket.totalItems} items shown here so you can pick different ones. ${existing.orderNo} only changes when you send it.`
          : `This clears the ${basket.totalItems} items loaded from your regular order.`,
        confirmLabel: 'Start fresh',
        tone: 'danger',
      });
      if (!ok) return;
    }
    basket.clear();
    setSelected(new Set());
    if (next === 'regular') regularSeed.forEach((l) => basket.setQty(l.itemId, l.qty));
    setRebaseSeq((n) => n + 1);
    setMode(next);
  };

  /* ------------------------------------------------- what's on the order */

  const rows = useMemo(() => {
    const ids = new Set<string>();
    for (const [id, q] of Object.entries(basket.quantities)) if (q != null) ids.add(id);

    return [...ids]
      .map((id) => {
        const item = basket.itemById.get(id);
        if (!item) return null;
        return { item, lastQty: basket.favByItemId.get(id)?.lastQty ?? null, rate: rateFor(db, customer.id, id, deliveryDate) };
      })
      .filter((r): r is { item: Item; lastQty: number | null; rate: number } => !!r)
      // Whatever they just added or changed floats to the top, newest first.
      .sort((a, b) => {
        const ca = changed.has(a.item.id) ? 1 : 0;
        const cb = changed.has(b.item.id) ? 1 : 0;
        if (ca !== cb) return cb - ca;
        if (ca) return (touchedAt[b.item.id] ?? 0) - (touchedAt[a.item.id] ?? 0);
        return a.item.sortOrder - b.item.sortOrder;
      });
  }, [basket.quantities, basket.itemById, basket.favByItemId, db, customer.id, deliveryDate, changed, touchedAt]);

  const rowIds = useMemo(() => new Set(rows.map((r) => r.item.id)), [rows]);
  const catalogue = useMemo(() => db.items.filter((i) => i.active && !rowIds.has(i.id)), [db.items, rowIds]);
  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.item.id));

  const removeSelected = async () => {
    const ok = await confirm({ title: `Remove ${selected.size} items?`, confirmLabel: 'Remove', tone: 'danger' });
    if (!ok) return;
    selected.forEach((id) => setQty(id, null));
    setSelected(new Set());
  };

  /* ------------------------------------------------------------ submitting */

  const send = () => {
    const lines = basket.lines.map((l) => ({ itemId: l.itemId, unit: l.unit, qty: l.qty, rate: l.rate }));
    if (existing) amendOrder(existing.id, lines, user.id);
    else createOrder({ customerId: customer.id, deliveryDate, source: 'Customer Portal', lines }, user.id);
    setReviewOpen(false);
    setSubmitted(true);
  };

  if (submitted) {
    return (
      <div className="flex min-h-[80vh] flex-col items-center justify-center gap-3 px-6 text-center">
        <div className="grid size-16 place-items-center rounded-full bg-emerald-50 text-emerald-600"><Check size={32} /></div>
        <h2 className="text-[19px] font-semibold text-ink">{existing ? 'Order updated!' : 'Order placed!'}</h2>
        <p className="max-w-xs text-[13.5px] text-muted">
          We'll confirm it before the {db.settings.orderCutoffTime} cutoff. You'll see it in Orders once approved.
        </p>
        <div className="mt-3 flex gap-2">
          <Button variant="secondary" onClick={() => nav('/portal/orders')}>View orders</Button>
          <Button variant="primary" onClick={() => nav('/portal')}>Back home</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col bg-gradient-to-b from-fresh-50/60 via-white to-white">
      {/* ------------------------------------------------------ brand header */}
      <header className="sticky top-0 z-30 flex items-center gap-2.5 bg-white/95 px-4 py-3 backdrop-blur">
        <div className="grid size-9 shrink-0 place-items-center rounded-xl bg-fresh-50 text-fresh-600">
          <Sprout size={21} strokeWidth={2.2} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[19px] leading-tight font-bold tracking-tight text-brand-800">SPAF</p>
          <p className="truncate text-[11px] leading-tight text-muted">Freshness Delivered Daily</p>
        </div>
        <button onClick={() => setAddOpen(true)} aria-label="Search items" className="rounded-lg p-2 text-brand-800 hover:bg-canvas">
          <Search size={22} strokeWidth={2.2} />
        </button>
        <button
          onClick={() => (basket.totalItems ? setReviewOpen(true) : toast({ tone: 'error', title: 'Add at least one item first' }))}
          aria-label="Review order"
          className="relative rounded-lg p-2 text-brand-800 hover:bg-canvas"
        >
          <ShoppingCart size={22} strokeWidth={2.2} />
          {basket.totalItems > 0 && (
            <span className="tabular absolute -top-0.5 -right-0.5 grid min-w-[20px] place-items-center rounded-full bg-brand-700 px-1 text-[10.5px] font-bold text-white ring-2 ring-white">
              {basket.totalItems}
            </span>
          )}
        </button>
      </header>

      <div className="flex flex-col gap-3.5 px-4 pt-1 pb-2">
        {/* ----------------------------------------------------- page title */}
        <div className="relative">
          <h1 className="text-[32px] leading-none font-bold tracking-[-0.02em] text-ink">Order</h1>
          <p className="mt-2 text-[14px] text-muted">Fresh vegetables, simpler for you</p>
          <p className="pointer-events-none absolute -top-1 right-0 text-right font-serif text-[16px] leading-[1.25] text-brand-700 italic">
            Fresh<br />Healthy<br />Everyday <span className="not-italic">🌿</span>
          </p>
        </div>

        {/* ---------------------------------------------------- mode switch */}
        <div className="grid grid-cols-2 gap-2.5">
          <ModeCard active={mode === 'regular'} icon={RefreshCw} title="Regular Order" sub="Your fixed items" onClick={() => switchMode('regular')} />
          <ModeCard active={mode === 'new'} icon={Plus} title="New Order" sub="Add different items" onClick={() => switchMode('new')} />
        </div>

        {/* ----------------------------------------------------- ready card */}
        {mode === 'regular' && rows.length > 0 && (
          <button
            onClick={() => (prev && !existing ? setRepeatOpen(true) : setAddOpen(true))}
            className="flex items-center gap-3 rounded-2xl border border-brand-200 bg-fresh-50/70 p-3.5 text-left"
          >
            <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-white text-brand-700"><Package size={22} /></span>
            <div className="min-w-0 flex-1">
              <p className="text-[15px] font-semibold text-ink">Your regular order is ready</p>
              <p className="truncate text-[12.5px] text-muted">
                {rows.length} items · {existing ? `From ${existing.orderNo}` : prev ? `From your last order (${fmtDate(prev.deliveryDate)})` : 'From your usual items'}
              </p>
            </div>
            <ChevronRight size={20} className="shrink-0 text-subtle" />
          </button>
        )}

        {pastCutoff && (
          <p className="rounded-xl bg-amber-50 px-3.5 py-2.5 text-[12.5px] text-amber-800">
            Today's {db.settings.orderCutoffTime} cutoff has passed — this order delivers {weekday(deliveryDate)}, {fmtDate(deliveryDate)}.
          </p>
        )}

        {mode === 'regular' && templates.length > 0 && (
          <div className="flex flex-col gap-2">
            {templates.map((t) => (
              <div key={t.id} className="flex items-center gap-2.5 rounded-xl border border-line bg-white p-2.5">
                <ListChecks size={18} className="shrink-0 text-brand-700" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13.5px] font-semibold text-ink">{t.name}</p>
                  <p className="text-[11.5px] text-muted">{t.lines.length} items</p>
                </div>
                <Button size="xs" variant="primary" onClick={() => {
                  basket.clear();
                  t.lines.forEach((l) => basket.setQty(l.itemId, l.qty));
                  setRebaseSeq((n) => n + 1);
                  toast({ tone: 'success', title: `"${t.name}" loaded` });
                }}>Use</Button>
                <button
                  onClick={async () => {
                    const ok = await confirm({ title: `Delete "${t.name}"?`, tone: 'danger', confirmLabel: 'Delete' });
                    if (ok) { deleteTemplate(t.id, user.id); toast({ tone: 'success', title: 'Regular order deleted' }); }
                  }}
                  aria-label={`Delete ${t.name}`}
                  className="shrink-0 rounded p-1.5 text-subtle hover:bg-canvas hover:text-red-600"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* --------------------------------------------------------- add more */}
        <button
          onClick={() => setAddOpen(true)}
          className="flex items-center justify-center gap-3 rounded-2xl border border-dashed border-brand-300 bg-fresh-50/40 px-4 py-5 text-left active:bg-fresh-50"
        >
          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-brand-800 text-white"><Plus size={20} strokeWidth={2.6} /></span>
          <span className="min-w-0">
            <span className="block text-[16px] font-semibold text-ink">Add More Items</span>
            <span className="block text-[12.5px] text-muted">Search and add other products</span>
          </span>
        </button>

        {/* --------------------------------------------------- item heading */}
        <div className="flex items-center justify-between pt-1">
          <div className="min-w-0">
            <h2 className="text-[19px] font-bold text-ink">
              {mode === 'regular' ? 'Regular Items' : 'Your Items'} ({rows.length})
            </h2>
            {changed.size > 0 && <p className="text-[11.5px] font-medium text-brand-700">{changed.size} changed — shown at the top</p>}
          </div>
          {rows.length > 0 && (
            <button
              onClick={() => setSelected(allSelected ? new Set() : new Set(rows.map((r) => r.item.id)))}
              className="flex items-center gap-2 text-[13.5px] font-semibold text-brand-800"
            >
              Select All
              <Box checked={allSelected} />
            </button>
          )}
        </div>

        {selected.size > 0 && (
          <div className="flex items-center gap-3 rounded-xl bg-brand-50 px-3 py-2 text-[12.5px]">
            <span className="font-medium text-brand-900">{selected.size} selected</span>
            <Button size="xs" variant="danger" icon={Trash2} onClick={removeSelected}>Remove</Button>
            <button onClick={() => setSelected(new Set())} className="text-muted hover:text-ink">Clear</button>
          </div>
        )}

        {/* -------------------------------------------------------- the rows */}
        <div className="flex flex-col gap-2.5">
          {rows.map((r) => {
            const mark = changed.get(r.item.id);
            const isSel = selected.has(r.item.id);
            return (
              <div
                key={r.item.id}
                className={cn('flex items-center gap-2 rounded-2xl border bg-white p-2.5 transition-colors',
                  mark ? 'border-brand-500 bg-brand-50 ring-1 ring-brand-200' : isSel ? 'border-brand-400' : 'border-line')}
              >
                <button
                  onClick={() => setSelected((s) => { const n = new Set(s); n.has(r.item.id) ? n.delete(r.item.id) : n.add(r.item.id); return n; })}
                  aria-label={`Select ${r.item.name}`}
                  className="shrink-0"
                >
                  <Box checked={isSel} />
                </button>

                <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-canvas text-[24px]">
                  {itemEmoji(r.item.name, r.item.category)}
                </span>

                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1.5 text-[15px] font-semibold text-ink">
                    <span className="truncate">{r.item.name}</span>
                    {mark && (
                      <span className={cn('shrink-0 rounded px-1.5 py-0.5 text-[9.5px] font-bold tracking-wide uppercase',
                        mark === 'added' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700')}>
                        {mark}
                      </span>
                    )}
                  </p>
                  <p className="tabular truncate text-[12.5px] text-muted">{inr(r.rate, true)} / {r.item.unit}</p>
                  {r.lastQty != null && (
                    <button
                      onClick={() => setQty(r.item.id, r.lastQty)}
                      className="mt-1 inline-flex items-center gap-1 rounded-lg bg-fresh-50 px-2 py-1 text-[11.5px] font-medium text-brand-700"
                    >
                      <RefreshCw size={11} /> Last: {r.lastQty} {r.item.unit}
                    </button>
                  )}
                </div>

                <QtyInput
                  value={basket.quantities[r.item.id] ?? null}
                  unit={r.item.unit}
                  onChange={(v) => setQty(r.item.id, v)}
                  showUnit={false}
                  widthClass="w-[108px]"
                  aria-label={`${r.item.name} quantity`}
                />
                <span className="w-6 shrink-0 text-[12.5px] font-medium text-muted">{r.item.unit}</span>
              </div>
            );
          })}

          {rows.length === 0 && (
            <EmptyState
              icon={Search}
              title={mode === 'new' ? 'Empty list — add what you need' : 'Nothing on this order yet'}
              description="Tap Add More Items above to search the catalogue."
              className="py-8"
            />
          )}
        </div>

        {basket.totalItems > 0 && (
          <Button variant="secondary" icon={Save} onClick={() => setSaveOpen(true)}>Save this as my regular order</Button>
        )}
      </div>

      {/* -------------------------------------------------------- sticky bar */}
      <div className="fixed inset-x-0 bottom-16 z-20 mx-auto w-full max-w-lg px-3 pb-2">
        <div className="flex items-center gap-3 rounded-2xl border border-line bg-white px-3 py-2.5 shadow-pop">
          <span className="relative grid size-12 shrink-0 place-items-center rounded-xl bg-fresh-50 text-brand-700">
            <ShoppingCart size={21} />
            {basket.totalItems > 0 && (
              <span className="tabular absolute -top-1.5 -right-1.5 grid min-w-[21px] place-items-center rounded-full bg-brand-700 px-1 text-[10.5px] font-bold text-white ring-2 ring-white">
                {basket.totalItems}
              </span>
            )}
          </span>
          <div className="shrink-0">
            <p className="text-[11px] text-muted">Total Items</p>
            <p className="tabular text-[18px] leading-none font-bold text-ink">{basket.totalItems}</p>
          </div>
          <div className="h-9 w-px shrink-0 bg-line" />
          <div className="min-w-0 shrink-0">
            <p className="text-[11px] text-muted">Estimated Amount</p>
            <p className="tabular text-[18px] leading-none font-bold text-ink">{inr(basket.totalAmount)}</p>
          </div>
          <button
            onClick={() => (basket.totalItems ? setReviewOpen(true) : toast({ tone: 'error', title: 'Add at least one item first' }))}
            className="ml-auto flex shrink-0 items-center gap-2 rounded-xl bg-brand-800 px-4 py-3.5 text-[15px] font-semibold text-white active:scale-[0.99]"
          >
            {existing ? 'Update' : 'Place Order'}
            <ArrowRight size={18} />
          </button>
        </div>
      </div>

      <AddMoreItemsModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        items={catalogue}
        rateOf={(id) => rateFor(db, customer.id, id, deliveryDate)}
        onAdd={(id, q) => {
          setQty(id, q);
          toast({ tone: 'success', title: `${basket.itemById.get(id)?.name ?? 'Item'} added` });
        }}
      />

      <ReviewOrderModal
        open={reviewOpen}
        onClose={() => setReviewOpen(false)}
        lines={basket.lines}
        totalAmount={basket.totalAmount}
        deliveryLabel={`${weekday(deliveryDate)}, ${fmtDate(deliveryDate)}`}
        changed={changed}
        amending={!!existing}
        onQty={setQty}
        onConfirm={send}
      />

      <RepeatOrderModal
        open={repeatOpen}
        onClose={() => setRepeatOpen(false)}
        previous={prev}
        onApply={(qtys) => {
          Object.entries(qtys).forEach(([itemId, q]) => basket.setQty(itemId, q));
          setRebaseSeq((n) => n + 1);
          setRepeatOpen(false);
          toast({ tone: 'success', title: 'Loaded — review and send' });
        }}
      />

      <SaveTemplateModal
        open={saveOpen}
        onClose={() => setSaveOpen(false)}
        defaultName={templates.length ? `Regular Order ${templates.length + 1}` : 'Daily Regular'}
        onSave={(name) => {
          saveTemplate(customer.id, name, basket.lines.map((l) => ({ itemId: l.itemId, unit: l.unit, qty: l.qty })), user.id);
          setSaveOpen(false);
          toast({ tone: 'success', title: 'Regular order saved', description: `"${name}" — use it next time in one tap.` });
        }}
      />
    </div>
  );
}

function Box({ checked }: { checked: boolean }) {
  return (
    <span className={cn('grid size-6 place-items-center rounded-lg border-2 transition-colors',
      checked ? 'border-brand-700 bg-brand-700 text-white' : 'border-[#c9d3cc] bg-white')}>
      {checked && <Check size={14} strokeWidth={3.5} />}
    </span>
  );
}

function ModeCard({ active, icon: Icon, title, sub, onClick }: {
  active: boolean; icon: typeof Plus; title: string; sub: string; onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn('flex items-center gap-2.5 rounded-2xl px-3 py-3.5 text-left transition-colors',
        active ? 'bg-brand-800' : 'border border-line bg-white')}
    >
      <span className={cn('grid size-10 shrink-0 place-items-center rounded-full',
        active ? 'bg-white/15 text-white' : 'bg-brand-800 text-white')}>
        <Icon size={19} strokeWidth={2.4} />
      </span>
      <span className="min-w-0">
        <span className={cn('block truncate text-[15px] font-bold', active ? 'text-white' : 'text-ink')}>{title}</span>
        <span className={cn('block truncate text-[12px]', active ? 'text-white/75' : 'text-muted')}>{sub}</span>
      </span>
    </button>
  );
}
