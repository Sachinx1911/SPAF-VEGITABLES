import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { CalendarDays, CheckCircle2, ChevronRight, Clock, ListFilter, Search, Truck, X } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Field';
import { EmptyState } from '../../components/ui/States';
import { useCurrentUser, useDb } from '../../store/useStore';
import type { Order } from '../../types/models';
import { todayISO } from '../../lib/clock';
import { fmtTime, inr, parseISO } from '../../lib/format';
import { itemEmoji } from '../orders/orderUi';
import { cn } from '../../lib/cn';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** "Mon, 14 Sep 2026" — the locale formatter gives "Sept" and a stray comma. */
const longish = (d: Date) => `${DAYS[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;

const TABS = [
  { key: 'all', label: 'All Orders', icon: ListFilter },
  { key: 'upcoming', label: 'Upcoming', icon: Truck },
  { key: 'past', label: 'Past Orders', icon: Clock },
] as const;

type TabKey = (typeof TABS)[number]['key'];

/** What the customer should read on the pill, derived from the real order state. */
function statusOf(o: Order): { label: string; tone: 'blue' | 'green' | 'amber' | 'red' } {
  if (o.status === 'Rejected') return { label: 'Rejected', tone: 'red' };
  if (o.deliveryStatus === 'Delivered') return { label: 'Delivered', tone: 'green' };
  if (o.deliveryStatus === 'Partial') return { label: 'Part delivered', tone: 'amber' };
  if (o.deliveryStatus === 'Failed') return { label: 'Failed', tone: 'red' };
  if (o.deliveryStatus === 'Dispatched' || o.deliveryStatus === 'In Transit') return { label: 'Out for delivery', tone: 'blue' };
  if (o.packingStatus === 'Packed' || o.deliveryStatus === 'Ready') return { label: 'Packed', tone: 'blue' };
  if (o.status === 'Submitted' || o.status === 'Late') return { label: 'Awaiting approval', tone: 'amber' };
  return { label: 'Preparing', tone: 'blue' };
}

const TONE = {
  blue: 'bg-blue-50 text-blue-700',
  green: 'bg-emerald-50 text-emerald-700',
  amber: 'bg-amber-50 text-amber-700',
  red: 'bg-red-50 text-red-700',
};

export function PortalOrdersPage() {
  const db = useDb();
  const user = useCurrentUser()!;
  const nav = useNavigate();
  const today = todayISO();

  const [tab, setTab] = useState<TabKey>('all');
  const [searchOpen, setSearchOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);

  const itemById = useMemo(() => new Map(db.items.map((i) => [i.id, i])), [db.items]);
  const routeById = useMemo(() => new Map(db.routes.map((r) => [r.id, r])), [db.routes]);
  const customer = db.customers.find((c) => c.id === user.customerId);

  const linesBy = useMemo(() => {
    const m = new Map<string, { itemId: string; qty: number; rate: number; unit: string }[]>();
    for (const l of db.orderItems) {
      const list = m.get(l.orderId) ?? [];
      list.push({ itemId: l.itemId, qty: l.qty.ordered ?? 0, rate: l.rate, unit: l.unit });
      m.set(l.orderId, list);
    }
    return m;
  }, [db.orderItems]);

  const orders = useMemo(() => {
    const term = search.trim().toLowerCase();
    return db.orders
      .filter((o) => o.customerId === user.customerId)
      .filter((o) => (tab === 'upcoming' ? o.deliveryDate >= today && o.deliveryStatus !== 'Delivered'
        : tab === 'past' ? o.deliveryDate < today || o.deliveryStatus === 'Delivered'
        : true))
      .filter((o) => {
        if (!term) return true;
        if (o.orderNo.toLowerCase().includes(term)) return true;
        return (linesBy.get(o.id) ?? []).some((l) => (itemById.get(l.itemId)?.name ?? '').toLowerCase().includes(term));
      })
      .sort((a, b) => (a.deliveryDate < b.deliveryDate ? 1 : a.deliveryDate > b.deliveryDate ? -1 : a.receivedAt < b.receivedAt ? 1 : -1));
  }, [db.orders, user.customerId, tab, today, search, linesBy, itemById]);

  return (
    <div className="flex flex-col gap-4">
      {/* -------------------------------------------------------------- head */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-[30px] leading-none font-bold tracking-[-0.02em] text-ink">My Orders</h1>
          <p className="mt-2 text-[13.5px] text-muted">Track your past and upcoming orders</p>
        </div>
        <button
          onClick={() => { setSearchOpen((v) => !v); if (searchOpen) setSearch(''); }}
          aria-label="Search orders"
          className="grid size-11 shrink-0 place-items-center rounded-full bg-fresh-50 text-brand-800"
        >
          {searchOpen ? <X size={20} /> : <Search size={20} />}
        </button>
      </div>

      {searchOpen && (
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Order number or item name…" leading={<Search size={16} />} autoFocus />
      )}

      {/* -------------------------------------------------------- segmented */}
      <div className="flex gap-1 rounded-2xl border border-line bg-white p-1">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={cn('flex flex-1 items-center justify-center gap-1.5 rounded-xl px-2 py-2.5 text-[13px] font-semibold whitespace-nowrap transition-colors',
              tab === t.key ? 'bg-brand-800 text-white' : 'text-muted')}
          >
            <t.icon size={15} />
            {t.label}
          </button>
        ))}
      </div>

      {/* ------------------------------------------------------------- cards */}
      {orders.length === 0 ? (
        <EmptyState
          title={search ? 'No orders match' : tab === 'upcoming' ? 'Nothing upcoming' : 'No orders yet'}
          description={search ? 'Try another order number or item.' : 'Place your first order to see it here.'}
          action={<Button size="sm" variant="primary" onClick={() => nav('/portal/order')} className="mt-1">Place order</Button>}
        />
      ) : (
        orders.map((o) => {
          const lines = linesBy.get(o.id) ?? [];
          const amount = lines.reduce((s, l) => s + l.qty * l.rate, 0);
          const st = statusOf(o);
          const d = parseISO(o.deliveryDate);
          const challan = db.challans.find((c) => c.orderId === o.id);
          const route = customer ? routeById.get(customer.routeId) : null;
          const done = o.deliveryStatus === 'Delivered' || o.deliveryStatus === 'Partial';
          const open = expanded === o.id;

          return (
            <div key={o.id} className="overflow-hidden rounded-2xl border border-line bg-white">
              <button onClick={() => setExpanded(open ? null : o.id)} className="flex w-full items-start gap-3 p-3.5 text-left">
                <div className="grid w-14 shrink-0 place-items-center rounded-xl bg-fresh-50 py-2">
                  <span className="text-[10.5px] font-semibold tracking-wide text-brand-700 uppercase">{DAYS[d.getDay()]}</span>
                  <span className="tabular text-[22px] leading-none font-bold text-ink">{d.getDate()}</span>
                  <span className="text-[10.5px] font-semibold tracking-wide text-brand-700 uppercase">{MONTHS[d.getMonth()]}</span>
                </div>

                <div className="min-w-0 flex-1">
                  <p className="truncate text-[15px] font-bold text-ink">Order #{o.orderNo}</p>
                  <p className="tabular mt-0.5 text-[12.5px] text-muted">{lines.length} items · {inr(amount)}</p>

                  <div className="mt-2 flex items-center gap-1.5">
                    {lines.slice(0, 5).map((l) => {
                      const it = itemById.get(l.itemId);
                      return (
                        <span key={l.itemId} className="grid size-8 place-items-center rounded-lg bg-canvas text-[17px]">
                          {it ? itemEmoji(it.name, it.category) : '🥬'}
                        </span>
                      );
                    })}
                    {lines.length > 5 && (
                      <span className="tabular grid h-8 min-w-[34px] place-items-center rounded-lg bg-canvas px-1.5 text-[12px] font-semibold text-muted">
                        +{lines.length - 5}
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex shrink-0 flex-col items-end gap-2">
                  <span className={cn('flex items-center gap-1 rounded-full px-2.5 py-1 text-[11.5px] font-semibold', TONE[st.tone])}>
                    {st.tone === 'green' ? <CheckCircle2 size={13} /> : <Truck size={13} />}
                    {st.label}
                  </span>
                  <ChevronRight size={18} className={cn('text-subtle transition-transform', open && 'rotate-90')} />
                </div>
              </button>

              <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-line px-3.5 py-2.5 text-[12px] text-muted">
                <span className="flex items-center gap-1.5">
                  <CalendarDays size={13} className="shrink-0" />
                  {done ? 'Delivered' : 'Delivery'}: {longish(d)}
                </span>
                <span className="flex items-center gap-1.5">
                  <Clock size={13} className="shrink-0" />
                  {done && challan?.deliveredAt
                    ? fmtTime(challan.deliveredAt)
                    : route ? `Expected from ${route.departureTime}` : 'Time to be confirmed'}
                </span>
                {!open && (
                  <button onClick={() => setExpanded(o.id)} className="ml-auto rounded-lg border border-brand-300 px-3 py-1.5 text-[12.5px] font-semibold text-brand-800">
                    View Details
                  </button>
                )}
              </div>

              {open && (
                <div className="border-t border-line bg-canvas/40 px-3.5 py-3">
                  <div className="flex flex-col gap-1.5">
                    {lines.map((l) => {
                      const it = itemById.get(l.itemId);
                      return (
                        <div key={l.itemId} className="flex items-center gap-2.5 text-[12.5px]">
                          <span className="text-[15px]">{it ? itemEmoji(it.name, it.category) : '🥬'}</span>
                          <span className="min-w-0 flex-1 truncate text-ink">{it?.name ?? l.itemId}</span>
                          <span className="tabular shrink-0 text-muted">{l.qty} {l.unit}</span>
                          <span className="tabular w-16 shrink-0 text-right font-medium text-ink">{inr(l.qty * l.rate)}</span>
                        </div>
                      );
                    })}
                  </div>
                  <div className="mt-2.5 flex items-center justify-between border-t border-line pt-2.5 text-[13px]">
                    <span className="font-semibold text-ink">Total</span>
                    <span className="tabular font-bold text-brand-800">{inr(amount)}</span>
                  </div>
                  {challan && (
                    <p className="mt-2 text-[11.5px] text-muted">Challan {challan.challanNo} · vehicle {challan.vehicleNo}</p>
                  )}
                </div>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}
