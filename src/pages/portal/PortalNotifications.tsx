import { useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router';
import { Bell, CheckCircle2, ChevronRight, Clock, FileText, Package, Truck, XCircle } from 'lucide-react';
import { EmptyState } from '../../components/ui/States';
import { useCurrentUser, useDb, useUi } from '../../store/useStore';
import { deriveCustomerNotifications, type CustomerNotificationTone } from '../../domain/customerNotifications';
import { todayISO, nowISO } from '../../lib/clock';
import { fmtDateTime, relativeTime } from '../../lib/format';
import { cn } from '../../lib/cn';

const TONE: Record<CustomerNotificationTone, { ring: string; icon: typeof Bell }> = {
  green: { ring: 'bg-emerald-50 text-emerald-600', icon: CheckCircle2 },
  blue: { ring: 'bg-blue-50 text-blue-600', icon: Truck },
  amber: { ring: 'bg-amber-50 text-amber-600', icon: Clock },
  red: { ring: 'bg-red-50 text-red-600', icon: XCircle },
  neutral: { ring: 'bg-canvas text-muted', icon: FileText },
};

/** Everything that happened to the customer's orders and bills, newest first. Opening the screen marks it all read. */
export function PortalNotificationsPage() {
  const db = useDb();
  const user = useCurrentUser()!;
  const nav = useNavigate();
  const today = todayISO();
  const now = nowISO();
  const readIds = useUi((s) => s.readNotificationIds);
  const markRead = useUi((s) => s.markRead);

  const items = useMemo(() => (user.customerId ? deriveCustomerNotifications(db, user.customerId, today) : []), [db, user.customerId, today]);
  const unread = useMemo(() => new Set(items.filter((n) => !readIds.includes(n.id)).map((n) => n.id)), [items, readIds]);

  useEffect(() => {
    if (unread.size) markRead([...unread]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items.length]);

  const todayItems = items.filter((n) => n.at.slice(0, 10) === today);
  const earlier = items.filter((n) => n.at.slice(0, 10) !== today);

  const Row = ({ n }: { n: (typeof items)[number] }) => {
    const t = TONE[n.tone];
    const Icon = n.tone === 'blue' && n.title.includes('prepared') ? Package : t.icon;
    return (
      <button onClick={() => nav(n.link)} className="flex w-full items-start gap-3 rounded-2xl border border-line bg-white p-3.5 text-left active:bg-canvas">
        <span className={cn('grid size-10 shrink-0 place-items-center rounded-xl', t.ring)}><Icon size={19} /></span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className="line-clamp-2 min-w-0 flex-1 text-[14px] leading-snug font-semibold text-ink">{n.title}</span>
            {unread.has(n.id) && <span className="size-2 shrink-0 rounded-full bg-brand-600" />}
          </span>
          <span className="mt-0.5 block text-[12.5px] leading-snug text-muted">{n.message}</span>
          <span className="mt-1 block text-[11px] text-subtle" title={fmtDateTime(n.at)}>{relativeTime(n.at, now)}</span>
        </span>
        <ChevronRight size={18} className="mt-2.5 shrink-0 text-subtle" />
      </button>
    );
  };

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-[30px] leading-none font-bold tracking-[-0.02em] text-ink">Updates</h1>
        <p className="mt-2 text-[13.5px] text-muted">Confirmations, deliveries and bills for your orders</p>
      </div>

      {items.length === 0 ? (
        <EmptyState icon={Bell} title="Nothing yet" description="You'll see a note here the moment an order is confirmed, dispatched or delivered." />
      ) : (
        <>
          {todayItems.length > 0 && (
            <section className="flex flex-col gap-2">
              <h2 className="text-[11px] font-semibold tracking-wide text-subtle uppercase">Today</h2>
              {todayItems.map((n) => <Row key={n.id} n={n} />)}
            </section>
          )}
          {earlier.length > 0 && (
            <section className="flex flex-col gap-2">
              <h2 className="text-[11px] font-semibold tracking-wide text-subtle uppercase">Earlier</h2>
              {earlier.map((n) => <Row key={n.id} n={n} />)}
            </section>
          )}
        </>
      )}
    </div>
  );
}
