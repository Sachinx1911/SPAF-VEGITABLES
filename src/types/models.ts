/**
 * SPAF domain model.
 *
 * Each interface maps 1:1 onto a future MySQL table (Laravel migration). Field
 * names are camelCase here; the table/column name is noted where it differs.
 * All dates are local ISO strings: 'YYYY-MM-DD' for dates, 'YYYY-MM-DDTHH:mm:ss'
 * for timestamps. Money is stored in rupees as numbers (DECIMAL(12,2) in MySQL).
 */

export type ID = string;
export type ISODate = string;
export type ISODateTime = string;

export const UNITS = ['Kg', 'Pcs', 'Bdl', 'Dozen', 'Pkt', 'Box'] as const;
export type Unit = (typeof UNITS)[number];

export const CATEGORIES = [
  'Indian Vegetables',
  'Imported Produce',
  'Herbs & Leafy',
  'Fresh Fruits',
  'Exotic Vegetables',
] as const;
export type Category = (typeof CATEGORIES)[number];

export const CUSTOMER_TYPES = ['Hotel', 'Restaurant', 'Cafe', 'Caterer', 'Corporate', 'Other'] as const;
export type CustomerType = (typeof CUSTOMER_TYPES)[number];

/** table: routes */
export interface Route {
  id: ID;
  code: string; // R1…R5
  name: string;
  area: string;
  driverId: ID | null;
  vehicleNo: string;
  departureTime: string; // HH:mm
}

/** table: customers */
export interface Customer {
  id: ID;
  code: string; // SPC-001
  routeCode: string; // sheet/route code from the legacy master (A, B, … ZZN)
  shortLabel: string; // short label printed on consolidation sheets
  routeOrder: number; // print & delivery sequence
  routeId: ID;
  name: string; // display name
  legalName: string; // exactly as in the accounting export
  type: CustomerType;
  location: string;
  contactPerson: string;
  mobile: string;
  altMobile: string;
  email: string;
  billingAddress: string;
  deliveryAddress: string;
  gstin: string;
  pan: string;
  paymentTermsDays: number;
  creditLimit: number;
  orderFrequency: 'Daily' | 'Alternate Days' | 'Weekly' | 'On Demand';
  preferredOrderTime: string;
  preferredDeliveryTime: string;
  specialInstructions: string;
  active: boolean;
  createdAt: ISODateTime;
}

/** table: items — Item + Unit is the SKU; the same produce in another unit is a separate row. */
export interface Item {
  id: ID;
  code: string;
  name: string;
  excelName: string; // name used in the legacy sale-report export (import mapping)
  category: Category;
  unit: Unit;
  purchaseUnit: Unit;
  sellingUnit: Unit;
  minStock: number;
  reorderLevel: number;
  defaultPurchasePrice: number;
  defaultSellingPrice: number;
  taxRate: number; // % GST; fresh produce is 0
  stock: number;
  sortOrder: number;
  active: boolean;
}

/** table: customer_item_prices */
export interface CustomerItemPrice {
  id: ID;
  customerId: ID;
  itemId: ID;
  unit: Unit;
  price: number;
  effectiveFrom: ISODate;
  effectiveTo: ISODate | null;
}

/** table: suppliers */
export interface Supplier {
  id: ID;
  code: string;
  name: string;
  market: string;
  contactPerson: string;
  mobile: string;
  categories: Category[];
}

export type OrderStatus =
  | 'Draft'
  | 'Submitted'
  | 'Approved'
  | 'Rejected'
  | 'Locked'
  | 'Late'
  | 'Partially Fulfilled'
  | 'Completed';

export type PackingStatus = 'Not Started' | 'To Pack' | 'Packing' | 'Packed' | 'Issue';
export type DeliveryStatus = 'Pending' | 'Ready' | 'Dispatched' | 'In Transit' | 'Delivered' | 'Partial' | 'Failed';
export type OrderInvoiceStatus = 'Not Ready' | 'Ready' | 'Invoiced';
export type OrderSource = 'Staff' | 'Customer Portal' | 'WhatsApp' | 'Phone';

/** table: orders */
export interface Order {
  id: ID;
  orderNo: string; // SO-2609-0142
  customerId: ID;
  orderDate: ISODate;
  deliveryDate: ISODate;
  orderType: 'Regular' | 'Urgent' | 'Top-up';
  source: OrderSource;
  status: OrderStatus;
  isLate: boolean;
  receivedAt: ISODateTime;
  approvedBy: ID | null;
  approvedAt: ISODateTime | null;
  lockedAt: ISODateTime | null;
  packingStatus: PackingStatus;
  deliveryStatus: DeliveryStatus;
  invoiceStatus: OrderInvoiceStatus;
  repeatOfOrderId: ID | null;
  remarks: string;
  createdBy: ID;
  createdAt: ISODateTime;
}

/**
 * The quantity chain. Every stage keeps its own value — a later stage never
 * overwrites an earlier one. null = stage not reached yet.
 * MySQL: one DECIMAL(10,3) NULL column per stage on order_items (qty_ordered, qty_approved, …).
 */
export const QTY_STAGES = [
  'ordered',
  'approved',
  'purchased',
  'received',
  'accepted',
  'allocated',
  'packed',
  'dispatched',
  'delivered',
  'customerAccepted',
  'invoiced',
  'paid',
] as const;
export type QtyStage = (typeof QTY_STAGES)[number];
export type QtyChain = Record<QtyStage, number | null>;

/** table: order_items */
export interface OrderItem {
  id: ID;
  orderId: ID;
  itemId: ID;
  unit: Unit;
  rate: number; // customer price captured at order time
  qty: QtyChain;
  remarks: string;
}

/** table: consolidation_locks */
export interface ConsolidationLock {
  id: ID;
  deliveryDate: ISODate;
  lockedAt: ISODateTime;
  lockedBy: ID;
  orderIds: ID[];
}

/** table: purchase_requirements — snapshot taken when consolidation is locked */
export interface PurchaseRequirement {
  id: ID;
  deliveryDate: ISODate;
  itemId: ID;
  unit: Unit;
  requiredQty: number;
  stockQty: number;
  generatedAt: ISODateTime;
}

/** table: purchase_orders */
export interface PurchaseOrder {
  id: ID;
  poNo: string;
  supplierId: ID;
  purchaseDate: ISODate;
  forDeliveryDate: ISODate;
  supplierInvoiceNo: string;
  status: 'Draft' | 'Confirmed' | 'Partially Received' | 'Received';
  taxAmount: number;
  createdBy: ID;
  createdAt: ISODateTime;
}

/** table: purchase_order_items */
export interface PurchaseOrderItem {
  id: ID;
  purchaseOrderId: ID;
  itemId: ID;
  unit: Unit;
  qty: number;
  rate: number;
  remarks: string;
}

/** table: receivings (GRN) — never modifies the purchase order */
export interface Receiving {
  id: ID;
  grnNo: string;
  purchaseOrderId: ID;
  receivedAt: ISODateTime;
  receivedBy: ID;
  status: 'Received' | 'Partial' | 'Rejected';
}

/** table: receiving_items */
export interface ReceivingItem {
  id: ID;
  receivingId: ID;
  purchaseOrderItemId: ID;
  itemId: ID;
  unit: Unit;
  orderedQty: number;
  receivedQty: number;
  condition: 'Good' | 'Average' | 'Damaged';
}

export type QcGrade = 'A' | 'B' | 'C' | 'Rejected';
export type QcReason = 'Damaged' | 'Overripe' | 'Underripe' | 'Poor Quality' | 'Wrong Item' | 'Wrong Qty' | 'Other';

/** table: quality_checks */
export interface QualityCheck {
  id: ID;
  receivingItemId: ID;
  itemId: ID;
  unit: Unit;
  acceptedQty: number;
  rejectedQty: number;
  grade: QcGrade;
  reason: QcReason | null;
  remarks: string;
  checkedBy: ID;
  checkedAt: ISODateTime;
}

/** table: allocations */
export interface Allocation {
  id: ID;
  orderItemId: ID;
  orderId: ID;
  customerId: ID;
  itemId: ID;
  unit: Unit;
  deliveryDate: ISODate;
  requiredQty: number;
  allocatedQty: number;
  override: boolean;
  allocatedBy: ID;
  allocatedAt: ISODateTime;
}

/** table: packings */
export interface Packing {
  id: ID;
  packingNo: string;
  orderId: ID;
  customerId: ID;
  deliveryDate: ISODate;
  status: PackingStatus;
  packages: number;
  packedBy: ID | null;
  startedAt: ISODateTime | null;
  packedAt: ISODateTime | null;
  verified: boolean;
  issue: string;
}

export type PackageType = 'Bag' | 'Box' | 'Crate' | 'Other';

/** table: packing_items */
export interface PackingItem {
  id: ID;
  packingId: ID;
  allocationId: ID;
  orderItemId: ID;
  itemId: ID;
  unit: Unit;
  allocatedQty: number;
  packedQty: number | null;
  packageType: PackageType;
}

/** table: challans — read-only snapshot generated from packing; quantities are never typed in */
export interface Challan {
  id: ID;
  challanNo: string;
  packingId: ID;
  orderId: ID;
  customerId: ID;
  routeId: ID;
  challanDate: ISODate;
  driverId: ID | null;
  vehicleNo: string;
  status: DeliveryStatus;
  packages: number;
  lines: { orderItemId: ID; itemId: ID; unit: Unit; qty: number }[];
  preparedBy: ID;
  packedBy: ID | null;
  dispatchedAt: ISODateTime | null;
  deliveredAt: ISODateTime | null;
  receivedByName: string;
  signature: string | null; // data URL
  photo: string | null;
  deliveryRemarks: string;
}

export type InvoiceStatus = 'Draft' | 'Generated' | 'Sent' | 'Partially Paid' | 'Paid' | 'Overdue';

/** table: invoices */
export interface Invoice {
  id: ID;
  invoiceNo: string;
  customerId: ID;
  orderId: ID;
  challanId: ID | null;
  invoiceDate: ISODate;
  dueDate: ISODate;
  subtotal: number;
  taxAmount: number;
  total: number;
  status: Exclude<InvoiceStatus, 'Partially Paid' | 'Paid' | 'Overdue'>; // stored; paid/overdue are derived from payments
  createdBy: ID;
  createdAt: ISODateTime;
}

/** table: invoice_items */
export interface InvoiceItem {
  id: ID;
  invoiceId: ID;
  orderItemId: ID;
  itemId: ID;
  unit: Unit;
  qty: number;
  rate: number;
  taxRate: number;
  amount: number;
}

export type PaymentMode = 'Cash' | 'Bank Transfer' | 'UPI' | 'Cheque' | 'Other';

/** table: payments */
export interface Payment {
  id: ID;
  receiptNo: string;
  customerId: ID;
  invoiceId: ID;
  paymentDate: ISODate;
  mode: PaymentMode;
  reference: string;
  amount: number;
  remarks: string;
  recordedBy: ID;
  recordedAt: ISODateTime;
}

/** table: customer_opening_balances */
export interface OpeningBalance {
  customerId: ID;
  asOf: ISODate;
  amount: number;
}

/** Derived (view) — computed from invoices + payments, never stored separately. */
export interface LedgerEntry {
  date: ISODate;
  reference: string;
  description: string;
  debit: number;
  credit: number;
  balance: number;
}

export type RoleKey =
  | 'admin'
  | 'ops_manager'
  | 'order_exec'
  | 'purchase_manager'
  | 'warehouse'
  | 'delivery'
  | 'accounts'
  | 'customer'
  | 'driver';

export const PERMISSION_ACTIONS = ['view', 'create', 'edit', 'approve', 'delete', 'export', 'print'] as const;
export type PermissionAction = (typeof PERMISSION_ACTIONS)[number];

export type ModuleKey =
  | 'dashboard'
  | 'orders'
  | 'consolidation'
  | 'purchase'
  | 'receiving'
  | 'allocation'
  | 'packing'
  | 'delivery'
  | 'customers'
  | 'prices'
  | 'items'
  | 'categories'
  | 'stock'
  | 'invoices'
  | 'payments'
  | 'outstanding'
  | 'ledger'
  | 'reports'
  | 'analytics'
  | 'users'
  | 'notifications'
  | 'audit'
  | 'settings'
  | 'portal'
  | 'driver_app';

/** tables: roles + role_permissions */
export interface Role {
  key: RoleKey;
  name: string;
  description: string;
  permissions: Partial<Record<ModuleKey, PermissionAction[]>>;
}

/** table: users */
export interface User {
  id: ID;
  name: string;
  email: string;
  mobile: string;
  role: RoleKey;
  status: 'Active' | 'Inactive';
  lastLogin: ISODateTime | null;
  customerId: ID | null; // set for customer-portal users
}

/** table: audit_logs */
export interface AuditLog {
  id: ID;
  at: ISODateTime;
  userId: ID;
  action: string;
  module: ModuleKey;
  recordRef: string;
  customerId: ID | null;
  oldValue: string;
  newValue: string;
  device: string;
  status: 'Success' | 'Failed' | 'Warning';
}

/** table: daily_snapshots — written by a scheduled job at the same time each day (cron on cPanel) */
export interface DailySnapshot {
  date: ISODate;
  ordersReceived: number;
  pendingApproval: number;
  locked: number;
  purchaseRequired: number;
  receivedLines: number;
  packingPending: number;
  dispatchPending: number;
  delivered: number;
  outstanding: number;
  salesValue: number;
}

/** table: settings (key/value in MySQL) */
export interface Settings {
  companyName: string;
  companyAddress: string;
  companyGstin: string;
  companyPhone: string;
  companyEmail: string;
  orderCutoffTime: string; // HH:mm, for next-day delivery
  maxSheetColumns: number; // customers per printed consolidation sheet
  itemQtySheetItemIds: ID[];
  defaultPaymentTermsDays: number;
  invoicePrefix: string;
  challanPrefix: string;
}

export interface Database {
  meta: { version: number; seededAt: number; seq: number };
  settings: Settings;
  routes: Route[];
  customers: Customer[];
  items: Item[];
  prices: CustomerItemPrice[];
  suppliers: Supplier[];
  orders: Order[];
  orderItems: OrderItem[];
  locks: ConsolidationLock[];
  requirements: PurchaseRequirement[];
  purchaseOrders: PurchaseOrder[];
  purchaseOrderItems: PurchaseOrderItem[];
  receivings: Receiving[];
  receivingItems: ReceivingItem[];
  qualityChecks: QualityCheck[];
  allocations: Allocation[];
  packings: Packing[];
  packingItems: PackingItem[];
  challans: Challan[];
  invoices: Invoice[];
  invoiceItems: InvoiceItem[];
  payments: Payment[];
  openingBalances: OpeningBalance[];
  roles: Role[];
  users: User[];
  auditLogs: AuditLog[];
  snapshots: DailySnapshot[];
}
