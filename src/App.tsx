import { lazy, Suspense, useEffect } from "react";
import { HashRouter, Route, Routes } from "react-router";
import { ToastProvider } from "./components/ui/Toast";
import { ConfirmProvider } from "./components/ui/ConfirmDialog";
import { AppShell } from "./components/shell/AppShell";
import { ErrorBoundary } from "./components/shell/ErrorBoundary";
import { API_MODE } from "./lib/api";
import { useStore } from "./store/useStore";
import { CustomerShell } from "./components/shell/CustomerShell";
import {
  RequireAuth,
  RequireDemoTools,
  RequireModule,
} from "./components/shell/RouteGuard";
import { LoginPage } from "./pages/auth/Login";
import { DashboardPage } from "./pages/dashboard/Dashboard";
import { ComingSoon } from "./pages/ComingSoon";

/** Prototype-only screens: split out so they are fetched only when an admin opens them in dev. */
const SwitchRolePage = lazy(() =>
  import("./pages/auth/SwitchRole").then((m) => ({
    default: m.SwitchRolePage,
  })),
);
const DesignSystemPage = lazy(() =>
  import("./pages/DesignSystem").then((m) => ({ default: m.DesignSystemPage })),
);

/** Every module screen is its own chunk, fetched when the route is first opened. */
const CustomersListPage = lazy(() =>
  import("./pages/customers/CustomersList").then((m) => ({
    default: m.CustomersListPage,
  })),
);
const CustomerDetailPage = lazy(() =>
  import("./pages/customers/CustomerDetail").then((m) => ({
    default: m.CustomerDetailPage,
  })),
);
const ItemsListPage = lazy(() =>
  import("./pages/items/ItemsList").then((m) => ({ default: m.ItemsListPage })),
);
const ItemDetailPage = lazy(() =>
  import("./pages/items/ItemDetail").then((m) => ({
    default: m.ItemDetailPage,
  })),
);
const CategoriesPage = lazy(() =>
  import("./pages/items/CategoriesPage").then((m) => ({
    default: m.CategoriesPage,
  })),
);
const CustomerPricesPage = lazy(() =>
  import("./pages/prices/CustomerPrices").then((m) => ({
    default: m.CustomerPricesPage,
  })),
);
const StockPage = lazy(() =>
  import("./pages/stock/StockPage").then((m) => ({ default: m.StockPage })),
);
const OrdersListPage = lazy(() =>
  import("./pages/orders/OrdersList").then((m) => ({
    default: m.OrdersListPage,
  })),
);
const NewOrderPage = lazy(() =>
  import("./pages/orders/NewOrder").then((m) => ({ default: m.NewOrderPage })),
);
const OrderDetailPage = lazy(() =>
  import("./pages/orders/OrderDetail").then((m) => ({
    default: m.OrderDetailPage,
  })),
);
const ConsolidationPage = lazy(() =>
  import("./pages/consolidation/Consolidation").then((m) => ({
    default: m.ConsolidationPage,
  })),
);
const PurchaseRequirementPage = lazy(() =>
  import("./pages/purchase/PurchaseRequirement").then((m) => ({
    default: m.PurchaseRequirementPage,
  })),
);
const PurchaseEntryPage = lazy(() =>
  import("./pages/purchase/PurchaseEntry").then((m) => ({
    default: m.PurchaseEntryPage,
  })),
);
const ReceivingPage = lazy(() =>
  import("./pages/receiving/Receiving").then((m) => ({
    default: m.ReceivingPage,
  })),
);
const QualityCheckPage = lazy(() =>
  import("./pages/receiving/QualityCheck").then((m) => ({
    default: m.QualityCheckPage,
  })),
);
const AllocationPage = lazy(() =>
  import("./pages/allocation/Allocation").then((m) => ({
    default: m.AllocationPage,
  })),
);
const ShortageExcessPage = lazy(() =>
  import("./pages/allocation/ShortageExcess").then((m) => ({
    default: m.ShortageExcessPage,
  })),
);
const PackingDashboardPage = lazy(() =>
  import("./pages/packing/PackingDashboard").then((m) => ({
    default: m.PackingDashboardPage,
  })),
);
const CustomerPackingPage = lazy(() =>
  import("./pages/packing/CustomerPacking").then((m) => ({
    default: m.CustomerPackingPage,
  })),
);
const DeliveryDashboardPage = lazy(() =>
  import("./pages/delivery/DeliveryDashboard").then((m) => ({
    default: m.DeliveryDashboardPage,
  })),
);
const ChallansListPage = lazy(() =>
  import("./pages/delivery/ChallansList").then((m) => ({
    default: m.ChallansListPage,
  })),
);
const ChallanDetailPage = lazy(() =>
  import("./pages/delivery/ChallanDetail").then((m) => ({
    default: m.ChallanDetailPage,
  })),
);
const DriverTodayPage = lazy(() =>
  import("./pages/driver/DriverToday").then((m) => ({
    default: m.DriverTodayPage,
  })),
);
const DriverDeliveriesPage = lazy(() =>
  import("./pages/driver/DriverDeliveries").then((m) => ({
    default: m.DriverDeliveriesPage,
  })),
);
const DriverChallansPage = lazy(() =>
  import("./pages/driver/DriverChallans").then((m) => ({
    default: m.DriverChallansPage,
  })),
);
const DriverHistoryPage = lazy(() =>
  import("./pages/driver/DriverHistory").then((m) => ({
    default: m.DriverHistoryPage,
  })),
);
const DriverProfilePage = lazy(() =>
  import("./pages/driver/DriverProfile").then((m) => ({
    default: m.DriverProfilePage,
  })),
);
const DeliveryConfirmationPage = lazy(() =>
  import("./pages/driver/DeliveryConfirmation").then((m) => ({
    default: m.DeliveryConfirmationPage,
  })),
);
const InvoicesListPage = lazy(() =>
  import("./pages/invoices/InvoicesList").then((m) => ({
    default: m.InvoicesListPage,
  })),
);
const CreateInvoicePage = lazy(() =>
  import("./pages/invoices/CreateInvoice").then((m) => ({
    default: m.CreateInvoicePage,
  })),
);
const InvoiceDetailPage = lazy(() =>
  import("./pages/invoices/InvoiceDetail").then((m) => ({
    default: m.InvoiceDetailPage,
  })),
);
const PaymentsListPage = lazy(() =>
  import("./pages/payments/PaymentsList").then((m) => ({
    default: m.PaymentsListPage,
  })),
);
const OutstandingPage = lazy(() =>
  import("./pages/outstanding/Outstanding").then((m) => ({
    default: m.OutstandingPage,
  })),
);
const CustomerLedgerPage = lazy(() =>
  import("./pages/ledger/CustomerLedger").then((m) => ({
    default: m.CustomerLedgerPage,
  })),
);
const AnalyticsPage = lazy(() =>
  import("./pages/analytics/Analytics").then((m) => ({
    default: m.AnalyticsPage,
  })),
);
const NotificationsPage = lazy(() =>
  import("./pages/notifications/Notifications").then((m) => ({
    default: m.NotificationsPage,
  })),
);
const AuditLogPage = lazy(() =>
  import("./pages/audit/AuditLog").then((m) => ({ default: m.AuditLogPage })),
);
const UsersRolesPage = lazy(() =>
  import("./pages/users/UsersRoles").then((m) => ({
    default: m.UsersRolesPage,
  })),
);
const SettingsPage = lazy(() =>
  import("./pages/settings/Settings").then((m) => ({
    default: m.SettingsPage,
  })),
);
const PortalHomePage = lazy(() =>
  import("./pages/portal/PortalHome").then((m) => ({
    default: m.PortalHomePage,
  })),
);
const PlaceOrderPage = lazy(() =>
  import("./pages/portal/PlaceOrder").then((m) => ({
    default: m.PlaceOrderPage,
  })),
);
const PortalOrdersPage = lazy(() =>
  import("./pages/portal/PortalOrders").then((m) => ({
    default: m.PortalOrdersPage,
  })),
);
const PortalInvoicesPage = lazy(() =>
  import("./pages/portal/PortalInvoices").then((m) => ({
    default: m.PortalInvoicesPage,
  })),
);
const PortalLedgerPage = lazy(() =>
  import("./pages/portal/PortalLedger").then((m) => ({
    default: m.PortalLedgerPage,
  })),
);
const PortalAccountPage = lazy(() =>
  import("./pages/portal/PortalAccount").then((m) => ({
    default: m.PortalAccountPage,
  })),
);
import { DriverShell } from "./components/shell/DriverShell";
import {
  OperationsReportsPage,
  SalesReportsPage,
  PurchaseReportsPage,
} from "./pages/reports/ReportCenter";
import { NotFoundPage, SessionExpiredPage } from "./pages/states/StatePages";
import { ALL_ROUTES } from "./lib/nav";
import type { ModuleKey } from "./types/models";

const TITLES: Partial<Record<ModuleKey, string>> = {
  orders: "Orders",
  consolidation: "Daily Consolidation",
  purchase: "Purchase",
  receiving: "Receiving",
  allocation: "Allocation",
  packing: "Packing",
  delivery: "Delivery",
  customers: "Customers",
  prices: "Customer Prices",
  items: "Items",
  categories: "Categories",
  stock: "Stock",
  invoices: "Invoices",
  payments: "Payments",
  outstanding: "Outstanding",
  ledger: "Customer Ledger",
  reports: "Reports",
  analytics: "Analytics",
  users: "Users & Roles",
  notifications: "Notifications",
  audit: "Audit Logs",
  settings: "Settings",
  portal: "Customer Portal",
  driver_app: "Driver App",
};

/** Routes not yet built land on a phase-labelled placeholder instead of a 404. */
const PLACEHOLDER_PATHS = new Map<
  string,
  { module: ModuleKey; phase: number; label: string }
>();
for (const item of ALL_ROUTES) {
  if (!PLACEHOLDER_PATHS.has(item.path))
    PLACEHOLDER_PATHS.set(item.path, {
      module: item.module,
      phase: item.phase,
      label: item.label,
    });
}
[
  ["/orders/:id", 3, "orders", "Order Detail"],
  ["/invoices/:id", 6, "invoices", "Invoice Detail"],
  ["/challans/:id", 5, "delivery", "Challan"],
  ["/reports/operations", 6, "reports", "Operations Reports"],
  ["/reports/sales", 6, "reports", "Sales Reports"],
  ["/reports/purchase", 6, "reports", "Purchase Reports"],
  ["/quality-check", 4, "receiving", "Quality Check"],
  ["/shortage", 4, "allocation", "Shortage / Excess"],
  ["/analytics/trends", 6, "analytics", "Trends"],
].forEach(([path, phase, module, label]) =>
  PLACEHOLDER_PATHS.set(path as string, {
    module: module as ModuleKey,
    phase: phase as number,
    label: label as string,
  }),
);
PLACEHOLDER_PATHS.delete("/"); // dashboard is real
// Phase 2 & 3 screens are real now — built out of the placeholder list.
[
  "/customers",
  "/customers/new",
  "/customers/:id",
  "/items",
  "/items/new",
  "/items/:id",
  "/categories",
  "/prices",
  "/stock",
  "/orders",
  "/orders/new",
  "/orders/:id",
  "/consolidation",
  "/portal/order",
  "/purchase",
  "/purchase/new",
  "/receiving",
  "/receiving/new",
  "/quality-check",
  "/allocation",
  "/shortage",
  "/packing",
  "/delivery",
  "/challans",
  "/challans/:id",
  "/driver",
  "/invoices",
  "/invoices/new",
  "/invoices/:id",
  "/payments",
  "/payments/new",
  "/outstanding",
  "/ledger",
  "/reports/operations",
  "/reports/sales",
  "/reports/purchase",
  "/analytics",
  "/notifications",
  "/audit-logs",
  "/users",
  "/settings",
].forEach((p) => PLACEHOLDER_PATHS.delete(p));

/** Shown while a route chunk is in flight — deliberately quiet so a fast load does not flash. */
function RouteFallback() {
  return (
    <div className="grid min-h-screen place-items-center bg-canvas">
      <div className="flex items-center gap-2.5 text-[13px] text-muted">
        <span className="size-4 animate-spin rounded-full border-2 border-line border-t-brand-700" />
        Loading…
      </div>
    </div>
  );
}

/**
 * Checks a stored token before the first render decides anything.
 *
 * Without this a page refresh would bounce a signed-in user to the login
 * screen, because the session itself is not persisted in API mode — the token
 * is, and only the server can say whether it is still good.
 */
function useRestoredSession(): boolean {
  const restoring = useStore((s) => s.restoring);
  const restore = useStore((s) => s.restoreApiSession);

  useEffect(() => {
    if (API_MODE) void restore();
  }, [restore]);

  return API_MODE ? restoring : false;
}

export default function App() {
  const restoring = useRestoredSession();

  if (restoring) return <RouteFallback />;

  return (
    <ErrorBoundary>
      <ToastProvider>
        <ConfirmProvider>
          <HashRouter>
            <Suspense fallback={<RouteFallback />}>
              <Routes>
                <Route path="/login" element={<LoginPage />} />
                <Route
                  path="/session-expired"
                  element={<SessionExpiredPage />}
                />

                <Route
                  element={
                    <RequireAuth>
                      <AppShell />
                    </RequireAuth>
                  }
                >
                  <Route index element={<DashboardPage />} />
                  <Route
                    path="/switch-role"
                    element={
                      <RequireDemoTools>
                        <SwitchRolePage />
                      </RequireDemoTools>
                    }
                  />
                  <Route
                    path="/design-system"
                    element={
                      <RequireDemoTools>
                        <DesignSystemPage />
                      </RequireDemoTools>
                    }
                  />

                  <Route
                    path="/customers"
                    element={
                      <RequireModule module="customers">
                        <CustomersListPage />
                      </RequireModule>
                    }
                  />
                  <Route
                    path="/customers/new"
                    element={
                      <RequireModule module="customers" action="create">
                        <CustomersListPage />
                      </RequireModule>
                    }
                  />
                  <Route
                    path="/customers/:id"
                    element={
                      <RequireModule module="customers">
                        <CustomerDetailPage />
                      </RequireModule>
                    }
                  />
                  <Route
                    path="/items"
                    element={
                      <RequireModule module="items">
                        <ItemsListPage />
                      </RequireModule>
                    }
                  />
                  <Route
                    path="/items/new"
                    element={
                      <RequireModule module="items" action="create">
                        <ItemsListPage />
                      </RequireModule>
                    }
                  />
                  <Route
                    path="/items/:id"
                    element={
                      <RequireModule module="items">
                        <ItemDetailPage />
                      </RequireModule>
                    }
                  />
                  <Route
                    path="/categories"
                    element={
                      <RequireModule module="categories">
                        <CategoriesPage />
                      </RequireModule>
                    }
                  />
                  <Route
                    path="/prices"
                    element={
                      <RequireModule module="prices">
                        <CustomerPricesPage />
                      </RequireModule>
                    }
                  />
                  <Route
                    path="/stock"
                    element={
                      <RequireModule module="stock">
                        <StockPage />
                      </RequireModule>
                    }
                  />

                  <Route
                    path="/orders"
                    element={
                      <RequireModule module="orders">
                        <OrdersListPage />
                      </RequireModule>
                    }
                  />
                  <Route
                    path="/orders/new"
                    element={
                      <RequireModule module="orders" action="create">
                        <NewOrderPage />
                      </RequireModule>
                    }
                  />
                  <Route
                    path="/orders/:id"
                    element={
                      <RequireModule module="orders">
                        <OrderDetailPage />
                      </RequireModule>
                    }
                  />
                  <Route
                    path="/consolidation"
                    element={
                      <RequireModule module="consolidation">
                        <ConsolidationPage />
                      </RequireModule>
                    }
                  />

                  <Route
                    path="/purchase"
                    element={
                      <RequireModule module="purchase">
                        <PurchaseRequirementPage />
                      </RequireModule>
                    }
                  />
                  <Route
                    path="/purchase/new"
                    element={
                      <RequireModule module="purchase" action="create">
                        <PurchaseEntryPage />
                      </RequireModule>
                    }
                  />
                  <Route
                    path="/receiving"
                    element={
                      <RequireModule module="receiving">
                        <ReceivingPage />
                      </RequireModule>
                    }
                  />
                  <Route
                    path="/receiving/new"
                    element={
                      <RequireModule module="receiving" action="create">
                        <ReceivingPage />
                      </RequireModule>
                    }
                  />
                  <Route
                    path="/quality-check"
                    element={
                      <RequireModule module="receiving">
                        <QualityCheckPage />
                      </RequireModule>
                    }
                  />
                  <Route
                    path="/allocation"
                    element={
                      <RequireModule module="allocation">
                        <AllocationPage />
                      </RequireModule>
                    }
                  />
                  <Route
                    path="/shortage"
                    element={
                      <RequireModule module="allocation">
                        <ShortageExcessPage />
                      </RequireModule>
                    }
                  />

                  <Route
                    path="/packing"
                    element={
                      <RequireModule module="packing">
                        <PackingDashboardPage />
                      </RequireModule>
                    }
                  />
                  <Route
                    path="/packing/:orderId"
                    element={
                      <RequireModule module="packing" action="edit">
                        <CustomerPackingPage />
                      </RequireModule>
                    }
                  />
                  <Route
                    path="/delivery"
                    element={
                      <RequireModule module="delivery">
                        <DeliveryDashboardPage />
                      </RequireModule>
                    }
                  />
                  <Route
                    path="/challans"
                    element={
                      <RequireModule module="delivery">
                        <ChallansListPage />
                      </RequireModule>
                    }
                  />
                  <Route
                    path="/challans/:id"
                    element={
                      <RequireModule module="delivery">
                        <ChallanDetailPage />
                      </RequireModule>
                    }
                  />

                  <Route
                    path="/invoices"
                    element={
                      <RequireModule module="invoices">
                        <InvoicesListPage />
                      </RequireModule>
                    }
                  />
                  <Route
                    path="/invoices/new"
                    element={
                      <RequireModule module="invoices" action="create">
                        <CreateInvoicePage />
                      </RequireModule>
                    }
                  />
                  <Route
                    path="/invoices/:id"
                    element={
                      <RequireModule module="invoices">
                        <InvoiceDetailPage />
                      </RequireModule>
                    }
                  />
                  <Route
                    path="/payments"
                    element={
                      <RequireModule module="payments">
                        <PaymentsListPage />
                      </RequireModule>
                    }
                  />
                  <Route
                    path="/payments/new"
                    element={
                      <RequireModule module="payments" action="create">
                        <PaymentsListPage />
                      </RequireModule>
                    }
                  />
                  <Route
                    path="/outstanding"
                    element={
                      <RequireModule module="outstanding">
                        <OutstandingPage />
                      </RequireModule>
                    }
                  />
                  <Route
                    path="/ledger"
                    element={
                      <RequireModule module="ledger">
                        <CustomerLedgerPage />
                      </RequireModule>
                    }
                  />
                  <Route
                    path="/reports/operations"
                    element={
                      <RequireModule module="reports">
                        <OperationsReportsPage />
                      </RequireModule>
                    }
                  />
                  <Route
                    path="/reports/sales"
                    element={
                      <RequireModule module="reports">
                        <SalesReportsPage />
                      </RequireModule>
                    }
                  />
                  <Route
                    path="/reports/purchase"
                    element={
                      <RequireModule module="reports">
                        <PurchaseReportsPage />
                      </RequireModule>
                    }
                  />
                  <Route
                    path="/analytics"
                    element={
                      <RequireModule module="analytics">
                        <AnalyticsPage />
                      </RequireModule>
                    }
                  />
                  <Route
                    path="/notifications"
                    element={
                      <RequireModule module="notifications">
                        <NotificationsPage />
                      </RequireModule>
                    }
                  />
                  <Route
                    path="/audit-logs"
                    element={
                      <RequireModule module="audit">
                        <AuditLogPage />
                      </RequireModule>
                    }
                  />
                  <Route
                    path="/users"
                    element={
                      <RequireModule module="users">
                        <UsersRolesPage />
                      </RequireModule>
                    }
                  />
                  <Route
                    path="/settings"
                    element={
                      <RequireModule module="settings">
                        <SettingsPage />
                      </RequireModule>
                    }
                  />
                  {[...PLACEHOLDER_PATHS.entries()].map(([path, meta]) => (
                    <Route
                      key={path}
                      path={path}
                      element={
                        <RequireModule module={meta.module}>
                          <ComingSoon
                            title={TITLES[meta.module] ?? meta.label}
                            phase={meta.phase}
                          />
                        </RequireModule>
                      }
                    />
                  ))}
                  <Route path="*" element={<NotFoundPage />} />
                </Route>

                <Route
                  element={
                    <RequireAuth>
                      <CustomerShell />
                    </RequireAuth>
                  }
                >
                  <Route
                    path="/portal"
                    element={
                      <RequireModule module="portal">
                        <PortalHomePage />
                      </RequireModule>
                    }
                  />
                  <Route
                    path="/portal/order"
                    element={
                      <RequireModule module="portal" action="create">
                        <PlaceOrderPage />
                      </RequireModule>
                    }
                  />
                  <Route
                    path="/portal/orders"
                    element={
                      <RequireModule module="portal">
                        <PortalOrdersPage />
                      </RequireModule>
                    }
                  />
                  <Route
                    path="/portal/invoices"
                    element={
                      <RequireModule module="portal">
                        <PortalInvoicesPage />
                      </RequireModule>
                    }
                  />
                  <Route
                    path="/portal/ledger"
                    element={
                      <RequireModule module="portal">
                        <PortalLedgerPage />
                      </RequireModule>
                    }
                  />
                  <Route
                    path="/portal/account"
                    element={
                      <RequireModule module="portal">
                        <PortalAccountPage />
                      </RequireModule>
                    }
                  />
                </Route>

                <Route
                  element={
                    <RequireAuth>
                      <DriverShell />
                    </RequireAuth>
                  }
                >
                  <Route
                    path="/driver"
                    element={
                      <RequireModule module="driver_app">
                        <DriverTodayPage />
                      </RequireModule>
                    }
                  />
                  <Route
                    path="/driver/deliveries"
                    element={
                      <RequireModule module="driver_app">
                        <DriverDeliveriesPage />
                      </RequireModule>
                    }
                  />
                  <Route
                    path="/driver/challans"
                    element={
                      <RequireModule module="driver_app">
                        <DriverChallansPage />
                      </RequireModule>
                    }
                  />
                  <Route
                    path="/driver/challans/:id"
                    element={
                      <RequireModule module="driver_app">
                        <ChallanDetailPage />
                      </RequireModule>
                    }
                  />
                  <Route
                    path="/driver/history"
                    element={
                      <RequireModule module="driver_app">
                        <DriverHistoryPage />
                      </RequireModule>
                    }
                  />
                  <Route
                    path="/driver/profile"
                    element={
                      <RequireModule module="driver_app">
                        <DriverProfilePage />
                      </RequireModule>
                    }
                  />
                  <Route
                    path="/driver/confirm/:challanId"
                    element={
                      <RequireModule module="driver_app" action="edit">
                        <DeliveryConfirmationPage />
                      </RequireModule>
                    }
                  />
                </Route>
              </Routes>
            </Suspense>
          </HashRouter>
        </ConfirmProvider>
      </ToastProvider>
    </ErrorBoundary>
  );
}
