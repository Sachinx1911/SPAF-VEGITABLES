import { useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { ChevronRight, PackageCheck } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { useConfirm } from '../../components/ui/ConfirmDialog';
import { useToast } from '../../components/ui/Toast';
import { packAllOrders, packOrderAsAllocated } from '../../store/packingActions';
import { PageHeader, Card, CardBody } from '../../components/ui/Card';
import { Select } from '../../components/ui/Field';
import { DateField } from '../../components/ui/DatePicker';
import { StatTile } from '../../components/ui/Kpi';
import { Badge, StatusBadge } from '../../components/ui/Badge';
import { DataTable, type Column } from '../../components/ui/DataTable';
import { EmptyState } from '../../components/ui/States';
import { useCurrentUser, useDb } from '../../store/useStore';
import { packingBoard, packingCounts, type PackingBoardRow } from '../../domain/packing';
import { todayISO } from '../../lib/clock';
import { fmtDate } from '../../lib/format';

export function PackingDashboardPage() {
  const db = useDb();
  const user = useCurrentUser()!;
  const nav = useNavigate();
  const loc = useLocation();
  const confirm = useConfirm();
  const toast = useToast();
  const [date, setDate] = useState(() => new URLSearchParams(loc.search).get('date') ?? todayISO());
  const [routeId, setRouteId] = useState('');
  const [status, setStatus] = useState('');

  const allRows = useMemo(() => packingBoard(db, date), [db, date]);
  const counts = packingCounts(allRows);
  const rows = allRows.filter((r) => (!routeId || r.route?.id === routeId) && (!status || r.status === status));

  const open = allRows.filter((r) => r.status !== 'Packed' && (!routeId || r.route?.id === routeId));
  const packAll = async () => {
    const ok = await confirm({
      title: `Pack ${open.length} orders as allocated?`,
      description: 'Every open order is marked packed at its allocated quantities and a delivery challan is generated for each. Open an order first if anything needs changing.',
      confirmLabel: 'Pack all & generate challans',
      details: [{ label: 'Delivery date', value: fmtDate(date) }, { label: 'Orders', value: open.length }],
    });
    if (!ok) return;
    const n = packAllOrders(date, user.id, routeId || undefined);
    toast({ tone: 'success', title: `${n} orders packed`, description: 'Challans are ready on the Delivery board.' });
  };
  const packOne = async (r: PackingBoardRow) => {
    const ok = await confirm({ title: `Pack ${r.customer.name} as allocated?`, description: `${r.order.orderNo} · ${r.allocatedLines} lines · generates the challan`, confirmLabel: 'Mark packed' });
    if (!ok) return;
    const challan = packOrderAsAllocated(r.order.id, user.id);
    toast({ tone: 'success', title: 'Packed', description: challan.challanNo });
  };

  const columns: Column<PackingBoardRow>[] = [
    { key: 'customer', header: 'Customer', render: (r) => r.customer.name, sortValue: (r) => r.customer.routeOrder },
    { key: 'route', header: 'Route', render: (r) => r.route?.name ?? '—', hideBelow: 'md' },
    { key: 'order', header: 'Order', nowrap: true, render: (r) => r.order.orderNo, hideBelow: 'lg' },
    { key: 'items', header: 'Items', align: 'right', render: (r) => r.allocatedLines },
    { key: 'priority', header: 'Priority', render: (r) => <Badge tone={r.priority === 'Urgent' ? 'red' : 'neutral'}>{r.priority}</Badge>, hideBelow: 'md' },
    { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status === 'Packing' ? 'Packing' : r.status} /> },
    {
      key: 'actions', header: '', align: 'right',
      render: (r) => (
        <div className="flex justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
          {r.status !== 'Packed' && <Button size="xs" variant="primary" onClick={() => packOne(r)}>Mark packed</Button>}
          <Button size="xs" variant="secondary" onClick={() => nav(`/packing/${r.order.id}?from=${date}`)}>{r.status === 'Packed' ? 'View' : 'Open'}</Button>
        </div>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Packing"
        description={`Delivery ${fmtDate(date)} · ${allRows.length} orders to prepare`}
        actions={open.length > 0 && <Button variant="primary" icon={PackageCheck} onClick={packAll}>Pack all & generate challans ({open.length})</Button>}
      />
      <div className="mb-4 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <StatTile label="To Pack" value={counts.toPack} tone="neutral" />
        <StatTile label="In Progress" value={counts.packing} tone="blue" />
        <StatTile label="Packed" value={counts.packed} tone="green" />
        <StatTile label="Issues" value={counts.issue} tone="red" />
      </div>
      <Card className="mb-4">
        <CardBody className="flex flex-wrap items-end gap-3">
          <DateField label="Delivery date" value={date} onChange={setDate} />
          <div>
            <label className="mb-1 block text-[11.5px] font-medium text-muted">Route</label>
            <Select value={routeId} onChange={(e) => setRouteId(e.target.value)} placeholder="All routes" className="w-48" options={db.routes.map((r) => ({ value: r.id, label: r.name }))} />
          </div>
          <div>
            <label className="mb-1 block text-[11.5px] font-medium text-muted">Status</label>
            <Select value={status} onChange={(e) => setStatus(e.target.value)} placeholder="All status" className="w-36" options={['To Pack', 'Packing', 'Packed', 'Issue']} />
          </div>
        </CardBody>
      </Card>
      <Card>
        {rows.length === 0 ? (
          <EmptyState icon={PackageCheck} title="Nothing to pack" description="Orders appear here once stock is allocated." />
        ) : (
          <DataTable
            columns={columns} rows={rows} rowKey={(r) => r.order.id} onRowClick={(r) => nav(`/packing/${r.order.id}?from=${date}`)} pageSize={50}
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
