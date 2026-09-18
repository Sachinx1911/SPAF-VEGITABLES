import { NavLink, Outlet, useLocation, useNavigate } from 'react-router';
import { Bell, ClipboardList, Home, Receipt, ShoppingBasket, Sprout, UserRound } from 'lucide-react';
import { cn } from '../../lib/cn';
import { useCurrentUser, useDb } from '../../store/useStore';
import { useMastersSync } from '../../store/useApiSync';
import { customerOutstanding } from '../../domain/finance';
import { todayISO } from '../../lib/clock';

const TABS = [
  { to: '/portal', label: 'Home', icon: Home, end: true },
  { to: '/portal/order', label: 'Order', icon: ShoppingBasket, end: false },
  { to: '/portal/orders', label: 'Orders', icon: ClipboardList, end: false },
  { to: '/portal/invoices', label: 'Invoices', icon: Receipt, end: false },
  { to: '/portal/account', label: 'Profile', icon: UserRound, end: false },
];

/** A deliberately small, mobile-first shell for the customer role — no sidebar, no dense tables. */
export function CustomerShell() {
  // Reference tables come from the server the moment a session exists, so
  // every screen below reads the same customers, items and routes.
  useMastersSync();

  const db = useDb();
  const user = useCurrentUser();
  const nav = useNavigate();
  const loc = useLocation();

  // The order screen carries its own back/title bar, so the brand header steps aside.
  const ownHeader = loc.pathname === '/portal/order';
  const dues = user?.customerId ? customerOutstanding(db, todayISO()).get(user.customerId) ?? 0 : 0;

  return (
    <div className="flex min-h-screen flex-col bg-white">
      {!ownHeader && (
        <header className="no-print sticky top-0 z-30 flex items-center gap-2.5 border-b border-line bg-white px-4 py-3">
          <div className="grid size-9 shrink-0 place-items-center rounded-xl bg-fresh-50 text-fresh-600">
            <Sprout size={20} strokeWidth={2.2} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[17px] leading-tight font-bold tracking-tight text-brand-800">SPAF</p>
            <p className="truncate text-[10.5px] leading-tight text-muted">Fresh Produce for a Better Tomorrow</p>
          </div>
          <button onClick={() => nav('/portal/account')} aria-label="Notifications" className="relative rounded-lg p-2 text-brand-800 hover:bg-canvas">
            <Bell size={21} />
            {dues > 0 && <span className="absolute top-1.5 right-1.5 size-2 rounded-full bg-red-500 ring-2 ring-white" />}
          </button>
        </header>
      )}

      <main className={cn('mx-auto w-full max-w-lg flex-1 pb-24', !ownHeader && 'px-4 pt-3')}>
        <Outlet />
      </main>

      <nav className="no-print pb-safe fixed inset-x-0 bottom-0 z-30 mx-auto grid w-full max-w-lg grid-cols-5 border-t border-line bg-white">
        {TABS.map((t) => (
          <NavLink
            key={t.to}
            to={t.to}
            end={t.end}
            className={({ isActive }) => cn('flex flex-col items-center justify-center gap-0.5 py-2.5 text-[10.5px] font-medium', isActive ? 'text-brand-700' : 'text-muted')}
          >
            {({ isActive }) => (
              <>
                <t.icon size={20} strokeWidth={isActive ? 2.2 : 1.9} />
                {t.label}
              </>
            )}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
