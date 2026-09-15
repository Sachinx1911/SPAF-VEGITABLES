import { NavLink } from 'react-router';
import { ClipboardList, LayoutDashboard, Layers, Truck, Wallet } from 'lucide-react';
import { cn } from '../../lib/cn';
import type { RoleKey } from '../../types/models';

const BY_ROLE: Record<string, { to: string; label: string; icon: typeof LayoutDashboard }[]> = {
  default: [
    { to: '/', label: 'Home', icon: LayoutDashboard },
    { to: '/orders', label: 'Orders', icon: ClipboardList },
    { to: '/consolidation', label: 'Consolidation', icon: Layers },
    { to: '/delivery', label: 'Delivery', icon: Truck },
    { to: '/outstanding', label: 'Outstanding', icon: Wallet },
  ],
};

export function MobileBottomNav({ role }: { role: RoleKey }) {
  const items = BY_ROLE[role] ?? BY_ROLE.default!;
  return (
    <nav className="no-print pb-safe fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-line bg-white md:hidden">
      {items.map((it) => (
        <NavLink
          key={it.to}
          to={it.to}
          end={it.to === '/'}
          className={({ isActive }) => cn('flex flex-col items-center justify-center gap-0.5 py-2 text-[10.5px] font-medium', isActive ? 'text-brand-700' : 'text-muted')}
        >
          <it.icon size={19} strokeWidth={1.9} />
          {it.label}
        </NavLink>
      ))}
    </nav>
  );
}
