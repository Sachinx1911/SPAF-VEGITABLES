import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { Printer, Wallet } from 'lucide-react';
import { PageHeader, Card, CardBody, CardHeader } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { StatusBadge } from '../../components/ui/Badge';
import { DataTable, type Column } from '../../components/ui/DataTable';
import { EmptyState } from '../../components/ui/States';
import { useDb } from '../../store/useStore';
import { invoiceViews, outstandingSummary } from '../../domain/finance';
import { fmtDate, inr } from '../../lib/format';
import { todayISO } from '../../lib/clock';
import type { Customer } from '../../types/models';

interface CustomerOutstandingRow {
  customer: Customer;
  invoiceCount: number;
  total: number;
  paid: number;
  outstanding: number;
  oldestDue: string;
  status: 'Outstanding' | 'Overdue';
}

export function OutstandingPage() {
  const db = useDb();
  const nav = useNavigate();
  const today = todayISO();

  const views = useMemo(() => invoiceViews(db, today), [db, today]);
  const summary = useMemo(() => outstandingSummary(db, today), [db, today]);

  const rows: CustomerOutstandingRow[] = useMemo(() => {
    const byCust = new Map<string, CustomerOutstandingRow>();
    for (const inv of views.filter((i) => i.balance > 0)) {
      const customer = db.customers.find((c) => c.id === inv.customerId);
      if (!customer) continue;
      const cur = byCust.get(customer.id) ?? { customer, invoiceCount: 0, total: 0, paid: 0, outstanding: 0, oldestDue: inv.dueDate, status: 'Outstanding' };
      cur.invoiceCount += 1;
      cur.total += inv.total;
      cur.paid += inv.paid;
      cur.outstanding += inv.balance;
      if (inv.dueDate < cur.oldestDue) cur.oldestDue = inv.dueDate;
      if (inv.daysOverdue > 0) cur.status = 'Overdue';
      byCust.set(customer.id, cur);
    }
    return [...byCust.values()].sort((a, b) => b.outstanding - a.outstanding);
  }, [views, db.customers]);

  const columns: Column<CustomerOutstandingRow>[] = [
    { key: 'customer', header: 'Customer', render: (r) => r.customer.name, sortValue: (r) => r.customer.name },
    { key: 'count', header: 'Invoices', align: 'right', render: (r) => r.invoiceCount },
    { key: 'total', header: 'Total', align: 'right', render: (r) => <span className="tabular">{inr(r.total)}</span>, hideBelow: 'md' },
    { key: 'paid', header: 'Paid', align: 'right', render: (r) => <span className="tabular text-muted">{inr(r.paid)}</span>, hideBelow: 'lg' },
    { key: 'outstanding', header: 'Outstanding', align: 'right', render: (r) => <span className="tabular font-semibold text-orange-600">{inr(r.outstanding)}</span>, sortValue: (r) => r.outstanding },
    { key: 'oldest', header: 'Oldest Due', render: (r) => fmtDate(r.oldestDue), sortValue: (r) => r.oldestDue },
    { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
  ];

  return (
    <div>
      <PageHeader title="Outstanding" description={`As of ${fmtDate(today)}`} actions={<Button variant="secondary" icon={Printer} onClick={() => window.print()}>Print</Button>} />

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Total Outstanding" value={inr(summary.total)} tone="orange" />
        <Stat label="Overdue" value={inr(summary.overdue)} tone="red" />
        <Stat label="Due Today" value={inr(summary.dueToday)} />
        <Stat label="Due Soon (7d)" value={inr(summary.dueSoon)} />
      </div>

      <Card className="mb-4">
        <CardHeader title="Aging" />
        <CardBody className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {summary.aging.map((b) => (
            <div key={b.label} className="rounded-lg border border-line p-3">
              <p className="text-[11.5px] text-muted">{b.label}</p>
              <p className="tabular text-[16px] font-semibold text-ink">{inr(b.amount)}</p>
              <p className="text-[11px] text-subtle">{b.count} invoices</p>
            </div>
          ))}
        </CardBody>
      </Card>

      <Card className="print-area">
        {rows.length === 0 ? (
          <EmptyState icon={Wallet} title="No outstanding dues" description="Every invoice has been paid in full." />
        ) : (
          <DataTable
            columns={columns} rows={rows} rowKey={(r) => r.customer.id} onRowClick={(r) => nav(`/customers/${r.customer.id}`)} exportFilename="outstanding" pageSize={50}
            cardRender={(r) => (
              <div>
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate text-[13.5px] font-medium text-ink">{r.customer.name}</p>
                  <StatusBadge status={r.status} />
                </div>
                <p className="mt-0.5 text-xs text-muted">{r.invoiceCount} invoices · oldest due {fmtDate(r.oldestDue)}</p>
                <p className="tabular mt-1 text-[13px] font-semibold text-orange-600">{inr(r.outstanding)}</p>
              </div>
            )}
          />
        )}
      </Card>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: 'orange' | 'red' }) {
  return (
    <Card className="p-3.5">
      <p className="text-[11.5px] font-medium text-muted">{label}</p>
      <p className={`tabular mt-1 text-[18px] font-semibold ${tone === 'red' ? 'text-red-600' : tone === 'orange' ? 'text-orange-600' : 'text-ink'}`}>{value}</p>
    </Card>
  );
}
