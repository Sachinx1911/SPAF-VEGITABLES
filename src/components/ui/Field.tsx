import { useId, type ComponentProps, type KeyboardEvent, type ReactNode } from 'react';
import { ChevronDown, Minus, Plus, Search, X } from 'lucide-react';
import { cn } from '../../lib/cn';
import type { Unit } from '../../types/models';

export const inputBase =
  'w-full rounded-lg border border-line bg-white text-[13px] text-ink placeholder:text-subtle transition ' +
  'focus:border-brand-400 focus:outline-none focus:ring-3 focus:ring-brand-100 disabled:bg-canvas disabled:text-muted';

export const inputError = 'border-red-400 focus:border-red-500 focus:ring-red-100';

interface FieldProps {
  label?: string;
  hint?: string;
  error?: string | null;
  required?: boolean;
  className?: string;
  children: (id: string) => ReactNode;
}

/** Label + control + hint/error, with accessible wiring. */
export function Field({ label, hint, error, required, className, children }: FieldProps) {
  const id = useId();
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      {label && (
        <label htmlFor={id} className="text-[12.5px] font-medium text-ink">
          {label}
          {required && <span className="ml-0.5 text-red-600">*</span>}
        </label>
      )}
      {children(id)}
      {error ? (
        <p className="text-xs text-red-600" role="alert">{error}</p>
      ) : hint ? (
        <p className="text-xs text-muted">{hint}</p>
      ) : null}
    </div>
  );
}

interface InputProps extends ComponentProps<'input'> {
  invalid?: boolean;
  leading?: ReactNode;
  trailing?: ReactNode;
}

export function Input({ invalid, leading, trailing, className, ...rest }: InputProps) {
  if (!leading && !trailing) return <input className={cn(inputBase, 'h-9 px-3', invalid && inputError, className)} {...rest} />;
  return (
    <div className={cn('relative flex items-center', className)}>
      {leading && <span className="pointer-events-none absolute left-3 flex items-center text-subtle">{leading}</span>}
      <input className={cn(inputBase, 'h-9', leading ? 'pl-9' : 'pl-3', trailing ? 'pr-10' : 'pr-3', invalid && inputError)} {...rest} />
      {trailing && <span className="absolute right-2 flex items-center text-subtle">{trailing}</span>}
    </div>
  );
}

export function Textarea({ invalid, className, ...rest }: ComponentProps<'textarea'> & { invalid?: boolean }) {
  return <textarea className={cn(inputBase, 'min-h-20 px-3 py-2', invalid && inputError, className)} {...rest} />;
}

interface SelectProps extends ComponentProps<'select'> {
  invalid?: boolean;
  options: (string | { value: string; label: string })[];
  placeholder?: string;
}

export function Select({ invalid, options, placeholder, className, ...rest }: SelectProps) {
  return (
    <div className={cn('relative', className)}>
      <select className={cn(inputBase, 'h-9 appearance-none pr-8 pl-3', invalid && inputError)} {...rest}>
        {placeholder !== undefined && <option value="">{placeholder}</option>}
        {options.map((o) => {
          const v = typeof o === 'string' ? { value: o, label: o } : o;
          return <option key={v.value} value={v.value}>{v.label}</option>;
        })}
      </select>
      <ChevronDown size={16} className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-subtle" />
    </div>
  );
}

interface SearchInputProps extends Omit<ComponentProps<'input'>, 'onChange'> {
  value: string;
  onChange: (v: string) => void;
}

export function SearchInput({ value, onChange, className, placeholder = 'Search…', ...rest }: SearchInputProps) {
  return (
    <Input
      className={className}
      leading={<Search size={16} />}
      trailing={
        value ? (
          <button type="button" aria-label="Clear search" onClick={() => onChange('')} className="rounded p-1 hover:bg-canvas">
            <X size={14} />
          </button>
        ) : null
      }
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      {...rest}
    />
  );
}

export function Checkbox({ label, className, ...rest }: ComponentProps<'input'> & { label?: ReactNode }) {
  const box = (
    <input
      type="checkbox"
      className={cn('size-4 cursor-pointer rounded border-line accent-brand-700', !label && className)}
      {...rest}
    />
  );
  if (!label) return box;
  return (
    <label className={cn('inline-flex cursor-pointer items-center gap-2 text-[13px] text-ink select-none', className)}>
      {box}
      {label}
    </label>
  );
}

export function Switch({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label?: string; disabled?: boolean }) {
  return (
    <label className={cn('inline-flex items-center gap-2.5 text-[13px] select-none', disabled ? 'opacity-50' : 'cursor-pointer')}>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn('relative h-5 w-9 rounded-full transition-colors', checked ? 'bg-brand-600' : 'bg-[#cfd8d2]')}
      >
        <span className={cn('absolute top-0.5 left-0.5 size-4 rounded-full bg-white shadow transition-transform', checked && 'translate-x-4')} />
      </button>
      {label}
    </label>
  );
}

/* ------------------------------------------------------------ quantity */

export const qtyStep = (unit: Unit) => (unit === 'Kg' ? 0.5 : 1);

interface QtyInputProps {
  value: number | null;
  unit: Unit;
  onChange: (v: number | null) => void;
  max?: number;
  min?: number;
  step?: number;
  size?: 'sm' | 'md' | 'lg';
  invalid?: boolean;
  disabled?: boolean;
  autoFocus?: boolean;
  'aria-label'?: string;
  stepper?: boolean;
}

/**
 * Quantity input built for fast daily entry: unit always visible, ↑/↓ step by
 * unit, Enter jumps to the next quantity field in the table.
 */
export function QtyInput({
  value, unit, onChange, max, min = 0, step, size = 'md', invalid, disabled, autoFocus, stepper = true, ...aria
}: QtyInputProps) {
  const s = step ?? qtyStep(unit);
  const over = max != null && value != null && value > max;
  const clamp = (v: number) => Math.max(min, Math.round(v * 1000) / 1000);
  const bump = (dir: 1 | -1) => onChange(clamp((value ?? 0) + dir * s));

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowUp') { e.preventDefault(); bump(1); }
    if (e.key === 'ArrowDown') { e.preventDefault(); bump(-1); }
    if (e.key === 'Enter') {
      e.preventDefault();
      const all = Array.from(document.querySelectorAll<HTMLInputElement>('input[data-qty-input]'));
      const i = all.indexOf(e.currentTarget);
      all[i + (e.shiftKey ? -1 : 1)]?.focus();
      all[i + (e.shiftKey ? -1 : 1)]?.select();
    }
  };

  const h = size === 'lg' ? 'h-12 text-base' : size === 'sm' ? 'h-8 text-[13px]' : 'h-9 text-[13px]';
  return (
    <div
      className={cn(
        'flex items-stretch overflow-hidden rounded-lg border bg-white transition focus-within:ring-3',
        over || invalid ? 'border-red-400 focus-within:ring-red-100' : 'border-line focus-within:border-brand-400 focus-within:ring-brand-100',
        disabled && 'bg-canvas opacity-70', h,
      )}
    >
      {stepper && (
        <button type="button" tabIndex={-1} disabled={disabled} onClick={() => bump(-1)} aria-label="Decrease"
          className={cn('grid place-items-center border-r border-line text-muted hover:bg-canvas', size === 'lg' ? 'w-12' : 'w-8')}>
          <Minus size={size === 'lg' ? 18 : 14} />
        </button>
      )}
      <input
        data-qty-input
        type="number"
        inputMode="decimal"
        step={s}
        min={min}
        disabled={disabled}
        autoFocus={autoFocus}
        aria-label={aria['aria-label']}
        aria-invalid={over || invalid}
        value={value ?? ''}
        onFocus={(e) => e.currentTarget.select()}
        onChange={(e) => onChange(e.target.value === '' ? null : clamp(Number(e.target.value)))}
        onKeyDown={onKey}
        className="tabular w-full min-w-0 bg-transparent px-2 text-right font-medium text-ink outline-none"
      />
      <span className={cn('grid place-items-center bg-canvas px-2 text-xs font-medium text-muted', size === 'lg' && 'px-3 text-sm')}>{unit}</span>
      {stepper && (
        <button type="button" tabIndex={-1} disabled={disabled} onClick={() => bump(1)} aria-label="Increase"
          className={cn('grid place-items-center border-l border-line text-muted hover:bg-canvas', size === 'lg' ? 'w-12' : 'w-8')}>
          <Plus size={size === 'lg' ? 18 : 14} />
        </button>
      )}
    </div>
  );
}

interface PriceInputProps extends Omit<ComponentProps<'input'>, 'value' | 'onChange'> {
  value: number | null;
  onChange: (v: number | null) => void;
  unit?: Unit;
  invalid?: boolean;
}

export function PriceInput({ value, onChange, unit, invalid, className, ...rest }: PriceInputProps) {
  return (
    <div className={cn('relative flex items-center', className)}>
      <span className="pointer-events-none absolute left-3 text-[13px] text-muted">₹</span>
      <input
        type="number"
        inputMode="decimal"
        step="0.5"
        min={0}
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
        className={cn(inputBase, 'tabular h-9 pl-7 text-right', unit ? 'pr-12' : 'pr-3', invalid && inputError)}
        {...rest}
      />
      {unit && <span className="pointer-events-none absolute right-3 text-xs text-muted">/ {unit}</span>}
    </div>
  );
}
