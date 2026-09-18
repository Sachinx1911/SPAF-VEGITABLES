import { useState } from 'react';
import { Outlet } from 'react-router';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { MobileBottomNav } from './MobileBottomNav';
import { useCurrentUser } from '../../store/useStore';
import { useMastersSync } from '../../store/useApiSync';

export function AppShell() {
  // Reference tables come from the server the moment a session exists, so
  // every screen below reads the same customers, items and routes.
  useMastersSync();

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
