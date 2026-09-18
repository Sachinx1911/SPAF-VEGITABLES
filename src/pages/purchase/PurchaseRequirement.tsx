import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { ShoppingCart } from 'lucide-react';
import { PageHeader, Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge, StatusBadge } from '../../components/ui/Badge';
import { DataTable, type Column } from '../../components/ui/DataTable';
import { useDb } from '../../store/useStore';
import { useRequirementsSync } from '../../store/useApiSync';
import { requirementRows } from '../../domain/ops';
import { addDays, qty } from '../../lib/format';
import { todayISO } from '../../lib/clock';

export function PurchaseRequirementPage() {
  const db = useDb();
  const nav = useNavigate();
  const today = todayISO();
  const [date, setDate] = useState(addDays(today, 1));

  const itemById = new Map(db.items.map((i) => [i.id, i]));
  // In API mode the requirement is computed server-side from the locked
  // consolidation; in demo mode it is worked out from the local store. Both
  // arrive in the same shape.
  const { rows: apiRows } = useRequirementsSync(date);
  const localRows = useMemo(() => requirementRows(db, date), [db, date]);
  const rows = apiRows ?? localRows;
  const withNames = rows.map((r) => ({ ...r, name: itemById.get(r.itemId)?.name ?? r.itemId, category: itemById.get(r.itemId)?.category ?? '' }));

  const columns: Column<typeof withNames[number]>[] = [
    { key: 'item', header: 'Item', render: (r) => <span className="font-medium text-ink">{r.name} <Badge tone="neutral" className="ml-1">{r.unit}</Badge></span>, sortValue: (r) => r.name, exportValue: (r) => r.name },
    { key: 'category', header: 'Category', render: (r) => r.category, hideBelow: 'md' },
    { key: 'required', header: 'Required', align: 'right', render: (r) => qty(r.required, r.unit), sortValue: (r) => r.required },
    { key: 'stock', header: 'Stock', align: 'right', render: (r) => qty(r.stock, r.unit), hideBelow: 'lg' },
    { key: 'purchased', header: 'Already Purchased', align: 'right', render: (r) => qty(r.purchased, r.unit), hideBelow: 'lg' },
    {
      key: 'toPurchase', header: 'To Purchase', align: 'right',
      render: (r) => <span className={`tabular font-semibold ${r.toPurchase > 0 ? 'text-orange-600' : 'text-emerald-600'}`}>{qty(r.toPurchase, r.unit)}</span>,
      sortValue: (r) => r.toPurchase,
    },
    { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
  ];

  const critical = withNames.filter((r) => r.status === 'Critical').length;
  const needed = withNames.filter((r) => r.status !== 'OK').length;

  return (
    <div>
      <PageHeader
        title="Purchase Requirement"
        description={`For delivery date · ${needed} items need buying${critical ? `, ${critical} critical` : ''}`}
        actions={<Button variant="primary" icon={ShoppingCart} onClick={() => nav(`/purchase/new?date=${date}`)}>Purchase Entry</Button>}
      />
      <Card className="mb-4">
        <div className="flex items-center gap-3 p-3.5">
          <div>
            <label className="mb-1 block text-[11.5px] font-medium text-muted">Delivery date</label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-9 rounded-lg border border-line px-3 text-[13px]" />
          </div>
        </div>
      </Card>
      <Card>
        <DataTable
          columns={columns}
          rows={withNames}
          rowKey={(r) => r.itemId}
          exportFilename="purchase-requirement"
          emptyTitle="No purchase requirement yet"
          emptyDescription="Lock consolidation for this delivery date first — the requirement generates automatically."
          emptyAction={<Button size="sm" variant="secondary" onClick={() => nav('/consolidation')} className="mt-1">Go to Consolidation</Button>}
          cardRender={(r) => (
            <div>
              <div className="flex items-center justify-between gap-2">
                <p className="text-[13.5px] font-medium text-ink">{r.name} <Badge tone="neutral" className="ml-1">{r.unit}</Badge></p>
                <StatusBadge status={r.status} />
              </div>
              <p className="mt-0.5 text-xs text-muted">Required {qty(r.required, r.unit)} · Purchased {qty(r.purchased, r.unit)}</p>
              <p className={`tabular mt-1 text-[13px] font-semibold ${r.toPurchase > 0 ? 'text-orange-600' : 'text-emerald-600'}`}>To purchase: {qty(r.toPurchase, r.unit)}</p>
            </div>
          )}
        />
      </Card>
    </div>
  );
}
