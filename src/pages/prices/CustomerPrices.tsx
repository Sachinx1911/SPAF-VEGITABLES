import { useMemo, useState } from 'react';
import { History, Plus } from 'lucide-react';
import { PageHeader, Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Select } from '../../components/ui/Field';
import { Badge, StatusBadge } from '../../components/ui/Badge';
import { DataTable, type Column } from '../../components/ui/DataTable';
import { Modal, Drawer } from '../../components/ui/Overlay';
import { Field, PriceInput } from '../../components/ui/Field';
import { InlineError } from '../../components/ui/States';
import { useCurrentUser, useDb } from '../../store/useStore';
import { setCustomerPrice } from '../../store/actions';
import { useToast } from '../../components/ui/Toast';
import type { CustomerItemPrice } from '../../types/models';
import { fmtDate, inr } from '../../lib/format';
import { todayISO } from '../../lib/clock';

export function CustomerPricesPage() {
  const db = useDb();
  const user = useCurrentUser()!;
  const toast = useToast();
  const [search, setSearch] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [itemId, setItemId] = useState('');
  const [status, setStatus] = useState('active');
  const [addOpen, setAddOpen] = useState(false);
  const [historyFor, setHistoryFor] = useState<{ customerId: string; itemId: string } | null>(null);

  const custById = new Map(db.customers.map((c) => [c.id, c]));
  const itemById = new Map(db.items.map((i) => [i.id, i]));

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return db.prices.filter((p) => {
      const c = custById.get(p.customerId);
      const it = itemById.get(p.itemId);
      if (term && !(c?.name.toLowerCase().includes(term) || it?.name.toLowerCase().includes(term))) return false;
      if (customerId && p.customerId !== customerId) return false;
      if (itemId && p.itemId !== itemId) return false;
      if (status === 'active' && p.effectiveTo) return false;
      if (status === 'expired' && !p.effectiveTo) return false;
      return true;
    });
  }, [db.prices, search, customerId, itemId, status]);

  const columns: Column<CustomerItemPrice>[] = [
    { key: 'customer', header: 'Customer', render: (p) => custById.get(p.customerId)?.name ?? '—', sortValue: (p) => custById.get(p.customerId)?.name ?? '', exportValue: (p) => custById.get(p.customerId)?.name ?? '' },
    {
      key: 'item', header: 'Item', render: (p) => <span>{itemById.get(p.itemId)?.name} <Badge tone="neutral" className="ml-1">{p.unit}</Badge></span>,
      sortValue: (p) => itemById.get(p.itemId)?.name ?? '', exportValue: (p) => `${itemById.get(p.itemId)?.name} (${p.unit})`,
    },
    { key: 'price', header: 'Selling Price', align: 'right', render: (p) => <span className="tabular font-medium">{inr(p.price, true)}</span>, sortValue: (p) => p.price, exportValue: (p) => p.price },
    { key: 'from', header: 'Effective From', render: (p) => fmtDate(p.effectiveFrom), sortValue: (p) => p.effectiveFrom },
    { key: 'to', header: 'Effective To', render: (p) => (p.effectiveTo ? fmtDate(p.effectiveTo) : '—') },
    { key: 'status', header: 'Status', render: (p) => <StatusBadge status={p.effectiveTo ? 'Inactive' : 'Active'} /> },
    {
      key: 'actions', header: '', width: '40px', align: 'center',
      render: (p) => (
        <button onClick={(e) => { e.stopPropagation(); setHistoryFor({ customerId: p.customerId, itemId: p.itemId }); }} className="rounded p-1 text-subtle hover:bg-canvas hover:text-ink" title="Price history">
          <History size={15} />
        </button>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Customer Prices"
        description="Item + unit prices customers actually pay — overrides the item's default selling price."
        actions={<Button variant="primary" icon={Plus} onClick={() => setAddOpen(true)}>Add Price</Button>}
      />
      <Card>
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(p) => p.id}
          searchValue={search}
          onSearchChange={setSearch}
          searchPlaceholder="Search customer or item…"
          exportFilename="customer-prices"
          filters={
            <>
              <Select value={customerId} onChange={(e) => setCustomerId(e.target.value)} placeholder="All customers" className="w-48"
                options={db.customers.map((c) => ({ value: c.id, label: c.name }))} />
              <Select value={itemId} onChange={(e) => setItemId(e.target.value)} placeholder="All items" className="w-44"
                options={db.items.map((i) => ({ value: i.id, label: `${i.name} (${i.unit})` }))} />
              <Select value={status} onChange={(e) => setStatus(e.target.value)} options={[{ value: 'active', label: 'Active' }, { value: 'expired', label: 'Expired' }, { value: '', label: 'All' }]} className="w-32" />
            </>
          }
          emptyTitle="No custom prices found"
          emptyAction={<Button size="sm" variant="primary" icon={Plus} onClick={() => setAddOpen(true)} className="mt-1">Add Price</Button>}
        />
      </Card>

      <AddPriceModal open={addOpen} onClose={() => setAddOpen(false)} />
      <PriceHistoryDrawer target={historyFor} onClose={() => setHistoryFor(null)} />
    </div>
  );

  function AddPriceModal({ open, onClose }: { open: boolean; onClose: () => void }) {
    const [form, setForm] = useState({ customerId: '', itemId: '', price: null as number | null, effectiveFrom: todayISO() });
    const [error, setError] = useState<string | null>(null);
    const item = itemById.get(form.itemId);

    const save = () => {
      if (!form.customerId || !form.itemId || form.price == null) return setError('Choose a customer, item and price.');
      setCustomerPrice({ customerId: form.customerId, itemId: form.itemId, unit: item!.unit, price: form.price, effectiveFrom: form.effectiveFrom }, user.id);
      toast({ tone: 'success', title: 'Price set', description: `${custById.get(form.customerId)?.name} · ${item?.name}` });
      setForm({ customerId: '', itemId: '', price: null, effectiveFrom: todayISO() });
      setError(null);
      onClose();
    };

    return (
      <Modal open={open} onClose={onClose} title="Add customer price" footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button variant="primary" onClick={save}>Save price</Button></>}>
        <div className="flex flex-col gap-3.5">
          <Field label="Customer" required>{(id) => <Select id={id} value={form.customerId} onChange={(e) => setForm((f) => ({ ...f, customerId: e.target.value }))} placeholder="Select customer…" options={db.customers.map((c) => ({ value: c.id, label: c.name }))} />}</Field>
          <Field label="Item" required>{(id) => <Select id={id} value={form.itemId} onChange={(e) => setForm((f) => ({ ...f, itemId: e.target.value }))} placeholder="Select item…" options={db.items.map((i) => ({ value: i.id, label: `${i.name} (${i.unit})` }))} />}</Field>
          <Field label="Selling price" required>{() => <PriceInput value={form.price} onChange={(v) => setForm((f) => ({ ...f, price: v }))} unit={item?.unit} />}</Field>
          <Field label="Effective from" hint="Any current price for this customer + item ends the day before.">{(id) => <input id={id} type="date" value={form.effectiveFrom} onChange={(e) => setForm((f) => ({ ...f, effectiveFrom: e.target.value }))} className="h-9 rounded-lg border border-line px-3 text-[13px]" />}</Field>
          {error && <InlineError>{error}</InlineError>}
        </div>
      </Modal>
    );
  }

  function PriceHistoryDrawer({ target, onClose }: { target: { customerId: string; itemId: string } | null; onClose: () => void }) {
    const history = target ? db.prices.filter((p) => p.customerId === target.customerId && p.itemId === target.itemId).sort((a, b) => (a.effectiveFrom < b.effectiveFrom ? 1 : -1)) : [];
    const cust = target ? custById.get(target.customerId) : null;
    const item = target ? itemById.get(target.itemId) : null;
    return (
      <Drawer open={!!target} onClose={onClose} title="Price history" description={target ? `${cust?.name} · ${item?.name}` : ''}>
        <div className="flex flex-col gap-2">
          {history.map((p) => (
            <div key={p.id} className="flex items-center justify-between rounded-lg border border-line px-3 py-2.5">
              <div>
                <p className="tabular text-[14px] font-semibold text-ink">{inr(p.price, true)}</p>
                <p className="text-xs text-muted">{fmtDate(p.effectiveFrom)} – {p.effectiveTo ? fmtDate(p.effectiveTo) : 'ongoing'}</p>
              </div>
              <StatusBadge status={p.effectiveTo ? 'Inactive' : 'Active'} />
            </div>
          ))}
        </div>
      </Drawer>
    );
  }
}
