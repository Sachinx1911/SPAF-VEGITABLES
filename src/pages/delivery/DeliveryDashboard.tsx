import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { Truck } from 'lucide-react';
import { PageHeader, Card, CardBody } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Select } from '../../components/ui/Field';
import { StatTile } from '../../components/ui/Kpi';
import { StatusBadge } from '../../components/ui/Badge';
import { DataTable, type Column } from '../../components/ui/DataTable';
import { EmptyState } from '../../components/ui/States';
import { useConfirm } from '../../components/ui/ConfirmDialog';
import { useToast } from '../../components/ui/Toast';
import { useCurrentUser, useDb } from '../../store/useStore';
import { dispatchChallan } from '../../store/packingActions';
import { deliveryRows, type DeliveryBoardRow } from '../../domain/packing';
import { fmtDateTime } from '../../lib/format';
import { todayISO } from '../../lib/clock';

export function DeliveryDashboardPage() {
  const db = useDb();
  const user = useCurrentUser()!;
  const nav = useNavigate();
  const confirm = useConfirm();
  const toast = useToast();
  const [date, setDate] = useState(todayISO());
  const [routeId, setRouteId] = useState('');

  const allRows = useMemo(() => deliveryRows(db, date), [db, date]);
  const rows = allRows.filter((r) => !routeId || r.route?.id === routeId);
  const counts = {
    ready: allRows.filter((r) => r.challan.status === 'Ready').length,
    dispatched: allRows.filter((r) => r.challan.status === 'Dispatched' || r.challan.status === 'In Transit').length,
    delivered: allRows.filter((r) => r.challan.status === 'Delivered' || r.challan.status === 'Partial').length,
    issue: allRows.filter((r) => r.challan.status === 'Failed').length,
  };

  const doDispatch = async (r: DeliveryBoardRow) => {
    const ok = await confirm({ title: `Dispatch ${r.challan.challanNo}?`, description: `${r.customer?.name} · ${r.route?.name}`, confirmLabel: 'Dispatch' });
    if (ok) { dispatchChallan(r.challan.id, user.id); toast({ tone: 'success', title: 'Dispatched', description: r.challan.challanNo }); }
  };

  const columns: Column<DeliveryBoardRow>[] = [
    { key: 'route', header: 'Route', render: (r) => r.route?.name ?? '—', sortValue: (r) => r.customer?.routeOrder ?? 0 },
    { key: 'customer', header: 'Customer', render: (r) => r.customer?.name ?? '—' },
    { key: 'order', header: 'Order', render: (r) => r.order?.orderNo ?? '—', hideBelow: 'lg' },
    { key: 'packages', header: 'Packages', align: 'right', render: (r) => r.challan.packages },
    { key: 'driver', header: 'Driver', render: (r) => r.driverName, hideBelow: 'md' },
    { key: 'dispatch', header: 'Dispatch Time', render: (r) => (r.challan.dispatchedAt ? fmtDateTime(r.challan.dispatchedAt) : '—'), hideBelow: 'lg' },
    { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.challan.status} /> },
    {
      key: 'actions', header: '', align: 'right',
      render: (r) => (
        <div className="flex justify-end gap-1.5">
          {r.challan.status === 'Ready' && <Button size="xs" variant="primary" onClick={() => doDispatch(r)}>Dispatch</Button>}
          <Button size="xs" variant="secondary" onClick={() => nav(`/challans/${r.challan.id}`)}>View</Button>
        </div>
      ),
    },
  ];

  return (
    <div>
      <PageHeader title="Delivery" description={`${allRows.length} challans for ${date}`} />
      <div className="mb-4 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <StatTile label="Ready" value={counts.ready} tone="neutral" />
        <StatTile label="Dispatched" value={counts.dispatched} tone="blue" />
        <StatTile label="Delivered" value={counts.delivered} tone="green" />
        <StatTile label="Issues" value={counts.issue} tone="red" />
      </div>
      <Card className="mb-4">
        <CardBody className="flex flex-wrap items-end gap-3">
          <div>
            <label className="mb-1 block text-[11.5px] font-medium text-muted">Delivery date</label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-9 rounded-lg border border-line px-3 text-[13px]" />
          </div>
          <Select value={routeId} onChange={(e) => setRouteId(e.target.value)} placeholder="All routes" className="w-48" options={db.routes.map((r) => ({ value: r.id, label: r.name }))} />
        </CardBody>
      </Card>
      <Card>
        {rows.length === 0 ? (
          <EmptyState icon={Truck} title="No deliveries yet" description="Challans appear here once orders are packed." />
        ) : (
          <DataTable columns={columns} rows={rows} rowKey={(r) => r.challan.id} pageSize={50} />
        )}
      </Card>
    </div>
  );
}
