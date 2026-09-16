import { useEffect, useRef, type ComponentProps, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { cn } from '../../lib/cn';
import { IconButton } from './Button';

function usePortalRoot() {
  const ref = useRef<HTMLDivElement | null>(null);
  if (!ref.current && typeof document !== 'undefined') {
    ref.current = document.createElement('div');
  }
  useEffect(() => {
    const el = ref.current!;
    document.body.appendChild(el);
    return () => {
      document.body.removeChild(el);
    };
  }, []);
  return ref.current;
}

function useEscape(onClose?: () => void) {
  useEffect(() => {
    if (!onClose) return;
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, [onClose]);
}

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}

const SIZES = { sm: 'max-w-sm', md: 'max-w-md', lg: 'max-w-2xl', xl: 'max-w-4xl' };

export function Modal({ open, onClose, title, description, children, footer, size = 'md' }: ModalProps) {
  const root = usePortalRoot();
  useEscape(open ? onClose : undefined);
  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);
  if (!open || !root) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="animate-fade-in fixed inset-0 bg-[#0c1a10]/45" onClick={onClose} />
      {/* The wrapper owns the width; an auto grid track would let wide content stretch the panel past the viewport. */}
      <div className="relative flex min-h-full items-center justify-center p-3 sm:p-4">
      <div className={cn('animate-slide-up relative my-4 w-full min-w-0 rounded-card border border-line bg-white shadow-pop sm:my-8', SIZES[size])}>
        {title && (
          <div className="flex items-start justify-between gap-3 border-b border-line px-4 py-4 sm:px-5">
            <div className="min-w-0">
              <h2 className="text-[15px] font-semibold text-ink">{title}</h2>
              {description && <p className="mt-0.5 text-[13px] text-muted">{description}</p>}
            </div>
            <IconButton icon={X} label="Close" onClick={onClose} size="sm" />
          </div>
        )}
        <div className="max-h-[70vh] overflow-y-auto px-4 py-4 sm:px-5">{children}</div>
        {footer && <div className="flex items-center justify-end gap-2 border-t border-line px-4 py-3.5 sm:px-5">{footer}</div>}
      </div>
      </div>
    </div>,
    root,
  );
}

interface DrawerProps {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  width?: string;
}

export function Drawer({ open, onClose, title, description, children, footer, width = '480px' }: DrawerProps) {
  const root = usePortalRoot();
  useEscape(open ? onClose : undefined);
  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);
  if (!open || !root) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="animate-fade-in fixed inset-0 bg-[#0c1a10]/45" onClick={onClose} />
      <div className="animate-slide-in relative flex h-full w-full flex-col border-l border-line bg-white shadow-pop" style={{ maxWidth: width }}>
        {title && (
          <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
            <div className="min-w-0">
              <h2 className="truncate text-[15px] font-semibold text-ink">{title}</h2>
              {description && <p className="mt-0.5 truncate text-[13px] text-muted">{description}</p>}
            </div>
            <IconButton icon={X} label="Close" onClick={onClose} size="sm" />
          </div>
        )}
        <div className="scrollbar-thin flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex items-center justify-end gap-2 border-t border-line px-5 py-3.5">{footer}</div>}
      </div>
    </div>,
    root,
  );
}

export function ModalFooterActions({ children }: { children: ReactNode }) {
  return <div className="flex items-center justify-end gap-2">{children}</div>;
}

export function DropdownPanel({ className, ...rest }: ComponentProps<'div'>) {
  return (
    <div
      className={cn('animate-fade-in absolute z-40 min-w-44 overflow-hidden rounded-lg border border-line bg-white py-1 shadow-pop', className)}
      {...rest}
    />
  );
}

export function useClickOutside<T extends HTMLElement>(onOutside: () => void) {
  const ref = useRef<T | null>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onOutside();
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [onOutside]);
  return ref;
}
