import type { ModuleKey, PermissionAction, Role } from '../../types/models';

const ALL: PermissionAction[] = ['view', 'create', 'edit', 'approve', 'delete', 'export', 'print'];
const VIEW: PermissionAction[] = ['view'];
const VIEW_EXPORT: PermissionAction[] = ['view', 'export', 'print'];
const WORK: PermissionAction[] = ['view', 'create', 'edit', 'print'];

const everything = (actions: PermissionAction[]) =>
  Object.fromEntries(
    ([
      'dashboard', 'orders', 'consolidation', 'purchase', 'receiving', 'allocation', 'packing', 'delivery',
      'customers', 'prices', 'items', 'categories', 'stock', 'invoices', 'payments', 'outstanding', 'ledger',
      'reports', 'analytics', 'users', 'notifications', 'audit', 'settings',
    ] as ModuleKey[]).map((m) => [m, actions]),
  ) as Partial<Record<ModuleKey, PermissionAction[]>>;

export const ROLES: Role[] = [
  {
    key: 'admin',
    name: 'Admin',
    description: 'Full access to every module, users and settings.',
    permissions: everything(ALL),
  },
  {
    key: 'ops_manager',
    name: 'Operations Manager',
    description: 'Runs the daily loop end to end: approvals, locking, purchase, packing and dispatch.',
    permissions: {
      ...everything(VIEW_EXPORT),
      orders: ALL, consolidation: ALL, purchase: ALL, receiving: ALL, allocation: ALL, packing: ALL, delivery: ALL,
      customers: WORK, prices: ['view', 'create', 'edit', 'approve'], items: WORK, categories: WORK, stock: WORK,
      users: VIEW, settings: VIEW, notifications: ['view', 'edit'],
    },
  },
  {
    key: 'order_exec',
    name: 'Order Executive',
    description: 'Captures and edits customer orders, handles late orders and repeats.',
    permissions: {
      dashboard: VIEW, orders: ['view', 'create', 'edit', 'print', 'export'], consolidation: VIEW_EXPORT,
      customers: ['view', 'create', 'edit'], prices: VIEW, items: VIEW, delivery: VIEW, notifications: VIEW,
      reports: VIEW_EXPORT,
    },
  },
  {
    key: 'purchase_manager',
    name: 'Purchase Manager',
    description: 'Converts locked consolidation into purchases, receiving and quality checks.',
    permissions: {
      dashboard: VIEW, consolidation: VIEW_EXPORT, purchase: ALL, receiving: ALL, allocation: ['view', 'create', 'edit'],
      items: WORK, categories: VIEW, stock: WORK, orders: VIEW, notifications: VIEW, reports: VIEW_EXPORT, analytics: VIEW,
    },
  },
  {
    key: 'warehouse',
    name: 'Warehouse / Packing Staff',
    description: 'Receives stock, packs customer orders and prepares challans.',
    permissions: {
      dashboard: VIEW, receiving: WORK, allocation: VIEW, packing: WORK, delivery: ['view', 'print'], stock: VIEW,
      orders: VIEW, notifications: VIEW,
    },
  },
  {
    key: 'delivery',
    name: 'Delivery Supervisor',
    description: 'Assigns drivers, dispatches routes and tracks delivery confirmations.',
    permissions: {
      dashboard: VIEW, packing: VIEW, delivery: ALL, customers: VIEW, orders: VIEW, notifications: VIEW, reports: VIEW_EXPORT,
    },
  },
  {
    key: 'accounts',
    name: 'Accounts',
    description: 'Invoices, payments, outstanding follow-up and customer ledgers.',
    permissions: {
      dashboard: VIEW, orders: VIEW, delivery: VIEW, customers: ['view', 'edit'], prices: VIEW,
      invoices: ALL, payments: ALL, outstanding: VIEW_EXPORT, ledger: VIEW_EXPORT, reports: VIEW_EXPORT,
      analytics: VIEW, notifications: VIEW, audit: VIEW,
    },
  },
  {
    key: 'customer',
    name: 'Customer',
    description: 'Places orders and views own deliveries, invoices and ledger.',
    permissions: { portal: ['view', 'create', 'print'] },
  },
  {
    key: 'driver',
    name: 'Driver',
    description: 'Mobile delivery app: route, challans and delivery confirmation.',
    permissions: { driver_app: ['view', 'edit', 'print'] },
  },
];

export const DEMO_PASSWORD = 'spaf@123';

// [id, name, email, mobile, role, customer routeCode (portal users)]
export const USERS: [string, string, string, string, Role['key'], string | null][] = [
  ['u_admin', 'Rajesh Patil', 'rajesh.patil@svproagro.in', '98200 11021', 'admin', null],
  ['u_ops', 'Sneha Kulkarni', 'sneha.k@svproagro.in', '98191 40562', 'ops_manager', null],
  ['u_order', 'Imran Shaikh', 'imran.s@svproagro.in', '99300 28817', 'order_exec', null],
  ['u_order2', 'Kavita Naik', 'kavita.n@svproagro.in', '97699 12054', 'order_exec', null],
  ['u_purchase', 'Vikram Jadhav', 'vikram.j@svproagro.in', '98675 33190', 'purchase_manager', null],
  ['u_wh', 'Ganesh More', 'ganesh.m@svproagro.in', '93241 77805', 'warehouse', null],
  ['u_wh2', 'Pravin Salunkhe', 'pravin.s@svproagro.in', '90040 61237', 'warehouse', null],
  ['u_delivery', 'Santosh Yadav', 'santosh.y@svproagro.in', '98921 04478', 'delivery', null],
  ['u_accounts', 'Priya Mehta', 'priya.m@svproagro.in', '98333 65209', 'accounts', null],
  ['u_driver1', 'Ramesh Pawar', 'ramesh.pawar@svproagro.in', '97022 81136', 'driver', null],
  ['u_driver2', 'Sunil Gaikwad', 'sunil.g@svproagro.in', '98700 25563', 'driver', null],
  ['u_driver3', 'Anil Kamble', 'anil.k@svproagro.in', '99209 44710', 'driver', null],
  ['u_driver4', 'Deepak Chavan', 'deepak.c@svproagro.in', '96190 37028', 'driver', null],
  ['u_driver5', 'Mahesh Sawant', 'mahesh.s@svproagro.in', '98695 50912', 'driver', null],
  ['u_cust_terrace', 'Chef Rohan Kapoor', 'purchase@theterracejuhu.in', '98190 66231', 'customer', 'ZQ'],
];
