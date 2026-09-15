import { useNavigate } from 'react-router';
import { CheckCircle2, ChevronRight, Clock, Repeat, ShoppingBasket, Wallet } from 'lucide-react';
import { Card, CardBody } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { StatusBadge } from '../../components/ui/Badge';
import { Alert } from '../../components/ui/Alert';
import { useCurrentUser, useDb } from '../../store/useStore';
import { todayISO, nowISO } from '../../lib/clock';
import { addDays, fmtDate, inr, weekday } from '../../lib/format';
import { isPastCutoff, previousOrder } from '../../domain/orders';
import { customerOutstanding } from '../../domain/finance';

export function PortalHomePage() {
  const db = useDb();
  const user = useCurrentUser()!;
  const nav = useNavigate();
  const customer = db.customers.find((c) => c.id === user.customerId)!;
  const today = todayISO();
  const now = nowISO();

  const upcoming = db.orders.filter((o) => o.customerId === customer.id && o.deliveryDate >= today).sort((a, b) => (a.deliveryDate < b.deliveryDate ? -1 : 1))[0];
  const prev = previousOrder(db, customer.id);
  const outstanding = customerOutstanding(db, today).get(customer.id) ?? 0;
  const pastCutoff = isPastCutoff(now, db.settings.orderCutoffTime);
  const orderableFor = addDays(today, pastCutoff ? 2 : 1);

  const hour = new Date(now).getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-[20px] font-semibold text-ink">{greeting}, {customer.name.split(' ')[0]}</h1>
        <p className="text-[13px] text-muted">{weekday(today)}, {fmtDate(today)}</p>
      </div>

      <Alert tone={pastCutoff ? 'warning' : 'info'} title={pastCutoff ? `Today's cutoff (${db.settings.orderCutoffTime}) has passed` : `Order before ${db.settings.orderCutoffTime} today`}>
        Placing an order now delivers on <b>{weekday(orderableFor)}, {fmtDate(orderableFor)}</b>.
      </Alert>

      <button onClick={() => nav('/portal/order')} className="rounded-card bg-brand-700 p-4 text-left text-white shadow-pop transition-transform active:scale-[0.99]">
        <div className="flex items-center gap-3">
          <div className="grid size-11 shrink-0 place-items-center rounded-xl bg-white/15"><ShoppingBasket size={22} /></div>
          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-semibold">Place today's order</p>
            <p className="text-[12.5px] text-white/75">Your usual items, ready to adjust and send</p>
          </div>
          <ChevronRight size={20} />
        </div>
      </button>

      {prev && (
        <button onClick={() => nav('/portal/order?repeat=1')} className="rounded-card border border-line bg-white p-4 text-left shadow-card transition-colors active:bg-canvas">
          <div className="flex items-center gap-3">
            <div className="grid size-11 shrink-0 place-items-center rounded-xl bg-fresh-50 text-fresh-600"><Repeat size={20} /></div>
            <div className="min-w-0 flex-1">
              <p className="text-[14px] font-semibold text-ink">Repeat last order</p>
              <p className="text-[12.5px] text-muted">{prev.orderNo} · {fmtDate(prev.deliveryDate)}</p>
            </div>
            <ChevronRight size={18} className="text-subtle" />
          </div>
        </button>
      )}

      {upcoming && (
        <Card>
          <CardBody className="flex items-center gap-3">
            <div className="grid size-10 shrink-0 place-items-center rounded-full bg-blue-50 text-blue-600"><Clock size={18} /></div>
            <div className="min-w-0 flex-1">
              <p className="text-[13.5px] font-medium text-ink">{upcoming.orderNo}</p>
              <p className="text-xs text-muted">Delivery {fmtDate(upcoming.deliveryDate)}</p>
            </div>
            <StatusBadge status={upcoming.status} />
          </CardBody>
        </Card>
      )}

      <button onClick={() => nav('/portal/ledger')} className="rounded-card border border-line bg-white p-4 text-left shadow-card">
        <div className="flex items-center gap-3">
          <div className={`grid size-11 shrink-0 place-items-center rounded-xl ${outstanding ? 'bg-orange-50 text-orange-600' : 'bg-emerald-50 text-emerald-600'}`}>
            {outstanding ? <Wallet size={20} /> : <CheckCircle2 size={20} />}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[14px] font-semibold text-ink">{outstanding ? inr(outstanding) : 'No outstanding dues'}</p>
            <p className="text-[12.5px] text-muted">{outstanding ? 'Outstanding balance' : 'You are all settled up'}</p>
          </div>
          <ChevronRight size={18} className="text-subtle" />
        </div>
      </button>

      <Button variant="secondary" size="lg" onClick={() => nav('/portal/orders')}>View order history</Button>
    </div>
  );
}
