import { useState } from 'react';
import { Modal } from '../../components/ui/Overlay';
import { Button } from '../../components/ui/Button';
import { Field, Input, Select, Switch } from '../../components/ui/Field';
import { InlineError } from '../../components/ui/States';
import { PasswordOnce } from '../../components/ui/PasswordOnce';
import { useCurrentUser, useDb } from '../../store/useStore';
import { addUser, updateUser } from '../../store/adminActions';
import { useToast } from '../../components/ui/Toast';
import { API_MODE } from '../../lib/api';
import type { RoleKey, User } from '../../types/models';

export function UserForm({ open, onClose, user }: { open: boolean; onClose: () => void; user?: User | null }) {
  const db = useDb();
  const actor = useCurrentUser()!;
  const toast = useToast();
  const isEdit = !!user;
  const [form, setForm] = useState(() => user ?? { name: '', email: '', mobile: '', role: 'order_exec' as RoleKey, status: 'Active' as const, customerId: null as string | null });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [created, setCreated] = useState<{ email: string; password: string } | null>(null);

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));

  const save = async () => {
    if (!form.name.trim() || !form.email.trim()) return setError('Name and email are required.');
    if (db.users.some((u) => u.email.toLowerCase() === form.email.trim().toLowerCase() && u.id !== user?.id)) return setError('A user with this email already exists.');
    // ScopeToCustomer has nothing to scope to without it, so the server refuses this anyway.
    if (form.role === 'customer' && !form.customerId) return setError('A customer login must be linked to a customer.');

    setError(null);
    setSaving(true);
    try {
      if (isEdit && user) {
        await updateUser(user.id, form, actor.id);
        toast({ tone: 'success', title: 'User updated', description: form.name });
        onClose();
      } else {
        const { user: made, password } = await addUser({ ...form, customerId: form.role === 'customer' ? form.customerId : null }, actor.id);
        if (password) {
          // The dialog closes the form once the admin has acknowledged it.
          setCreated({ email: made.email, password });
        } else {
          toast({ tone: 'success', title: 'User created', description: made.name });
          onClose();
        }
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  if (created) {
    return (
      <PasswordOnce
        open
        email={created.email}
        password={created.password}
        onClose={() => { setCreated(null); onClose(); }}
      />
    );
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? `Edit ${user!.name}` : 'Add user'}
      description={isEdit ? undefined : API_MODE ? 'A password is generated on save and shown once.' : undefined}
      footer={<><Button variant="secondary" onClick={onClose} disabled={saving}>Cancel</Button><Button variant="primary" onClick={save} disabled={saving}>{saving ? 'Saving…' : isEdit ? 'Save changes' : 'Create user'}</Button></>}
    >
      <div className="flex flex-col gap-3.5">
        <Field label="Full name" required>{(id) => <Input id={id} value={form.name} onChange={(e) => set('name', e.target.value)} />}</Field>
        <Field label="Email" hint="This is the sign-in ID." required>{(id) => <Input id={id} type="email" value={form.email} onChange={(e) => set('email', e.target.value)} />}</Field>
        <Field label="Mobile">{(id) => <Input id={id} value={form.mobile} onChange={(e) => set('mobile', e.target.value)} />}</Field>
        <Field label="Role">
          {(id) => (
            <Select id={id} value={form.role} onChange={(e) => set('role', e.target.value as RoleKey)}
              options={db.roles.map((r) => ({ value: r.key, label: r.name }))} />
          )}
        </Field>
        {form.role === 'customer' && (
          <Field label="Customer" hint="This login can only ever see this customer's data." required>
            {(id) => (
              <Select id={id} value={form.customerId ?? ''} onChange={(e) => set('customerId', e.target.value || null)} placeholder="Select customer…"
                options={db.customers.map((c) => ({ value: c.id, label: `${c.code} · ${c.name}` }))} />
            )}
          </Field>
        )}
        <Switch checked={form.status === 'Active'} onChange={(v) => set('status', v ? 'Active' : 'Inactive')} label="Active" />
        {error && <InlineError>{error}</InlineError>}
      </div>
    </Modal>
  );
}
