import { useState } from 'react';
import { Modal } from '../../components/ui/Overlay';
import { Button } from '../../components/ui/Button';
import { Field, Input, Select, Switch } from '../../components/ui/Field';
import { InlineError } from '../../components/ui/States';
import { useCurrentUser, useDb } from '../../store/useStore';
import { addUser, updateUser } from '../../store/adminActions';
import { useToast } from '../../components/ui/Toast';
import type { RoleKey, User } from '../../types/models';

export function UserForm({ open, onClose, user }: { open: boolean; onClose: () => void; user?: User | null }) {
  const db = useDb();
  const actor = useCurrentUser()!;
  const toast = useToast();
  const isEdit = !!user;
  const [form, setForm] = useState(() => user ?? { name: '', email: '', mobile: '', role: 'order_exec' as RoleKey, status: 'Active' as const, customerId: null });
  const [error, setError] = useState<string | null>(null);

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));

  const save = () => {
    if (!form.name.trim() || !form.email.trim()) return setError('Name and email are required.');
    if (db.users.some((u) => u.email.toLowerCase() === form.email.trim().toLowerCase() && u.id !== user?.id)) return setError('A user with this email already exists.');
    if (isEdit && user) {
      updateUser(user.id, form, actor.id);
      toast({ tone: 'success', title: 'User updated', description: form.name });
    } else {
      const created = addUser({ ...form, customerId: null }, actor.id);
      toast({ tone: 'success', title: 'User created', description: created.name });
    }
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose} title={isEdit ? `Edit ${user!.name}` : 'Add user'} footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button variant="primary" onClick={save}>{isEdit ? 'Save changes' : 'Create user'}</Button></>}>
      <div className="flex flex-col gap-3.5">
        <Field label="Full name" required>{(id) => <Input id={id} value={form.name} onChange={(e) => set('name', e.target.value)} />}</Field>
        <Field label="Email" required>{(id) => <Input id={id} type="email" value={form.email} onChange={(e) => set('email', e.target.value)} />}</Field>
        <Field label="Mobile">{(id) => <Input id={id} value={form.mobile} onChange={(e) => set('mobile', e.target.value)} />}</Field>
        <Field label="Role">
          {(id) => (
            <Select id={id} value={form.role} onChange={(e) => set('role', e.target.value as RoleKey)}
              options={db.roles.filter((r) => r.key !== 'customer').map((r) => ({ value: r.key, label: r.name }))} />
          )}
        </Field>
        <Switch checked={form.status === 'Active'} onChange={(v) => set('status', v ? 'Active' : 'Inactive')} label="Active" />
        {error && <InlineError>{error}</InlineError>}
      </div>
    </Modal>
  );
}
