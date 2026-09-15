import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { FileText, Plus } from 'lucide-react';
import { PageHeader, Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Select } from '../../components/ui/Field';
import { StatusBadge } from '../../components/ui/Badge';
import { DataTable, type Column } from '../../components/ui/DataTable';
import { EmptyState } from '../../components/ui/States';
import { useDb } from '../../store/useStore';
import { invoiceViews, type InvoiceView } from '../../domain/finance';
import { fmtDate, inr } from '../../lib/format';
import { todayISO } from '../../lib/clock';

const STATUSES = ['Draft', 'Generated', 'Sent', 'Partially Paid', 'Paid', 'Overdue'];

export function InvoicesListPage() {
  const db = useDb();
  const nav = useNavigate();
  const today = todayISO();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [customerId, setCustomerId] = useState('');

  const views = useMemo(() => invoiceViews(db, today), [db, today]);
  const custById = new Map(db.customers.map((c) => [c.id, c]));
  const rows = views.filter((i) => {
    const term = search.trim().toLowerCase();
    const cust = custById.get(i.customerId);
    if (term && !(i.invoiceNo.toLowerCase().includes(term) || cust?.name.toLowerCase().includes(term))) return false;
    if (status && i.derivedStatus !== status) return false;
    if (customerId && i.customerId !== customerId) return false;
    return true;
  }).sort((a, b) => (a.invoiceDate < b.invoiceDate ? 1 : -1));

  const columns: Column<InvoiceView>[] = [
    { key: 'no', header: 'Invoice No', render: (i) => <span className="font-medium text-brand-700">{i.invoiceNo}</span>, sortValue: (i) => i.invoiceNo, exportValue: (i) => i.invoiceNo },
    { key: 'customer', header: 'Customer', render: (i) => custById.get(i.customerId)?.name ?? '—', sortValue: (i) => custById.get(i.customerId)?.name ?? '' },
    { key: 'date', header: 'Invoice Date', render: (i) => fmtDate(i.invoiceDate), sortValue: (i) => i.invoiceDate },
    { key: 'due', header: 'Due Date', render: (i) => fmtDate(i.dueDate), hideBelow: 'md' },
    { key: 'order', header: 'Order', render: (i) => db.orders.find((o) => o.id === i.orderId)?.orderNo ?? '—', hideBelow: 'lg' },
    { key: 'amount', header: 'Amount', align: 'right', render: (i) => <span className="tabular">{inr(i.total)}</span>, sortValue: (i) => i.total },
    { key: 'paid', header: 'Paid', align: 'right', render: (i) => <span className="tabular text-muted">{inr(i.paid)}</span>, hideBelow: 'md' },
    { key: 'balance', header: 'Balance', align: 'right', render: (i) => (i.balance ? <span className="tabular font-medium text-orange-600">{inr(i.balance)}</span> : '—'), sortValue: (i) => i.balance },
    { key: 'status', header: 'Status', render: (i) => <StatusBadge status={i.derivedStatus} /> },
  ];

  return (
    <div>
      <PageHeader
        title="Invoices"
        description={`${rows.length} of ${db.invoices.length} invoices`}
        actions={<Button variant="primary" icon={Plus} onClick={() => nav('/invoices/new')}>Create Invoice</Button>}
      />
      <Card>
        {rows.length === 0 && !search && !status && !customerId ? (
          <EmptyState icon={FileText} title="No invoices yet" description="Invoices generate from delivered orders." action={<Button size="sm" variant="primary" icon={Plus} onClick={() => nav('/invoices/new')} className="mt-1">Create Invoice</Button>} />
        ) : (
          <DataTable
            columns={columns}
            rows={rows}
            rowKey={(i) => i.id}
            onRowClick={(i) => nav(`/invoices/${i.id}`)}
            searchValue={search}
            onSearchChange={setSearch}
            searchPlaceholder="Search invoice no. or customer…"
            exportFilename="invoices"
            filters={
              <>
                <Select value={status} onChange={(e) => setStatus(e.target.value)} placeholder="All status" options={STATUSES} className="w-36" />
                <Select value={customerId} onChange={(e) => setCustomerId(e.target.value)} placeholder="All customers" className="w-48" options={db.customers.map((c) => ({ value: c.id, label: c.name }))} />
              </>
            }
            emptyTitle="No invoices found"
            pageSize={50}
            cardRender={(i) => (
              <div>
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[13.5px] font-medium text-brand-700">{i.invoiceNo}</p>
                  <StatusBadge status={i.derivedStatus} />
                </div>
                <p className="mt-0.5 text-xs text-muted">{custById.get(i.customerId)?.name} · {fmtDate(i.invoiceDate)}</p>
                <div className="mt-1.5 flex items-center justify-between text-[13px]">
                  <span className="tabular font-semibold text-ink">{inr(i.total)}</span>
                  {i.balance > 0 && <span className="tabular font-medium text-orange-600">{inr(i.balance)} due</span>}
                </div>
              </div>
            )}
          />
        )}
      </Card>
    </div>
  );
}
