import { useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { Lock, Wand2 } from 'lucide-react';
import { PageHeader, Card, CardBody } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Select, Checkbox, QtyInput } from '../../components/ui/Field';
import { DateField } from '../../components/ui/DatePicker';
import { Badge, StatusBadge } from '../../components/ui/Badge';
import { StatTile } from '../../components/ui/Kpi';
import { DataTable, type Column } from '../../components/ui/DataTable';
import { EmptyState } from '../../components/ui/States';
import { useConfirm } from '../../components/ui/ConfirmDialog';
import { useToast } from '../../components/ui/Toast';
import { useCurrentUser, useDb } from '../../store/useStore';
import { autoAllocateItem, setManualAllocation } from '../../store/procurementActions';
import { allocationRows, isLockedDate, itemsNeedingAllocation, type AllocationRow } from '../../domain/procurement';
import { defaultProcurementDate } from '../../domain/ops';
import { fmtDate, qty } from '../../lib/format';
import { todayISO } from '../../lib/clock';

export function AllocationPage() {
  const db = useDb();
  const user = useCurrentUser()!;
  const nav = useNavigate();
  const loc = useLocation();
  const confirm = useConfirm();
  const toast = useToast();
  const today = todayISO();

  // Shortage / Excess deep-links here with ?date=&item= so the right rows are already on screen.
  const params = new URLSearchParams(loc.search);
  const [date, setDate] = useState(params.get('date') ?? defaultProcurementDate(db, today));
  const [itemId, setItemId] = useState(params.get('item') ?? '');
  const [override, setOverride] = useState(false);

  const locked = isLockedDate(db, date);
  const items = useMemo(() => itemsNeedingAllocation(db, date), [db, date]);
  const rows = useMemo(() => allocationRows(db, date, itemId || undefined), [db, date, itemId]);
  const allRows = useMemo(() => (itemId ? allocationRows(db, date) : rows), [db, date, itemId, rows]);

  const counts = {
    lines: allRows.length,
    pending: allRows.filter((r) => r.allocated == null).length,
    short: allRows.filter((r) => r.status === 'Shortage' || r.status === 'Partial').length,
    done: allRows.filter((r) => r.allocated != null).length,
  };

  const runAutoAll = async () => {
    const pendingItems = items.filter((i) => allRows.some((r) => r.item.id === i.id && r.allocated == null));
    const targets = pendingItems.length ? pendingItems : items;
    const ok = await confirm({
      title: `Auto-allocate ${targets.length} items?`,
      description: override
        ? 'Override is on: every order line gets its full requested quantity.'
        : `Every ${pendingItems.length ? 'unallocated' : ''} item for ${fmtDate(date)} is split across customer orders in route order, proportionally where stock is short.`,
      tone: override ? 'danger' : 'default',
      confirmLabel: 'Allocate all',
      details: [{ label: 'Delivery date', value: fmtDate(date) }, { label: 'Items', value: targets.length }],
    });
    if (!ok) return;
    for (const it of targets) autoAllocateItem(date, it.id, user.id, override);
    toast({ tone: 'success', title: 'Allocation complete', description: `${targets.length} items · ${fmtDate(date)}` });
  };

  const columns: Column<AllocationRow>[] = [
    { key: 'item', header: 'Item', nowrap: true, render: (r) => <span className="font-medium text-ink">{r.item.name} <Badge tone="neutral" className="ml-1">{r.unit}</Badge></span>, sortValue: (r) => r.item.sortOrder, exportValue: (r) => r.item.name },
    { key: 'customer', header: 'Customer', render: (r) => r.customer.name, sortValue: (r) => r.customer.routeOrder, exportValue: (r) => r.customer.name },
    { key: 'required', header: 'Required', align: 'right', nowrap: true, render: (r) => qty(r.required, r.unit), sortValue: (r) => r.required, exportValue: (r) => r.required },
    { key: 'available', header: 'Available', align: 'right', nowrap: true, render: (r) => qty(r.available, r.unit), hideBelow: 'md', exportValue: (r) => r.available },
    {
      key: 'allocated', header: 'Allocated', align: 'right',
      render: (r) => (
        <div className="flex justify-end">
          <QtyInput
            value={r.allocated} unit={r.unit} size="sm"
            max={override ? undefined : Math.max(r.required, r.allocated ?? 0)}
            onChange={(v) => setManualAllocation(r.orderItemId, v ?? 0, user.id)}
          />
        </div>
      ),
      exportValue: (r) => r.allocated ?? '',
    },
    { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.allocated == null ? (r.status === 'Available' ? 'Pending' : 'Shortage') : r.status === 'Available' ? 'Allocated' : 'Partial'} /> },
  ];

  return (
    <div>
      <PageHeader
        title="Allocation"
        description="Stock is split across customer orders automatically as it is received. Adjust a line here only when you need to."
        actions={locked && counts.pending > 0 && <Button variant="primary" icon={Wand2} onClick={runAutoAll}>Allocate {counts.pending} pending lines</Button>}
      />

      {locked && (
        <div className="mb-4 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          <StatTile label="Order lines" value={counts.lines} tone="neutral" />
          <StatTile label="Not allocated" value={counts.pending} tone="orange" />
          <StatTile label="Short" value={counts.short} tone="red" />
          <StatTile label="Allocated" value={counts.done} tone="green" />
        </div>
      )}

      <Card className="mb-4">
        <CardBody className="flex flex-wrap items-end gap-3">
          <DateField label="Delivery date" value={date} onChange={(v) => { setDate(v); setItemId(''); }} />
          <div>
            <label className="mb-1 block text-[11.5px] font-medium text-muted">Item</label>
            <Select value={itemId} onChange={(e) => setItemId(e.target.value)} placeholder="All items" className="w-56" options={items.map((i) => ({ value: i.id, label: `${i.name} (${i.unit})` }))} />
          </div>
          <Checkbox label="Allocate in full even when stock is short" checked={override} onChange={(e) => setOverride(e.target.checked)} className="pb-2" />
        </CardBody>
      </Card>

      <Card>
        {!locked ? (
          <EmptyState
            icon={Lock}
            title={`Consolidation for ${fmtDate(date)} is not locked`}
            description="Allocation starts after the day's orders are locked and stock has come in through receiving and quality check."
            action={<Button size="sm" variant="primary" onClick={() => nav('/consolidation')} className="mt-1">Go to Consolidation</Button>}
          />
        ) : (
          <DataTable
            columns={columns}
            rows={rows}
            rowKey={(r) => r.orderItemId}
            exportFilename={`allocation-${date}`}
            emptyTitle="Nothing to allocate"
            emptyDescription="No approved order lines for this delivery date."
            pageSize={50}
            cardRender={(r) => (
              <div>
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[13.5px] font-medium text-ink">{r.item.name} <Badge tone="neutral" className="ml-1">{r.unit}</Badge></p>
                  <StatusBadge status={r.allocated == null ? (r.status === 'Available' ? 'Pending' : 'Shortage') : r.status === 'Available' ? 'Allocated' : 'Partial'} />
                </div>
                <p className="mt-0.5 text-xs text-muted">{r.customer.name} · required {qty(r.required, r.unit)} · available {qty(r.available, r.unit)}</p>
                <div className="mt-2">
                  <QtyInput value={r.allocated} unit={r.unit} size="sm" max={override ? undefined : Math.max(r.required, r.allocated ?? 0)} onChange={(v) => setManualAllocation(r.orderItemId, v ?? 0, user.id)} />
                </div>
              </div>
            )}
          />
        )}
      </Card>
    </div>
  );
}
