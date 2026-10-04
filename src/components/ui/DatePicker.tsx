import { CalendarDays } from 'lucide-react';
import { Input } from './Field';
import { fmtDate } from '../../lib/format';
import { cn } from '../../lib/cn';

interface DatePickerProps {
  value: string; // ISO yyyy-mm-dd
  onChange: (v: string) => void;
  min?: string;
  max?: string;
  className?: string;
}

/** Native date input styled to match the design system; shows DD-MM-YYYY as a caption. */
export function DatePicker({ value, onChange, min, max, className }: DatePickerProps) {
  return (
    <div className={className}>
      <Input type="date" value={value} min={min} max={max} onChange={(e) => onChange(e.target.value)} leading={<CalendarDays size={15} />} />
      <p className="mt-1 text-[11px] text-subtle">{fmtDate(value)}</p>
    </div>
  );
}

export function DateRangePicker({ from, to, onChange }: { from: string; to: string; onChange: (from: string, to: string) => void }) {
  return (
    <div className="flex items-center gap-2">
      <Input type="date" value={from} onChange={(e) => onChange(e.target.value, to)} className="w-[152px]" />
      <span className="text-xs text-subtle">to</span>
      <Input type="date" value={to} min={from} onChange={(e) => onChange(from, e.target.value)} className="w-[152px]" />
    </div>
  );
}

interface DateFieldProps {
  label?: string;
  value: string;
  onChange: (v: string) => void;
  min?: string;
  max?: string;
  className?: string;
  id?: string;
}

/** Labelled date control for filter bars and forms — one look everywhere a date is picked. */
export function DateField({ label, value, onChange, min, max, className, id }: DateFieldProps) {
  return (
    <div className={cn('flex flex-col gap-1', className)}>
      {label && <label htmlFor={id} className="text-[11.5px] font-medium text-muted">{label}</label>}
      <Input id={id} type="date" value={value} min={min} max={max} onChange={(e) => onChange(e.target.value)} leading={<CalendarDays size={15} />} className="w-[172px] max-w-full" />
    </div>
  );
}
