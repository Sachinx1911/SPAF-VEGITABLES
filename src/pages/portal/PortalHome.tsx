import { useNavigate } from 'react-router';
import { ArrowRight, CalendarDays, Check, ChevronRight, ClipboardList, Clock, ListChecks, Truck, Wallet } from 'lucide-react';
import { useCurrentUser, useDb } from '../../store/useStore';
import { todayISO, nowISO } from '../../lib/clock';
import { addDays, fmtDate, inr, parseISO, weekday } from '../../lib/format';
import { customerFavourites, cutoffMoment, editableOrder, nextDeliveryDate } from '../../domain/orders';
import { customerOutstanding, invoiceViews } from '../../domain/finance';
import { cn } from '../../lib/cn';
import { ProduceArt } from './ProduceArt';

const longDate = (iso: string) =>
  parseISO(iso).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

/**
 * The customer's whole day on one screen: today's order first, four things they
 * actually tap, then their saved regular order. Everything else lives in the tab bar.
 */
export function PortalHomePage() {
  const db = useDb();
  const user = useCurrentUser()!;
  const nav = useNavigate();
  const customer = db.customers.find((c) => c.id === user.customerId)!;
  const today = todayISO();
  const now = nowISO();

  const cutoff = db.settings.orderCutoffTime;
  const deliveryDate = nextDeliveryDate(today, now, cutoff);
  // A small-hours cutoff closes on the delivery day itself, so "order by 03:00"
  // can mean tonight, tomorrow morning, or later — say which.
  const closesOn = cutoffMoment(deliveryDate, cutoff).slice(0, 10);
  const closesLabel = closesOn === today ? 'today' : closesOn === addDays(today, 1) ? 'tomorrow' : weekday(closesOn);
  const pending = editableOrder(db, customer.id, deliveryDate);
  const arrivingToday = db.orders.find((o) => o.customerId === customer.id && o.deliveryDate === today);
  const templates = db.standingTemplates.filter((t) => t.customerId === customer.id);
  const outstanding = customerOutstanding(db, today).get(customer.id) ?? 0;
  const overdue = invoiceViews(db, today).filter((i) => i.customerId === customer.id && i.derivedStatus === 'Overdue').length;

  // What "place today's order" would start from, when nothing is in yet.
  const regularCount = customerFavourites(db, customer.id, deliveryDate).filter((f) => f.timesOrdered > 0).length;
  const itemCount = pending ? pending.lines.length : regularCount;

  const hour = new Date(now).getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  return (
    <div className="-mx-4 -mt-3 flex flex-col bg-gradient-to-b from-fresh-50/70 via-white to-white">
      {/* -------------------------------------------------------------- hero */}
      <div className="relative px-4 pt-4 pb-3">
        <div className="relative z-10 max-w-[62%]">
          <h1 className="text-[28px] leading-[1.12] font-bold tracking-[-0.02em] text-ink">
            {greeting},<br />{user.name.split(' ')[0]}!
          </h1>
          <p className="mt-2 text-[12.5px] text-muted">{longDate(today)}</p>
        </div>

        <div className="pointer-events-none absolute top-1 right-0 w-[42%] text-center">
          <p className="font-serif text-[15px] leading-[1.15] text-brand-700 italic">Fresh<br />Food<br />Daily</p>
          <ProduceArt className="mt-1 h-24 w-full" fallbackClass="text-[22px]" />
        </div>
      </div>

      {/* ------------------------------------------------------ today's order */}
      <div className="px-4">
        <div className="rounded-2xl border border-line bg-white p-3.5 shadow-pop">
          <div className="flex items-center gap-3">
            <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-fresh-50 text-brand-700">
              <CalendarDays size={21} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[15.5px] font-semibold text-ink">Today's Order</p>
              <p className="truncate text-[12.5px] text-muted">
                {itemCount} items{pending ? ` · ${pending.orderNo}` : ' · from your regular list'}
              </p>
            </div>
            <span className={cn('shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold',
              pending ? 'bg-emerald-50 text-emerald-700' : 'bg-fresh-50 text-brand-700')}>
              {pending ? pending.status : 'Ready to order'}
            </span>
          </div>

          <button
            onClick={() => nav('/portal/order')}
            className="mt-3 flex w-full items-center gap-2 rounded-xl bg-brand-800 px-4 py-3.5 text-[15px] font-semibold text-white transition-transform active:scale-[0.99]"
          >
            <Check size={18} strokeWidth={2.8} />
            <span className="flex-1 text-center">{pending ? 'Add / Edit Items' : "Place Today's Order"}</span>
            <ArrowRight size={18} />
          </button>

          <p className="mt-2 text-center text-[11.5px] text-subtle">
            Delivery {weekday(deliveryDate)}, {fmtDate(deliveryDate)} · order by {cutoff} {closesLabel}
          </p>
        </div>
      </div>

      {/* ------------------------------------------------------- quick tiles */}
      <div className="grid grid-cols-4 gap-2.5 px-4 pt-4">
        <Tile icon={Clock} label={<>Repeat<br />Order</>} onClick={() => nav('/portal/order?repeat=1')} />
        <Tile icon={ClipboardList} label="My Orders" onClick={() => nav('/portal/orders')} />
        <Tile icon={Truck} label={<>Today's<br />Delivery</>} badge={arrivingToday ? '1' : undefined} onClick={() => nav('/portal/orders')} />
        <Tile
          icon={Wallet}
          label="Outstanding"
          sub={outstanding > 0 ? inr(outstanding) : undefined}
          badge={overdue ? String(overdue) : undefined}
          onClick={() => nav('/portal/account')}
        />
      </div>

      {/* ------------------------------------------------------ regular order */}
      <div className="px-4 pt-5">
        <div className="mb-2.5 flex items-center justify-between">
          <h2 className="text-[17px] font-semibold text-ink">Your Regular Order</h2>
          <button onClick={() => nav('/portal/order')} className="text-[12.5px] font-medium text-brand-700">View / Edit</button>
        </div>

        {templates.length > 0 ? (
          <div className="flex flex-col gap-2">
            {templates.map((t) => (
              <button
                key={t.id}
                onClick={() => nav(`/portal/order?template=${t.id}`)}
                className="flex items-center gap-3 rounded-2xl bg-fresh-50 p-3.5 text-left active:bg-brand-100"
              >
                <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-white text-brand-700"><ListChecks size={20} /></span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[15px] font-semibold text-ink">{t.name}</p>
                  <p className="text-[12.5px] text-muted">{t.lines.length} items · One tap order</p>
                </div>
                <ChevronRight size={20} className="shrink-0 text-subtle" />
              </button>
            ))}
          </div>
        ) : (
          <button onClick={() => nav('/portal/order')} className="flex w-full items-center gap-3 rounded-2xl border border-dashed border-brand-300 bg-fresh-50/60 p-3.5 text-left">
            <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-white text-brand-700"><ListChecks size={20} /></span>
            <div className="min-w-0 flex-1">
              <p className="text-[15px] font-semibold text-ink">Save a regular order</p>
              <p className="text-[12.5px] text-muted">Place one order, then save it for one-tap reuse.</p>
            </div>
            <ChevronRight size={20} className="shrink-0 text-subtle" />
          </button>
        )}
      </div>

      {/* ------------------------------------------------------------ banner */}
      <div className="px-4 pt-4 pb-2">
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-fresh-100 via-brand-50 to-fresh-100 px-5 py-7">
          <p className="relative z-10 max-w-[55%] font-serif text-[21px] leading-tight text-brand-800 italic">Same Freshness<br />Same Trust</p>
          <ProduceArt className="pointer-events-none absolute right-2 -bottom-1 h-[88%] w-[46%]" fallbackClass="text-[28px]" />
        </div>
      </div>
    </div>
  );
}

function Tile({ icon: Icon, label, sub, badge, onClick }: {
  icon: typeof Clock; label: React.ReactNode; sub?: string; badge?: string; onClick: () => void;
}) {
  return (
    <button onClick={onClick} className="relative flex flex-col items-center gap-1.5 rounded-2xl border border-line bg-white px-1 py-3 text-center shadow-card active:bg-canvas">
      <span className="grid size-10 place-items-center rounded-full bg-fresh-50 text-brand-700"><Icon size={19} /></span>
      <span className="text-[11px] leading-[1.25] font-medium text-ink">{label}</span>
      {sub && <span className="tabular text-[11px] leading-none font-bold text-red-600">{sub}</span>}
      {badge && (
        <span className="absolute top-1.5 right-1.5 grid min-w-[16px] place-items-center rounded-full bg-red-500 px-1 text-[9.5px] font-bold text-white">{badge}</span>
      )}
    </button>
  );
}
