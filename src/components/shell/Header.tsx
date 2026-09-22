import { useState } from 'react';
import { useNavigate } from 'react-router';
import { CalendarDays, ChevronDown, KeyRound, LogOut, Menu, RotateCcw, Search, Settings, Sprout, UserRound } from 'lucide-react';
import { IconButton } from '../ui/Button';
import { QuickAdd } from './QuickAdd';
import { GlobalSearch } from './GlobalSearch';
import { ChangePassword } from './ChangePassword';
import { NotificationsMenu } from './NotificationsMenu';
import { API_MODE } from '../../lib/api';
import { Menu as DropMenu } from '../ui/Dropdown';
import { useConfirm } from '../ui/ConfirmDialog';
import { useToast } from '../ui/Toast';
import { useStore, useCurrentUser } from '../../store/useStore';
import { todayISO } from '../../lib/clock';
import { fmtDate, weekday, initials } from '../../lib/format';
import { ROLES } from '../../data/seed/roles';
import { homePathFor } from '../../lib/nav';

export function Header({ onOpenMobileNav }: { onOpenMobileNav: () => void }) {
  const user = useCurrentUser();
  const logout = useStore((s) => s.logout);
  const resetDemo = useStore((s) => s.resetDemo);
  const db = useStore((s) => s.db);
  const nav = useNavigate();
  const confirm = useConfirm();
  const toast = useToast();
  const [searchOpen, setSearchOpen] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const today = todayISO();

  const doReset = async () => {
    const ok = await confirm({ title: 'Reset demo data?', description: 'Every order, purchase, delivery and payment you\'ve created will be discarded and the original seed restored.', tone: 'danger', confirmLabel: 'Reset data' });
    if (!ok) return;
    resetDemo();
    toast({ tone: 'success', title: 'Demo data reset' });
    nav('/');
  };

  const roleLabel = user ? (ROLES.find((r) => r.key === user.role)?.name ?? user.role) : '';

  return (
    <header className="no-print sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-line bg-white/90 px-3 backdrop-blur md:px-5">
      <IconButton icon={Menu} label="Open menu" onClick={onOpenMobileNav} className="md:hidden" />

      <div className="mr-2 hidden min-w-0 items-center gap-2.5 lg:flex">
        <span className="grid size-8 shrink-0 place-items-center rounded-full bg-fresh-50 text-fresh-600"><Sprout size={17} /></span>
        <div className="min-w-0">
          <p className="truncate text-[12.5px] leading-tight font-bold text-ink">{db.settings.companyName}</p>
          <p className="truncate text-[10.5px] leading-tight text-muted">Fresh Vegetables · Fruits · Herbs · Exotic Produce</p>
        </div>
      </div>

      <button
        onClick={() => setSearchOpen(true)}
        className="flex h-9 w-44 items-center gap-2 rounded-lg border border-line bg-canvas/60 px-3 text-[13px] text-subtle transition hover:border-[#c9d3cc] sm:w-64 md:w-80 lg:mx-auto"
      >
        <Search size={15} />
        <span className="flex-1 truncate text-left">Search everything…</span>
        <kbd className="hidden rounded border border-line bg-white px-1.5 py-0.5 text-[10px] font-medium text-muted sm:inline">Ctrl K</kbd>
      </button>
      <GlobalSearch open={searchOpen} onClose={() => setSearchOpen(false)} />

      <div className="ml-auto flex items-center gap-1.5">
        <div className="mr-1 hidden items-center gap-1.5 text-[12.5px] text-muted lg:flex">
          <CalendarDays size={14} />
          {weekday(today)}, {fmtDate(today)}
        </div>
        <QuickAdd />
        <NotificationsMenu />
        <div className="mx-1 h-6 w-px bg-line" />
        <DropMenu
          align="right"
          items={[
            { key: 'settings', label: 'Settings', icon: <Settings size={14} />, onClick: () => nav('/settings') },
            // Demo mode checks no password, so there is none to change.
            ...(API_MODE ? [{ key: 'password', label: 'Change password', icon: <KeyRound size={14} />, onClick: () => setPasswordOpen(true) }] : []),
            { key: 'divider', label: '', divider: true },
            // Identity switching hands out any role without a password, so it
            // exists only in dev builds and only for an admin.
            ...(import.meta.env.DEV && user?.role === 'admin'
              ? [
                  { key: 'roles', label: 'Switch demo role…', icon: <UserRound size={14} />, onClick: () => nav('/switch-role') },
                  { key: 'reset', label: 'Reset demo data', icon: <RotateCcw size={14} />, onClick: doReset },
                ]
              : []),
            { key: 'divider2', label: '', divider: true },
            { key: 'logout', label: 'Sign out', icon: <LogOut size={14} />, danger: true, onClick: () => { logout(); nav('/login'); } },
          ]}
          trigger={(open, isOpen) => (
            <button onClick={open} className="flex items-center gap-2 rounded-lg py-1 pr-1.5 pl-1 hover:bg-canvas">
              <span className="grid size-7 shrink-0 place-items-center rounded-full bg-brand-700 text-[11px] font-semibold text-white">
                {user ? initials(user.name) : '—'}
              </span>
              <span className="hidden text-left sm:block">
                <span className="block text-[12.5px] leading-tight font-medium text-ink">{user?.name}</span>
                <span className="block text-[10.5px] leading-tight text-muted">{roleLabel}</span>
              </span>
              <ChevronDown size={14} className={`hidden text-subtle transition-transform sm:block ${isOpen ? 'rotate-180' : ''}`} />
            </button>
          )}
        />
      </div>
      <ChangePassword open={passwordOpen} onClose={() => setPasswordOpen(false)} />
    </header>
  );
}
