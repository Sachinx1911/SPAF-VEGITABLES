import { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { Modal } from './Overlay';
import { Button } from './Button';
import { Alert } from './Alert';

/**
 * Shows a generated password, once.
 *
 * The server hashes it and returns the readable form only in the response to
 * the call that created it, so this dialog is the single moment it can be read.
 * Closing it is final — hence the explicit acknowledgement rather than a
 * dismissable toast that a stray click could swallow.
 */
export function PasswordOnce({
  open,
  onClose,
  email,
  password,
  title = 'Login created',
}: {
  open: boolean;
  onClose: () => void;
  email: string;
  password: string;
  title?: string;
}) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(`${email}\n${password}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard blocked — the values are on screen to copy by hand */
    }
  };

  const close = () => {
    setCopied(false);
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={close}
      title={title}
      footer={<Button variant="primary" onClick={close}>I have saved it</Button>}
    >
      <div className="flex flex-col gap-3.5">
        <Alert tone="warning" title="This password is shown only once">
          It is not stored in readable form and cannot be retrieved later. Save it now, or you
          will have to reset it.
        </Alert>

        <div className="rounded-lg border border-line bg-canvas px-3.5 py-3">
          <p className="text-[11px] font-semibold tracking-wide text-muted uppercase">Email</p>
          <p className="font-mono text-[13px] break-all text-ink">{email}</p>
          <p className="mt-2.5 text-[11px] font-semibold tracking-wide text-muted uppercase">Password</p>
          <p className="font-mono text-[15px] break-all text-ink select-all">{password}</p>
        </div>

        <Button variant="secondary" icon={copied ? Check : Copy} onClick={copy}>
          {copied ? 'Copied' : 'Copy email and password'}
        </Button>
      </div>
    </Modal>
  );
}
