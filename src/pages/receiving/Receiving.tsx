import { useMemo, useState } from 'react';
import { PackageCheck } from 'lucide-react';
import { PageHeader, Card } from '../../components/ui/Card';
import { useConfirm } from '../../components/ui/ConfirmDialog';
import { useToast } from '../../components/ui/Toast';
import { receiveAllPending } from '../../store/procurementActions';
import { Button } from '../../components/ui/Button';
import { StatusBadge } from '../../components/ui/Badge';
import { DataTable, type Column } from '../../components/ui/DataTable';
import { useCurrentUser, useDb } from '../../store/useStore';
import { receivingQueue, type ReceivingQueueRow } from '../../domain/procurement';
import { fmtDate, num } from '../../lib/format';
import { ReceivingForm } from './ReceivingForm';
import type { PurchaseOrder } from '../../types/models';

export function ReceivingPage() {
  const db = useDb();
  const user = useCurrentUser()!;
  const confirm = useConfirm();
  const toast = useToast();
  const [receiving, setReceiving] = useState<PurchaseOrder | null>(null);
  const queue = useMemo(() => receivingQueue(db), [db]);

  const receiveAll = async () => {
    const ok = await confirm({
      title: `Receive ${queue.length} purchase orders as ordered?`,
      description: 'Every line is received in full in good condition, accepted to stock and allocated to customer orders. Use the Receive button on a single PO when something came short or damaged.',
      confirmLabel: 'Receive all',
      details: queue.map((r) => ({ label: r.po.poNo, value: `${r.supplierName} · ${r.lineCount} lines` })),
    });
    if (!ok) return;
    const res = receiveAllPending(user.id);
    toast({ tone: 'success', title: `${res.pos} purchase orders received`, description: `${res.autoAccepted} lines accepted to stock${res.autoAllocated ? ` · ${res.autoAllocated} items allocated to orders` : ''}` });
  };
  const recentGrns = [...db.receivings].sort((a, b) => (a.receivedAt < b.receivedAt ? 1 : -1)).slice(0, 15);

  const columns: Column<ReceivingQueueRow>[] = [
    { key: 'po', header: 'PO No', render: (r) => <span className="font-medium text-brand-700">{r.po.poNo}</span> },
    { key: 'supplier', header: 'Supplier', render: (r) => r.supplierName },
    { key: 'date', header: 'Purchase Date', render: (r) => fmtDate(r.po.purchaseDate), sortValue: (r) => r.po.purchaseDate },
    { key: 'delivery', header: 'For Delivery', render: (r) => fmtDate(r.po.forDeliveryDate), hideBelow: 'md' },
    { key: 'lines', header: 'Items', align: 'right', render: (r) => r.lineCount },
    { key: 'qty', header: 'Total Qty', align: 'right', render: (r) => num(r.totalQty), hideBelow: 'lg' },
    { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.po.status} /> },
    { key: 'actions', header: '', align: 'right', render: (r) => <Button size="xs" variant="primary" onClick={() => setReceiving(r.po)}>Receive</Button> },
  ];

  const grnCols: Column<(typeof recentGrns)[number]>[] = [
    { key: 'grn', header: 'GRN No', render: (g) => <span className="font-medium text-brand-700">{g.grnNo}</span> },
    { key: 'po', header: 'PO No', render: (g) => db.purchaseOrders.find((p) => p.id === g.purchaseOrderId)?.poNo ?? '—' },
    { key: 'date', header: 'Received At', render: (g) => fmtDate(g.receivedAt), sortValue: (g) => g.receivedAt },
    { key: 'status', header: 'Status', render: (g) => <StatusBadge status={g.status} /> },
  ];

  return (
    <div>
      <PageHeader
        title="Receiving"
        description={`${queue.length} purchase orders waiting for a GRN`}
        actions={queue.length > 0 && <Button variant="primary" icon={PackageCheck} onClick={receiveAll}>Receive all as ordered ({queue.length})</Button>}
      />
      <Card className="mb-4">
        <DataTable
          columns={columns} rows={queue} rowKey={(r) => r.po.id} emptyTitle="Nothing to receive" emptyDescription="Every confirmed purchase has been received."
          cardRender={(r) => (
            <div>
              <div className="flex items-center justify-between gap-2">
                <p className="text-[13.5px] font-medium text-brand-700">{r.po.poNo}</p>
                <StatusBadge status={r.po.status} />
              </div>
              <p className="mt-0.5 text-xs text-muted">{r.supplierName} · {r.lineCount} items · {num(r.totalQty)} qty</p>
              <Button size="xs" variant="primary" className="mt-2" onClick={() => setReceiving(r.po)}>Receive</Button>
            </div>
          )}
        />
      </Card>
      <Card>
        <div className="border-b border-line px-4 py-3"><p className="text-[13px] font-semibold text-ink">Recent GRNs</p></div>
        <DataTable columns={grnCols} rows={recentGrns} rowKey={(g) => g.id} emptyTitle="No GRNs yet" pageSize={10} />
      </Card>
      <ReceivingForm po={receiving} onClose={() => setReceiving(null)} />
    </div>
  );
}
