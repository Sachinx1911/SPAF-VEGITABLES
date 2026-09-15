import { useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { Check, CircleX, PackageX, TriangleAlert } from 'lucide-react';
import { Card, CardBody } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input, Select, QtyInput, Textarea } from '../../components/ui/Field';
import { Badge } from '../../components/ui/Badge';
import { SignaturePad } from '../../components/ui/SignaturePad';
import { FileUpload } from '../../components/ui/FileUpload';
import { EmptyState } from '../../components/ui/States';
import { useConfirm } from '../../components/ui/ConfirmDialog';
import { useToast } from '../../components/ui/Toast';
import { useCurrentUser, useDb } from '../../store/useStore';
import { confirmDelivery, type DeliveryLineResult } from '../../store/packingActions';
import { cn } from '../../lib/cn';
import { qty } from '../../lib/format';

type Mode = 'Full' | 'Partial' | 'Refused' | 'Failed';
const MODES: { key: Mode; label: string; icon: typeof Check }[] = [
  { key: 'Full', label: 'Delivered Full', icon: Check },
  { key: 'Partial', label: 'Delivered Partial', icon: TriangleAlert },
  { key: 'Refused', label: 'Customer Refused', icon: CircleX },
  { key: 'Failed', label: 'Delivery Failed', icon: PackageX },
];
const SHORT_REASONS = ['Damaged in transit', 'Item missing', 'Customer changed mind', 'Quality complaint', 'Other'];

export function DeliveryConfirmationPage() {
  const { challanId } = useParams();
  const db = useDb();
  const user = useCurrentUser()!;
  const nav = useNavigate();
  const confirm = useConfirm();
  const toast = useToast();

  const challan = db.challans.find((c) => c.id === challanId);
  const customer = challan ? db.customers.find((c) => c.id === challan.customerId) : null;
  const itemById = new Map(db.items.map((i) => [i.id, i]));

  const [mode, setMode] = useState<Mode>('Full');
  const [qtys, setQtys] = useState<Record<string, number>>(() => Object.fromEntries((challan?.lines ?? []).map((l) => [l.orderItemId, l.qty])));
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [receivedByName, setReceivedByName] = useState('');
  const [signature, setSignature] = useState<string | null>(null);
  const [photo, setPhoto] = useState<{ name: string; url: string } | null>(null);
  const [remarks, setRemarks] = useState('');

  if (!challan || !customer) return <EmptyState title="Challan not found" action={<Button size="sm" onClick={() => nav('/driver')}>Back</Button>} />;

  const submit = async () => {
    if (mode !== 'Failed' && !receivedByName.trim()) return toast({ tone: 'error', title: "Enter who received the delivery" });
    if (mode !== 'Failed' && !signature) return toast({ tone: 'error', title: 'Signature required' });
    const ok = await confirm({
      title: `Confirm: ${MODES.find((m) => m.key === mode)!.label}`,
      description: customer.name,
      confirmLabel: 'Confirm delivery',
      tone: mode === 'Full' ? 'default' : 'danger',
    });
    if (!ok) return;

    const lines: DeliveryLineResult[] | undefined =
      mode === 'Full' ? undefined
      : mode === 'Refused' ? challan.lines.map((l) => ({ orderItemId: l.orderItemId, deliveredQty: 0, reason: 'Customer refused delivery' }))
      : mode === 'Partial' ? challan.lines.map((l) => ({ orderItemId: l.orderItemId, deliveredQty: qtys[l.orderItemId] ?? l.qty, reason: reasons[l.orderItemId] }))
      : undefined;

    confirmDelivery(challan.id, { mode, lines, receivedByName, signature, photo: photo?.url ?? null, remarks }, user.id);
    toast({ tone: mode === 'Full' ? 'success' : 'warning', title: 'Delivery recorded', description: customer.name });
    nav('/driver');
  };

  return (
    <div className="flex flex-col gap-4 pb-6">
      <div>
        <h1 className="text-[18px] font-semibold text-ink">Confirm delivery</h1>
        <p className="text-[12.5px] text-muted">{customer.name} · {challan.challanNo}</p>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {MODES.map((m) => (
          <button
            key={m.key}
            onClick={() => setMode(m.key)}
            className={cn('flex items-center justify-center gap-2 rounded-lg border p-3 text-[13px] font-medium', mode === m.key ? 'border-brand-600 bg-brand-50 text-brand-800' : 'border-line bg-white text-muted')}
          >
            <m.icon size={16} /> {m.label}
          </button>
        ))}
      </div>

      {mode !== 'Failed' && (
        <Card>
          <CardBody className="flex flex-col gap-2.5">
            <p className="text-[11px] font-semibold tracking-wide text-subtle uppercase">Items ({challan.lines.length})</p>
            {challan.lines.map((l) => {
              const item = itemById.get(l.itemId)!;
              return (
                <div key={l.orderItemId} className="rounded-lg border border-line p-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[13px] font-medium text-ink">{item.name} <Badge tone="neutral" className="ml-1">{item.unit}</Badge></p>
                    <p className="text-xs text-muted">Dispatched {qty(l.qty, item.unit)}</p>
                  </div>
                  {mode === 'Partial' && (
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <QtyInput value={qtys[l.orderItemId] ?? l.qty} unit={item.unit} max={l.qty} onChange={(v) => setQtys((q) => ({ ...q, [l.orderItemId]: v ?? 0 }))} size="sm" />
                      {(qtys[l.orderItemId] ?? l.qty) < l.qty && (
                        <>
                          <span className="text-[11.5px] font-medium text-orange-600">short {qty(l.qty - (qtys[l.orderItemId] ?? l.qty), item.unit)}</span>
                          <Select value={reasons[l.orderItemId] ?? ''} onChange={(e) => setReasons((r) => ({ ...r, [l.orderItemId]: e.target.value }))} placeholder="Reason…" options={SHORT_REASONS} className="w-40" />
                        </>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </CardBody>
        </Card>
      )}

      {mode !== 'Failed' && (
        <>
          <Input value={receivedByName} onChange={(e) => setReceivedByName(e.target.value)} placeholder="Customer / receiver name" />
          <SignaturePad value={signature} onChange={setSignature} />
          <FileUpload label="Photo (optional)" value={photo} onChange={setPhoto} />
        </>
      )}
      <Textarea value={remarks} onChange={(e) => setRemarks(e.target.value)} rows={2} placeholder="Remarks (optional)…" />

      <Button variant="primary" size="lg" onClick={submit}>Confirm Delivery</Button>
    </div>
  );
}
