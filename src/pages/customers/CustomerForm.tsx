import { useState } from 'react';
import { Drawer } from '../../components/ui/Overlay';
import { Button } from '../../components/ui/Button';
import { Field, Input, Select, Textarea, Switch } from '../../components/ui/Field';
import { InlineError } from '../../components/ui/States';
import { useDb, useCurrentUser } from '../../store/useStore';
import { addCustomer, nextCustomerCode, updateCustomer } from '../../store/actions';
import { useToast } from '../../components/ui/Toast';
import { CUSTOMER_TYPES, type Customer } from '../../types/models';

interface CustomerFormProps {
  open: boolean;
  onClose: () => void;
  customer?: Customer | null;
  onSaved?: (c: Customer) => void;
}

const emptyForm = (code: string) => ({
  code, name: '', legalName: '', type: 'Restaurant' as (typeof CUSTOMER_TYPES)[number], location: '',
  contactPerson: '', mobile: '', altMobile: '', email: '', billingAddress: '', deliveryAddress: '',
  gstin: '', pan: '', paymentTermsDays: 15, creditLimit: 100000, orderFrequency: 'Daily' as Customer['orderFrequency'],
  preferredOrderTime: 'Before 20:00', preferredDeliveryTime: '08:00 – 10:00', specialInstructions: '', active: true,
  routeId: '',
});

export function CustomerForm({ open, onClose, customer, onSaved }: CustomerFormProps) {
  const db = useDb();
  const user = useCurrentUser()!;
  const toast = useToast();
  const isEdit = !!customer;
  const [form, setForm] = useState(() => (customer ? { ...customer } : emptyForm(nextCustomerCode(db.customers))));
  const [errors, setErrors] = useState<Record<string, string>>({});

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));

  const validate = () => {
    const e: Record<string, string> = {};
    if (!form.name.trim()) e.name = 'Customer name is required.';
    if (!form.code.trim()) e.code = 'Code is required.';
    else if (db.customers.some((c) => c.code.toLowerCase() === form.code.trim().toLowerCase() && c.id !== customer?.id)) {
      e.code = `Code "${form.code}" is already used by another customer.`;
    }
    if (!form.mobile.trim()) e.mobile = 'Mobile number is required.';
    if (!form.location.trim()) e.location = 'Location is required.';
    if (!form.routeId) e.routeId = 'Choose a delivery route.';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const save = () => {
    if (!validate()) return;
    if (isEdit && customer) {
      updateCustomer(customer.id, form, user.id);
      toast({ tone: 'success', title: 'Customer updated', description: form.name });
      onSaved?.({ ...customer, ...form });
    } else {
      const created = addCustomer({ ...form, legalName: form.legalName || form.name }, user.id);
      toast({ tone: 'success', title: 'Customer created', description: `${created.code} · ${created.name}` });
      onSaved?.(created);
    }
    onClose();
  };

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={isEdit ? `Edit ${customer!.name}` : 'Add customer'}
      description={isEdit ? customer!.code : 'New customers appear in Orders and Consolidation once saved.'}
      width="560px"
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button variant="primary" onClick={save}>{isEdit ? 'Save changes' : 'Create customer'}</Button></>}
    >
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Customer code" required error={errors.code}>{(id) => <Input id={id} value={form.code} onChange={(e) => set('code', e.target.value.toUpperCase())} invalid={!!errors.code} />}</Field>
          <Field label="Type" required>{(id) => <Select id={id} value={form.type} onChange={(e) => set('type', e.target.value as Customer['type'])} options={[...CUSTOMER_TYPES]} />}</Field>
        </div>
        <Field label="Display name" required error={errors.name}>{(id) => <Input id={id} value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="e.g. The Terrace Juhu" invalid={!!errors.name} />}</Field>
        <Field label="Legal name" hint="As it should appear on invoices">{(id) => <Input id={id} value={form.legalName} onChange={(e) => set('legalName', e.target.value)} placeholder={form.name || 'Legal / registered name'} />}</Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Contact person">{(id) => <Input id={id} value={form.contactPerson} onChange={(e) => set('contactPerson', e.target.value)} />}</Field>
          <Field label="Location / area" required error={errors.location}>{(id) => <Input id={id} value={form.location} onChange={(e) => set('location', e.target.value)} invalid={!!errors.location} />}</Field>
          <Field label="Mobile" required error={errors.mobile}>{(id) => <Input id={id} value={form.mobile} onChange={(e) => set('mobile', e.target.value)} invalid={!!errors.mobile} />}</Field>
          <Field label="Alt. mobile">{(id) => <Input id={id} value={form.altMobile} onChange={(e) => set('altMobile', e.target.value)} />}</Field>
        </div>
        <Field label="Email">{(id) => <Input id={id} type="email" value={form.email} onChange={(e) => set('email', e.target.value)} />}</Field>
        <Field label="Billing address">{(id) => <Textarea id={id} value={form.billingAddress} onChange={(e) => set('billingAddress', e.target.value)} rows={2} />}</Field>
        <Field label="Delivery address" hint="Leave blank if same as billing">{(id) => <Textarea id={id} value={form.deliveryAddress} onChange={(e) => set('deliveryAddress', e.target.value)} rows={2} />}</Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="GSTIN">{(id) => <Input id={id} value={form.gstin} onChange={(e) => set('gstin', e.target.value.toUpperCase())} />}</Field>
          <Field label="PAN">{(id) => <Input id={id} value={form.pan} onChange={(e) => set('pan', e.target.value.toUpperCase())} />}</Field>
          <Field label="Payment terms (days)">{(id) => <Input id={id} type="number" value={form.paymentTermsDays} onChange={(e) => set('paymentTermsDays', Number(e.target.value))} />}</Field>
          <Field label="Credit limit (₹)">{(id) => <Input id={id} type="number" value={form.creditLimit} onChange={(e) => set('creditLimit', Number(e.target.value))} />}</Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Delivery route" required error={errors.routeId}>
            {(id) => (
              <Select id={id} value={form.routeId} onChange={(e) => set('routeId', e.target.value)} placeholder="Select route…" invalid={!!errors.routeId}
                options={db.routes.map((r) => ({ value: r.id, label: r.name }))} />
            )}
          </Field>
          <Field label="Order frequency">
            {(id) => <Select id={id} value={form.orderFrequency} onChange={(e) => set('orderFrequency', e.target.value as Customer['orderFrequency'])} options={['Daily', 'Alternate Days', 'Weekly', 'On Demand']} />}
          </Field>
          <Field label="Preferred order time">{(id) => <Input id={id} value={form.preferredOrderTime} onChange={(e) => set('preferredOrderTime', e.target.value)} placeholder="Before 20:00" />}</Field>
          <Field label="Preferred delivery time">{(id) => <Input id={id} value={form.preferredDeliveryTime} onChange={(e) => set('preferredDeliveryTime', e.target.value)} placeholder="08:00 – 10:00" />}</Field>
        </div>

        <Field label="Special instructions">{(id) => <Textarea id={id} value={form.specialInstructions} onChange={(e) => set('specialInstructions', e.target.value)} rows={2} placeholder="Delivery gate, packaging notes…" />}</Field>
        <Switch checked={form.active} onChange={(v) => set('active', v)} label="Active — can place and receive orders" />
        {Object.keys(errors).length > 0 && <InlineError>Please fix the highlighted fields.</InlineError>}
      </div>
    </Drawer>
  );
}
