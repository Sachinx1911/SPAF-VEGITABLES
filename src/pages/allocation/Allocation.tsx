import { useMemo, useState } from 'react';
import { Split } from 'lucide-react';
import { PageHeader, Card, CardBody } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Select, Checkbox, QtyInput } from '../../components/ui/Field';
import { Badge, StatusBadge } from '../../components/ui/Badge';
import { DataTable, type Column } from '../../components/ui/DataTable';
import { useConfirm } from '../../components/ui/ConfirmDialog';
import { useToast } from '../../components/ui/Toast';
import { useCurrentUser, useDb } from '../../store/useStore';
import { autoAllocateItem, setManualAllocation } from '../../store/procurementActions';
import { allocationRows, itemsNeedingAllocation, type AllocationRow } from '../../domain/procurement';
import { addDays, qty } from '../../lib/format';
import { todayISO } from '../../lib/clock';

export function AllocationPage() {
  const db = useDb();
  const user = useCurrentUser()!;
  const confirm = useConfirm();
  const toast = useToast();
  const today = todayISO();

  const [date, setDate] = useState(addDays(today, 1));
  const [itemId, setItemId] = useState('');
  const [override, setOverride] = useState(false);

  const items = useMemo(() => itemsNeedingAllocation(db, date), [db, date]);
  const rows = useMemo(() => allocationRows(db, date, itemId || undefined), [db, date, itemId]);

  const runAuto = async (id: string) => {
    const item = db.items.find((i) => i.id === id)!;
    const ok = await confirm({
      title: `Auto-allocate ${item.name}?`,
      description: override ? 'Override is on: every order gets its full requested quantity even if that exceeds available stock.' : 'Distributes available stock proportionally, in route order.',
      tone: override ? 'danger' : 'default',
      confirmLabel: 'Allocate',
    });
    if (!ok) return;
    autoAllocateItem(date, id, user.id, override);
    toast({ tone: 'success', title: 'Allocated', description: item.name });
  };

  const columns: Column<AllocationRow>[] = [
    { key: 'item', header: 'Item', render: (r) => <span className="font-medium text-ink">{r.item.name} <Badge tone="neutral" className="ml-1">{r.unit}</Badge></span>, sortValue: (r) => r.item.name },
    { key: 'customer', header: 'Customer', render: (r) => r.customer.name, sortValue: (r) => r.customer.routeOrder },
    { key: 'required', header: 'Required', align: 'right', render: (r) => qty(r.required, r.unit), sortValue: (r) => r.required },
    { key: 'available', header: 'Available', align: 'right', render: (r) => qty(r.available, r.unit), hideBelow: 'md' },
    {
      key: 'allocated', header: 'Allocated', align: 'right',
      render: (r) => (
        <QtyInput
          value={r.allocated} unit={r.unit} size="sm"
          max={override ? undefined : Math.max(r.required, r.allocated ?? 0)}
          onChange={(v) => setManualAllocation(r.orderItemId, v ?? 0, user.id)}
        />
      ),
    },
    { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
  ];

  return (
    <div>
      <PageHeader title="Allocation" description="Distribute accepted stock to customer order lines — shortages are visible before packing." />
      <Card className="mb-4">
        <CardBody className="flex flex-wrap items-end gap-3">
          <div>
            <label className="mb-1 block text-[11.5px] font-medium text-muted">Delivery date</label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-9 rounded-lg border border-line px-3 text-[13px]" />
          </div>
          <div>
            <label className="mb-1 block text-[11.5px] font-medium text-muted">Item</label>
            <Select value={itemId} onChange={(e) => setItemId(e.target.value)} placeholder="All items" className="w-56" options={items.map((i) => ({ value: i.id, label: `${i.name} (${i.unit})` }))} />
          </div>
          <Checkbox label="Override — ignore shortage, allocate in full" checked={override} onChange={(e) => setOverride(e.target.checked)} />
          {itemId && <Button variant="primary" icon={Split} onClick={() => runAuto(itemId)} className="ml-auto">Auto-allocate this item</Button>}
        </CardBody>
      </Card>
      <Card>
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(r) => r.orderItemId}
          exportFilename="allocation"
          emptyTitle="Nothing to allocate"
          emptyDescription="Choose a delivery date with a locked consolidation and received stock."
          pageSize={50}
        />
      </Card>
    </div>
  );
}
