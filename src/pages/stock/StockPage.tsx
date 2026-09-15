import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { PageHeader, Card } from '../../components/ui/Card';
import { Select, Checkbox } from '../../components/ui/Field';
import { Badge } from '../../components/ui/Badge';
import { DataTable, type Column } from '../../components/ui/DataTable';
import { useDb } from '../../store/useStore';
import { CATEGORIES, type Item } from '../../types/models';
import { qty } from '../../lib/format';

type StockStatus = 'Out of Stock' | 'Low' | 'OK' | 'Fresh (bought daily)';

function stockStatus(i: Item): StockStatus {
  if (i.minStock <= 0) return 'Fresh (bought daily)';
  if (i.stock <= 0) return 'Out of Stock';
  if (i.stock <= i.reorderLevel) return 'Low';
  return 'OK';
}

const STATUS_TONE: Record<StockStatus, 'red' | 'orange' | 'green' | 'neutral'> = {
  'Out of Stock': 'red', Low: 'orange', OK: 'green', 'Fresh (bought daily)': 'neutral',
};

export function StockPage() {
  const db = useDb();
  const nav = useNavigate();
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [trackedOnly, setTrackedOnly] = useState(true);

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return db.items.filter((i) => {
      if (term && !i.name.toLowerCase().includes(term)) return false;
      if (category && i.category !== category) return false;
      if (trackedOnly && i.minStock <= 0) return false;
      return true;
    });
  }, [db.items, search, category, trackedOnly]);

  const columns: Column<Item>[] = [
    { key: 'name', header: 'Item', sticky: true, render: (i) => <span className="font-medium text-ink">{i.name} <Badge tone="neutral" className="ml-1">{i.unit}</Badge></span>, sortValue: (i) => i.name, exportValue: (i) => i.name },
    { key: 'category', header: 'Category', render: (i) => i.category, hideBelow: 'md', exportValue: (i) => i.category },
    { key: 'stock', header: 'Stock', align: 'right', render: (i) => <span className="tabular font-medium">{i.minStock > 0 ? qty(i.stock, i.unit) : '—'}</span>, sortValue: (i) => i.stock },
    { key: 'min', header: 'Min Stock', align: 'right', render: (i) => (i.minStock > 0 ? qty(i.minStock, i.unit) : '—'), hideBelow: 'lg' },
    { key: 'reorder', header: 'Reorder Level', align: 'right', render: (i) => (i.reorderLevel > 0 ? qty(i.reorderLevel, i.unit) : '—'), hideBelow: 'lg' },
    {
      key: 'status', header: 'Status', render: (i) => { const s = stockStatus(i); return <Badge tone={STATUS_TONE[s]} dot>{s}</Badge>; },
      sortValue: (i) => stockStatus(i),
    },
  ];

  const lowCount = db.items.filter((i) => stockStatus(i) === 'Low').length;
  const outCount = db.items.filter((i) => stockStatus(i) === 'Out of Stock').length;

  return (
    <div>
      <PageHeader
        title="Stock"
        description={`${db.items.filter((i) => i.minStock > 0).length} SKUs carried as stock · ${lowCount} low · ${outCount} out of stock`}
      />
      <Card>
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(i) => i.id}
          onRowClick={(i) => nav(`/items/${i.id}`)}
          searchValue={search}
          onSearchChange={setSearch}
          searchPlaceholder="Search item…"
          exportFilename="stock"
          filters={
            <>
              <Select value={category} onChange={(e) => setCategory(e.target.value)} placeholder="All categories" options={[...CATEGORIES]} className="w-44" />
              <Checkbox label="Stock-tracked items only" checked={trackedOnly} onChange={(e) => setTrackedOnly(e.target.checked)} />
            </>
          }
          emptyTitle="No items match"
        />
      </Card>
    </div>
  );
}
