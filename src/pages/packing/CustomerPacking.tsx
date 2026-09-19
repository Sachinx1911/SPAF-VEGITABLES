import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { ArrowLeft, Check, LoaderCircle, PackageCheck, TriangleAlert } from 'lucide-react';
import { Card, CardBody, CardHeader, PageHeader } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Select, QtyInput, Checkbox, Textarea } from '../../components/ui/Field';
import { Badge, StatusBadge } from '../../components/ui/Badge';
import { Breadcrumb } from '../../components/ui/Breadcrumb';
import { Modal } from '../../components/ui/Overlay';
import { useConfirm } from '../../components/ui/ConfirmDialog';
import { useToast } from '../../components/ui/Toast';
import { useCurrentUser, useDb } from '../../store/useStore';
import { getOrCreatePacking, markPacked, raisePackingIssue, setPackageType, setPackedQty } from '../../store/packingActions';
import { API_MODE } from '../../lib/api';
import { fmtDate, qty } from '../../lib/format';
import type { PackageType } from '../../types/models';

const PACKAGE_TYPES: PackageType[] = ['Bag', 'Box', 'Crate', 'Other'];

export function CustomerPackingPage() {
  const { orderId } = useParams();
  const db = useDb();
  const user = useCurrentUser()!;
  const nav = useNavigate();
  const confirm = useConfirm();
  const toast = useToast();
  const [issueOpen, setIssueOpen] = useState(false);
  const [issueText, setIssueText] = useState('');
  const [checked, setChecked] = useState(false);
  const [loadingPacking, setLoadingPacking] = useState(false);
  const [finishing, setFinishing] = useState(false);

  useEffect(() => {
    if (!orderId) return;

    if (!API_MODE) {
      // Demo mode: create locally if not already there.
      if (!db.packings.some((p) => p.orderId === orderId)) void getOrCreatePacking(orderId, user.id);
      return;
    }

    // API mode: always fetch fresh detail so packingItems are populated.
    setLoadingPacking(true);
    getOrCreatePacking(orderId, user.id)
      .catch((e) => {
        toast({ tone: 'error', title: 'Could not load packing', description: (e as Error).message });
        nav('/packing');
      })
      .finally(() => setLoadingPacking(false));
  }, [orderId]); // eslint-disable-line react-hooks/exhaustive-deps

  const order = db.orders.find((o) => o.id === orderId);
  const packing = db.packings.find((p) => p.orderId === orderId);
  const customer = order ? db.customers.find((c) => c.id === order.customerId) : null;
  const route = customer ? db.routes.find((r) => r.id === customer.routeId) : null;
  const items = packing ? db.packingItems.filter((i) => i.packingId === packing.id) : [];
  const itemById = new Map(db.items.map((i) => [i.id, i]));

  if (loadingPacking || !order || !customer || !packing) {
    return loadingPacking ? (
      <div className="flex items-center gap-2 p-8 text-muted">
        <LoaderCircle size={18} className="animate-spin" />
        <span className="text-[13px]">Loading packing sheet…</span>
      </div>
    ) : null;
  }

  const allPacked = items.every((i) => (i.packedQty ?? 0) >= i.allocatedQty);
  const isDone = packing.status === 'Packed';

  const finish = async () => {
    if (!allPacked && !(await confirm({ title: 'Some items are not fully packed', description: 'Mark packed anyway? Balance quantities will be recorded as short.', tone: 'danger', confirmLabel: 'Mark packed anyway' }))) return;
    if (allPacked && !(await confirm({ title: 'Mark this order packed?', description: 'This generates the delivery challan automatically.', confirmLabel: 'Mark Packed' }))) return;
    setFinishing(true);
    try {
      const challan = await markPacked(packing.id, user.id);
      toast({ tone: 'success', title: 'Packed & challan generated', description: challan.challanNo });
      nav('/packing');
    } catch (e) {
      toast({ tone: 'error', title: 'Packing failed', description: (e as Error).message });
    } finally {
      setFinishing(false);
    }
  };

  return (
    <div>
      <PageHeader
        breadcrumb={<Breadcrumb items={[{ label: 'Packing', to: '/packing' }, { label: order.orderNo }]} />}
        title={<span className="flex items-center gap-2">{customer.name} <StatusBadge status={packing.status === 'Packing' ? 'Packing' : packing.status} /></span>}
        description={`${order.orderNo} · ${route?.name ?? '—'} · Delivery ${fmtDate(order.deliveryDate)}`}
        actions={
          <>
            <Button variant="secondary" icon={ArrowLeft} onClick={() => nav('/packing')}>Back</Button>
            {!isDone && <Button variant="danger" icon={TriangleAlert} onClick={() => setIssueOpen(true)} disabled={finishing}>Raise Issue</Button>}
            {!isDone && <Button variant="primary" icon={finishing ? LoaderCircle : Check} onClick={finish} disabled={finishing}>{finishing ? 'Saving…' : 'Mark Packed'}</Button>}
          </>
        }
      />

      {packing.status === 'Issue' && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3.5 text-[13px] text-red-800">
          <p className="font-semibold">Packing issue</p>
          <p>{packing.issue}</p>
        </div>
      )}

      <Card>
        <CardHeader title="Items to pack" icon={<PackageCheck size={15} />} subtitle={`${items.filter((i) => (i.packedQty ?? 0) >= i.allocatedQty).length}/${items.length} complete`} />
        <div className="scrollbar-thin overflow-x-auto">
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr className="border-b border-line bg-canvas/70 text-[11.5px] font-semibold uppercase text-muted">
                <th className="px-3 py-2 text-left">Item</th>
                <th className="px-3 py-2 text-right">Allocated Qty</th>
                <th className="w-36 px-3 py-2 text-right">Packed Qty</th>
                <th className="px-3 py-2 text-right">Balance</th>
                <th className="px-3 py-2 text-left">Package Type</th>
              </tr>
            </thead>
            <tbody>
              {items.map((i) => {
                const item = itemById.get(i.itemId)!;
                const balance = i.allocatedQty - (i.packedQty ?? 0);
                return (
                  <tr key={i.id} className="border-b border-line last:border-0">
                    <td className="px-3 py-2 font-medium text-ink">{item.name} <Badge tone="neutral" className="ml-1">{item.unit}</Badge></td>
                    <td className="px-3 py-2 text-right text-muted">{qty(i.allocatedQty, item.unit)}</td>
                    <td className="px-3 py-2"><QtyInput value={i.packedQty} unit={item.unit} onChange={(v) => setPackedQty(i.id, v, user.id)} size="sm" disabled={isDone} /></td>
                    <td className={`px-3 py-2 text-right tabular font-medium ${balance > 0 ? 'text-orange-600' : 'text-emerald-600'}`}>{balance > 0 ? qty(balance, item.unit) : '—'}</td>
                    <td className="px-3 py-2"><Select value={i.packageType} onChange={(e) => setPackageType(i.id, e.target.value as PackageType)} options={PACKAGE_TYPES} className="w-28" disabled={isDone} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {!isDone && (
          <div className="border-t border-line p-4">
            <Checkbox checked={checked} onChange={(e) => setChecked(e.target.checked)} label="Packing checklist verified — items match order, quality checked, correctly packaged" />
          </div>
        )}
      </Card>

      <Modal open={issueOpen} onClose={() => setIssueOpen(false)} title="Raise packing issue" footer={<><Button variant="secondary" onClick={() => setIssueOpen(false)}>Cancel</Button><Button variant="danger" onClick={() => { if (!issueText.trim()) return; raisePackingIssue(packing.id, issueText, user.id); toast({ tone: 'warning', title: 'Issue raised' }); setIssueOpen(false); }}>Raise issue</Button></>}>
        <Textarea value={issueText} onChange={(e) => setIssueText(e.target.value)} rows={3} placeholder="e.g. Item short at packing table, recount requested…" />
      </Modal>
    </div>
  );
}
