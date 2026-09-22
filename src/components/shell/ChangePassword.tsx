import { useState } from 'react';
import { Modal } from '../ui/Overlay';
import { Button } from '../ui/Button';
import { Field, Input } from '../ui/Field';
import { InlineError } from '../ui/States';
import { useToast } from '../ui/Toast';
import { apiChangePassword } from '../../store/authApi';

/**
 * Changes the signed-in user's own password.
 *
 * The server re-checks the current password and drops every other token on
 * success, so a password changed because it may have leaked also ends whatever
 * sessions that leak opened. This tab keeps its own.
 */
export function ChangePassword({ open, onClose }: { open: boolean; onClose: () => void }) {
  const toast = useToast();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const close = () => {
    setCurrent('');
    setNext('');
    setConfirmation('');
    setError(null);
    onClose();
  };

  const submit = async () => {
    if (!current || !next) return setError('Fill in both the current and the new password.');
    if (next !== confirmation) return setError('The new password and its confirmation do not match.');
    if (next.length < 8) return setError('Use at least 8 characters.');

    setError(null);
    setSaving(true);
    const res = await apiChangePassword(current, next, confirmation);
    setSaving(false);

    if (!res.ok) return setError(res.error);
    toast({ tone: 'success', title: 'Password changed', description: 'Other devices have been signed out.' });
    close();
  };

  return (
    <Modal
      open={open}
      onClose={close}
      title="Change password"
      description="Your other signed-in devices will be signed out."
      footer={<><Button variant="secondary" onClick={close} disabled={saving}>Cancel</Button><Button variant="primary" onClick={submit} disabled={saving}>{saving ? 'Changing…' : 'Change password'}</Button></>}
    >
      <div className="flex flex-col gap-3.5">
        <Field label="Current password" required>
          {(id) => <Input id={id} type="password" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" />}
        </Field>
        <Field label="New password" hint="At least 8 characters." required>
          {(id) => <Input id={id} type="password" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" />}
        </Field>
        <Field label="Confirm new password" required>
          {(id) => <Input id={id} type="password" value={confirmation} onChange={(e) => setConfirmation(e.target.value)} autoComplete="new-password" />}
        </Field>
        {error && <InlineError>{error}</InlineError>}
      </div>
    </Modal>
  );
}
