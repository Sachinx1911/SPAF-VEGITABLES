import { useMemo, useState } from 'react';
import { Printer } from 'lucide-react';
import { PageHeader, Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Select } from '../../components/ui/Field';
import { DateRangePicker } from '../../components/ui/DatePicker';
import { StatusBadge } from '../../components/ui/Badge';
import { DataTable, type Column } from '../../components/ui/DataTable';
import { useDb } from '../../store/useStore';
import {
  dailyOrdersReport, salesByCustomer, salesByItem, purchaseReport, purchaseVsSales, receivingReport, deliveryReport,
} from '../../domain/reports';
import { itemQuantityReport, buildConsolidation } from '../../domain/orders';
import { requirementRows } from '../../domain/ops';
import { addDays, fmtDate, inr, num, qty } from '../../lib/format';
import { todayISO } from '../../lib/clock';

type ReportKey =
  | 'daily-orders' | 'item-quantity' | 'delivery-performance'
  | 'customer-sales' | 'item-sales' | 'profitability'
  | 'purchase' | 'receiving' | 'shortage';

interface ReportOption { key: ReportKey; label: string }

const OPERATIONS: ReportOption[] = [
  { key: 'daily-orders', label: 'Daily Orders' },
  { key: 'item-quantity', label: 'Item Quantity' },
  { key: 'delivery-performance', label: 'Delivery Performance' },
];
const SALES: ReportOption[] = [
  { key: 'customer-sales', label: 'Customer Orders' },
  { key: 'item-sales', label: 'Item Sales' },
  { key: 'profitability', label: 'Purchase vs Sales' },
];
const PURCHASE: ReportOption[] = [
  { key: 'purchase', label: 'Purchase Report' },
  { key: 'receiving', label: 'Receiving Report' },
  { key: 'shortage', label: 'Shortage Report' },
];

function ReportsPage({ title, options }: { title: string; options: ReportOption[] }) {
  const db = useDb();
  const today = todayISO();
  const [report, setReport] = useState<ReportKey>(options[0]!.key);
  const [from, setFrom] = useState(addDays(today, -7));
  const [to, setTo] = useState(today);

  const { columns, rows, filename } = useMemo(() => buildReport(db, report, from, to), [db, report, from, to]);

  return (
    <div>
      <PageHeader title={title} description="Filter by date range, then export or print." actions={<Button variant="secondary" icon={Printer} onClick={() => window.print()}>Print</Button>} />
      <Card className="mb-4">
        <div className="flex flex-wrap items-end gap-3 p-3.5">
          <Select value={report} onChange={(e) => setReport(e.target.value as ReportKey)} options={options.map((o) => ({ value: o.key, label: o.label }))} className="w-56" />
          <DateRangePicker from={from} to={to} onChange={(f, t) => { setFrom(f); setTo(t); }} />
        </div>
      </Card>
      <Card className="print-area">
        <DataTable columns={columns} rows={rows} rowKey={(r: any, i?: number) => r.id ?? r.date ?? r.customerId ?? r.itemId ?? r.poNo ?? r.grnNo ?? String(i)} exportFilename={filename} pageSize={50} emptyTitle="No data for this range" />
      </Card>
    </div>
  );
}

function buildReport(db: ReturnType<typeof useDb>, report: ReportKey, from: string, to: string): { columns: Column<any>[]; rows: any[]; filename: string } {
  switch (report) {
    case 'daily-orders':
      return {
        filename: 'daily-orders', rows: dailyOrdersReport(db, from, to),
        columns: [
          { key: 'date', header: 'Date', render: (r) => fmtDate(r.date), sortValue: (r) => r.date },
          { key: 'orders', header: 'Orders', align: 'right', render: (r) => r.orders },
          { key: 'customers', header: 'Customers', align: 'right', render: (r) => r.customers },
          { key: 'lines', header: 'Lines', align: 'right', render: (r) => r.lines },
          { key: 'amount', header: 'Amount', align: 'right', render: (r) => <span className="tabular font-medium">{inr(r.amount)}</span> },
        ],
      };
    case 'item-quantity': {
      const matrix = buildConsolidation(db, to);
      return {
        filename: 'item-quantity', rows: itemQuantityReport(matrix),
        columns: [
          { key: 'category', header: 'Category', render: (r) => r.item.category },
          { key: 'item', header: 'Item', render: (r) => <span className="font-medium">{r.item.name} ({r.item.unit})</span> },
          { key: 'qty', header: 'Total Quantity', align: 'right', render: (r) => qty(r.totalQty, r.item.unit) },
          { key: 'customers', header: 'Customer Count', align: 'right', render: (r) => r.customerCount },
        ],
      };
    }
    case 'delivery-performance':
      return {
        filename: 'delivery-performance', rows: deliveryReport(db, from, to),
        columns: [
          { key: 'date', header: 'Date', render: (r) => fmtDate(r.date), sortValue: (r) => r.date },
          { key: 'total', header: 'Total', align: 'right', render: (r) => r.total },
          { key: 'delivered', header: 'Delivered', align: 'right', render: (r) => r.delivered },
          { key: 'partial', header: 'Partial', align: 'right', render: (r) => r.partial },
          { key: 'failed', header: 'Failed', align: 'right', render: (r) => r.failed },
          { key: 'ontime', header: 'Fulfilled %', align: 'right', render: (r) => `${r.onTimePct}%` },
        ],
      };
    case 'customer-sales':
      return {
        filename: 'customer-sales', rows: salesByCustomer(db, from, to),
        columns: [
          { key: 'name', header: 'Customer', render: (r) => r.name },
          { key: 'orders', header: 'Invoices', align: 'right', render: (r) => r.orders },
          { key: 'qty', header: 'Qty', align: 'right', render: (r) => num(r.qty) },
          { key: 'amount', header: 'Amount', align: 'right', render: (r) => <span className="tabular font-medium">{inr(r.amount)}</span> },
        ],
      };
    case 'item-sales':
      return {
        filename: 'item-sales', rows: salesByItem(db, from, to),
        columns: [
          { key: 'name', header: 'Item', render: (r) => `${r.name} (${r.unit})` },
          { key: 'qty', header: 'Qty Sold', align: 'right', render: (r) => num(r.qty) },
          { key: 'customers', header: 'Customers', align: 'right', render: (r) => r.customers },
          { key: 'amount', header: 'Amount', align: 'right', render: (r) => <span className="tabular font-medium">{inr(r.amount)}</span> },
        ],
      };
    case 'profitability':
      return {
        filename: 'purchase-vs-sales', rows: purchaseVsSales(db, from, to),
        columns: [
          { key: 'date', header: 'Date', render: (r) => fmtDate(r.date), sortValue: (r) => r.date },
          { key: 'purchase', header: 'Purchase', align: 'right', render: (r) => inr(r.purchase) },
          { key: 'sales', header: 'Sales', align: 'right', render: (r) => inr(r.sales) },
          { key: 'margin', header: 'Margin', align: 'right', render: (r) => <span className={`tabular font-medium ${r.margin >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>{inr(r.margin)}</span> },
        ],
      };
    case 'purchase':
      return {
        filename: 'purchase-report', rows: purchaseReport(db, from, to),
        columns: [
          { key: 'po', header: 'PO No', render: (r) => r.poNo },
          { key: 'supplier', header: 'Supplier', render: (r) => r.supplier },
          { key: 'date', header: 'Date', render: (r) => fmtDate(r.date), sortValue: (r) => r.date },
          { key: 'items', header: 'Items', align: 'right', render: (r) => r.items },
          { key: 'qty', header: 'Qty', align: 'right', render: (r) => num(r.qty) },
          { key: 'amount', header: 'Amount', align: 'right', render: (r) => <span className="tabular font-medium">{inr(r.amount)}</span> },
          { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
        ],
      };
    case 'receiving':
      return {
        filename: 'receiving-report', rows: receivingReport(db, from, to),
        columns: [
          { key: 'grn', header: 'GRN No', render: (r) => r.grnNo },
          { key: 'po', header: 'PO No', render: (r) => r.poNo },
          { key: 'supplier', header: 'Supplier', render: (r) => r.supplier },
          { key: 'date', header: 'Date', render: (r) => fmtDate(r.date), sortValue: (r) => r.date },
          { key: 'lines', header: 'Lines', align: 'right', render: (r) => r.lines },
          { key: 'shortage', header: 'Shortage Lines', align: 'right', render: (r) => r.shortageLines },
          { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
        ],
      };
    case 'shortage': {
      const rows = requirementRows(db, to).filter((r) => r.shortage > 0 || r.excess > 0);
      const itemById = new Map(db.items.map((i) => [i.id, i]));
      return {
        filename: 'shortage-report', rows: rows.map((r) => ({ ...r, name: itemById.get(r.itemId)?.name ?? r.itemId })),
        columns: [
          { key: 'item', header: 'Item', render: (r) => `${r.name} (${r.unit})` },
          { key: 'required', header: 'Required', align: 'right', render: (r) => qty(r.required, r.unit) },
          { key: 'available', header: 'Available', align: 'right', render: (r) => qty(r.available, r.unit) },
          { key: 'shortage', header: 'Shortage', align: 'right', render: (r) => (r.shortage ? qty(r.shortage, r.unit) : '—') },
          { key: 'excess', header: 'Excess', align: 'right', render: (r) => (r.excess ? qty(r.excess, r.unit) : '—') },
        ],
      };
    }
  }
}

export const OperationsReportsPage = () => <ReportsPage title="Operations Reports" options={OPERATIONS} />;
export const SalesReportsPage = () => <ReportsPage title="Sales Reports" options={SALES} />;
export const PurchaseReportsPage = () => <ReportsPage title="Purchase Reports" options={PURCHASE} />;
