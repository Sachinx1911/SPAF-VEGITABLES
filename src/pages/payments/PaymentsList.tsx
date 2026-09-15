import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { HandCoins, Plus } from 'lucide-react';
import { PageHeader, Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Select } from '../../components/ui/Field';
import { Badge } from '../../components/ui/Badge';
import { DataTable, type Column } from '../../components/ui/DataTable';
import { EmptyState } from '../../components/ui/States';
import { useDb } from '../../store/useStore';
import type { Payment, PaymentMode } from '../../types/models';
import { fmtDate, inr } from '../../lib/format';
import { RecordPaymentModal } from './RecordPaymentModal';

const MODES: PaymentMode[] = ['Cash', 'Bank Transfer', 'UPI', 'Cheque', 'Other'];

export function PaymentsListPage() {
  const db = useDb();
  const nav = useNavigate();
  const loc = useLocation();
  const [search, setSearch] = useState('');
  const [mode, setMode] = useState('');
  const [modalOpen, setModalOpen] = useState(false);

  useEffect(() => { if (loc.pathname === '/payments/new') setModalOpen(true); }, [loc.pathname]);
  const closeModal = () => { setModalOpen(false); if (loc.pathname === '/payments/new') nav('/payments'); };

  const custById = new Map(db.customers.map((c) => [c.id, c]));
  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return [...db.payments]
      .filter((p) => {
        const cust = custById.get(p.customerId);
        if (term && !(p.receiptNo.toLowerCase().includes(term) || cust?.name.toLowerCase().includes(term))) return false;
        if (mode && p.mode !== mode) return false;
        return true;
      })
      .sort((a, b) => (a.paymentDate < b.paymentDate ? 1 : -1));
  }, [db.payments, search, mode]);

  const columns: Column<Payment>[] = [
    { key: 'receipt', header: 'Receipt No', render: (p) => <span className="font-medium text-brand-700">{p.receiptNo}</span>, sortValue: (p) => p.receiptNo },
    { key: 'customer', header: 'Customer', render: (p) => custById.get(p.customerId)?.name ?? '—' },
    { key: 'invoice', header: 'Invoice', render: (p) => db.invoices.find((i) => i.id === p.invoiceId)?.invoiceNo ?? '—', hideBelow: 'md' },
    { key: 'date', header: 'Date', render: (p) => fmtDate(p.paymentDate), sortValue: (p) => p.paymentDate },
    { key: 'mode', header: 'Mode', render: (p) => <Badge tone="blue">{p.mode}</Badge> },
    { key: 'ref', header: 'Reference', render: (p) => <span className="text-muted">{p.reference}</span>, hideBelow: 'lg' },
    { key: 'amount', header: 'Amount', align: 'right', render: (p) => <span className="tabular font-medium">{inr(p.amount)}</span>, sortValue: (p) => p.amount },
  ];

  return (
    <div>
      <PageHeader title="Payments" description={`${rows.length} of ${db.payments.length} payments`} actions={<Button variant="primary" icon={Plus} onClick={() => setModalOpen(true)}>Record Payment</Button>} />
      <Card>
        {rows.length === 0 && !search && !mode ? (
          <EmptyState icon={HandCoins} title="No payments yet" action={<Button size="sm" variant="primary" icon={Plus} onClick={() => setModalOpen(true)} className="mt-1">Record Payment</Button>} />
        ) : (
          <DataTable
            columns={columns}
            rows={rows}
            rowKey={(p) => p.id}
            searchValue={search}
            onSearchChange={setSearch}
            searchPlaceholder="Search receipt no. or customer…"
            exportFilename="payments"
            filters={<Select value={mode} onChange={(e) => setMode(e.target.value)} placeholder="All modes" options={MODES} className="w-36" />}
            emptyTitle="No payments found"
            pageSize={50}
          />
        )}
      </Card>
      <RecordPaymentModal open={modalOpen} onClose={closeModal} />
    </div>
  );
}
