import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import {
  Building2, CreditCard, HandCoins, MapPin, Mail, PenLine, Phone, Receipt, ClipboardList, Tags, Truck, BookOpen,
  StickyNote, ArrowLeft, Printer,
} from 'lucide-react';
import { Card, CardBody, CardHeader, PageHeader } from '../../components/ui/Card';
import { Button, IconButton } from '../../components/ui/Button';
import { Badge, StatusBadge } from '../../components/ui/Badge';
import { Tabs } from '../../components/ui/Tabs';
import { DataTable, type Column } from '../../components/ui/DataTable';
import { Breadcrumb } from '../../components/ui/Breadcrumb';
import { EmptyState } from '../../components/ui/States';
import { Textarea } from '../../components/ui/Field';
import { CustomerForm } from './CustomerForm';
import { useCurrentUser, useDb } from '../../store/useStore';
import { updateCustomer } from '../../store/actions';
import { useToast } from '../../components/ui/Toast';
import { fmtDate, fmtDateTime, inr } from '../../lib/format';
import { todayISO } from '../../lib/clock';
import { invoiceViews, buildLedger, customerOutstanding } from '../../domain/finance';
import type { Challan, Invoice, Order, Payment } from '../../types/models';

export function CustomerDetailPage() {
  const { id } = useParams();
  const nav = useNavigate();
  const db = useDb();
  const user = useCurrentUser()!;
  const toast = useToast();
  const [tab, setTab] = useState('overview');
  const [editOpen, setEditOpen] = useState(false);
  const today = todayISO();

  const customer = db.customers.find((c) => c.id === id);
  const route = db.routes.find((r) => r.id === customer?.routeId);
  const orders = useMemo(() => db.orders.filter((o) => o.customerId === id).sort((a, b) => (a.orderDate < b.orderDate ? 1 : -1)), [db.orders, id]);
  const invoices = useMemo(() => invoiceViews(db, today).filter((i) => i.customerId === id).sort((a, b) => (a.invoiceDate < b.invoiceDate ? 1 : -1)), [db, id, today]);
  const payments = useMemo(() => db.payments.filter((p) => p.customerId === id).sort((a, b) => (a.paymentDate < b.paymentDate ? 1 : -1)), [db.payments, id]);
  const challans = useMemo(() => db.challans.filter((c) => c.customerId === id).sort((a, b) => (a.challanDate < b.challanDate ? 1 : -1)), [db.challans, id]);
  const prices = useMemo(() => db.prices.filter((p) => p.customerId === id).sort((a, b) => (a.effectiveFrom < b.effectiveFrom ? 1 : -1)), [db.prices, id]);
  const outstanding = customerOutstanding(db, today).get(id ?? '') ?? 0;
  const ledger = useMemo(() => (id ? buildLedger(db, id) : []), [db, id]);
  const itemById = new Map(db.items.map((i) => [i.id, i]));

  const [notes, setNotes] = useState(customer?.specialInstructions ?? '');

  if (!customer) {
    return <EmptyState title="Customer not found" description="It may have been removed." action={<Button size="sm" onClick={() => nav('/customers')}>Back to customers</Button>} />;
  }

  const lastOrder = orders[0];

  const orderCols: Column<Order>[] = [
    { key: 'orderNo', header: 'Order No', render: (o) => <span className="font-medium text-brand-700">{o.orderNo}</span>, sortValue: (o) => o.orderNo },
    { key: 'orderDate', header: 'Order Date', render: (o) => fmtDate(o.orderDate), sortValue: (o) => o.orderDate },
    { key: 'deliveryDate', header: 'Delivery Date', render: (o) => fmtDate(o.deliveryDate), sortValue: (o) => o.deliveryDate },
    { key: 'source', header: 'Source', render: (o) => o.source, hideBelow: 'md' },
    { key: 'status', header: 'Status', render: (o) => <StatusBadge status={o.status} /> },
    { key: 'delivery', header: 'Delivery', render: (o) => <StatusBadge status={o.deliveryStatus} />, hideBelow: 'md' },
    { key: 'invoice', header: 'Invoice', render: (o) => <StatusBadge status={o.invoiceStatus} />, hideBelow: 'lg' },
  ];

  const priceCols: Column<(typeof prices)[number]>[] = [
    { key: 'item', header: 'Item', render: (p) => itemById.get(p.itemId)?.name ?? p.itemId, sortValue: (p) => itemById.get(p.itemId)?.name ?? '' },
    { key: 'unit', header: 'Unit', render: (p) => <Badge tone="neutral">{p.unit}</Badge> },
    { key: 'price', header: 'Price', align: 'right', render: (p) => <span className="tabular font-medium">{inr(p.price, true)}</span>, sortValue: (p) => p.price },
    { key: 'from', header: 'Effective From', render: (p) => fmtDate(p.effectiveFrom), sortValue: (p) => p.effectiveFrom },
    { key: 'to', header: 'Effective To', render: (p) => (p.effectiveTo ? fmtDate(p.effectiveTo) : '—') },
    { key: 'status', header: 'Status', render: (p) => <StatusBadge status={p.effectiveTo ? 'Inactive' : 'Active'} /> },
  ];

  const invoiceCols: Column<Invoice & { paid: number; balance: number; derivedStatus: string }>[] = [
    { key: 'no', header: 'Invoice No', render: (i) => <span className="font-medium text-brand-700">{i.invoiceNo}</span>, sortValue: (i) => i.invoiceNo },
    { key: 'date', header: 'Date', render: (i) => fmtDate(i.invoiceDate), sortValue: (i) => i.invoiceDate },
    { key: 'due', header: 'Due Date', render: (i) => fmtDate(i.dueDate), hideBelow: 'md' },
    { key: 'total', header: 'Amount', align: 'right', render: (i) => <span className="tabular">{inr(i.total)}</span>, sortValue: (i) => i.total },
    { key: 'paid', header: 'Paid', align: 'right', render: (i) => <span className="tabular text-muted">{inr(i.paid)}</span>, hideBelow: 'md' },
    { key: 'balance', header: 'Balance', align: 'right', render: (i) => <span className="tabular font-medium">{i.balance ? inr(i.balance) : '—'}</span>, sortValue: (i) => i.balance },
    { key: 'status', header: 'Status', render: (i) => <StatusBadge status={i.derivedStatus} /> },
  ];

  const paymentCols: Column<Payment>[] = [
    { key: 'receipt', header: 'Receipt No', render: (p) => <span className="font-medium text-brand-700">{p.receiptNo}</span> },
    { key: 'date', header: 'Date', render: (p) => fmtDate(p.paymentDate), sortValue: (p) => p.paymentDate },
    { key: 'invoice', header: 'Invoice', render: (p) => db.invoices.find((i) => i.id === p.invoiceId)?.invoiceNo ?? '—' },
    { key: 'mode', header: 'Mode', render: (p) => <Badge tone="blue">{p.mode}</Badge> },
    { key: 'ref', header: 'Reference', render: (p) => <span className="text-muted">{p.reference}</span>, hideBelow: 'lg' },
    { key: 'amount', header: 'Amount', align: 'right', render: (p) => <span className="tabular font-medium">{inr(p.amount)}</span>, sortValue: (p) => p.amount },
  ];

  const challanCols: Column<Challan>[] = [
    { key: 'no', header: 'Challan No', render: (c) => <span className="font-medium text-brand-700">{c.challanNo}</span> },
    { key: 'date', header: 'Date', render: (c) => fmtDate(c.challanDate), sortValue: (c) => c.challanDate },
    { key: 'driver', header: 'Driver', render: (c) => db.users.find((u) => u.id === c.driverId)?.name ?? '—', hideBelow: 'md' },
    { key: 'packages', header: 'Packages', align: 'right', render: (c) => c.packages },
    { key: 'status', header: 'Status', render: (c) => <StatusBadge status={c.status} /> },
    { key: 'delivered', header: 'Delivered At', render: (c) => fmtDateTime(c.deliveredAt), hideBelow: 'lg' },
  ];

  const ledgerCols: Column<(typeof ledger)[number]>[] = [
    { key: 'date', header: 'Date', render: (r) => fmtDate(r.date), sortValue: (r) => r.date },
    { key: 'ref', header: 'Reference', render: (r) => r.reference },
    { key: 'desc', header: 'Description', render: (r) => <span className="text-muted">{r.description}</span> },
    { key: 'debit', header: 'Debit', align: 'right', render: (r) => (r.debit ? <span className="tabular">{inr(r.debit)}</span> : '—') },
    { key: 'credit', header: 'Credit', align: 'right', render: (r) => (r.credit ? <span className="tabular text-emerald-700">{inr(r.credit)}</span> : '—') },
    { key: 'balance', header: 'Balance', align: 'right', render: (r) => <span className="tabular font-semibold">{inr(r.balance)}</span> },
  ];

  return (
    <div>
      <PageHeader
        breadcrumb={<Breadcrumb items={[{ label: 'Customers', to: '/customers' }, { label: customer.name }]} />}
        title={
          <span className="flex items-center gap-2">
            {customer.name} <StatusBadge status={customer.active ? 'Active' : 'Inactive'} />
          </span>
        }
        description={`${customer.code} · ${customer.type} · ${customer.location}`}
        actions={
          <>
            <Button variant="secondary" icon={ArrowLeft} onClick={() => nav('/customers')}>Back</Button>
            <Button variant="primary" icon={PenLine} onClick={() => setEditOpen(true)}>Edit</Button>
          </>
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatBlock label="Outstanding" value={inr(outstanding)} tone={outstanding > customer.creditLimit ? 'red' : outstanding ? 'orange' : undefined} />
        <StatBlock label="Credit Limit" value={inr(customer.creditLimit)} />
        <StatBlock label="Total Orders" value={String(orders.length)} />
        <StatBlock label="Last Order" value={lastOrder ? fmtDate(lastOrder.orderDate) : '—'} />
      </div>

      <Tabs
        variant="pill"
        value={tab}
        onChange={setTab}
        items={[
          { key: 'overview', label: 'Overview', icon: <Building2 size={14} /> },
          { key: 'orders', label: 'Orders', icon: <ClipboardList size={14} />, count: orders.length },
          { key: 'prices', label: 'Prices', icon: <Tags size={14} />, count: prices.length },
          { key: 'invoices', label: 'Invoices', icon: <Receipt size={14} />, count: invoices.length },
          { key: 'payments', label: 'Payments', icon: <HandCoins size={14} />, count: payments.length },
          { key: 'ledger', label: 'Ledger', icon: <BookOpen size={14} /> },
          { key: 'delivery', label: 'Delivery History', icon: <Truck size={14} />, count: challans.length },
          { key: 'notes', label: 'Notes', icon: <StickyNote size={14} /> },
        ]}
      />

      <div className="mt-4">
        {tab === 'overview' && (
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader title="Contact" icon={<Phone size={15} />} />
              <CardBody className="flex flex-col gap-2.5 text-[13px]">
                <Row label="Contact person" value={customer.contactPerson} />
                <Row label="Mobile" value={customer.mobile} />
                {customer.altMobile && <Row label="Alt. mobile" value={customer.altMobile} />}
                <Row label="Email" value={customer.email} />
                <Row label="Route" value={route?.name ?? '—'} />
              </CardBody>
            </Card>
            <Card>
              <CardHeader title="Addresses" icon={<MapPin size={15} />} />
              <CardBody className="flex flex-col gap-2.5 text-[13px]">
                <Row label="Billing" value={customer.billingAddress} />
                <Row label="Delivery" value={customer.deliveryAddress || customer.billingAddress} />
              </CardBody>
            </Card>
            <Card>
              <CardHeader title="Commercial terms" icon={<CreditCard size={15} />} />
              <CardBody className="flex flex-col gap-2.5 text-[13px]">
                <Row label="GSTIN" value={customer.gstin} />
                <Row label="PAN" value={customer.pan} />
                <Row label="Payment terms" value={`${customer.paymentTermsDays} days`} />
                <Row label="Credit limit" value={inr(customer.creditLimit)} />
              </CardBody>
            </Card>
            <Card>
              <CardHeader title="Ordering preferences" icon={<Mail size={15} />} />
              <CardBody className="flex flex-col gap-2.5 text-[13px]">
                <Row label="Frequency" value={customer.orderFrequency} />
                <Row label="Preferred order time" value={customer.preferredOrderTime} />
                <Row label="Preferred delivery time" value={customer.preferredDeliveryTime} />
                {customer.specialInstructions && <Row label="Instructions" value={customer.specialInstructions} />}
              </CardBody>
            </Card>
          </div>
        )}

        {tab === 'orders' && (
          <Card>
            <DataTable columns={orderCols} rows={orders} rowKey={(o) => o.id} onRowClick={(o) => nav(`/orders/${o.id}`)} exportFilename={`${customer.code}-orders`}
              emptyTitle="No orders yet" emptyDescription="Orders placed by this customer will appear here." />
          </Card>
        )}
        {tab === 'prices' && (
          <Card>
            <DataTable columns={priceCols} rows={prices} rowKey={(p) => p.id} exportFilename={`${customer.code}-prices`}
              emptyTitle="No custom prices" emptyDescription="This customer uses default item prices." />
          </Card>
        )}
        {tab === 'invoices' && (
          <Card>
            <DataTable columns={invoiceCols} rows={invoices} rowKey={(i) => i.id} onRowClick={(i) => nav(`/invoices/${i.id}`)} exportFilename={`${customer.code}-invoices`}
              emptyTitle="No invoices yet" />
          </Card>
        )}
        {tab === 'payments' && (
          <Card>
            <DataTable columns={paymentCols} rows={payments} rowKey={(p) => p.id} exportFilename={`${customer.code}-payments`} emptyTitle="No payments recorded" />
          </Card>
        )}
        {tab === 'ledger' && (
          <Card>
            <CardHeader title="Customer Ledger" subtitle={`Running balance as of ${fmtDate(today)}`} actions={<IconButton icon={Printer} label="Print" onClick={() => window.print()} />} />
            <div className="print-area">
              <DataTable columns={ledgerCols} rows={ledger} rowKey={(r) => `${r.date}-${r.reference}`} exportFilename={`${customer.code}-ledger`} emptyTitle="No ledger entries" pageSize={50} />
            </div>
          </Card>
        )}
        {tab === 'delivery' && (
          <Card>
            <DataTable columns={challanCols} rows={challans} rowKey={(c) => c.id} onRowClick={(c) => nav(`/challans/${c.id}`)} exportFilename={`${customer.code}-deliveries`} emptyTitle="No deliveries yet" />
          </Card>
        )}
        {tab === 'notes' && (
          <Card>
            <CardHeader title="Special instructions & notes" icon={<StickyNote size={15} />} />
            <CardBody className="flex flex-col gap-3">
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={4} placeholder="Delivery gate instructions, packaging preferences, standing requests…" />
              <div>
                <Button
                  size="sm" variant="primary"
                  onClick={() => { updateCustomer(customer.id, { specialInstructions: notes }, user.id); toast({ tone: 'success', title: 'Notes saved' }); }}
                >
                  Save notes
                </Button>
              </div>
            </CardBody>
          </Card>
        )}
      </div>

      <CustomerForm open={editOpen} onClose={() => setEditOpen(false)} customer={customer} />
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="shrink-0 text-muted">{label}</span>
      <span className="text-right font-medium text-ink">{value || '—'}</span>
    </div>
  );
}

function StatBlock({ label, value, tone }: { label: string; value: string; tone?: 'red' | 'orange' }) {
  return (
    <Card className="p-3.5">
      <p className="text-[11.5px] font-medium text-muted">{label}</p>
      <p className={`tabular mt-1 text-[17px] font-semibold ${tone === 'red' ? 'text-red-600' : tone === 'orange' ? 'text-orange-600' : 'text-ink'}`}>{value}</p>
    </Card>
  );
}
