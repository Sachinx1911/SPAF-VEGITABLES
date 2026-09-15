import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { Download, MoreHorizontal, Plus, Upload } from 'lucide-react';
import { PageHeader, Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Select, Checkbox } from '../../components/ui/Field';
import { Badge, StatusBadge } from '../../components/ui/Badge';
import { DataTable, type Column } from '../../components/ui/DataTable';
import { Menu } from '../../components/ui/Dropdown';
import { ItemForm } from './ItemForm';
import { useDb } from '../../store/useStore';
import { CATEGORIES, UNITS, type Item } from '../../types/models';
import { inr, qty } from '../../lib/format';

export function ItemsListPage() {
  const db = useDb();
  const nav = useNavigate();
  const loc = useLocation();
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState(() => new URLSearchParams(loc.search).get('category') ?? '');
  const [unit, setUnit] = useState('');
  const [lowStockOnly, setLowStockOnly] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Item | null>(null);

  // /items/new opens straight into the add form, then returns to the list.
  useEffect(() => {
    if (loc.pathname === '/items/new') setFormOpen(true);
  }, [loc.pathname]);
  const closeForm = () => {
    setFormOpen(false);
    if (loc.pathname === '/items/new') nav('/items');
  };

  const priceRangeByItem = useMemo(() => {
    const m = new Map<string, { min: number; max: number }>();
    for (const p of db.prices.filter((x) => !x.effectiveTo)) {
      const cur = m.get(p.itemId);
      m.set(p.itemId, cur ? { min: Math.min(cur.min, p.price), max: Math.max(cur.max, p.price) } : { min: p.price, max: p.price });
    }
    return m;
  }, [db.prices]);

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return db.items.filter((it) => {
      if (term && !(it.name.toLowerCase().includes(term) || it.code.toLowerCase().includes(term))) return false;
      if (category && it.category !== category) return false;
      if (unit && it.unit !== unit) return false;
      if (lowStockOnly && !(it.minStock > 0 && it.stock <= it.reorderLevel)) return false;
      return true;
    });
  }, [db.items, search, category, unit, lowStockOnly]);

  const columns: Column<Item>[] = [
    { key: 'code', header: 'Code', width: '90px', render: (i) => <span className="tabular text-muted">{i.code}</span>, sortValue: (i) => i.code, exportValue: (i) => i.code },
    {
      key: 'name', header: 'Item Name', sticky: true, width: '210px',
      render: (i) => (
        <div className="flex items-center gap-2">
          <span className="font-medium text-ink">{i.name}</span>
          <Badge tone="brand">{i.unit}</Badge>
        </div>
      ),
      sortValue: (i) => i.name, exportValue: (i) => `${i.name} (${i.unit})`,
    },
    { key: 'category', header: 'Category', render: (i) => i.category, sortValue: (i) => i.category, exportValue: (i) => i.category, hideBelow: 'md' },
    { key: 'unit', header: 'Unit', render: (i) => i.unit, hideBelow: 'lg' },
    { key: 'active', header: 'Active', align: 'center', render: (i) => <StatusBadge status={i.active ? 'Active' : 'Inactive'} />, sortValue: (i) => (i.active ? 1 : 0) },
    {
      key: 'purchasePrice', header: 'Purchase Price', align: 'right', render: (i) => <span className="tabular">{inr(i.defaultPurchasePrice, true)}</span>,
      sortValue: (i) => i.defaultPurchasePrice, exportValue: (i) => i.defaultPurchasePrice, hideBelow: 'lg',
    },
    {
      key: 'priceRange', header: 'Customer Price Range', align: 'right',
      render: (i) => {
        const r = priceRangeByItem.get(i.id);
        return r ? <span className="tabular text-muted">{r.min === r.max ? inr(r.min, true) : `${inr(r.min, true)} – ${inr(r.max, true)}`}</span> : '—';
      },
      hideBelow: 'lg',
    },
    {
      key: 'stock', header: 'Stock', align: 'right',
      render: (i) => (i.minStock > 0 ? <span className={`tabular font-medium ${i.stock <= i.reorderLevel ? 'text-orange-600' : 'text-ink'}`}>{qty(i.stock, i.unit)}</span> : <span className="text-subtle">fresh daily</span>),
      sortValue: (i) => i.stock,
    },
    {
      key: 'actions', header: '', width: '40px', align: 'center',
      render: (i) => (
        <Menu
          align="right"
          items={[
            { key: 'view', label: 'View detail', onClick: () => nav(`/items/${i.id}`) },
            { key: 'edit', label: 'Edit', onClick: () => setEditing(i) },
          ]}
          trigger={(open) => <button onClick={(e) => { e.stopPropagation(); open(); }} className="rounded p-1 text-subtle hover:bg-canvas hover:text-ink"><MoreHorizontal size={16} /></button>}
        />
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Items"
        description={`${db.items.filter((i) => i.active).length} active · ${db.items.length} total SKUs across ${CATEGORIES.length} categories`}
        actions={
          <>
            <Button variant="secondary" icon={Upload}>Import</Button>
            <Button variant="secondary" icon={Download}>Export</Button>
            <Button variant="primary" icon={Plus} onClick={() => setFormOpen(true)}>Add Item</Button>
          </>
        }
      />
      <Card>
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(i) => i.id}
          onRowClick={(i) => nav(`/items/${i.id}`)}
          searchValue={search}
          onSearchChange={setSearch}
          searchPlaceholder="Search item name or code…"
          exportFilename="items"
          filters={
            <>
              <Select value={category} onChange={(e) => setCategory(e.target.value)} placeholder="All categories" options={[...CATEGORIES]} className="w-44" />
              <Select value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="All units" options={[...UNITS]} className="w-32" />
              <Checkbox label="Low stock only" checked={lowStockOnly} onChange={(e) => setLowStockOnly(e.target.checked)} />
            </>
          }
          emptyTitle="No items found"
          emptyDescription="Try clearing filters, or add a new item."
          emptyAction={<Button size="sm" variant="primary" icon={Plus} onClick={() => setFormOpen(true)} className="mt-1">Add Item</Button>}
          cardRender={(i) => (
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-[13.5px] font-medium text-ink">{i.name} <span className="text-muted">({i.unit})</span></p>
                <p className="truncate text-xs text-muted">{i.code} · {i.category}</p>
              </div>
              <span className="tabular shrink-0 text-xs font-medium">{inr(i.defaultSellingPrice, true)}</span>
            </div>
          )}
        />
      </Card>

      <ItemForm open={formOpen} onClose={closeForm} />
      <ItemForm open={!!editing} onClose={() => setEditing(null)} item={editing} />
    </div>
  );
}
