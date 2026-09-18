import { NavLink, Outlet } from 'react-router';
import { CalendarClock, FileText, History, Sprout, Truck, UserRound } from 'lucide-react';
import { cn } from '../../lib/cn';
import { useCurrentUser } from '../../store/useStore';
import { useMastersSync } from '../../store/useApiSync';
import { initials } from '../../lib/format';

const TABS = [
  { to: '/driver', label: 'Today', icon: Truck, end: true },
  { to: '/driver/deliveries', label: 'Deliveries', icon: CalendarClock, end: false },
  { to: '/driver/challans', label: 'Challan', icon: FileText, end: false },
  { to: '/driver/history', label: 'History', icon: History, end: false },
  { to: '/driver/profile', label: 'Profile', icon: UserRound, end: false },
];

/** Driver mobile app: big touch targets for confirming deliveries outdoors. */
export function DriverShell() {
  // Reference tables come from the server the moment a session exists, so
  // every screen below reads the same customers, items and routes.
  useMastersSync();

  const user = useCurrentUser();

  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <header className="no-print sticky top-0 z-30 flex h-14 items-center gap-2.5 border-b border-line bg-white px-4">
        <div className="grid size-8 place-items-center rounded-lg bg-brand-800 text-white"><Sprout size={16} /></div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-bold text-ink">SPAF Driver</p>
          <p className="truncate text-[10px] text-muted">Delivery app</p>
        </div>
        <span className="grid size-8 shrink-0 place-items-center rounded-full bg-brand-700 text-[11px] font-semibold text-white">{user ? initials(user.name) : ''}</span>
      </header>

      <main className="mx-auto w-full max-w-lg flex-1 px-4 pt-4 pb-24">
        <Outlet />
      </main>

      <nav className="no-print pb-safe fixed inset-x-0 bottom-0 z-30 mx-auto grid w-full max-w-lg grid-cols-5 border-t border-line bg-white">
        {TABS.map((t) => (
          <NavLink key={t.to} to={t.to} end={t.end} className={({ isActive }) => cn('flex flex-col items-center justify-center gap-0.5 py-2.5 text-[10px] font-medium', isActive ? 'text-brand-700' : 'text-muted')}>
            <t.icon size={20} strokeWidth={1.9} />
            {t.label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
