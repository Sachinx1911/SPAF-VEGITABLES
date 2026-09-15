import { useState } from 'react';
import { Ban, Download, Plus, Trash, Truck } from 'lucide-react';
import { PageHeader, Card, CardHeader, CardBody } from '../components/ui/Card';
import { Button, IconButton } from '../components/ui/Button';
import { Badge, StatusBadge } from '../components/ui/Badge';
import { Field, Input, Select, Textarea, Checkbox, Switch, SearchInput, QtyInput, PriceInput } from '../components/ui/Field';
import { Tabs } from '../components/ui/Tabs';
import { Alert } from '../components/ui/Alert';
import { Modal } from '../components/ui/Overlay';
import { Drawer } from '../components/ui/Overlay';
import { useToast } from '../components/ui/Toast';
import { useConfirm } from '../components/ui/ConfirmDialog';
import { Pagination } from '../components/ui/Pagination';
import { Breadcrumb } from '../components/ui/Breadcrumb';
import { EmptyState, LoadingState, Skeleton, SkeletonTable } from '../components/ui/States';
import { DatePicker, DateRangePicker } from '../components/ui/DatePicker';
import { FileUpload } from '../components/ui/FileUpload';
import { SignaturePad } from '../components/ui/SignaturePad';
import { DataTable, type Column } from '../components/ui/DataTable';
import { KpiCard, StatTile } from '../components/ui/Kpi';
import { QtyChain } from '../components/ui/QtyChain';
import { QTY_STAGES } from '../types/models';

const sampleRows = Array.from({ length: 8 }, (_, i) => ({ id: `r${i}`, item: `Item ${i + 1}`, qty: (i + 1) * 3, status: ['Pending', 'Approved', 'Late'][i % 3]! }));
const cols: Column<(typeof sampleRows)[number]>[] = [
  { key: 'item', header: 'Item', render: (r) => r.item, sortValue: (r) => r.item, exportValue: (r) => r.item },
  { key: 'qty', header: 'Qty', align: 'right', render: (r) => r.qty, sortValue: (r) => r.qty, exportValue: (r) => r.qty },
  { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
];

export function DesignSystemPage() {
  const toast = useToast();
  const confirm = useConfirm();
  const [modalOpen, setModalOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [tab, setTab] = useState('a');
  const [search, setSearch] = useState('');
  const [qty, setQty] = useState<number | null>(4.5);
  const [price, setPrice] = useState<number | null>(65);
  const [sig, setSig] = useState<string | null>(null);
  const [date, setDate] = useState('2026-09-13');
  const [range, setRange] = useState({ from: '2026-09-01', to: '2026-09-13' });
  const [page, setPage] = useState(1);

  const sampleChain = { ordered: 12, approved: 12, purchased: 12, received: 11.5, accepted: 11.5, allocated: 11.5, packed: 11.5, dispatched: 11.5, delivered: 11, customerAccepted: 11, invoiced: 11, paid: null };

  return (
    <div className="flex flex-col gap-6 pb-10">
      <PageHeader title="Design System" description="Every shared component used across SPAF — buttons, inputs, tables, states." breadcrumb={<Breadcrumb items={[{ label: 'System' }, { label: 'Design System' }]} />} />

      <Card>
        <CardHeader title="Buttons" />
        <CardBody className="flex flex-wrap items-center gap-2">
          <Button variant="primary">Primary</Button>
          <Button variant="accent">Accent</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="subtle">Subtle</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="danger" icon={Trash}>Danger</Button>
          <Button variant="primary" icon={Plus} size="sm">Small</Button>
          <Button variant="primary" size="lg" iconRight={Truck}>Large</Button>
          <Button variant="primary" loading>Loading</Button>
          <Button variant="secondary" disabled>Disabled</Button>
          <IconButton icon={Download} label="Download" />
          <IconButton icon={Ban} label="Blocked" badge={3} />
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Status badges" subtitle="Consistent colour meaning across every module" />
        <CardBody className="flex flex-wrap gap-2">
          {['Draft', 'Submitted', 'Approved', 'Late', 'Rejected', 'Locked', 'Partially Fulfilled', 'Completed', 'OK', 'Purchase Required', 'Critical', 'Shortage', 'Packed', 'Dispatched', 'Delivered', 'Partial', 'Issue', 'Outstanding', 'Paid', 'Overdue'].map((s) => (
            <StatusBadge key={s} status={s} />
          ))}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Form controls" />
        <CardBody className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Customer name" required hint="Exactly as in accounting export">{(id) => <Input id={id} placeholder="e.g. The Terrace Juhu" />}</Field>
          <Field label="Customer type">{(id) => <Select id={id} options={['Hotel', 'Restaurant', 'Cafe', 'Caterer', 'Corporate', 'Other']} />}</Field>
          <Field label="Search">{() => <SearchInput value={search} onChange={setSearch} />}</Field>
          <Field label="Quantity">{() => <QtyInput value={qty} unit="Kg" onChange={setQty} />}</Field>
          <Field label="Selling price">{() => <PriceInput value={price} onChange={setPrice} unit="Kg" />}</Field>
          <Field label="Delivery date">{() => <DatePicker value={date} onChange={setDate} />}</Field>
          <Field label="Report range" className="sm:col-span-2">{() => <DateRangePicker from={range.from} to={range.to} onChange={(from, to) => setRange({ from, to })} />}</Field>
          <Field label="Remarks">{(id) => <Textarea id={id} placeholder="Special instructions…" />}</Field>
          <div className="flex flex-col gap-3">
            <Checkbox label="Active" defaultChecked />
            <Switch checked label="Enabled" onChange={() => {}} />
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Quantity chain" subtitle="Every stage keeps its own value — never overwritten" />
        <CardBody><QtyChain chain={sampleChain} unit="Kg" /></CardBody>
      </Card>

      <Card>
        <CardHeader title="Tabs" />
        <CardBody className="flex flex-col gap-4">
          <Tabs items={[{ key: 'a', label: 'Overview' }, { key: 'b', label: 'Orders', count: 12 }, { key: 'c', label: 'Ledger' }]} value={tab} onChange={setTab} />
          <Tabs variant="pill" items={[{ key: 'a', label: 'Today' }, { key: 'b', label: 'This Week' }]} value={tab} onChange={setTab} />
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Alerts" />
        <CardBody className="flex flex-col gap-2.5">
          <Alert tone="info" title="Heads up">Consolidation locks at 22:00 for tomorrow's delivery.</Alert>
          <Alert tone="success" title="Delivered">All 34 orders on Route 2 delivered.</Alert>
          <Alert tone="warning" title="3 Late Orders">Received after cutoff — needs approval.</Alert>
          <Alert tone="error" title="Critical shortage">Broccoli short by 62% of requirement.</Alert>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="KPI cards & stat tiles" />
        <CardBody className="grid gap-3 sm:grid-cols-3">
          <KpiCard label="Today's Orders" value={31} deltaPct={12} icon={Truck} />
          <KpiCard label="Outstanding" value="₹2.45 L" deltaPct={-8} deltaGoodDirection="down" tone="red" icon={Truck} />
          <div className="flex gap-2"><StatTile label="Shortage" value={4} tone="red" /><StatTile label="Excess" value={2} tone="blue" /></div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Overlays" actions={<>
          <Button size="sm" onClick={() => setModalOpen(true)}>Open modal</Button>
          <Button size="sm" onClick={() => setDrawerOpen(true)}>Open drawer</Button>
        </>} />
        <CardBody className="flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" onClick={() => toast({ tone: 'success', title: 'Saved', description: 'Changes recorded.' })}>Toast: success</Button>
          <Button size="sm" variant="secondary" onClick={() => toast({ tone: 'error', title: 'Could not save' })}>Toast: error</Button>
          <Button
            size="sm" variant="danger"
            onClick={async () => {
              const ok = await confirm({ title: 'Lock today\'s orders?', description: 'Once locked, orders cannot be edited and the purchase requirement is generated.', tone: 'danger', confirmLabel: 'Lock orders', details: [{ label: 'Orders', value: '31' }, { label: 'Items', value: '58' }] });
              toast({ tone: ok ? 'success' : 'info', title: ok ? 'Locked' : 'Cancelled' });
            }}
          >
            Confirm dialog
          </Button>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="File upload & signature" />
        <CardBody className="grid gap-4 sm:grid-cols-2">
          <FileUpload label="Damage photo" onChange={() => {}} value={null} />
          <SignaturePad value={sig} onChange={setSig} />
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Empty / loading / skeleton states" />
        <CardBody className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg border border-line"><EmptyState title="No orders yet" description="Create your first order to get started." /></div>
          <div className="rounded-lg border border-line"><LoadingState /></div>
          <div className="rounded-lg border border-line sm:col-span-2"><SkeletonTable rows={3} cols={4} /></div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Pagination" />
        <CardBody><Pagination page={page} pageSize={10} total={94} onPageChange={setPage} /></CardBody>
      </Card>

      <Card>
        <CardHeader title="Data table" subtitle="Search, sort, filter, pagination, column toggle, export — the only table component in the app" />
        <DataTable columns={cols} rows={sampleRows} rowKey={(r) => r.id} searchValue={search} onSearchChange={setSearch} exportFilename="sample" pageSize={5} />
      </Card>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Sample modal" description="Used for focused, blocking actions." footer={<><Button variant="secondary" onClick={() => setModalOpen(false)}>Cancel</Button><Button variant="primary" onClick={() => setModalOpen(false)}>Save</Button></>}>
        <p className="text-[13px] text-muted">Modal body content goes here.</p>
      </Modal>
      <Drawer open={drawerOpen} onClose={() => setDrawerOpen(false)} title="Sample drawer" description="Used for detail views and forms that need more room.">
        <p className="text-[13px] text-muted">Drawer body content goes here.</p>
      </Drawer>
    </div>
  );
}
