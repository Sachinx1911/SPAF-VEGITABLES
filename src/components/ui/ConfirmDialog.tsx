import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { TriangleAlert } from 'lucide-react';
import { Modal } from './Overlay';
import { Button, type ButtonVariant } from './Button';

interface ConfirmOptions {
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'default' | 'danger';
  /** Extra context shown as a small definition list, e.g. quantities being committed. */
  details?: { label: string; value: ReactNode }[];
}

type ConfirmCtx = (opts: ConfirmOptions) => Promise<boolean>;
const Ctx = createContext<ConfirmCtx | null>(null);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<(ConfirmOptions & { resolve: (v: boolean) => void }) | null>(null);

  const confirm = useCallback<ConfirmCtx>(
    (opts) =>
      new Promise((resolve) => {
        setState({ ...opts, resolve });
      }),
    [],
  );

  const close = (v: boolean) => {
    state?.resolve(v);
    setState(null);
  };

  const value = useMemo(() => confirm, [confirm]);
  const variant: ButtonVariant = state?.tone === 'danger' ? 'danger' : 'primary';

  return (
    <Ctx.Provider value={value}>
      {children}
      <Modal
        open={!!state}
        onClose={() => close(false)}
        title={
          <span className="flex items-center gap-2">
            {state?.tone === 'danger' && <TriangleAlert size={16} className="text-red-600" />}
            {state?.title}
          </span>
        }
        size="sm"
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={() => close(false)}>{state?.cancelLabel ?? 'Cancel'}</Button>
            <Button variant={variant} size="sm" onClick={() => close(true)} autoFocus>{state?.confirmLabel ?? 'Confirm'}</Button>
          </>
        }
      >
        {state?.description && <p className="text-[13px] text-muted">{state.description}</p>}
        {state?.details?.length ? (
          <dl className="mt-3 space-y-1.5 rounded-lg bg-canvas p-3">
            {state.details.map((d, i) => (
              <div key={i} className="flex items-center justify-between gap-3 text-[13px]">
                <dt className="text-muted">{d.label}</dt>
                <dd className="font-medium text-ink">{d.value}</dd>
              </div>
            ))}
          </dl>
        ) : null}
      </Modal>
    </Ctx.Provider>
  );
}

export function useConfirm() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useConfirm must be used within ConfirmProvider');
  return ctx;
}
