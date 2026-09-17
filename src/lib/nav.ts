import type { LucideIcon } from 'lucide-react';
import {
  Bell, BookOpen, Boxes, ChartBar, ChartLine, ClipboardCheck, ClipboardList, FileText, FolderTree, HandCoins,
  Layers, LayoutDashboard, PackageCheck, PackageOpen, ReceiptIndianRupee, ScrollText, Settings, ShieldCheck,
  ShoppingCart, Split, Store, Tags, Truck, Users, Carrot, Wallet, TrendingUp, Route,
} from 'lucide-react';
import type { Database, ModuleKey, PermissionAction, RoleKey } from '../types/models';

export interface NavItem {
  module: ModuleKey;
  label: string;
  path: string;
  icon: LucideIcon;
  phase: number;
  /** Where the screen sits in the order-to-cash chain. */
  chain?: { from: string; to: string; summary: string };
}

export interface NavSection {
  title: string | null;
  items: NavItem[];
}

export const NAV: NavSection[] = [
  { title: null, items: [{ module: 'dashboard', label: 'Dashboard', path: '/', icon: LayoutDashboard, phase: 1 }] },
  {
    title: 'Operations',
    items: [
      { module: 'orders', label: 'Orders', path: '/orders', icon: ClipboardList, phase: 3, chain: { from: 'Customer', to: 'Approval → Lock', summary: 'Capture daily orders, approve, handle late and repeat orders.' } },
      { module: 'consolidation', label: 'Consolidation', path: '/consolidation', icon: Layers, phase: 3, chain: { from: 'Approved orders', to: 'Purchase requirement', summary: 'Item × customer matrix in route order; locking generates the purchase requirement.' } },
      { module: 'purchase', label: 'Purchase', path: '/purchase', icon: ShoppingCart, phase: 4, chain: { from: 'Purchase requirement', to: 'Receiving', summary: 'Buy what the locked consolidation needs, supplier-wise.' } },
      { module: 'receiving', label: 'Receiving', path: '/receiving', icon: PackageOpen, phase: 4, chain: { from: 'Purchase orders', to: 'Quality check → Allocation', summary: 'GRN against each PO, shortage/excess and quality grading.' } },
      { module: 'allocation', label: 'Allocation', path: '/allocation', icon: Split, phase: 4, chain: { from: 'Accepted stock', to: 'Packing list', summary: 'Distribute accepted stock to customer order lines; resolve shortages.' } },
      { module: 'packing', label: 'Packing', path: '/packing', icon: PackageCheck, phase: 5, chain: { from: 'Allocation', to: 'Delivery challan', summary: 'Pack each customer order and verify before a challan is generated.' } },
      { module: 'delivery', label: 'Delivery', path: '/delivery', icon: Truck, phase: 5, chain: { from: 'Challan', to: 'Customer acceptance → Invoice', summary: 'Dispatch routes, track drivers, capture proof of delivery.' } },
    ],
  },
  {
    title: 'Customers',
    items: [
      { module: 'customers', label: 'Customers', path: '/customers', icon: Users, phase: 2, chain: { from: '—', to: 'Orders', summary: 'Customer master: routes, terms, credit and contacts.' } },
      { module: 'prices', label: 'Customer Prices', path: '/prices', icon: Tags, phase: 2, chain: { from: 'Items + Customers', to: 'Order rates', summary: 'Customer-specific item prices with effective dates and history.' } },
    ],
  },
  {
    title: 'Inventory',
    items: [
      { module: 'items', label: 'Items', path: '/items', icon: Carrot, phase: 2, chain: { from: '—', to: 'Orders, Purchase', summary: 'Item + unit SKUs across the five produce categories.' } },
      { module: 'categories', label: 'Categories', path: '/categories', icon: FolderTree, phase: 2, chain: { from: '—', to: 'Items', summary: 'Produce categories and print grouping.' } },
      { module: 'stock', label: 'Stock', path: '/stock', icon: Boxes, phase: 2, chain: { from: 'Receiving, Allocation', to: 'Purchase requirement', summary: 'Carry-over stock by SKU, low-stock and reorder levels.' } },
    ],
  },
  {
    title: 'Finance',
    items: [
      { module: 'invoices', label: 'Invoices', path: '/invoices', icon: FileText, phase: 6, chain: { from: 'Delivery', to: 'Payment', summary: 'Invoices generated from customer-accepted quantities.' } },
      { module: 'payments', label: 'Payments', path: '/payments', icon: HandCoins, phase: 6, chain: { from: 'Invoice', to: 'Outstanding, Ledger', summary: 'Record receipts against invoices.' } },
      { module: 'outstanding', label: 'Outstanding', path: '/outstanding', icon: Wallet, phase: 6, chain: { from: 'Invoices − Payments', to: 'Follow-up', summary: 'Receivables with aging buckets.' } },
      { module: 'ledger', label: 'Customer Ledger', path: '/ledger', icon: BookOpen, phase: 6, chain: { from: 'Invoices + Payments', to: 'Statements', summary: 'Running balance per customer.' } },
    ],
  },
  {
    title: 'Reports',
    items: [
      { module: 'reports', label: 'Operations', path: '/reports/operations', icon: ClipboardCheck, phase: 6, chain: { from: 'All modules', to: 'Print / Export', summary: 'Consolidation, item quantity, packing and delivery reports.' } },
      { module: 'reports', label: 'Sales', path: '/reports/sales', icon: ReceiptIndianRupee, phase: 6, chain: { from: 'Invoices', to: 'Print / Export', summary: 'Sales by customer, item and period.' } },
      { module: 'reports', label: 'Purchase', path: '/reports/purchase', icon: ChartBar, phase: 6, chain: { from: 'Purchases', to: 'Print / Export', summary: 'Purchase, receiving, shortage and purchase-vs-sales.' } },
      { module: 'analytics', label: 'Analytics', path: '/analytics', icon: ChartLine, phase: 6, chain: { from: 'All modules', to: 'Decisions', summary: 'Volume, fulfilment, delivery performance and profitability.' } },
    ],
  },
  {
    title: 'System',
    items: [
      { module: 'users', label: 'Users & Roles', path: '/users', icon: ShieldCheck, phase: 6, chain: { from: '—', to: 'Access control', summary: 'Users, roles and the permission matrix.' } },
      { module: 'notifications', label: 'Notifications', path: '/notifications', icon: Bell, phase: 6, chain: { from: 'Live data', to: 'Action', summary: 'Every alert raised by the operations chain.' } },
      { module: 'audit', label: 'Audit Logs', path: '/audit-logs', icon: ScrollText, phase: 6, chain: { from: 'Every change', to: 'Accountability', summary: 'Who changed what, with old and new values.' } },
      { module: 'settings', label: 'Settings', path: '/settings', icon: Settings, phase: 6, chain: { from: '—', to: 'All modules', summary: 'Company, tax, units, cutoff, invoice and notification settings.' } },
    ],
  },
];

/** Screens reachable from actions rather than the sidebar. */
export const EXTRA_ROUTES: NavItem[] = [
  { module: 'orders', label: 'New Order', path: '/orders/new', icon: ClipboardList, phase: 3, chain: { from: 'Customer + prices', to: 'Approval', summary: 'Fast daily order entry with previous quantities and customer prices.' } },
  { module: 'customers', label: 'Add Customer', path: '/customers/new', icon: Users, phase: 2 },
  { module: 'items', label: 'Add Item', path: '/items/new', icon: Carrot, phase: 2 },
  { module: 'purchase', label: 'Purchase Entry', path: '/purchase/new', icon: ShoppingCart, phase: 4, chain: { from: 'Purchase requirement', to: 'Receiving', summary: 'Supplier purchase with multi-item lines.' } },
  { module: 'receiving', label: 'Receive Stock', path: '/receiving/new', icon: PackageOpen, phase: 4 },
  { module: 'receiving', label: 'Quality Check', path: '/quality-check', icon: ClipboardCheck, phase: 4 },
  { module: 'allocation', label: 'Shortage / Excess', path: '/shortage', icon: Split, phase: 4 },
  { module: 'delivery', label: 'Delivery Challans', path: '/challans', icon: Route, phase: 5, chain: { from: 'Packing', to: 'Dispatch', summary: 'Auto-generated challans — quantities pulled from packing, never re-typed.' } },
  { module: 'payments', label: 'Record Payment', path: '/payments/new', icon: HandCoins, phase: 6 },
  { module: 'invoices', label: 'Create Invoice', path: '/invoices/new', icon: FileText, phase: 6 },
  { module: 'driver_app', label: 'Driver App', path: '/driver', icon: Truck, phase: 5, chain: { from: 'Challans', to: 'Delivery confirmation', summary: 'Mobile route view with navigate, call, challan and proof of delivery.' } },
  { module: 'portal', label: 'Place Order', path: '/portal/order', icon: Store, phase: 3, chain: { from: 'Customer', to: 'Approval', summary: 'Customers place and repeat orders themselves.' } },
  { module: 'analytics', label: 'Trends', path: '/analytics/trends', icon: TrendingUp, phase: 6 },
];

export const ALL_ROUTES: NavItem[] = [...NAV.flatMap((s) => s.items), ...EXTRA_ROUTES];

/**
 * Grants the current session holds, when the server supplied them.
 *
 * In API mode this is the authority: the same grid the server checks on every
 * request, so a button is hidden exactly when the call behind it would be
 * refused. Without it the two could drift, and the UI would offer actions that
 * fail.
 */
let serverPermissions: Partial<Record<ModuleKey, PermissionAction[]>> | null = null;

export function setServerPermissions(p: Partial<Record<ModuleKey, PermissionAction[]>> | null): void {
  serverPermissions = p;
}

export function can(db: Database, role: RoleKey, module: ModuleKey, action: PermissionAction = 'view'): boolean {
  if (serverPermissions) return !!serverPermissions[module]?.includes(action);

  const r = db.roles.find((x) => x.key === role);
  return !!r?.permissions[module]?.includes(action);
}

export function navForRole(db: Database, role: RoleKey): NavSection[] {
  return NAV.map((s) => ({ ...s, items: s.items.filter((i) => can(db, role, i.module)) })).filter((s) => s.items.length);
}

export function homePathFor(role: RoleKey): string {
  if (role === 'customer') return '/portal';
  if (role === 'driver') return '/driver';
  return '/';
}
