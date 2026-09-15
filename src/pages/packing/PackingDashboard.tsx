import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { ChevronRight, PackageCheck } from 'lucide-react';
import { PageHeader, Card, CardBody } from '../../components/ui/Card';
import { Select } from '../../components/ui/Field';
import { StatTile } from '../../components/ui/Kpi';
import { Badge, StatusBadge } from '../../components/ui/Badge';
import { DataTable, type Column } from '../../components/ui/DataTable';
import { EmptyState } from '../../components/ui/States';
import { useDb } from '../../store/useStore';
import { packingBoard, packingCounts, type PackingBoardRow } from '../../domain/packing';
import { todayISO } from '../../lib/clock';

export function PackingDashboardPage() {
  const db = useDb();
  const nav = useNavigate();
  const [date, setDate] = useState(todayISO());
  const [routeId, setRouteId] = useState('');
  const [status, setStatus] = useState('');

  const allRows = useMemo(() => packingBoard(db, date), [db, date]);
  const counts = packingCounts(allRows);
  const rows = allRows.filter((r) => (!routeId || r.route?.id === routeId) && (!status || r.status === status));

  const columns: Column<PackingBoardRow>[] = [
    { key: 'customer', header: 'Customer', render: (r) => r.customer.name, sortValue: (r) => r.customer.routeOrder },
    { key: 'route', header: 'Route', render: (r) => r.route?.name ?? '—', hideBelow: 'md' },
    { key: 'order', header: 'Order', render: (r) => r.order.orderNo, hideBelow: 'lg' },
    { key: 'items', header: 'Items', align: 'right', render: (r) => r.allocatedLines },
    { key: 'priority', header: 'Priority', render: (r) => <Badge tone={r.priority === 'Urgent' ? 'red' : 'neutral'}>{r.priority}</Badge>, hideBelow: 'md' },
    { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status === 'Packing' ? 'Packing' : r.status} /> },
  ];

  return (
    <div>
      <PageHeader title="Packing" description={`Delivery ${date} · ${allRows.length} orders to prepare`} />
      <div className="mb-4 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <StatTile label="To Pack" value={counts.toPack} tone="neutral" />
        <StatTile label="In Progress" value={counts.packing} tone="blue" />
        <StatTile label="Packed" value={counts.packed} tone="green" />
        <StatTile label="Issues" value={counts.issue} tone="red" />
      </div>
      <Card className="mb-4">
        <CardBody className="flex flex-wrap items-end gap-3">
          <div>
            <label className="mb-1 block text-[11.5px] font-medium text-muted">Delivery date</label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-9 rounded-lg border border-line px-3 text-[13px]" />
          </div>
          <Select value={routeId} onChange={(e) => setRouteId(e.target.value)} placeholder="All routes" className="w-48" options={db.routes.map((r) => ({ value: r.id, label: r.name }))} />
          <Select value={status} onChange={(e) => setStatus(e.target.value)} placeholder="All status" className="w-36" options={['To Pack', 'Packing', 'Packed', 'Issue']} />
        </CardBody>
      </Card>
      <Card>
        {rows.length === 0 ? (
          <EmptyState icon={PackageCheck} title="Nothing to pack" description="Orders appear here once stock is allocated." />
        ) : (
          <DataTable
            columns={columns} rows={rows} rowKey={(r) => r.order.id} onRowClick={(r) => nav(`/packing/${r.order.id}`)} pageSize={50}
            cardRender={(r) => (
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-[13.5px] font-medium text-ink">{r.customer.name}</p>
                  <p className="truncate text-xs text-muted">{r.route?.name ?? '—'} · {r.allocatedLines} items{r.priority === 'Urgent' ? ' · Urgent' : ''}</p>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <StatusBadge status={r.status === 'Packing' ? 'Packing' : r.status} />
                  <ChevronRight size={16} className="text-subtle" />
                </div>
              </div>
            )}
          />
        )}
      </Card>
    </div>
  );
}
