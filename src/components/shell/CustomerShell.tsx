import { NavLink, Outlet } from 'react-router';
import { BookOpen, ClipboardList, Home, LogOut, Receipt, ShoppingBasket, Sprout } from 'lucide-react';
import { cn } from '../../lib/cn';
import { useCurrentUser, useStore } from '../../store/useStore';
import { useNavigate } from 'react-router';
import { initials } from '../../lib/format';

const TABS = [
  { to: '/portal', label: 'Home', icon: Home, end: true },
  { to: '/portal/order', label: 'Order', icon: ShoppingBasket, end: false },
  { to: '/portal/orders', label: 'Orders', icon: ClipboardList, end: false },
  { to: '/portal/invoices', label: 'Invoices', icon: Receipt, end: false },
  { to: '/portal/ledger', label: 'Ledger', icon: BookOpen, end: false },
];

/** A deliberately small, mobile-first shell for the customer role — no sidebar, no dense tables. */
export function CustomerShell() {
  const user = useCurrentUser();
  const logout = useStore((s) => s.logout);
  const nav = useNavigate();

  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <header className="no-print sticky top-0 z-30 flex h-14 items-center gap-2.5 border-b border-line bg-white px-4">
        <div className="grid size-8 place-items-center rounded-lg bg-brand-800 text-white"><Sprout size={16} /></div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-bold text-ink">SPAF</p>
          <p className="truncate text-[10px] text-muted">Ordering Portal</p>
        </div>
        <span className="grid size-8 shrink-0 place-items-center rounded-full bg-brand-700 text-[11px] font-semibold text-white">{user ? initials(user.name) : ''}</span>
        <button onClick={() => { logout(); nav('/login'); }} aria-label="Sign out" className="rounded-lg p-2 text-muted hover:bg-canvas hover:text-red-600">
          <LogOut size={17} />
        </button>
      </header>

      <main className="mx-auto w-full max-w-lg flex-1 px-4 pt-4 pb-24">
        <Outlet />
      </main>

      <nav className="no-print pb-safe fixed inset-x-0 bottom-0 z-30 mx-auto grid w-full max-w-lg grid-cols-5 border-t border-line bg-white">
        {TABS.map((t) => (
          <NavLink key={t.to} to={t.to} end={t.end} className={({ isActive }) => cn('flex flex-col items-center justify-center gap-0.5 py-2.5 text-[10.5px] font-medium', isActive ? 'text-brand-700' : 'text-muted')}>
            <t.icon size={20} strokeWidth={1.9} />
            {t.label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
