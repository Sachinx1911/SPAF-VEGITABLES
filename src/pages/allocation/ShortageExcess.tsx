import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { AlertTriangle, Bell, Lock, PackagePlus, Split } from 'lucide-react';
import { PageHeader, Card, CardBody } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { DateField } from '../../components/ui/DatePicker';
import { Badge, StatusBadge } from '../../components/ui/Badge';
import { StatTile } from '../../components/ui/Kpi';
import { DataTable, type Column } from '../../components/ui/DataTable';
import { EmptyState } from '../../components/ui/States';
import { useToast } from '../../components/ui/Toast';
import { useCurrentUser, useDb } from '../../store/useStore';
import { logNote } from '../../store/procurementActions';
import { defaultProcurementDate, requirementRows, type RequirementRow } from '../../domain/ops';
import { isLockedDate } from '../../domain/procurement';
import { fmtDate, qty } from '../../lib/format';
import { todayISO } from '../../lib/clock';

export function ShortageExcessPage() {
  const db = useDb();
  const user = useCurrentUser()!;
  const nav = useNavigate();
  const toast = useToast();
  const today = todayISO();
  const [date, setDate] = useState(defaultProcurementDate(db, today));

  const locked = isLockedDate(db, date);
  const rows = useMemo(() => requirementRows(db, date).filter((r) => r.shortage > 0 || r.excess > 0), [db, date]);
  const itemById = new Map(db.items.map((i) => [i.id, i]));
  const withNames = rows.map((r) => ({ ...r, name: itemById.get(r.itemId)?.name ?? r.itemId }));
  const shortCount = withNames.filter((r) => r.shortage > 0).length;
  const excessCount = withNames.filter((r) => r.excess > 0).length;

  const log = (action: string, item: string, note: string) => {
    logNote(action, 'allocation', item, note, user.id);
    toast({ tone: 'success', title: action, description: item });
  };

  const columns: Column<RequirementRow & { name: string }>[] = [
    { key: 'item', header: 'Item', nowrap: true, render: (r) => <span className="font-medium text-ink">{r.name} <Badge tone="neutral" className="ml-1">{r.unit}</Badge></span>, sortValue: (r) => r.name, exportValue: (r) => r.name },
    { key: 'required', header: 'Required', align: 'right', nowrap: true, render: (r) => qty(r.required, r.unit), exportValue: (r) => r.required },
    { key: 'available', header: 'Available', align: 'right', nowrap: true, render: (r) => qty(r.available, r.unit), exportValue: (r) => r.available },
    { key: 'shortage', header: 'Shortage', align: 'right', nowrap: true, render: (r) => (r.shortage ? <span className="tabular font-semibold text-red-600">{qty(r.shortage, r.unit)}</span> : '—'), sortValue: (r) => r.shortage, exportValue: (r) => r.shortage },
    { key: 'excess', header: 'Excess', align: 'right', nowrap: true, render: (r) => (r.excess ? <span className="tabular font-semibold text-blue-600">{qty(r.excess, r.unit)}</span> : '—'), sortValue: (r) => r.excess, exportValue: (r) => r.excess },
    { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.shortage ? 'Shortage' : 'Excess'} /> },
    {
      key: 'actions', header: '', align: 'right',
      render: (r) => (
        <div className="flex justify-end gap-1.5">
          {r.shortage > 0 ? (
            <>
              <Button size="xs" variant="secondary" icon={Split} onClick={() => nav(`/allocation?date=${date}&item=${r.itemId}`)}>Allocate</Button>
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

  return (
    <div>
      <PageHeader
        title="Shortage / Excess"
        description="Customer requirement against stock available after quality check, per delivery date."
        actions={<Button variant="secondary" icon={Split} onClick={() => nav(`/allocation?date=${date}`)}>Open Allocation</Button>}
      />

      <Card className="mb-4">
        <CardBody className="flex flex-wrap items-end gap-3">
          <DateField label="Delivery date" value={date} onChange={setDate} />
          {locked && (
            <div className="ml-auto grid grid-cols-2 gap-2.5">
              <StatTile label="Items short" value={shortCount} tone={shortCount ? 'red' : 'neutral'} />
              <StatTile label="Items in excess" value={excessCount} tone={excessCount ? 'blue' : 'neutral'} />
            </div>
          )}
        </CardBody>
      </Card>

      {!locked ? (
        <Card>
          <EmptyState
            icon={Lock}
            title={`Consolidation for ${fmtDate(date)} is not locked`}
            description="Shortages and excess are measured against the locked purchase requirement."
            action={<Button size="sm" variant="primary" onClick={() => nav('/consolidation')} className="mt-1">Go to Consolidation</Button>}
          />
        </Card>
      ) : withNames.length === 0 ? (
        <Card><EmptyState icon={AlertTriangle} title="No shortages or excess" description={`Everything received for ${fmtDate(date)} matches what customers ordered.`} /></Card>
      ) : (
        <Card>
          <DataTable
            columns={columns} rows={withNames} rowKey={(r) => r.itemId} exportFilename={`shortage-excess-${date}`}
            cardRender={(r) => (
              <div>
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[13.5px] font-medium text-ink">{r.name} <Badge tone="neutral" className="ml-1">{r.unit}</Badge></p>
                  <StatusBadge status={r.shortage ? 'Shortage' : 'Excess'} />
                </div>
                <p className="mt-0.5 text-xs text-muted">Required {qty(r.required, r.unit)} · Available {qty(r.available, r.unit)}</p>
                <p className={`tabular mt-1 text-[13px] font-semibold ${r.shortage ? 'text-red-600' : 'text-blue-600'}`}>{r.shortage ? `Short ${qty(r.shortage, r.unit)}` : `Excess ${qty(r.excess, r.unit)}`}</p>
                {r.shortage > 0 && <Button size="xs" variant="secondary" icon={Split} className="mt-2" onClick={() => nav(`/allocation?date=${date}&item=${r.itemId}`)}>Allocate</Button>}
              </div>
            )}
          />
        </Card>
      )}
    </div>
  );
}
