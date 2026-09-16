import { useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import {
  Building2, ClipboardList, Filter, History, Layers, Phone, Plus, Save, Search, Send, ShoppingBasket,
  Star, Trash2, User,
} from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Select, SearchInput, QtyInput, Input, Textarea, Field } from '../../components/ui/Field';
import { Badge } from '../../components/ui/Badge';
import { Breadcrumb } from '../../components/ui/Breadcrumb';
import { EmptyState } from '../../components/ui/States';
import { Menu } from '../../components/ui/Dropdown';
import { useConfirm } from '../../components/ui/ConfirmDialog';
import { useToast } from '../../components/ui/Toast';
import { useCurrentUser, useDb } from '../../store/useStore';
import { createOrder } from '../../store/orderActions';
import { CATEGORIES, type Category } from '../../types/models';
import { nextDeliveryDate, previousOrder } from '../../domain/orders';
import { customerOutstanding } from '../../domain/finance';
import { todayISO, nowISO } from '../../lib/clock';
import { fmtDate, inr, initials, qty as fmtQty, weekday } from '../../lib/format';
import { cn } from '../../lib/cn';
import { useOrderBasket } from './useOrderBasket';
import { RepeatOrderModal } from './RepeatOrderModal';
import { AddItemModal } from './AddItemModal';
import { CATEGORY_EMOJI, itemEmoji } from './orderUi';

const ALL = 'All Items';

export function NewOrderPage() {
  const db = useDb();
  const user = useCurrentUser()!;
  const nav = useNavigate();
  const loc = useLocation();
  const confirm = useConfirm();
  const toast = useToast();
  const today = todayISO();

  const preselect = new URLSearchParams(loc.search).get('customer') ?? '';
  const [customerId, setCustomerId] = useState(preselect);
  const [orderDate, setOrderDate] = useState(today);
  const [deliveryDate, setDeliveryDate] = useState(() => nextDeliveryDate(today, nowISO(), db.settings.orderCutoffTime));
  const [orderType, setOrderType] = useState<'Regular' | 'Urgent' | 'Top-up'>('Regular');
  const [reference, setReference] = useState('');
  const [instructions, setInstructions] = useState('');
  const [category, setCategory] = useState<string>(ALL);
  const [search, setSearch] = useState('');
  const [onlyFilled, setOnlyFilled] = useState(false);
  const [repeatOpen, setRepeatOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);

  const customer = db.customers.find((c) => c.id === customerId);
  const basket = useOrderBasket(db, customerId, deliveryDate);
  const prevOrder = customerId ? previousOrder(db, customerId) : null;
  const outstanding = customerId ? customerOutstanding(db, today).get(customerId) ?? 0 : 0;

  /* The order is a list of rows the user has put on it, not the whole catalogue. */
  const [rowIds, setRowIds] = useState<string[]>([]);
  const activeItems = useMemo(() => db.items.filter((i) => i.active), [db.items]);
  const itemById = useMemo(() => new Map(activeItems.map((i) => [i.id, i])), [activeItems]);
  const [remarks, setRemarks] = useState<Record<string, string>>({});

  const rateFor = (itemId: string) =>
    db.prices.find((p) => p.customerId === customerId && p.itemId === itemId && p.effectiveFrom <= deliveryDate && (!p.effectiveTo || p.effectiveTo >= deliveryDate))?.price
    ?? itemById.get(itemId)?.defaultSellingPrice ?? 0;

  const addRow = (itemId: string, qty?: number | null) => {
    setRowIds((ids) => (ids.includes(itemId) ? ids : [...ids, itemId]));
    if (qty != null) basket.setQty(itemId, qty);
  };
  const removeRow = (itemId: string) => {
    setRowIds((ids) => ids.filter((x) => x !== itemId));
    basket.setQty(itemId, null);
  };

  const pickCustomer = (id: string) => {
    setCustomerId(id);
    setRowIds([]);
    basket.clear();
  };

  const loadPrevious = () => {
    if (!prevOrder) return toast({ tone: 'error', title: 'No previous order for this customer' });
    prevOrder.lines.forEach((l) => addRow(l.itemId, l.qty.ordered ?? 0));
    toast({ tone: 'success', title: 'Previous order loaded', description: `${prevOrder.orderNo} · ${prevOrder.lines.length} items` });
  };

  const addFavourites = () => {
    const favs = basket.favourites.filter((f) => f.timesOrdered > 0);
    if (!favs.length) return toast({ tone: 'error', title: 'This customer has no order history yet' });
    favs.forEach((f) => addRow(f.item.id, f.lastQty));
    toast({ tone: 'success', title: `${favs.length} favourite items added` });
  };

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return rowIds
      .map((id) => itemById.get(id))
      .filter((i): i is NonNullable<typeof i> => !!i)
      .filter((i) => category === ALL || i.category === category)
      .filter((i) => !term || i.name.toLowerCase().includes(term) || i.code.toLowerCase().includes(term))
      .filter((i) => !onlyFilled || (basket.quantities[i.id] ?? 0) > 0);
  }, [rowIds, itemById, category, search, onlyFilled, basket.quantities]);

  const suggestions = useMemo(
    () => basket.favourites.filter((f) => f.timesOrdered > 1 && !rowIds.includes(f.item.id)).slice(0, 4),
    [basket.favourites, rowIds],
  );

  const totalQty = basket.lines.reduce((s, l) => s + l.qty, 0);

  const save = async (draft: boolean) => {
    if (!customer) return toast({ tone: 'error', title: 'Choose a customer first' });
    if (!basket.lines.length) return toast({ tone: 'error', title: 'Add at least one item' });
    if (!draft) {
      const ok = await confirm({
        title: 'Submit this order?', confirmLabel: 'Submit order',
        description: `${customer.name} · delivery ${weekday(deliveryDate)}, ${fmtDate(deliveryDate)}`,
        details: [{ label: 'Items', value: basket.totalItems }, { label: 'Total amount', value: inr(basket.totalAmount) }],
      });
      if (!ok) return;
    }
    const order = createOrder(
      {
        customerId, deliveryDate, source: 'Staff', draft,
        orderType: orderType === 'Regular' ? 'Regular' : orderType,
        remarks: [reference && `Ref: ${reference}`, instructions].filter(Boolean).join(' · '),
        lines: basket.lines.map((l) => ({ itemId: l.itemId, unit: l.unit, qty: l.qty, rate: rateFor(l.itemId), remarks: remarks[l.itemId] ?? '' })),
      },
      user.id,
    );
    toast({ tone: 'success', title: draft ? 'Draft saved' : 'Order submitted', description: order.orderNo });
    nav(`/orders/${order.id}`);
  };

  return (
    <div className="flex flex-col gap-4">
      {/* -------------------------------------------------------- page head */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <Breadcrumb items={[{ label: 'Orders', to: '/orders' }, { label: 'New Order' }]} />
          <h1 className="mt-1.5 text-[24px] leading-tight font-semibold tracking-[-0.01em] text-ink">New Order</h1>
          <p className="mt-0.5 text-[13px] text-muted">Create a new customer order for fresh produce items.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" icon={History} disabled={!prevOrder} onClick={() => setRepeatOpen(true)}>Repeat Previous Order</Button>
          <Button variant="subtle" icon={Save} onClick={() => save(true)}>Save Draft</Button>
          <Button variant="primary" icon={Send} onClick={() => save(false)}>Submit Order</Button>
        </div>
      </div>

      {/* ------------------------------------- customer / order / shortcuts */}
      <div className="grid gap-4 xl:grid-cols-12">
        <Panel className="xl:col-span-4" title="Customer Details">
          <div className="flex flex-col gap-3 p-4">
            <div className="flex items-end gap-2">
              <Field label="Customer" required className="flex-1">
                {(id) => (
                  <Select id={id} value={customerId} onChange={(e) => pickCustomer(e.target.value)} placeholder="Select customer…"
                    options={db.customers.filter((c) => c.active).map((c) => ({ value: c.id, label: `${c.name} (${c.code})` }))} />
                )}
              </Field>
              <Button variant="secondary" icon={History} disabled={!customer} onClick={() => nav(`/customers/${customerId}`)}>View History</Button>
            </div>

            {customer ? (
              <div className="rounded-lg border border-line bg-canvas/40 p-3">
                <div className="flex items-start gap-2.5">
                  <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-brand-700 text-[12px] font-semibold text-white">{initials(customer.name)}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13.5px] font-semibold text-ink">{customer.name}</p>
                    <p className="truncate text-[11.5px] text-muted">{customer.type} · {customer.location}</p>
                  </div>
                  <Badge tone={customer.active ? 'green' : 'neutral'}>{customer.active ? 'Active' : 'Inactive'}</Badge>
                </div>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  <div className="flex flex-col gap-1.5 text-[12px] text-muted">
                    <span className="flex items-center gap-1.5"><Phone size={13} className="shrink-0" /> {customer.mobile}</span>
                    <span className="flex items-center gap-1.5"><User size={13} className="shrink-0" /> {customer.contactPerson}</span>
                    <span className="flex items-center gap-1.5"><Building2 size={13} className="shrink-0" /> GST: {customer.gstin || '—'}</span>
                  </div>
                  <div className="text-[12px] sm:text-right">
                    <p className="text-muted">Credit Limit: <b className="tabular text-ink">{inr(customer.creditLimit)}</b></p>
                    <p className="mt-1.5 text-muted">Outstanding: <b className={cn('tabular', outstanding > 0 ? 'text-orange-600' : 'text-emerald-600')}>{inr(outstanding)}</b></p>
                  </div>
                </div>
              </div>
            ) : (
              <p className="rounded-lg border border-dashed border-line px-3 py-6 text-center text-[12.5px] text-subtle">
                Pick a customer to load their rates and history.
              </p>
            )}
          </div>
        </Panel>

        <Panel className="xl:col-span-5" title="Order Information">
          <div className="grid gap-3 p-4 sm:grid-cols-2">
            <Field label="Order Date" required>
              {(id) => <Input id={id} type="date" value={orderDate} onChange={(e) => setOrderDate(e.target.value)} />}
            </Field>
            <Field label="Delivery Date" required hint={weekday(deliveryDate)}>
              {(id) => <Input id={id} type="date" value={deliveryDate} min={orderDate} onChange={(e) => setDeliveryDate(e.target.value)} />}
            </Field>
            <Field label="Order Type">
              {(id) => (
                <Select id={id} value={orderType} onChange={(e) => setOrderType(e.target.value as typeof orderType)}
                  options={[{ value: 'Regular', label: 'Regular Order' }, { value: 'Urgent', label: 'Urgent Order' }, { value: 'Top-up', label: 'Top-up Order' }]} />
              )}
            </Field>
            <Field label="Reference (Optional)">
              {(id) => <Input id={id} value={reference} onChange={(e) => setReference(e.target.value)} placeholder="e.g. PO Number" />}
            </Field>
            <div className="sm:col-span-2">
              <Field label="Special Instructions">
                {(id) => <Textarea id={id} rows={3} value={instructions} onChange={(e) => setInstructions(e.target.value)} placeholder="Any special instructions for this order…" />}
              </Field>
            </div>
          </div>
        </Panel>

        <div className="flex flex-col gap-4 xl:col-span-3">
          <ShortcutCard
            icon={ClipboardList} tone="bg-brand-50 text-brand-700" title="Previous Order"
            line1="Load items from last order"
            line2={prevOrder ? `${prevOrder.orderNo} · ${fmtDate(prevOrder.deliveryDate)} · ${prevOrder.lines.length} items` : 'No previous order yet.'}
            action={<Button variant="secondary" size="sm" disabled={!prevOrder} onClick={loadPrevious} className="w-full">Load Previous Order</Button>}
          />
          <ShortcutCard
            icon={Star} tone="bg-amber-50 text-amber-600" title="Favourite Items"
            line1="Add frequently ordered items"
            line2="Add customer's most ordered items."
            action={<Button variant="secondary" size="sm" disabled={!customer} onClick={addFavourites} className="w-full">View Favourite Items</Button>}
          />
        </div>
      </div>

      {!customer ? (
        <div className="rounded-card border border-line bg-white shadow-card">
          <EmptyState icon={ShoppingBasket} title="Choose a customer to start" description="Their price list and order history will appear here." />
        </div>
      ) : (
        <>
          {/* --------------------------------------------- category + search */}
          <div className="flex flex-col gap-2 rounded-card border border-line bg-white p-3 shadow-card lg:flex-row lg:items-center lg:justify-between">
            <div className="scrollbar-thin flex gap-1.5 overflow-x-auto">
              {[ALL, ...CATEGORIES].map((c) => (
                <button
                  key={c}
                  onClick={() => setCategory(c)}
                  className={cn(
                    'flex shrink-0 items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[12.5px] font-medium whitespace-nowrap',
                    category === c ? 'border-brand-700 bg-brand-50 text-brand-800' : 'border-line bg-white text-muted hover:text-ink',
                  )}
                >
                  <span>{c === ALL ? '🧾' : CATEGORY_EMOJI[c as Category]}</span>
                  {c}
                </button>
              ))}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <SearchInput value={search} onChange={setSearch} placeholder="Search items by name or code…" className="w-56" />
              <Button variant={onlyFilled ? 'primary' : 'secondary'} icon={Filter} onClick={() => setOnlyFilled((v) => !v)}>Filter</Button>
            </div>
          </div>

          {/* ------------------------------------------------- line editor */}
          <div className="rounded-card border border-line bg-white shadow-card">
            <div className="scrollbar-thin overflow-x-auto">
              <table className="w-full border-collapse text-[12.5px]">
                <thead>
                  <tr className="border-b border-line bg-canvas/70 text-[11px] font-semibold tracking-wide text-subtle uppercase">
                    <th className="w-10 px-3 py-2.5 text-left">#</th>
                    {['Item Code', 'Item Name', 'Category', 'Unit'].map((h) => <th key={h} className="px-3 py-2.5 text-left whitespace-nowrap">{h}</th>)}
                    <th className="px-3 py-2.5 text-right whitespace-nowrap">Last Order Qty</th>
                    <th className="w-40 px-3 py-2.5 text-right whitespace-nowrap">Current Qty</th>
                    <th className="px-3 py-2.5 text-right whitespace-nowrap">Rate (₹)</th>
                    <th className="px-3 py-2.5 text-right whitespace-nowrap">Amount (₹)</th>
                    <th className="px-3 py-2.5 text-left">Remarks</th>
                    <th className="w-14 px-3 py-2.5 text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((item, idx) => {
                    const q = basket.quantities[item.id] ?? null;
                    const rate = rateFor(item.id);
                    const fav = basket.favByItemId.get(item.id);
                    return (
                      <tr key={item.id} className="border-b border-line last:border-0 hover:bg-brand-50/25">
                        <td className="tabular px-3 py-2 text-subtle">{idx + 1}</td>
                        <td className="px-3 py-2 whitespace-nowrap text-muted">{item.code}</td>
                        <td className="px-3 py-2 font-medium whitespace-nowrap text-ink">
                          <span className="mr-1.5">{itemEmoji(item.name, item.category)}</span>{item.name}
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap text-muted">{item.category}</td>
                        <td className="px-3 py-2 text-muted">{item.unit}</td>
                        <td className="tabular px-3 py-2 text-right text-muted">{fav?.lastQty != null ? fmtQty(fav.lastQty, item.unit) : '—'}</td>
                        <td className="px-3 py-2">
                          <QtyInput value={q} unit={item.unit} onChange={(v) => basket.setQty(item.id, v)} size="sm" aria-label={`${item.name} quantity`} />
                        </td>
                        <td className="tabular px-3 py-2 text-right text-muted">{rate.toFixed(2)}</td>
                        <td className="tabular px-3 py-2 text-right font-medium text-ink">{q ? (q * rate).toFixed(2) : '—'}</td>
                        <td className="px-3 py-2">
                          <Input
                            value={remarks[item.id] ?? ''}
                            onChange={(e) => setRemarks((r) => ({ ...r, [item.id]: e.target.value }))}
                            placeholder="—"
                            className="h-7 w-36 text-[12px]"
                          />
                        </td>
                        <td className="px-3 py-2 text-right">
                          <button onClick={() => removeRow(item.id)} aria-label={`Remove ${item.name}`} className="rounded p-1.5 text-subtle hover:bg-red-50 hover:text-red-600">
                            <Trash2 size={15} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                  {rows.length === 0 && (
                    <tr>
                      <td colSpan={11}>
                        <EmptyState
                          icon={rowIds.length ? Search : ShoppingBasket}
                          title={rowIds.length ? 'No rows match this filter' : 'No items on this order yet'}
                          description={rowIds.length ? 'Clear the search or category filter.' : 'Add items, load the previous order, or pull in the favourites.'}
                          className="py-10"
                        />
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-3">
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="primary" icon={Plus} onClick={() => setAddOpen(true)}>Add Item</Button>
                <Button variant="secondary" icon={Star} onClick={addFavourites}>Add from Favourite</Button>
                <Menu
                  items={[
                    { key: 'last', label: 'Set every row to its last order qty', onClick: () => { rowIds.forEach((id) => basket.setQty(id, basket.favByItemId.get(id)?.lastQty ?? null)); toast({ tone: 'success', title: 'Quantities reset to last order' }); } },
                    { key: 'clear', label: 'Clear all quantities', onClick: () => { rowIds.forEach((id) => basket.setQty(id, null)); toast({ tone: 'success', title: 'Quantities cleared' }); } },
                    { key: 'remove', label: 'Remove empty rows', onClick: () => setRowIds((ids) => ids.filter((id) => (basket.quantities[id] ?? 0) > 0)) },
                  ]}
                  trigger={(open) => <Button variant="secondary" icon={Layers} onClick={open}>Bulk Update</Button>}
                />
              </div>
              <div className="flex items-center gap-5 text-[13px]">
                <span className="text-muted">Total Items: <b className="tabular text-ink">{basket.totalItems}</b></span>
                <span className="text-muted">Total Amount: <b className="tabular text-ink">{inr(basket.totalAmount)}</b></span>
              </div>
            </div>
          </div>

          {/* ------------------------------------ suggestions + order summary */}
          <div className="grid gap-4 xl:grid-cols-3">
            <Panel className="xl:col-span-2" title="Suggested Items for This Customer">
              <div className="grid gap-2 p-4 sm:grid-cols-2 lg:grid-cols-4">
                {suggestions.map((f) => (
                  <div key={f.item.id} className="flex items-center gap-2 rounded-lg border border-line px-3 py-2">
                    <span className="text-[16px]">{itemEmoji(f.item.name, f.item.category)}</span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[12.5px] font-medium text-ink">{f.item.name}</p>
                      <p className="truncate text-[11px] text-muted">{f.item.category}</p>
                    </div>
                    <Button size="xs" variant="subtle" icon={Plus} onClick={() => addRow(f.item.id, f.lastQty)}>Add</Button>
                  </div>
                ))}
                {suggestions.length === 0 && <p className="py-3 text-[12.5px] text-subtle">Everything they usually order is already on this order.</p>}
              </div>
            </Panel>

            <Panel title="Order Summary">
              <div className="flex flex-col divide-y divide-line px-4">
                <SummaryRow label="Items" value={String(basket.totalItems)} />
                <SummaryRow label="Total Quantity" value={String(Math.round(totalQty * 100) / 100)} />
                <SummaryRow label="Estimated Value" value={inr(basket.totalAmount)} strong />
              </div>
            </Panel>
          </div>
        </>
      )}

      <RepeatOrderModal
        open={repeatOpen}
        onClose={() => setRepeatOpen(false)}
        previous={prevOrder}
        onApply={(qtys) => {
          Object.entries(qtys).forEach(([itemId, q]) => addRow(itemId, q));
          setRepeatOpen(false);
          toast({ tone: 'success', title: 'Previous order loaded', description: 'Review quantities and submit.' });
        }}
      />

      <AddItemModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        items={activeItems}
        addedIds={new Set(rowIds)}
        rateFor={rateFor}
        onAdd={(id) => addRow(id, basket.favByItemId.get(id)?.lastQty ?? null)}
      />
    </div>
  );
}

/* ------------------------------------------------------------- small parts */

function Panel({ title, action, children, className }: { title: React.ReactNode; action?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('flex flex-col rounded-card border border-line bg-white shadow-card', className)}>
      <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-2.5">
        <h3 className="truncate text-[13.5px] font-semibold text-ink">{title}</h3>
        {action}
      </div>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

function ShortcutCard({ icon: Icon, tone, title, line1, line2, action }: {
  icon: typeof Star; tone: string; title: string; line1: string; line2: string; action: React.ReactNode;
}) {
  return (
    <div className="rounded-card border border-line bg-white p-3.5 shadow-card">
      <div className="flex items-start gap-2.5">
        <span className={cn('grid size-9 shrink-0 place-items-center rounded-lg', tone)}><Icon size={17} /></span>
        <div className="min-w-0">
          <p className="text-[13px] font-semibold text-ink">{title}</p>
          <p className="text-[12px] text-muted">{line1}</p>
          <p className="mt-0.5 text-[11.5px] text-subtle">{line2}</p>
        </div>
      </div>
      <div className="mt-3">{action}</div>
    </div>
  );
}

function SummaryRow({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-2 py-2.5">
      <p className="text-[12.5px] text-muted">{label}</p>
      <p className={cn('tabular text-[13px] font-semibold', strong ? 'text-brand-800' : 'text-ink')}>{value}</p>
    </div>
  );
}
