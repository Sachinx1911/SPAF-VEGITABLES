import { useState } from 'react';
import { Modal } from '../../components/ui/Overlay';
import { Button } from '../../components/ui/Button';
import { Field, Select, Input, Textarea } from '../../components/ui/Field';
import { InlineError } from '../../components/ui/States';
import { useCurrentUser, useDb } from '../../store/useStore';
import { recordPayment } from '../../store/financeActions';
import { useToast } from '../../components/ui/Toast';
import { invoiceViews } from '../../domain/finance';
import { todayISO } from '../../lib/clock';
import { inr } from '../../lib/format';
import type { Payment, PaymentMode } from '../../types/models';

const MODES: PaymentMode[] = ['Cash', 'Bank Transfer', 'UPI', 'Cheque', 'Other'];

interface RecordPaymentModalProps {
  open: boolean;
  onClose: () => void;
  invoiceId?: string;
  onRecorded?: (p: Payment) => void;
}

export function RecordPaymentModal({ open, onClose, invoiceId, onRecorded }: RecordPaymentModalProps) {
  const db = useDb();
  const user = useCurrentUser()!;
  const toast = useToast();
  const today = todayISO();
  const openInvoices = invoiceViews(db, today).filter((i) => i.balance > 0);

  const [customerId, setCustomerId] = useState('');
  const [selectedInvoiceId, setSelectedInvoiceId] = useState(invoiceId ?? '');
  const [amount, setAmount] = useState<number | null>(null);
  const [mode, setMode] = useState<PaymentMode>('UPI');
  const [reference, setReference] = useState('');
  const [remarks, setRemarks] = useState('');
  const [error, setError] = useState<string | null>(null);

  const invoiceOptions = openInvoices.filter((i) => !customerId || i.customerId === customerId);
  const selected = openInvoices.find((i) => i.id === selectedInvoiceId);

  const save = () => {
    if (!selected) return setError('Choose an invoice.');
    if (!amount || amount <= 0) return setError('Enter a valid amount.');
    if (amount > selected.balance + 0.01) return setError(`Amount exceeds the outstanding balance of ${inr(selected.balance)}.`);
    const p = recordPayment({ customerId: selected.customerId, invoiceId: selected.id, paymentDate: today, mode, reference, amount, remarks }, user.id);
    toast({ tone: 'success', title: 'Payment recorded', description: `${p.receiptNo} · ${inr(amount)}` });
    onRecorded?.(p);
    setAmount(null); setReference(''); setRemarks(''); setError(null); setSelectedInvoiceId(''); setCustomerId('');
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose} title="Record payment" footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button variant="primary" onClick={save}>Save payment</Button></>}>
      <div className="flex flex-col gap-3.5">
        {!invoiceId && (
          <Field label="Customer">{(id) => <Select id={id} value={customerId} onChange={(e) => { setCustomerId(e.target.value); setSelectedInvoiceId(''); }} placeholder="All customers" options={db.customers.map((c) => ({ value: c.id, label: c.name }))} />}</Field>
        )}
        <Field label="Invoice" required>
          {(id) => (
            <Select id={id} value={selectedInvoiceId} onChange={(e) => setSelectedInvoiceId(e.target.value)} placeholder="Select invoice…" disabled={!!invoiceId}
              options={invoiceOptions.map((i) => ({ value: i.id, label: `${i.invoiceNo} · ${db.customers.find((c) => c.id === i.customerId)?.name} · ${inr(i.balance)} due` }))} />
          )}
        </Field>
        {selected && <p className="-mt-2 text-xs text-muted">Outstanding: <b className="text-ink">{inr(selected.balance)}</b></p>}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Amount" required>{() => <Input type="number" value={amount ?? ''} onChange={(e) => setAmount(e.target.value ? Number(e.target.value) : null)} />}</Field>
          <Field label="Mode">{(id) => <Select id={id} value={mode} onChange={(e) => setMode(e.target.value as PaymentMode)} options={MODES} />}</Field>
        </div>
        <Field label="Reference" hint="UPI ref / cheque no. / transaction ID">{(id) => <Input id={id} value={reference} onChange={(e) => setReference(e.target.value)} />}</Field>
        <Field label="Remarks">{(id) => <Textarea id={id} value={remarks} onChange={(e) => setRemarks(e.target.value)} rows={2} />}</Field>
        {error && <InlineError>{error}</InlineError>}
      </div>
    </Modal>
  );
}
