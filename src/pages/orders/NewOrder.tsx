import { useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { ArrowLeft, Repeat, Search, ShoppingBasket } from 'lucide-react';
import { PageHeader, Card, CardBody } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Select, SearchInput, QtyInput } from '../../components/ui/Field';
import { Tabs } from '../../components/ui/Tabs';
import { Badge } from '../../components/ui/Badge';
import { EmptyState } from '../../components/ui/States';
import { useConfirm } from '../../components/ui/ConfirmDialog';
import { useToast } from '../../components/ui/Toast';
import { useCurrentUser, useDb } from '../../store/useStore';
import { createOrder } from '../../store/orderActions';
import { CATEGORIES } from '../../types/models';
import { nextDeliveryDate, previousOrder } from '../../domain/orders';
import { todayISO, nowISO } from '../../lib/clock';
import { fmtDate, inr, qty as fmtQty, weekday } from '../../lib/format';
import { useOrderBasket } from './useOrderBasket';
import { RepeatOrderModal } from './RepeatOrderModal';

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
  const [deliveryDate, setDeliveryDate] = useState(() => nextDeliveryDate(today, nowISO(), db.settings.orderCutoffTime));
  const [category, setCategory] = useState<string>(CATEGORIES[0]);
  const [search, setSearch] = useState('');
  const [repeatOpen, setRepeatOpen] = useState(false);

  const customer = db.customers.find((c) => c.id === customerId);
  const basket = useOrderBasket(db, customerId, deliveryDate);
  const prevOrder = customerId ? previousOrder(db, customerId) : null;

  const rowsForCategory = useMemo(() => {
    const term = search.trim().toLowerCase();
    const favs = basket.favouritesByCategory.get(category) ?? [];
    const favIds = new Set(favs.map((f) => f.item.id));
    const rest = (basket.catalogByCategory.get(category) ?? []).filter((i) => !favIds.has(i.id));
    const combined = [
      ...favs.map((f) => ({ item: f.item, lastQty: f.lastQty })),
      ...rest.map((i) => ({ item: i, lastQty: null as number | null })),
    ];
    return term ? combined.filter((r) => r.item.name.toLowerCase().includes(term)) : combined;
  }, [basket.favouritesByCategory, basket.catalogByCategory, category, search]);

  const submit = async () => {
    if (!customer) return toast({ tone: 'error', title: 'Choose a customer first' });
    if (!basket.lines.length) return toast({ tone: 'error', title: 'Add at least one item' });
    const ok = await confirm({
      title: 'Submit this order?', confirmLabel: 'Submit order',
      description: `${customer.name} · delivery ${fmtDate(deliveryDate)}`,
      details: [{ label: 'Items', value: basket.totalItems }, { label: 'Total amount', value: inr(basket.totalAmount) }],
    });
    if (!ok) return;
    const order = createOrder(
      { customerId, deliveryDate, source: 'Staff', lines: basket.lines.map((l) => ({ itemId: l.itemId, unit: l.unit, qty: l.qty, rate: l.rate, remarks: l.remarks })) },
      user.id,
    );
    toast({ tone: 'success', title: 'Order submitted', description: order.orderNo });
    nav(`/orders/${order.id}`);
  };

  return (
    <div className="pb-16">
      <PageHeader
        title="New Order"
        description="Pick a customer — their prices, previous quantities and favourite items load automatically."
        actions={<Button variant="secondary" icon={ArrowLeft} onClick={() => nav('/orders')}>Back</Button>}
      />

      <Card className="mb-4">
        <CardBody className="grid gap-3 sm:grid-cols-3">
          <div>
            <label className="mb-1.5 block text-[12.5px] font-medium text-ink">Customer</label>
            <Select value={customerId} onChange={(e) => { setCustomerId(e.target.value); basket.clear(); }} placeholder="Select customer…"
              options={db.customers.filter((c) => c.active).map((c) => ({ value: c.id, label: `${c.name} (${c.code})` }))} />
          </div>
          <div>
            <label className="mb-1.5 block text-[12.5px] font-medium text-ink">Delivery date</label>
            <input type="date" value={deliveryDate} min={today} onChange={(e) => setDeliveryDate(e.target.value)} className="h-9 w-full rounded-lg border border-line px-3 text-[13px]" />
            <p className="mt-1 text-[11px] text-subtle">{weekday(deliveryDate)}</p>
          </div>
          <div className="flex items-end">
            {customer && prevOrder && (
              <Button variant="secondary" icon={Repeat} onClick={() => setRepeatOpen(true)} className="w-full">Repeat Previous Order</Button>
            )}
          </div>
        </CardBody>
      </Card>

      {!customer ? (
        <Card><EmptyState icon={ShoppingBasket} title="Choose a customer to start" description="Their price list and order history will appear here." /></Card>
      ) : (
        <>
          <Card className="mb-3">
            <CardBody className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <Tabs items={CATEGORIES.map((c) => ({ key: c, label: c, count: (basket.favouritesByCategory.get(c) ?? []).length || undefined }))} value={category} onChange={setCategory} />
              <SearchInput value={search} onChange={setSearch} placeholder="Search item…" className="w-56" />
            </CardBody>
          </Card>

          <Card>
            <div className="scrollbar-thin overflow-x-auto">
              <table className="w-full border-collapse text-[13px]">
                <thead>
                  <tr className="border-b border-line bg-canvas/70 text-[11.5px] font-semibold tracking-wide text-muted uppercase">
                    <th className="px-3 py-2 text-left">Item</th>
                    <th className="px-3 py-2 text-right">Previous Qty</th>
                    <th className="w-44 px-3 py-2 text-right">Current Qty</th>
                    <th className="px-3 py-2 text-right">Price</th>
                    <th className="px-3 py-2 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {rowsForCategory.map(({ item, lastQty }) => {
                    const q = basket.quantities[item.id] ?? null;
                    const rate = db.prices.find((p) => p.customerId === customerId && p.itemId === item.id && !p.effectiveTo)?.price ?? item.defaultSellingPrice;
                    return (
                      <tr key={item.id} className="border-b border-line last:border-0 hover:bg-brand-50/30">
                        <td className="px-3 py-2 font-medium text-ink">{item.name} <Badge tone="neutral" className="ml-1">{item.unit}</Badge></td>
                        <td className="px-3 py-2 text-right text-muted">{lastQty != null ? fmtQty(lastQty, item.unit) : '—'}</td>
                        <td className="px-3 py-2">
                          <QtyInput value={q} unit={item.unit} onChange={(v) => basket.setQty(item.id, v)} size="sm" aria-label={`${item.name} quantity`} />
                        </td>
                        <td className="px-3 py-2 text-right tabular text-muted">{inr(rate, true)}</td>
                        <td className="px-3 py-2 text-right tabular font-medium">{q ? inr(q * rate) : '—'}</td>
                      </tr>
                    );
                  })}
                  {rowsForCategory.length === 0 && (
                    <tr><td colSpan={5}><EmptyState icon={Search} title="No items match" className="py-8" /></td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>

          <div className="no-print fixed inset-x-0 bottom-0 z-20 border-t border-line bg-white/95 px-4 py-3 backdrop-blur md:left-60">
            <div className="mx-auto flex max-w-6xl items-center justify-between gap-4">
              <div className="flex gap-5 text-[13px]">
                <span><b className="tabular">{basket.totalItems}</b> <span className="text-muted">items</span></span>
                <span><b className="tabular">{inr(basket.totalAmount)}</b> <span className="text-muted">total</span></span>
              </div>
              <Button variant="primary" size="lg" onClick={submit}>Submit Order</Button>
            </div>
          </div>
        </>
      )}

      <RepeatOrderModal
        open={repeatOpen}
        onClose={() => setRepeatOpen(false)}
        previous={prevOrder}
        onApply={(qtys) => {
          Object.entries(qtys).forEach(([itemId, q]) => basket.setQty(itemId, q));
          setRepeatOpen(false);
          toast({ tone: 'success', title: 'Previous order loaded', description: 'Review quantities and submit.' });
        }}
      />
    </div>
  );
}
