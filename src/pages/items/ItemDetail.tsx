import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { ArrowLeft, Boxes, PenLine, Tags } from 'lucide-react';
import { Card, CardBody, CardHeader, PageHeader } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { StatusBadge } from '../../components/ui/Badge';
import { Breadcrumb } from '../../components/ui/Breadcrumb';
import { DataTable, type Column } from '../../components/ui/DataTable';
import { EmptyState } from '../../components/ui/States';
import { ItemForm } from './ItemForm';
import { useDb } from '../../store/useStore';
import { fmtDate, inr, qty } from '../../lib/format';
import type { CustomerItemPrice } from '../../types/models';

export function ItemDetailPage() {
  const { id } = useParams();
  const nav = useNavigate();
  const db = useDb();
  const [editOpen, setEditOpen] = useState(false);

  const item = db.items.find((i) => i.id === id);
  const custById = new Map(db.customers.map((c) => [c.id, c]));
  const activePrices = useMemo(() => db.prices.filter((p) => p.itemId === id && !p.effectiveTo).sort((a, b) => b.price - a.price), [db.prices, id]);
  const purchaseHistory = useMemo(() => {
    const lines = db.purchaseOrderItems.filter((l) => l.itemId === id);
    return lines
      .map((l) => ({ ...l, po: db.purchaseOrders.find((p) => p.id === l.purchaseOrderId)! }))
      .sort((a, b) => (a.po.purchaseDate < b.po.purchaseDate ? 1 : -1))
      .slice(0, 25);
  }, [db.purchaseOrderItems, db.purchaseOrders, id]);

  if (!item) {
    return <EmptyState title="Item not found" action={<Button size="sm" onClick={() => nav('/items')}>Back to items</Button>} />;
  }

  const priceCols: Column<CustomerItemPrice>[] = [
    { key: 'customer', header: 'Customer', render: (p) => custById.get(p.customerId)?.name ?? p.customerId, sortValue: (p) => custById.get(p.customerId)?.name ?? '' },
    { key: 'price', header: 'Price', align: 'right', render: (p) => <span className="tabular font-medium">{inr(p.price, true)}</span>, sortValue: (p) => p.price },
    { key: 'from', header: 'Effective From', render: (p) => fmtDate(p.effectiveFrom) },
  ];

  const purchaseCols: Column<(typeof purchaseHistory)[number]>[] = [
    { key: 'date', header: 'Purchase Date', render: (l) => fmtDate(l.po.purchaseDate), sortValue: (l) => l.po.purchaseDate },
    { key: 'supplier', header: 'Supplier', render: (l) => db.suppliers.find((s) => s.id === l.po.supplierId)?.name ?? '—' },
    { key: 'qty', header: 'Qty', align: 'right', render: (l) => qty(l.qty, l.unit) },
    { key: 'rate', header: 'Rate', align: 'right', render: (l) => <span className="tabular">{inr(l.rate, true)}</span> },
    { key: 'status', header: 'Status', render: (l) => <StatusBadge status={l.po.status} /> },
  ];

  return (
    <div>
      <PageHeader
        breadcrumb={<Breadcrumb items={[{ label: 'Items', to: '/items' }, { label: item.name }]} />}
        title={<span className="flex items-center gap-2">{item.name} <StatusBadge status={item.active ? 'Active' : 'Inactive'} /></span>}
        description={`${item.code} · ${item.category} · ${item.unit}`}
        actions={<><Button variant="secondary" icon={ArrowLeft} onClick={() => nav('/items')}>Back</Button><Button variant="primary" icon={PenLine} onClick={() => setEditOpen(true)}>Edit</Button></>}
      />

      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Purchase Price" value={inr(item.defaultPurchasePrice, true)} sub={`/ ${item.unit}`} />
        <Stat label="Selling Price" value={inr(item.defaultSellingPrice, true)} sub={`/ ${item.unit}`} />
        <Stat label="Current Stock" value={item.minStock > 0 ? qty(item.stock, item.unit) : 'Fresh daily'} tone={item.minStock > 0 && item.stock <= item.reorderLevel ? 'orange' : undefined} />
        <Stat label="Tax Rate" value={`${item.taxRate}%`} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Item details" icon={<Tags size={15} />} />
          <CardBody className="grid grid-cols-2 gap-x-4 gap-y-2.5 text-[13px]">
            <Row label="Purchase unit" value={item.purchaseUnit} />
            <Row label="Selling unit" value={item.sellingUnit} />
            <Row label="Min stock" value={item.minStock > 0 ? qty(item.minStock, item.unit) : '—'} />
            <Row label="Reorder level" value={item.reorderLevel > 0 ? qty(item.reorderLevel, item.unit) : '—'} />
            <Row label="Legacy import name" value={item.excelName} />
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Stock" icon={<Boxes size={15} />} />
          <CardBody className="text-[13px] text-muted">
            {item.minStock > 0
              ? `Carried over as stock; reordered when it falls to or below ${qty(item.reorderLevel, item.unit)}.`
              : 'Not carried as stock — bought fresh against each day\'s requirement.'}
          </CardBody>
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader title="Customer prices" subtitle={`${activePrices.length} customers with a custom price for this item`} />
        <DataTable columns={priceCols} rows={activePrices} rowKey={(p) => p.id} emptyTitle="No customer-specific prices" emptyDescription="Everyone pays the default selling price." pageSize={10} />
      </Card>

      <Card className="mt-4">
        <CardHeader title="Recent purchases" />
        <DataTable columns={purchaseCols} rows={purchaseHistory} rowKey={(l) => l.id} emptyTitle="No purchase history yet" pageSize={10} />
      </Card>

      <ItemForm open={editOpen} onClose={() => setEditOpen(false)} item={item} />
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-xs text-muted">{label}</span>
      <span className="font-medium text-ink">{value || '—'}</span>
    </div>
  );
}

function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: 'orange' }) {
  return (
    <Card className="p-3.5">
      <p className="text-[11.5px] font-medium text-muted">{label}</p>
      <p className={`tabular mt-1 text-[17px] font-semibold ${tone === 'orange' ? 'text-orange-600' : 'text-ink'}`}>{value} {sub && <span className="text-xs font-normal text-subtle">{sub}</span>}</p>
    </Card>
  );
}
