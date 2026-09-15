import { useState, type ReactNode } from 'react';
import { cn } from '../../lib/cn';
import { DropdownPanel, useClickOutside } from './Overlay';

export interface MenuItem {
  key: string;
  label: ReactNode;
  icon?: ReactNode;
  onClick?: () => void;
  danger?: boolean;
  disabled?: boolean;
  divider?: boolean;
}

export function Menu({ items, trigger, align = 'left' }: { items: MenuItem[]; trigger: (open: () => void, isOpen: boolean) => ReactNode; align?: 'left' | 'right' }) {
  const [open, setOpen] = useState(false);
  const ref = useClickOutside<HTMLDivElement>(() => setOpen(false));

  return (
    <div className="relative inline-block" ref={ref}>
      {trigger(() => setOpen((v) => !v), open)}
      {open && (
        <DropdownPanel className={cn(align === 'right' ? 'right-0' : 'left-0', 'top-full mt-1.5')}>
          {items.map((it, i) =>
            it.divider ? (
              <div key={i} className="my-1 h-px bg-line" />
            ) : (
              <button
                key={it.key}
                disabled={it.disabled}
                onClick={() => {
                  it.onClick?.();
                  setOpen(false);
                }}
                className={cn(
                  'flex w-full items-center gap-2.5 px-3 py-2 text-left text-[13px] transition-colors disabled:opacity-40',
                  it.danger ? 'text-red-600 hover:bg-red-50' : 'text-ink hover:bg-canvas',
                )}
              >
                {it.icon}
                {it.label}
              </button>
            ),
          )}
        </DropdownPanel>
      )}
    </div>
  );
}
