import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '../../lib/cn';
import { usePortalRoot } from './Overlay';

export interface MenuItem {
  key: string;
  label: ReactNode;
  icon?: ReactNode;
  onClick?: () => void;
  danger?: boolean;
  disabled?: boolean;
  /** Renders a separator *instead of* an item — give it its own entry. */
  divider?: boolean;
}

/**
 * A dropdown menu.
 *
 * The panel is rendered in a portal and positioned against the viewport rather
 * than sitting next to its trigger. A menu inside a table cell would otherwise
 * be clipped: DataTable scrolls horizontally, and a scroll container clips its
 * children in both directions, so everything below the table's bottom edge was
 * being cut off.
 */
export function Menu({ items, trigger, align = 'left' }: { items: MenuItem[]; trigger: (open: () => void, isOpen: boolean) => ReactNode; align?: 'left' | 'right' }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const anchorRef = useRef<HTMLDivElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const root = usePortalRoot();

  useLayoutEffect(() => {
    if (!open) {
      setPos(null);
      return;
    }

    const place = () => {
      const t = anchorRef.current?.getBoundingClientRect();
      const p = panelRef.current?.getBoundingClientRect();
      if (!t || !p) return;

      const gap = 6;
      // Below the trigger, unless that would run past the bottom of the window.
      let top = t.bottom + gap;
      if (top + p.height > window.innerHeight - 8) top = Math.max(8, t.top - gap - p.height);

      let left = align === 'right' ? t.right - p.width : t.left;
      left = Math.min(Math.max(8, left), Math.max(8, window.innerWidth - p.width - 8));

      setPos({ left, top });
    };

    place();
    // Capture, so scrolling any ancestor — including the table — moves it too.
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    return () => {
      window.removeEventListener('scroll', place, true);
      window.removeEventListener('resize', place);
    };
  }, [open, align, items.length]);

  useEffect(() => {
    if (!open) return;

    const onDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (anchorRef.current?.contains(target) || panelRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };

    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="relative inline-block" ref={anchorRef}>
      {trigger(() => setOpen((v) => !v), open)}
      {open && root && createPortal(
        <div
          ref={panelRef}
          className="animate-fade-in fixed z-50 min-w-44 overflow-hidden rounded-lg border border-line bg-white py-1 shadow-pop"
          style={{
            left: pos?.left ?? 0,
            top: pos?.top ?? 0,
            // Measured on the first pass, so keep it off-screen until placed.
            visibility: pos ? 'visible' : 'hidden',
          }}
        >
          {items.map((it, i) =>
            it.divider ? (
              <div key={`sep-${i}`} className="my-1 h-px bg-line" />
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
        </div>,
        root,
      )}
    </div>
  );
}
