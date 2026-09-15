import { NavLink } from 'react-router';
import { ChevronsLeft, ChevronsRight, Sprout } from 'lucide-react';
import { cn } from '../../lib/cn';
import { navForRole } from '../../lib/nav';
import { useCurrentUser, useDb, useUi } from '../../store/useStore';

export function Sidebar({ mobileOpen, onCloseMobile }: { mobileOpen: boolean; onCloseMobile: () => void }) {
  const db = useDb();
  const user = useCurrentUser();
  const collapsed = useUi((s) => s.sidebarCollapsed);
  const setCollapsed = useUi((s) => s.setSidebarCollapsed);
  const sections = user ? navForRole(db, user.role) : [];

  const body = (
    <>
      <div className={cn('flex h-14 items-center gap-2.5 border-b border-white/10 px-4', collapsed && 'justify-center px-0')}>
        <div className="grid size-8 shrink-0 place-items-center rounded-lg bg-fresh-500 text-white">
          <Sprout size={17} strokeWidth={2.3} />
        </div>
        {!collapsed && (
          <div className="min-w-0">
            <p className="truncate text-[13.5px] font-bold tracking-tight text-white">SPAF</p>
            <p className="truncate text-[10px] text-white/55">Operations OS</p>
          </div>
        )}
      </div>

      <nav className="scrollbar-thin flex-1 overflow-y-auto px-2.5 py-3">
        {sections.map((section, i) => (
          <div key={i} className={cn(i > 0 && 'mt-4')}>
            {section.title && !collapsed && (
              <p className="mb-1.5 px-2.5 text-[10.5px] font-semibold tracking-wider text-white/40 uppercase">{section.title}</p>
            )}
            <div className="flex flex-col gap-0.5">
              {section.items.map((item) => (
                <NavLink
                  key={item.path}
                  to={item.path}
                  onClick={onCloseMobile}
                  title={collapsed ? item.label : undefined}
                  className={({ isActive }) =>
                    cn(
                      'flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] font-medium transition-colors',
                      collapsed && 'justify-center px-0',
                      isActive ? 'bg-white/12 text-white' : 'text-white/70 hover:bg-white/8 hover:text-white',
                    )
                  }
                >
                  <item.icon size={17} strokeWidth={1.9} className="shrink-0" />
                  {!collapsed && <span className="truncate">{item.label}</span>}
                </NavLink>
              ))}
            </div>
          </div>
        ))}
      </nav>

      <button
        onClick={() => setCollapsed(!collapsed)}
        className="hidden h-11 items-center justify-center gap-2 border-t border-white/10 text-[12px] font-medium text-white/60 hover:bg-white/8 hover:text-white md:flex"
      >
        {collapsed ? <ChevronsRight size={16} /> : (<><ChevronsLeft size={16} /> Collapse</>)}
      </button>
    </>
  );

  return (
    <>
      <aside className={cn('no-print sticky top-0 hidden h-screen shrink-0 flex-col bg-brand-900 transition-[width] duration-150 md:flex', collapsed ? 'w-16' : 'w-60')}>
        {body}
      </aside>

      {mobileOpen && (
        <div className="no-print fixed inset-0 z-50 flex md:hidden">
          <div className="animate-fade-in fixed inset-0 bg-black/50" onClick={onCloseMobile} />
          <aside className="animate-slide-in relative flex h-full w-64 flex-col bg-brand-900">{body}</aside>
        </div>
      )}
    </>
  );
}
