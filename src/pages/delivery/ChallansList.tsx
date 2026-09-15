import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { PageHeader, Card } from '../../components/ui/Card';
import { Select } from '../../components/ui/Field';
import { StatusBadge } from '../../components/ui/Badge';
import { DataTable, type Column } from '../../components/ui/DataTable';
import { useDb } from '../../store/useStore';
import type { Challan } from '../../types/models';
import { fmtDate, fmtDateTime } from '../../lib/format';

const STATUSES: Challan['status'][] = ['Pending', 'Ready', 'Dispatched', 'In Transit', 'Delivered', 'Partial', 'Failed'];

export function ChallansListPage() {
  const db = useDb();
  const nav = useNavigate();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [customerId, setCustomerId] = useState('');

  const custById = new Map(db.customers.map((c) => [c.id, c]));
  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return [...db.challans]
      .filter((c) => {
        const cust = custById.get(c.customerId);
        if (term && !(c.challanNo.toLowerCase().includes(term) || cust?.name.toLowerCase().includes(term))) return false;
        if (status && c.status !== status) return false;
        if (customerId && c.customerId !== customerId) return false;
        return true;
      })
      .sort((a, b) => (a.challanDate < b.challanDate ? 1 : -1));
  }, [db.challans, search, status, customerId]);

  const columns: Column<Challan>[] = [
    { key: 'no', header: 'Challan No', render: (c) => <span className="font-medium text-brand-700">{c.challanNo}</span>, sortValue: (c) => c.challanNo, exportValue: (c) => c.challanNo },
    { key: 'customer', header: 'Customer', render: (c) => custById.get(c.customerId)?.name ?? '—', sortValue: (c) => custById.get(c.customerId)?.name ?? '' },
    { key: 'date', header: 'Date', render: (c) => fmtDate(c.challanDate), sortValue: (c) => c.challanDate },
    { key: 'driver', header: 'Driver', render: (c) => db.users.find((u) => u.id === c.driverId)?.name ?? '—', hideBelow: 'md' },
    { key: 'packages', header: 'Packages', align: 'right', render: (c) => c.packages, hideBelow: 'lg' },
    { key: 'dispatched', header: 'Dispatched', render: (c) => fmtDateTime(c.dispatchedAt), hideBelow: 'lg' },
    { key: 'delivered', header: 'Delivered', render: (c) => fmtDateTime(c.deliveredAt), hideBelow: 'lg' },
    { key: 'status', header: 'Status', render: (c) => <StatusBadge status={c.status} /> },
  ];

  return (
    <div>
      <PageHeader title="Delivery Challans" description={`${rows.length} of ${db.challans.length} challans`} />
      <Card>
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(c) => c.id}
          onRowClick={(c) => nav(`/challans/${c.id}`)}
          searchValue={search}
          onSearchChange={setSearch}
          searchPlaceholder="Search challan no. or customer…"
          exportFilename="challans"
          filters={
            <>
              <Select value={status} onChange={(e) => setStatus(e.target.value)} placeholder="All status" options={STATUSES} className="w-36" />
              <Select value={customerId} onChange={(e) => setCustomerId(e.target.value)} placeholder="All customers" className="w-48" options={db.customers.map((c) => ({ value: c.id, label: c.name }))} />
            </>
          }
          emptyTitle="No challans found"
          pageSize={50}
        />
      </Card>
    </div>
  );
}
