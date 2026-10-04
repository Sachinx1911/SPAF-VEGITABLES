import { useNavigate } from 'react-router';
import { ArrowLeft, FileText, Files } from 'lucide-react';
import { PageHeader, Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { DataTable, type Column } from '../../components/ui/DataTable';
import { EmptyState } from '../../components/ui/States';
import { useConfirm } from '../../components/ui/ConfirmDialog';
import { useToast } from '../../components/ui/Toast';
import { useCurrentUser, useDb } from '../../store/useStore';
import { generateAllInvoices, generateInvoice } from '../../store/financeActions';
import { ordersReadyToInvoice } from '../../domain/finance';
import { fmtDate, inr } from '../../lib/format';
import type { Order } from '../../types/models';

export function CreateInvoicePage() {
  const db = useDb();
  const user = useCurrentUser()!;
  const nav = useNavigate();
  const confirm = useConfirm();
  const toast = useToast();

  const rows = ordersReadyToInvoice(db);
  const custById = new Map(db.customers.map((c) => [c.id, c]));
  const amountFor = (o: Order) => db.orderItems.filter((l) => l.orderId === o.id).reduce((s, l) => s + (l.qty.customerAccepted ?? 0) * l.rate, 0);

  const create = async (order: Order) => {
    const customer = custById.get(order.customerId)!;
    const ok = await confirm({ title: `Generate invoice for ${customer.name}?`, description: order.orderNo, confirmLabel: 'Generate invoice', details: [{ label: 'Amount', value: inr(amountFor(order)) }] });
    if (!ok) return;
    const inv = generateInvoice(order.id, user.id);
    toast({ tone: 'success', title: 'Invoice generated', description: inv.invoiceNo });
    nav(`/invoices/${inv.id}`);
  };

  const createAll = async () => {
    const total = rows.reduce((s, o) => s + amountFor(o), 0);
    const ok = await confirm({ title: `Generate ${rows.length} invoices?`, description: 'One invoice per delivered order, at the quantities the customer accepted.', confirmLabel: 'Generate all', details: [{ label: 'Total', value: inr(total) }] });
    if (!ok) return;
    const n = generateAllInvoices(user.id);
    toast({ tone: 'success', title: `${n} invoices generated` });
    nav('/invoices');
  };

  const columns: Column<Order>[] = [
    { key: 'order', header: 'Order No', render: (o) => o.orderNo },
    { key: 'customer', header: 'Customer', render: (o) => custById.get(o.customerId)?.name ?? '—' },
    { key: 'delivery', header: 'Delivery Date', render: (o) => fmtDate(o.deliveryDate) },
    { key: 'amount', header: 'Amount', align: 'right', render: (o) => <span className="tabular font-medium">{inr(amountFor(o))}</span> },
    { key: 'actions', header: '', align: 'right', render: (o) => <Button size="xs" variant="primary" onClick={() => create(o)}>Generate</Button> },
  ];

  return (
    <div>
      <PageHeader
        title="Create Invoice"
        description="Delivered orders are invoiced automatically. Anything listed here still needs one."
        actions={
          <>
            <Button variant="secondary" icon={ArrowLeft} onClick={() => nav('/invoices')}>Back</Button>
            {rows.length > 0 && <Button variant="primary" icon={Files} onClick={createAll}>Generate all ({rows.length})</Button>}
          </>
        }
      />
      <Card>
        {rows.length === 0 ? (
          <EmptyState icon={FileText} title="Nothing to invoice" description="Every delivered order already has an invoice — they are generated the moment a driver confirms delivery." />
        ) : (
          <DataTable columns={columns} rows={rows} rowKey={(o) => o.id} pageSize={50} />
        )}
      </Card>
    </div>
  );
}
