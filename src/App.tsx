import { HashRouter, Route, Routes } from 'react-router';
import { ToastProvider } from './components/ui/Toast';
import { ConfirmProvider } from './components/ui/ConfirmDialog';
import { AppShell } from './components/shell/AppShell';
import { RequireAuth, RequireModule } from './components/shell/RouteGuard';
import { LoginPage } from './pages/auth/Login';
import { SwitchRolePage } from './pages/auth/SwitchRole';
import { DashboardPage } from './pages/dashboard/Dashboard';
import { DesignSystemPage } from './pages/DesignSystem';
import { ComingSoon } from './pages/ComingSoon';
import { NotFoundPage, SessionExpiredPage } from './pages/states/StatePages';
import { ALL_ROUTES } from './lib/nav';
import type { ModuleKey } from './types/models';

const TITLES: Partial<Record<ModuleKey, string>> = {
  orders: 'Orders', consolidation: 'Daily Consolidation', purchase: 'Purchase', receiving: 'Receiving',
  allocation: 'Allocation', packing: 'Packing', delivery: 'Delivery', customers: 'Customers', prices: 'Customer Prices',
  items: 'Items', categories: 'Categories', stock: 'Stock', invoices: 'Invoices', payments: 'Payments',
  outstanding: 'Outstanding', ledger: 'Customer Ledger', reports: 'Reports', analytics: 'Analytics',
  users: 'Users & Roles', notifications: 'Notifications', audit: 'Audit Logs', settings: 'Settings',
  portal: 'Customer Portal', driver_app: 'Driver App',
};

/** Routes not yet built land on a phase-labelled placeholder instead of a 404. */
const PLACEHOLDER_PATHS = new Map<string, { module: ModuleKey; phase: number; label: string }>();
for (const item of ALL_ROUTES) {
  if (!PLACEHOLDER_PATHS.has(item.path)) PLACEHOLDER_PATHS.set(item.path, { module: item.module, phase: item.phase, label: item.label });
}
[
  ['/customers/:id', 2, 'customers', 'Customer Detail'], ['/items/:id', 2, 'items', 'Item Detail'],
  ['/orders/:id', 3, 'orders', 'Order Detail'], ['/invoices/:id', 6, 'invoices', 'Invoice Detail'],
  ['/challans/:id', 5, 'delivery', 'Challan'], ['/reports/operations', 6, 'reports', 'Operations Reports'],
  ['/reports/sales', 6, 'reports', 'Sales Reports'], ['/reports/purchase', 6, 'reports', 'Purchase Reports'],
  ['/quality-check', 4, 'receiving', 'Quality Check'], ['/shortage', 4, 'allocation', 'Shortage / Excess'],
  ['/analytics/trends', 6, 'analytics', 'Trends'],
].forEach(([path, phase, module, label]) => PLACEHOLDER_PATHS.set(path as string, { module: module as ModuleKey, phase: phase as number, label: label as string }));
PLACEHOLDER_PATHS.delete('/'); // dashboard is real

export default function App() {
  return (
    <ToastProvider>
      <ConfirmProvider>
        <HashRouter>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/session-expired" element={<SessionExpiredPage />} />

            <Route element={<RequireAuth><AppShell /></RequireAuth>}>
              <Route index element={<DashboardPage />} />
              <Route path="/switch-role" element={<SwitchRolePage />} />
              <Route path="/design-system" element={<DesignSystemPage />} />
              {[...PLACEHOLDER_PATHS.entries()].map(([path, meta]) => (
                <Route
                  key={path}
                  path={path}
                  element={
                    <RequireModule module={meta.module}>
                      <ComingSoon title={TITLES[meta.module] ?? meta.label} phase={meta.phase} />
                    </RequireModule>
                  }
                />
              ))}
              <Route path="*" element={<NotFoundPage />} />
            </Route>
          </Routes>
        </HashRouter>
      </ConfirmProvider>
    </ToastProvider>
  );
}
