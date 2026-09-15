import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { AlertTriangle, Bell, PackagePlus, Split } from 'lucide-react';
import { PageHeader, Card, CardBody } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge, StatusBadge } from '../../components/ui/Badge';
import { DataTable, type Column } from '../../components/ui/DataTable';
import { EmptyState } from '../../components/ui/States';
import { useToast } from '../../components/ui/Toast';
import { useCurrentUser, useDb } from '../../store/useStore';
import { logNote } from '../../store/procurementActions';
import { requirementRows, type RequirementRow } from '../../domain/ops';
import { addDays, qty } from '../../lib/format';
import { todayISO } from '../../lib/clock';

export function ShortageExcessPage() {
  const db = useDb();
  const user = useCurrentUser()!;
  const nav = useNavigate();
  const toast = useToast();
  const today = todayISO();
  const [date] = useState(addDays(today, 1));

  const rows = useMemo(() => requirementRows(db, date).filter((r) => r.shortage > 0 || r.excess > 0), [db, date]);
  const itemById = new Map(db.items.map((i) => [i.id, i]));

  const log = (action: string, item: string, note: string) => {
    logNote(action, 'allocation', item, note, user.id);
    toast({ tone: 'success', title: action, description: item });
  };

  const columns: Column<RequirementRow & { name: string }>[] = [
    { key: 'item', header: 'Item', render: (r) => <span className="font-medium text-ink">{r.name} <Badge tone="neutral" className="ml-1">{r.unit}</Badge></span>, sortValue: (r) => r.name },
    { key: 'required', header: 'Required', align: 'right', render: (r) => qty(r.required, r.unit) },
    { key: 'available', header: 'Available', align: 'right', render: (r) => qty(r.available, r.unit) },
    { key: 'shortage', header: 'Shortage', align: 'right', render: (r) => (r.shortage ? <span className="tabular font-semibold text-red-600">{qty(r.shortage, r.unit)}</span> : '—') },
    { key: 'excess', header: 'Excess', align: 'right', render: (r) => (r.excess ? <span className="tabular font-semibold text-blue-600">{qty(r.excess, r.unit)}</span> : '—') },
    { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.shortage ? 'Shortage' : 'Excess'} /> },
    {
      key: 'actions', header: '', align: 'right',
      render: (r) => (
        <div className="flex justify-end gap-1.5">
          {r.shortage > 0 ? (
            <>
              <Button size="xs" variant="secondary" icon={Split} onClick={() => nav(`/allocation?item=${r.itemId}`)}>Allocate</Button>
              <Button size="xs" variant="secondary" icon={PackagePlus} onClick={() => log('Backorder raised', r.name, `${qty(r.shortage, r.unit)} added to tomorrow's requirement`)}>Backorder</Button>
              <Button size="xs" variant="ghost" icon={Bell} onClick={() => log('Customers informed', r.name, 'Shortage notice sent')}>Inform</Button>
            </>
          ) : (
            <Button size="xs" variant="secondary" onClick={() => log('Marked for substitution', r.name, 'Excess flagged for tomorrow')}>Note excess</Button>
          )}
        </div>
      ),
    },
  ];

  const withNames = rows.map((r) => ({ ...r, name: itemById.get(r.itemId)?.name ?? r.itemId }));

  return (
    <div>
      <PageHeader title="Shortage / Excess" description={`Delivery ${date} · comparing customer requirement against available stock after quality check`} />
      {withNames.length === 0 ? (
        <Card><EmptyState icon={AlertTriangle} title="No shortages or excess" description="Everything received matches what customers ordered." /></Card>
      ) : (
        <Card>
          <DataTable columns={columns} rows={withNames} rowKey={(r) => r.itemId} exportFilename="shortage-excess" />
        </Card>
      )}
    </div>
  );
}
