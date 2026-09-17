import type { ReactNode } from 'react';
import { Funnel, X } from 'lucide-react';
import { Button } from './Button';
import { cn } from '../../lib/cn';

/**
 * The "Filters" control next to a table's inline dropdowns.
 *
 * It carries the count of filters currently narrowing the list, so it is
 * obvious at a glance why a table looks shorter than expected, and it opens a
 * panel for the filters that do not fit on one row.
 */
export function FilterToggle({ open, activeCount, onToggle }: {
  open: boolean;
  activeCount: number;
  onToggle: () => void;
}) {
  return (
    <Button
      variant={open || activeCount > 0 ? 'primary' : 'secondary'}
      size="sm"
      icon={Funnel}
      onClick={onToggle}
    >
      Filters
      {activeCount > 0 && (
        <span className="ml-1.5 rounded-full bg-white/25 px-1.5 text-[10.5px] font-bold">{activeCount}</span>
      )}
    </Button>
  );
}

export function FilterPanel({ open, onClear, canClear, children }: {
  open: boolean;
  onClear: () => void;
  canClear: boolean;
  children: ReactNode;
}) {
  if (!open) return null;
  return (
    <div className="flex flex-wrap items-end gap-3 border-b border-line bg-canvas/50 px-3 py-3">
      {children}
      <button
        onClick={onClear}
        disabled={!canClear}
        className={cn(
          'ml-auto flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[12.5px] font-medium',
          canClear ? 'text-red-600 hover:bg-red-50' : 'cursor-not-allowed text-subtle',
        )}
      >
        <X size={13} /> Clear all filters
      </button>
    </div>
  );
}

/** A labelled control inside the panel, so every page's filters line up. */
export function FilterField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] font-medium tracking-wide text-subtle uppercase">{label}</span>
      {children}
    </label>
  );
}
