import { useMemo, useState } from 'react';
import { Printer } from 'lucide-react';
import { PageHeader, Card, CardHeader } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Select } from '../../components/ui/Field';
import { DateRangePicker } from '../../components/ui/DatePicker';
import { DataTable, type Column } from '../../components/ui/DataTable';
import { EmptyState } from '../../components/ui/States';
import { useDb } from '../../store/useStore';
import { buildLedger, type LedgerRow } from '../../domain/finance';
import { addDays, fmtDate, inr } from '../../lib/format';
import { todayISO } from '../../lib/clock';

export function CustomerLedgerPage() {
  const db = useDb();
  const today = todayISO();
  const [customerId, setCustomerId] = useState('');
  const [from, setFrom] = useState(addDays(today, -90));
  const [to, setTo] = useState(today);

  const rows = useMemo(() => (customerId ? buildLedger(db, customerId, from, to) : []), [db, customerId, from, to]);
  const balance = rows.at(-1)?.balance ?? 0;
  const customer = db.customers.find((c) => c.id === customerId);

  const columns: Column<LedgerRow>[] = [
    { key: 'date', header: 'Date', render: (r) => fmtDate(r.date), sortValue: (r) => r.date },
    { key: 'ref', header: 'Reference', render: (r) => r.reference },
    { key: 'desc', header: 'Description', render: (r) => <span className="text-muted">{r.description}</span> },
    { key: 'debit', header: 'Debit', align: 'right', render: (r) => (r.debit ? <span className="tabular">{inr(r.debit)}</span> : '—') },
    { key: 'credit', header: 'Credit', align: 'right', render: (r) => (r.credit ? <span className="tabular text-emerald-700">{inr(r.credit)}</span> : '—') },
    { key: 'balance', header: 'Balance', align: 'right', render: (r) => <span className="tabular font-semibold">{inr(r.balance)}</span> },
  ];

  return (
    <div>
      <PageHeader title="Customer Ledger" description="Running balance per customer, from invoices and payments." actions={<Button variant="secondary" icon={Printer} onClick={() => window.print()} disabled={!customerId}>Print</Button>} />
      <Card className="mb-4">
        <div className="flex flex-wrap items-end gap-3 p-3.5">
          <div>
            <label className="mb-1 block text-[11.5px] font-medium text-muted">Customer</label>
            <Select value={customerId} onChange={(e) => setCustomerId(e.target.value)} placeholder="Select customer…" className="w-56" options={db.customers.map((c) => ({ value: c.id, label: c.name }))} />
          </div>
          <DateRangePicker from={from} to={to} onChange={(f, t) => { setFrom(f); setTo(t); }} />
        </div>
      </Card>

      {!customerId ? (
        <Card><EmptyState title="Choose a customer" description="Select a customer to view their statement." /></Card>
      ) : (
        <Card className="print-area">
          <CardHeader title={customer?.name ?? ''} subtitle={`${fmtDate(from)} – ${fmtDate(to)}`} actions={<span className="tabular text-[15px] font-semibold text-ink">Balance: {inr(balance)}</span>} />
          <DataTable columns={columns} rows={rows} rowKey={(r) => `${r.date}-${r.reference}`} exportFilename={`${customer?.code}-ledger`} pageSize={50} emptyTitle="No entries in this range" />
        </Card>
      )}
    </div>
  );
}
