import { CalendarDays } from 'lucide-react';
import { Input } from './Field';
import { fmtDate } from '../../lib/format';

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
