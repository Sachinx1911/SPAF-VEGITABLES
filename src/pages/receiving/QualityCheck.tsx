import { useMemo, useState } from 'react';
import { ClipboardCheck } from 'lucide-react';
import { PageHeader, Card, CardBody } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Select, QtyInput, Textarea } from '../../components/ui/Field';
import { Badge } from '../../components/ui/Badge';
import { FileUpload } from '../../components/ui/FileUpload';
import { EmptyState } from '../../components/ui/States';
import { useCurrentUser, useDb } from '../../store/useStore';
import { recordQualityCheck } from '../../store/procurementActions';
import { useProcurementSync } from '../../store/useApiSync';
import { qcQueue, type QcQueueRow } from '../../domain/procurement';
import { useToast } from '../../components/ui/Toast';
import { fmtDateTime, qty } from '../../lib/format';
import type { QcGrade, QcReason } from '../../types/models';

const REASONS: QcReason[] = ['Damaged', 'Overripe', 'Underripe', 'Poor Quality', 'Wrong Item', 'Wrong Qty', 'Other'];
const GRADES: QcGrade[] = ['A', 'B', 'C', 'Rejected'];

export function QualityCheckPage() {
  const db = useDb();
  const user = useCurrentUser()!;
  const toast = useToast();
  // Fills the store with the procurement tables in API mode; refresh re-pulls
  // them after a grade is recorded so the line leaves the queue.
  const { refresh } = useProcurementSync();
  const queue = useMemo(() => qcQueue(db), [db]);
  const [drafts, setDrafts] = useState<Record<string, { accepted: number; rejected: number; grade: QcGrade; reason: QcReason | ''; remarks: string; photo: { name: string; url: string } | null }>>({});

  const draftFor = (row: QcQueueRow) =>
    drafts[row.receivingItem.id] ?? { accepted: row.receivingItem.receivedQty, rejected: 0, grade: 'A' as QcGrade, reason: '' as QcReason | '', remarks: '', photo: null as { name: string; url: string } | null };

  const setDraft = (row: QcQueueRow, patch: Partial<ReturnType<typeof draftFor>>) =>
    setDrafts((d) => ({ ...d, [row.receivingItem.id]: { ...draftFor(row), ...patch } }));

  const save = async (row: QcQueueRow) => {
    const d = draftFor(row);
    if (d.accepted + d.rejected > row.receivingItem.receivedQty + 0.001) {
      return toast({ tone: 'error', title: 'Accepted + rejected exceeds received quantity' });
    }
    try {
      await recordQualityCheck(
        { receivingItemId: row.receivingItem.id, itemId: row.item.id, unit: row.item.unit, acceptedQty: d.accepted, rejectedQty: d.rejected, grade: d.grade, reason: d.rejected > 0 ? (d.reason || 'Other') : null, remarks: d.remarks },
        user.id,
      );
      await refresh();
    } catch (e) {
      toast({ tone: 'error', title: 'Could not save the quality check', description: (e as Error).message });
      return;
    }
    toast({ tone: 'success', title: 'Quality check saved', description: `${row.item.name} · Grade ${d.grade}` });
  };

  if (queue.length === 0) {
    return (
      <div>
        <PageHeader title="Quality Check" />
        <Card><EmptyState icon={ClipboardCheck} title="No pending quality checks" description="Every received line has been graded." /></Card>
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="Quality Check" description={`${queue.length} received lines waiting for grading`} />
      <div className="flex flex-col gap-3">
        {queue.map((row) => {
          const d = draftFor(row);
          return (
            <Card key={row.receivingItem.id}>
              <CardBody className="flex flex-col gap-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-medium text-ink">{row.item.name} <Badge tone="neutral" className="ml-1">{row.item.unit}</Badge></p>
                    <p className="text-xs text-muted">{row.supplierName} · {row.grnNo} · received {fmtDateTime(row.receivedAt)} · {qty(row.receivingItem.receivedQty, row.item.unit)} received</p>
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <div>
                    <label className="mb-1 block text-[11.5px] font-medium text-muted">Accepted qty</label>
                    <QtyInput value={d.accepted} unit={row.item.unit} onChange={(v) => setDraft(row, { accepted: v ?? 0 })} size="sm" />
                  </div>
                  <div>
                    <label className="mb-1 block text-[11.5px] font-medium text-muted">Rejected qty</label>
                    <QtyInput value={d.rejected} unit={row.item.unit} onChange={(v) => setDraft(row, { rejected: v ?? 0 })} size="sm" />
                  </div>
                  <div>
                    <label className="mb-1 block text-[11.5px] font-medium text-muted">Grade</label>
                    <Select value={d.grade} onChange={(e) => setDraft(row, { grade: e.target.value as QcGrade })} options={GRADES} />
                  </div>
                  <div>
                    <label className="mb-1 block text-[11.5px] font-medium text-muted">Reason (if rejected)</label>
                    <Select value={d.reason} onChange={(e) => setDraft(row, { reason: e.target.value as QcReason })} placeholder="—" options={REASONS} disabled={d.rejected <= 0} />
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Textarea value={d.remarks} onChange={(e) => setDraft(row, { remarks: e.target.value })} rows={2} placeholder="Remarks…" />
                  <FileUpload label="Photo (optional)" value={d.photo} onChange={(v) => setDraft(row, { photo: v })} />
                </div>
                <div>
                  <Button variant="primary" size="sm" onClick={() => save(row)}>Save quality check</Button>
                </div>
              </CardBody>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
