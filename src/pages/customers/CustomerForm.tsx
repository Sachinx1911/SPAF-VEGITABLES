import { useMemo, useState } from 'react';
import { Drawer } from '../../components/ui/Overlay';
import { Button } from '../../components/ui/Button';
import { Field, Input, Select, Textarea, Switch } from '../../components/ui/Field';
import { InlineError } from '../../components/ui/States';
import { PasswordOnce } from '../../components/ui/PasswordOnce';
import { useConfirm } from '../../components/ui/ConfirmDialog';
import { useDb, useCurrentUser } from '../../store/useStore';
import { useUsersSync } from '../../store/useApiSync';
import { addCustomer, nextCustomerCode, updateCustomer } from '../../store/actions';
import { addUser, resetUserPassword, updateUser } from '../../store/adminActions';
import { useToast } from '../../components/ui/Toast';
import { API_MODE } from '../../lib/api';
import { can } from '../../lib/nav';
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
  const confirm = useConfirm();
  const isEdit = !!customer;
  const [form, setForm] = useState(() => (customer ? { ...customer } : emptyForm(nextCustomerCode(db.customers))));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [issued, setIssued] = useState<{ email: string; password: string; title: string } | null>(null);

  // The login that lets this customer place its own orders. There is at most
  // one: the portal scopes by customer_id, so a second would see the same rows.
  const login = useMemo(
    () => (customer ? db.users.find((u) => u.role === 'customer' && u.customerId === customer.id) ?? null : null),
    [db.users, customer],
  );
  const canManageLogins = API_MODE && can(db, user.role, 'users', 'edit');
  // Without this db.users still holds the seed, so an existing login looks missing.
  useUsersSync(canManageLogins);
  const [wantsLogin, setWantsLogin] = useState(false);
  const [loginEmail, setLoginEmail] = useState('');

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
    if (wantsLogin && !isEdit) {
      if (!loginEmail.trim()) e.loginEmail = 'A sign-in email is required for the portal login.';
      else if (db.users.some((u) => u.email.toLowerCase() === loginEmail.trim().toLowerCase())) e.loginEmail = 'That email already has a login.';
    }
    if (isEdit && login && loginEmail.trim() && db.users.some((u) => u.email.toLowerCase() === loginEmail.trim().toLowerCase() && u.id !== login.id)) {
      e.loginEmail = 'That email already has a login.';
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const save = async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      if (isEdit && customer) {
        await updateCustomer(customer.id, form, user.id);
        // The email is the sign-in ID, so changing it here changes how they log in.
        if (login && loginEmail.trim() && loginEmail.trim().toLowerCase() !== login.email) {
          await updateUser(login.id, { email: loginEmail.trim().toLowerCase() }, user.id);
          toast({ tone: 'info', title: 'Login ID changed', description: 'They have been signed out and must use the new email.' });
        }
        toast({ tone: 'success', title: 'Customer updated', description: form.name });
        onSaved?.({ ...customer, ...form });
        onClose();
        return;
      }

      const created = await addCustomer({ ...form, legalName: form.legalName || form.name }, user.id);
      toast({ tone: 'success', title: 'Customer created', description: `${created.code} · ${created.name}` });
      onSaved?.(created);

      if (wantsLogin && canManageLogins) {
        const { password } = await addUser(
          { name: created.name, email: loginEmail.trim().toLowerCase(), mobile: created.mobile, role: 'customer', customerId: created.id },
          user.id,
        );
        if (password) {
          // Held open until acknowledged — this is the only time the password exists.
          setIssued({ email: loginEmail.trim().toLowerCase(), password, title: 'Customer login created' });
          return;
        }
      }
      onClose();
    } catch (e) {
      setErrors({ form: (e as Error).message });
    } finally {
      setSaving(false);
    }
  };

  const resetLogin = async () => {
    if (!login) return;
    const ok = await confirm({
      title: `Reset password for ${login.email}?`,
      description: 'A new password is generated and shown once. Anywhere this customer is signed in gets signed out.',
      confirmLabel: 'Reset password',
      tone: 'danger',
    });
    if (!ok) return;
    try {
      setIssued({ email: login.email, password: await resetUserPassword(login.id), title: 'Password reset' });
    } catch (e) {
      toast({ tone: 'error', title: 'Could not reset password', description: (e as Error).message });
    }
  };

  if (issued) {
    return (
      <PasswordOnce
        open
        title={issued.title}
        email={issued.email}
        password={issued.password}
        onClose={() => {
          const wasNew = !isEdit;
          setIssued(null);
          if (wasNew) onClose();
        }}
      />
    );
  }

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={isEdit ? `Edit ${customer!.name}` : 'Add customer'}
      description={isEdit ? customer!.code : 'New customers appear in Orders and Consolidation once saved.'}
      width="560px"
      footer={<><Button variant="secondary" onClick={onClose} disabled={saving}>Cancel</Button><Button variant="primary" onClick={save} disabled={saving}>{saving ? 'Saving…' : isEdit ? 'Save changes' : 'Create customer'}</Button></>}
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

        {canManageLogins && (
          <div className="rounded-lg border border-line bg-canvas p-3.5">
            <p className="text-[13px] font-semibold text-ink">Portal login</p>
            <p className="mt-0.5 mb-3 text-[12.5px] leading-relaxed text-muted">
              Lets this customer sign in and place their own orders. They see only their own
              orders, invoices and ledger.
            </p>

            {isEdit ? (
              login ? (
                <div className="flex flex-col gap-3">
                  <Field label="Sign-in email" hint="Changing this signs them out." error={errors.loginEmail}>
                    {(id) => (
                      <Input id={id} type="email" value={loginEmail === '' ? login.email : loginEmail}
                        onChange={(e) => setLoginEmail(e.target.value)} invalid={!!errors.loginEmail} />
                    )}
                  </Field>
                  <Button variant="secondary" size="sm" onClick={resetLogin}>Reset password</Button>
                </div>
              ) : (
                <p className="text-[12.5px] text-muted">
                  No login yet. Create one from <span className="font-medium text-ink">Users &amp; Roles</span>.
                </p>
              )
            ) : (
              <div className="flex flex-col gap-3">
                <Switch checked={wantsLogin} onChange={setWantsLogin} label="Create a portal login for this customer" />
                {wantsLogin && (
                  <Field label="Sign-in email" hint="A password is generated on save and shown once." required error={errors.loginEmail}>
                    {(id) => (
                      <Input id={id} type="email" value={loginEmail} onChange={(e) => setLoginEmail(e.target.value)}
                        placeholder={form.email || 'orders@customer.com'} invalid={!!errors.loginEmail} />
                    )}
                  </Field>
                )}
              </div>
            )}
          </div>
        )}

        {errors.form && <InlineError>{errors.form}</InlineError>}
        {Object.keys(errors).filter((k) => k !== 'form').length > 0 && <InlineError>Please fix the highlighted fields.</InlineError>}
      </div>
    </Drawer>
  );
}
