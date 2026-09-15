import type { Unit } from '../types/models';

const inr0 = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });
const inr2 = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const qtyFmt = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 3 });

/** ₹2,45,000 — Indian digit grouping. `paise` shows two decimals (rates, invoice lines). */
export function inr(n: number, paise = false): string {
  const sign = n < 0 ? '-' : '';
  return `${sign}₹${(paise ? inr2 : inr0).format(Math.abs(n))}`;
}

/** ₹2.45 L / ₹1.2 Cr for tight spaces like KPI deltas. */
export function inrCompact(n: number): string {
  const a = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  if (a >= 1e7) return `${sign}₹${(a / 1e7).toFixed(2).replace(/\.?0+$/, '')} Cr`;
  if (a >= 1e5) return `${sign}₹${(a / 1e5).toFixed(2).replace(/\.?0+$/, '')} L`;
  if (a >= 1e3) return `${sign}₹${(a / 1e3).toFixed(1).replace(/\.0$/, '')} K`;
  return inr(n);
}

export function num(n: number): string {
  return qtyFmt.format(n);
}

/** Quantity always travels with its unit: "12.5 Kg", "40 Pcs". */
export function qty(n: number | null | undefined, unit: Unit): string {
  if (n == null) return '—';
  return `${qtyFmt.format(n)} ${unit}`;
}

const pad = (x: number) => String(x).padStart(2, '0');

export function toISODate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function toISODateTime(d: Date): string {
  return `${toISODate(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export function parseISO(s: string): Date {
  const [datePart, timePart = '00:00:00'] = s.split('T');
  const [y, m, d] = datePart.split('-').map(Number);
  const [hh, mm, ss = 0] = timePart.split(':').map(Number);
  return new Date(y, m - 1, d, hh, mm, ss);
}

/** DD-MM-YYYY */
export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}-${m}-${y}`;
}

export function fmtTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = parseISO(iso);
  const h = d.getHours();
  return `${pad(h % 12 || 12)}:${pad(d.getMinutes())} ${h < 12 ? 'AM' : 'PM'}`;
}

export function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  return `${fmtDate(iso)} ${fmtTime(iso)}`;
}

export function weekday(iso: string): string {
  return parseISO(iso).toLocaleDateString('en-IN', { weekday: 'long' });
}

export function addDays(iso: string, days: number): string {
  const d = parseISO(iso);
  d.setDate(d.getDate() + days);
  return toISODate(d);
}

export function daysBetween(fromISO: string, toISO: string): number {
  const a = parseISO(fromISO.slice(0, 10)).getTime();
  const b = parseISO(toISO.slice(0, 10)).getTime();
  return Math.round((b - a) / 86_400_000);
}

export function relativeTime(iso: string, nowIso: string): string {
  const diff = (parseISO(nowIso).getTime() - parseISO(iso).getTime()) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
  if (diff < 86_400) return `${Math.floor(diff / 3600)} hr ago`;
  const days = Math.floor(diff / 86_400);
  return days === 1 ? 'yesterday' : `${days} days ago`;
}

export function pct(part: number, whole: number): number {
  return whole ? Math.round((part / whole) * 100) : 0;
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('');
}
