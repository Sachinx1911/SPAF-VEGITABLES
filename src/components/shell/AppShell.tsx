import { useState } from 'react';
import { Outlet } from 'react-router';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { MobileBottomNav } from './MobileBottomNav';
import { useCurrentUser } from '../../store/useStore';

export function AppShell() {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const user = useCurrentUser();

  return (
    <div className="flex min-h-screen bg-canvas">
      <Sidebar mobileOpen={mobileNavOpen} onCloseMobile={() => setMobileNavOpen(false)} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Header onOpenMobileNav={() => setMobileNavOpen(true)} />
        <main className="min-w-0 flex-1 px-3 pb-20 md:px-6 md:pb-8 md:pt-5 pt-4">
          <Outlet />
        </main>
      </div>
      {user && <MobileBottomNav role={user.role} />}
    </div>
  );
}
