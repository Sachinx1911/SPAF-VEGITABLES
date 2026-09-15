import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { Download, MoreHorizontal, Plus, Upload } from 'lucide-react';
import { PageHeader } from '../../components/ui/Card';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Select } from '../../components/ui/Field';
import { Badge, StatusBadge } from '../../components/ui/Badge';
import { DataTable, type Column } from '../../components/ui/DataTable';
import { Menu } from '../../components/ui/Dropdown';
import { CustomerForm } from './CustomerForm';
import { useDb } from '../../store/useStore';
import { CUSTOMER_TYPES, type Customer } from '../../types/models';
import { inr, fmtDate } from '../../lib/format';
import { customerOutstanding } from '../../domain/finance';
import { todayISO } from '../../lib/clock';

const LOCATIONS_ALL = 'All locations';

export function CustomersListPage() {
  const db = useDb();
  const nav = useNavigate();
  const location_ = useLocation();
  const today = todayISO();
  const [search, setSearch] = useState('');
  const [type, setType] = useState('');
  const [location, setLocation] = useState('');
  const [status, setStatus] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);

  // /customers/new opens straight into the add form, then returns to the list.
  useEffect(() => {
    if (location_.pathname === '/customers/new') setFormOpen(true);
  }, [location_.pathname]);
  const closeForm = () => {
    setFormOpen(false);
    if (location_.pathname === '/customers/new') nav('/customers');
  };

  const outstandingBy = useMemo(() => customerOutstanding(db, today), [db, today]);
  const lastOrderBy = useMemo(() => {
    const m = new Map<string, string>();
    for (const o of db.orders) {
      const cur = m.get(o.customerId);
      if (!cur || o.orderDate > cur) m.set(o.customerId, o.orderDate);
    }
    return m;
  }, [db.orders]);
  const orderCountBy = useMemo(() => {
    const m = new Map<string, number>();
    for (const o of db.orders) m.set(o.customerId, (m.get(o.customerId) ?? 0) + 1);
    return m;
  }, [db.orders]);

  const locations = useMemo(() => [...new Set(db.customers.map((c) => c.location))].sort(), [db.customers]);

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return db.customers.filter((c) => {
      if (term && !(c.name.toLowerCase().includes(term) || c.code.toLowerCase().includes(term) || c.legalName.toLowerCase().includes(term))) return false;
      if (type && c.type !== type) return false;
      if (location && c.location !== location) return false;
      if (status === 'active' && !c.active) return false;
      if (status === 'inactive' && c.active) return false;
      if (status === 'outstanding' && !(outstandingBy.get(c.id) ?? 0)) return false;
      return true;
    });
  }, [db.customers, search, type, location, status, outstandingBy]);

  const columns: Column<Customer>[] = [
    { key: 'code', header: 'Code', width: '90px', render: (c) => <span className="tabular text-muted">{c.code}</span>, sortValue: (c) => c.code, exportValue: (c) => c.code },
    {
      key: 'name', header: 'Name', sticky: true, width: '220px',
      render: (c) => (
        <div className="min-w-0">
          <p className="truncate font-medium text-ink">{c.name}</p>
          <p className="truncate text-xs text-muted">{c.contactPerson}</p>
        </div>
      ),
      sortValue: (c) => c.name, exportValue: (c) => c.name,
    },
    { key: 'type', header: 'Type', render: (c) => <Badge tone="neutral">{c.type}</Badge>, sortValue: (c) => c.type, exportValue: (c) => c.type, hideBelow: 'md' },
    { key: 'location', header: 'Location', render: (c) => c.location, sortValue: (c) => c.location, exportValue: (c) => c.location, hideBelow: 'lg' },
    { key: 'mobile', header: 'Mobile', render: (c) => c.mobile, exportValue: (c) => c.mobile, hideBelow: 'lg' },
    {
      key: 'freq', header: 'Order Freq.', render: (c) => <span className="text-muted">{c.orderFrequency}</span>, hideBelow: 'lg', exportValue: (c) => c.orderFrequency,
    },
    {
      key: 'creditLimit', header: 'Credit Limit', align: 'right', render: (c) => <span className="tabular">{inr(c.creditLimit)}</span>,
      sortValue: (c) => c.creditLimit, exportValue: (c) => c.creditLimit, hideBelow: 'lg',
    },
    {
      key: 'outstanding', header: 'Outstanding', align: 'right',
      render: (c) => {
        const v = outstandingBy.get(c.id) ?? 0;
        return <span className={`tabular font-medium ${v > c.creditLimit ? 'text-red-600' : v ? 'text-orange-600' : 'text-muted'}`}>{v ? inr(v) : '—'}</span>;
      },
      sortValue: (c) => outstandingBy.get(c.id) ?? 0, exportValue: (c) => outstandingBy.get(c.id) ?? 0,
    },
    {
      key: 'lastOrder', header: 'Last Order', render: (c) => (lastOrderBy.get(c.id) ? fmtDate(lastOrderBy.get(c.id)) : '—'),
      sortValue: (c) => lastOrderBy.get(c.id) ?? '', exportValue: (c) => (lastOrderBy.get(c.id) ? fmtDate(lastOrderBy.get(c.id)) : ''), hideBelow: 'md',
    },
    { key: 'status', header: 'Status', render: (c) => <StatusBadge status={c.active ? 'Active' : 'Inactive'} />, sortValue: (c) => (c.active ? 1 : 0) },
    {
      key: 'actions', header: '', width: '40px', align: 'center',
      render: (c) => (
        <Menu
          align="right"
          items={[
            { key: 'view', label: 'View detail', onClick: () => nav(`/customers/${c.id}`) },
            { key: 'edit', label: 'Edit', onClick: () => setEditing(c) },
            { key: 'order', label: 'New order for customer', onClick: () => nav(`/orders/new?customer=${c.id}`) },
          ]}
          trigger={(open) => <button onClick={(e) => { e.stopPropagation(); open(); }} className="rounded p-1 text-subtle hover:bg-canvas hover:text-ink"><MoreHorizontal size={16} /></button>}
        />
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Customers"
        description={`${db.customers.filter((c) => c.active).length} active · ${db.customers.length} total`}
        actions={
          <>
            <Button variant="secondary" icon={Upload}>Import</Button>
            <Button variant="secondary" icon={Download}>Export</Button>
            <Button variant="primary" icon={Plus} onClick={() => setFormOpen(true)}>Add Customer</Button>
          </>
        }
      />
      <Card>
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(c) => c.id}
          onRowClick={(c) => nav(`/customers/${c.id}`)}
          searchValue={search}
          onSearchChange={setSearch}
          searchPlaceholder="Search name, code, legal name…"
          exportFilename="customers"
          filters={
            <>
              <Select value={type} onChange={(e) => setType(e.target.value)} placeholder="All types" options={[...CUSTOMER_TYPES]} className="w-36" />
              <Select value={location} onChange={(e) => setLocation(e.target.value)} placeholder={LOCATIONS_ALL} options={locations} className="w-40" />
              <Select value={status} onChange={(e) => setStatus(e.target.value)} placeholder="All status"
                options={[{ value: 'active', label: 'Active' }, { value: 'inactive', label: 'Inactive' }, { value: 'outstanding', label: 'Has outstanding' }]} className="w-36" />
            </>
          }
          emptyTitle="No customers found"
          emptyDescription="Try clearing filters, or add your first customer."
          emptyAction={<Button size="sm" variant="primary" icon={Plus} onClick={() => setFormOpen(true)} className="mt-1">Add Customer</Button>}
          cardRender={(c) => (
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-[13.5px] font-medium text-ink">{c.name}</p>
                <p className="truncate text-xs text-muted">{c.code} · {c.location}</p>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                <StatusBadge status={c.active ? 'Active' : 'Inactive'} />
                {!!outstandingBy.get(c.id) && <span className="text-xs font-medium text-orange-600">{inr(outstandingBy.get(c.id)!)}</span>}
              </div>
            </div>
          )}
        />
      </Card>

      <CustomerForm open={formOpen} onClose={closeForm} />
      <CustomerForm open={!!editing} onClose={() => setEditing(null)} customer={editing} />
    </div>
  );
}
