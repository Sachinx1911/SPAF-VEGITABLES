import { useState } from 'react';
import { Modal } from '../../components/ui/Overlay';
import { Button } from '../../components/ui/Button';
import { Field, Input } from '../../components/ui/Field';
import { InlineError } from '../../components/ui/States';

export function SaveTemplateModal({ open, onClose, onSave, defaultName }: { open: boolean; onClose: () => void; onSave: (name: string) => void; defaultName?: string }) {
  const [name, setName] = useState(defaultName ?? 'Daily Regular');
  const [error, setError] = useState<string | null>(null);

  return (
    <Modal
      open={open} onClose={onClose} title="Save as fixed order"
      description="Next time, tap this to load these exact items and quantities — no searching needed."
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button variant="primary" onClick={() => { if (!name.trim()) return setError('Give it a name.'); onSave(name.trim()); }}>Save</Button></>}
    >
      <Field label="Name" required error={error}>
        {(id) => <Input id={id} value={name} onChange={(e) => { setName(e.target.value); setError(null); }} placeholder="e.g. Daily Regular, Weekend Order" autoFocus />}
      </Field>
    </Modal>
  );
}
