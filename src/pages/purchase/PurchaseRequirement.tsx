import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { PencilLine, ShoppingCart } from 'lucide-react';
import { PageHeader, Card, CardBody } from '../../components/ui/Card';
import { DateField } from '../../components/ui/DatePicker';
import { Button } from '../../components/ui/Button';
import { Badge, StatusBadge } from '../../components/ui/Badge';
import { DataTable, type Column } from '../../components/ui/DataTable';
import { useCurrentUser, useDb } from '../../store/useStore';
import { createPurchaseOrdersFromRequirement, planPurchaseOrders } from '../../store/procurementActions';
import { useConfirm } from '../../components/ui/ConfirmDialog';
import { useToast } from '../../components/ui/Toast';
import { defaultProcurementDate, requirementRows, type RequirementRow } from '../../domain/ops';
import { fmtDate, qty } from '../../lib/format';
import { todayISO } from '../../lib/clock';

export function PurchaseRequirementPage() {
  const db = useDb();
  const user = useCurrentUser()!;
  const nav = useNavigate();
  const confirm = useConfirm();
  const toast = useToast();
  const today = todayISO();
  const [date, setDate] = useState(defaultProcurementDate(db, today));

  const createAll = async () => {
    const plan = planPurchaseOrders(date);
    const lineCount = plan.reduce((s, g) => s + g.lines.length, 0);
    const ok = await confirm({
      title: `Create ${plan.length} purchase order${plan.length > 1 ? 's' : ''} for ${fmtDate(date)}?`,
      description: 'Every item still to buy is split by supplier at its default purchase rate. You can receive against them straight away.',
      confirmLabel: 'Create purchase orders',
      details: plan.map((g) => ({ label: g.supplierName, value: `${g.lines.length} items` })),
    });
    if (!ok) return;
    const pos = createPurchaseOrdersFromRequirement(date, user.id);
    toast({ tone: 'success', title: `${pos.length} purchase orders created`, description: `${lineCount} items · ${pos.map((p) => p.poNo).join(', ')}` });
  };

  const itemById = new Map(db.items.map((i) => [i.id, i]));
  const rows = useMemo(() => requirementRows(db, date), [db, date]);
  const withNames = rows.map((r) => ({ ...r, name: itemById.get(r.itemId)?.name ?? r.itemId, category: itemById.get(r.itemId)?.category ?? '' }));

  const columns: Column<typeof withNames[number]>[] = [
    { key: 'item', header: 'Item', nowrap: true, render: (r) => <span className="font-medium text-ink">{r.name} <Badge tone="neutral" className="ml-1">{r.unit}</Badge></span>, sortValue: (r) => r.name, exportValue: (r) => r.name },
    { key: 'category', header: 'Category', render: (r) => r.category, hideBelow: 'md' },
    { key: 'required', header: 'Required', align: 'right', nowrap: true, render: (r) => qty(r.required, r.unit), sortValue: (r) => r.required, exportValue: (r) => r.required },
    { key: 'stock', header: 'Stock', align: 'right', nowrap: true, render: (r) => qty(r.stock, r.unit), hideBelow: 'lg', exportValue: (r) => r.stock },
    { key: 'purchased', header: 'Already Purchased', align: 'right', nowrap: true, render: (r) => qty(r.purchased, r.unit), hideBelow: 'lg', exportValue: (r) => r.purchased },
    {
      key: 'toPurchase', header: 'To Purchase', align: 'right', nowrap: true, exportValue: (r) => r.toPurchase,
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
        description={`Delivery ${fmtDate(date)} · ${needed} items need buying${critical ? `, ${critical} critical` : ''}`}
        actions={
          <>
            <Button variant="secondary" icon={PencilLine} onClick={() => nav(`/purchase/new?date=${date}`)}>Manual entry</Button>
            <Button variant="primary" icon={ShoppingCart} onClick={createAll} disabled={!needed}>Create purchase orders{needed ? ` (${needed})` : ''}</Button>
          </>
        }
      />
      <Card className="mb-4">
        <CardBody className="flex flex-wrap items-end gap-3">
          <DateField label="Delivery date" value={date} onChange={setDate} />
        </CardBody>
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
