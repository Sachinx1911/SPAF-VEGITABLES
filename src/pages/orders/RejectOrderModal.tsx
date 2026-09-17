import { useState } from 'react';
import { Modal } from '../../components/ui/Overlay';
import { Button } from '../../components/ui/Button';
import { Field, Textarea } from '../../components/ui/Field';
import { InlineError } from '../../components/ui/States';
import { useCurrentUser, useDb } from '../../store/useStore';
import { rejectOrder } from '../../store/orderActions';
import { useToast } from '../../components/ui/Toast';
import type { Order } from '../../types/models';

export function RejectOrderModal({ order, onClose }: { order: Order | null; onClose: () => void }) {
  const db = useDb();
  const user = useCurrentUser()!;
  const toast = useToast();
  const [reason, setReason] = useState('');
  const [error, setError] = useState(false);
  const customer = order ? db.customers.find((c) => c.id === order.customerId) : null;

  const submit = async () => {
    if (!order) return;
    if (!reason.trim()) return setError(true);

    try {
      await rejectOrder(order.id, reason.trim(), user.id);
    } catch (e) {
      // The modal stays open with the reason intact, so nothing is retyped.
      return toast({ tone: 'error', title: 'Could not reject', description: (e as Error).message });
    }

    toast({ tone: 'success', title: 'Order rejected', description: order.orderNo });
    setReason('');
    setError(false);
    onClose();
  };

  return (
    <Modal
      open={!!order}
      onClose={onClose}
      title="Reject order"
      description={order ? `${order.orderNo} · ${customer?.name}` : ''}
      size="sm"
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button variant="danger" onClick={submit}>Reject order</Button></>}
    >
      <Field label="Reason" required>
        {(id) => <Textarea id={id} value={reason} onChange={(e) => { setReason(e.target.value); setError(false); }} rows={3} placeholder="e.g. Duplicate order, credit hold, out of delivery window…" invalid={error} />}
      </Field>
      {error && <InlineError>A reason is required to reject an order.</InlineError>}
    </Modal>
  );
}
