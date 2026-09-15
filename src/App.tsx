import { HashRouter, Route, Routes } from 'react-router';
import { ToastProvider } from './components/ui/Toast';
import { ConfirmProvider } from './components/ui/ConfirmDialog';
import { AppShell } from './components/shell/AppShell';
import { CustomerShell } from './components/shell/CustomerShell';
import { RequireAuth, RequireModule } from './components/shell/RouteGuard';
import { LoginPage } from './pages/auth/Login';
import { SwitchRolePage } from './pages/auth/SwitchRole';
import { DashboardPage } from './pages/dashboard/Dashboard';
import { DesignSystemPage } from './pages/DesignSystem';
import { ComingSoon } from './pages/ComingSoon';
import { CustomersListPage } from './pages/customers/CustomersList';
import { CustomerDetailPage } from './pages/customers/CustomerDetail';
import { ItemsListPage } from './pages/items/ItemsList';
import { ItemDetailPage } from './pages/items/ItemDetail';
import { CategoriesPage } from './pages/items/CategoriesPage';
import { CustomerPricesPage } from './pages/prices/CustomerPrices';
import { StockPage } from './pages/stock/StockPage';
import { OrdersListPage } from './pages/orders/OrdersList';
import { NewOrderPage } from './pages/orders/NewOrder';
import { OrderDetailPage } from './pages/orders/OrderDetail';
import { ConsolidationPage } from './pages/consolidation/Consolidation';
import { PurchaseRequirementPage } from './pages/purchase/PurchaseRequirement';
import { PurchaseEntryPage } from './pages/purchase/PurchaseEntry';
import { ReceivingPage } from './pages/receiving/Receiving';
import { QualityCheckPage } from './pages/receiving/QualityCheck';
import { AllocationPage } from './pages/allocation/Allocation';
import { ShortageExcessPage } from './pages/allocation/ShortageExcess';
import { PackingDashboardPage } from './pages/packing/PackingDashboard';
import { CustomerPackingPage } from './pages/packing/CustomerPacking';
import { DeliveryDashboardPage } from './pages/delivery/DeliveryDashboard';
import { ChallansListPage } from './pages/delivery/ChallansList';
import { ChallanDetailPage } from './pages/delivery/ChallanDetail';
import { DriverShell } from './components/shell/DriverShell';
import { DriverTodayPage } from './pages/driver/DriverToday';
import { DriverDeliveriesPage } from './pages/driver/DriverDeliveries';
import { DriverChallansPage } from './pages/driver/DriverChallans';
import { DriverHistoryPage } from './pages/driver/DriverHistory';
import { DriverProfilePage } from './pages/driver/DriverProfile';
import { DeliveryConfirmationPage } from './pages/driver/DeliveryConfirmation';
import { PortalHomePage } from './pages/portal/PortalHome';
import { PlaceOrderPage } from './pages/portal/PlaceOrder';
import { PortalOrdersPage } from './pages/portal/PortalOrders';
import { PortalInvoicesPage } from './pages/portal/PortalInvoices';
import { PortalLedgerPage } from './pages/portal/PortalLedger';
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
  ['/orders/:id', 3, 'orders', 'Order Detail'], ['/invoices/:id', 6, 'invoices', 'Invoice Detail'],
  ['/challans/:id', 5, 'delivery', 'Challan'], ['/reports/operations', 6, 'reports', 'Operations Reports'],
  ['/reports/sales', 6, 'reports', 'Sales Reports'], ['/reports/purchase', 6, 'reports', 'Purchase Reports'],
  ['/quality-check', 4, 'receiving', 'Quality Check'], ['/shortage', 4, 'allocation', 'Shortage / Excess'],
  ['/analytics/trends', 6, 'analytics', 'Trends'],
].forEach(([path, phase, module, label]) => PLACEHOLDER_PATHS.set(path as string, { module: module as ModuleKey, phase: phase as number, label: label as string }));
PLACEHOLDER_PATHS.delete('/'); // dashboard is real
// Phase 2 & 3 screens are real now — built out of the placeholder list.
[
  '/customers', '/customers/new', '/customers/:id', '/items', '/items/new', '/items/:id', '/categories', '/prices', '/stock',
  '/orders', '/orders/new', '/orders/:id', '/consolidation', '/portal/order',
  '/purchase', '/purchase/new', '/receiving', '/receiving/new', '/quality-check', '/allocation', '/shortage',
  '/packing', '/delivery', '/challans', '/challans/:id', '/driver',
].forEach((p) => PLACEHOLDER_PATHS.delete(p));

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

              <Route path="/customers" element={<RequireModule module="customers"><CustomersListPage /></RequireModule>} />
              <Route path="/customers/new" element={<RequireModule module="customers" action="create"><CustomersListPage /></RequireModule>} />
              <Route path="/customers/:id" element={<RequireModule module="customers"><CustomerDetailPage /></RequireModule>} />
              <Route path="/items" element={<RequireModule module="items"><ItemsListPage /></RequireModule>} />
              <Route path="/items/new" element={<RequireModule module="items" action="create"><ItemsListPage /></RequireModule>} />
              <Route path="/items/:id" element={<RequireModule module="items"><ItemDetailPage /></RequireModule>} />
              <Route path="/categories" element={<RequireModule module="categories"><CategoriesPage /></RequireModule>} />
              <Route path="/prices" element={<RequireModule module="prices"><CustomerPricesPage /></RequireModule>} />
              <Route path="/stock" element={<RequireModule module="stock"><StockPage /></RequireModule>} />

              <Route path="/orders" element={<RequireModule module="orders"><OrdersListPage /></RequireModule>} />
              <Route path="/orders/new" element={<RequireModule module="orders" action="create"><NewOrderPage /></RequireModule>} />
              <Route path="/orders/:id" element={<RequireModule module="orders"><OrderDetailPage /></RequireModule>} />
              <Route path="/consolidation" element={<RequireModule module="consolidation"><ConsolidationPage /></RequireModule>} />

              <Route path="/purchase" element={<RequireModule module="purchase"><PurchaseRequirementPage /></RequireModule>} />
              <Route path="/purchase/new" element={<RequireModule module="purchase" action="create"><PurchaseEntryPage /></RequireModule>} />
              <Route path="/receiving" element={<RequireModule module="receiving"><ReceivingPage /></RequireModule>} />
              <Route path="/receiving/new" element={<RequireModule module="receiving" action="create"><ReceivingPage /></RequireModule>} />
              <Route path="/quality-check" element={<RequireModule module="receiving"><QualityCheckPage /></RequireModule>} />
              <Route path="/allocation" element={<RequireModule module="allocation"><AllocationPage /></RequireModule>} />
              <Route path="/shortage" element={<RequireModule module="allocation"><ShortageExcessPage /></RequireModule>} />

              <Route path="/packing" element={<RequireModule module="packing"><PackingDashboardPage /></RequireModule>} />
              <Route path="/packing/:orderId" element={<RequireModule module="packing" action="edit"><CustomerPackingPage /></RequireModule>} />
              <Route path="/delivery" element={<RequireModule module="delivery"><DeliveryDashboardPage /></RequireModule>} />
              <Route path="/challans" element={<RequireModule module="delivery"><ChallansListPage /></RequireModule>} />
              <Route path="/challans/:id" element={<RequireModule module="delivery"><ChallanDetailPage /></RequireModule>} />
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

            <Route element={<RequireAuth><CustomerShell /></RequireAuth>}>
              <Route path="/portal" element={<RequireModule module="portal"><PortalHomePage /></RequireModule>} />
              <Route path="/portal/order" element={<RequireModule module="portal" action="create"><PlaceOrderPage /></RequireModule>} />
              <Route path="/portal/orders" element={<RequireModule module="portal"><PortalOrdersPage /></RequireModule>} />
              <Route path="/portal/invoices" element={<RequireModule module="portal"><PortalInvoicesPage /></RequireModule>} />
              <Route path="/portal/ledger" element={<RequireModule module="portal"><PortalLedgerPage /></RequireModule>} />
            </Route>

            <Route element={<RequireAuth><DriverShell /></RequireAuth>}>
              <Route path="/driver" element={<RequireModule module="driver_app"><DriverTodayPage /></RequireModule>} />
              <Route path="/driver/deliveries" element={<RequireModule module="driver_app"><DriverDeliveriesPage /></RequireModule>} />
              <Route path="/driver/challans" element={<RequireModule module="driver_app"><DriverChallansPage /></RequireModule>} />
              <Route path="/driver/challans/:id" element={<RequireModule module="driver_app"><ChallanDetailPage /></RequireModule>} />
              <Route path="/driver/history" element={<RequireModule module="driver_app"><DriverHistoryPage /></RequireModule>} />
              <Route path="/driver/profile" element={<RequireModule module="driver_app"><DriverProfilePage /></RequireModule>} />
              <Route path="/driver/confirm/:challanId" element={<RequireModule module="driver_app" action="edit"><DeliveryConfirmationPage /></RequireModule>} />
            </Route>
          </Routes>
        </HashRouter>
      </ConfirmProvider>
    </ToastProvider>
  );
}
