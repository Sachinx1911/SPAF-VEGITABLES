import { useMemo, useState } from 'react';
import { CalendarDays, CalendarRange, CheckCircle2, Clock, Copy, FileText, IndianRupee, ListFilter, Printer, TriangleAlert, X } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { DateRangePicker } from '../../components/ui/DatePicker';
import { EmptyState } from '../../components/ui/States';
import { Modal } from '../../components/ui/Overlay';
import { useToast } from '../../components/ui/Toast';
import { useCurrentUser, useDb } from '../../store/useStore';
import { invoiceViews, type InvoiceView } from '../../domain/finance';
import { todayISO } from '../../lib/clock';
import { addDays, fmtDate, inr, parseISO } from '../../lib/format';
import { itemEmoji } from '../orders/orderUi';
import { ProduceArt } from './ProduceArt';
import { cn } from '../../lib/cn';

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const DAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

const TABS = [
  { key: 'all', label: 'All Invoices' },
  { key: 'unpaid', label: 'Unpaid' },
  { key: 'paid', label: 'Paid' },
] as const;
type TabKey = (typeof TABS)[number]['key'];

/** What the customer reads on the pill — three states, never the accounts team's six. */
function pillOf(inv: InvoiceView): { label: string; tone: 'green' | 'amber' | 'red'; icon: typeof CheckCircle2 } {
  if (inv.balance <= 0) return { label: 'Paid', tone: 'green', icon: CheckCircle2 };
  if (inv.daysOverdue > 0) return { label: `Overdue ${inv.daysOverdue}d`, tone: 'red', icon: TriangleAlert };
  return { label: 'Pending', tone: 'amber', icon: Clock };
}

const PILL = {
  green: 'bg-emerald-50 text-emerald-700',
  amber: 'bg-amber-50 text-amber-700',
  red: 'bg-red-50 text-red-700',
};

export function PortalInvoicesPage() {
  const db = useDb();
  const user = useCurrentUser()!;
  const toast = useToast();
  const today = todayISO();

  const [tab, setTab] = useState<TabKey>('all');
  const [rangeOpen, setRangeOpen] = useState(false);
  const [from, setFrom] = useState(addDays(today, -90));
  const [to, setTo] = useState(today);
  const [viewing, setViewing] = useState<InvoiceView | null>(null);
  const [paying, setPaying] = useState<InvoiceView | null>(null);

  const itemById = useMemo(() => new Map(db.items.map((i) => [i.id, i])), [db.items]);
  const orderById = useMemo(() => new Map(db.orders.map((o) => [o.id, o])), [db.orders]);
  const customer = db.customers.find((c) => c.id === user.customerId);

  const linesBy = useMemo(() => {
    const m = new Map<string, typeof db.invoiceItems>();
    for (const l of db.invoiceItems) m.set(l.invoiceId, [...(m.get(l.invoiceId) ?? []), l]);
    return m;
  }, [db.invoiceItems]);

  const all = useMemo(
    () => invoiceViews(db, today).filter((i) => i.customerId === user.customerId).sort((a, b) => (a.invoiceDate < b.invoiceDate ? 1 : -1)),
    [db, today, user.customerId],
  );
  const invoices = all
    .filter((i) => (tab === 'paid' ? i.balance <= 0 : tab === 'unpaid' ? i.balance > 0 : true))
    .filter((i) => !rangeOpen || (i.invoiceDate >= from && i.invoiceDate <= to));

  const unpaidTotal = all.reduce((s, i) => s + i.balance, 0);
  const counts = { all: all.length, unpaid: all.filter((i) => i.balance > 0).length, paid: all.filter((i) => i.balance <= 0).length };

  const copyNo = (no: string) => {
    navigator.clipboard?.writeText(no).catch(() => undefined);
    toast({ tone: 'success', title: 'Invoice number copied', description: no });
  };

  return (
    <div className="flex flex-col gap-4">
      {/* -------------------------------------------------------------- head */}
      <div className="relative">
        <h1 className="text-[30px] leading-none font-bold tracking-[-0.02em] text-ink">Invoices</h1>
        <p className="mt-2 text-[13.5px] text-muted">Your bills &amp; payment history</p>
        <div className="pointer-events-none absolute -top-3 right-0 flex items-center gap-1">
          <p className="font-serif text-[15px] leading-[1.2] text-brand-700 italic">Good Food<br />Brighter Days <span className="not-italic">🌿</span></p>
          <ProduceArt className="h-16 w-20" fallbackClass="text-[22px]" />
        </div>
      </div>

      {/* --------------------------------------------------------- segmented */}
      <div className="flex items-center gap-2">
        <div className="flex flex-1 gap-1 rounded-2xl border border-line bg-white p-1">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={cn('flex-1 rounded-xl px-2 py-2.5 text-[13px] font-semibold whitespace-nowrap transition-colors', tab === t.key ? 'bg-brand-800 text-white' : 'text-muted')}
            >
              {t.label}
              {t.key !== 'all' && counts[t.key] > 0 && <span className={cn('tabular ml-1 text-[11px]', tab === t.key ? 'text-white/70' : 'text-subtle')}>{counts[t.key]}</span>}
            </button>
          ))}
        </div>
        <button
          onClick={() => setRangeOpen((v) => !v)}
          className={cn('flex h-[46px] shrink-0 items-center gap-1.5 rounded-2xl border px-3.5 text-[13px] font-semibold', rangeOpen ? 'border-brand-300 bg-brand-50 text-brand-800' : 'border-line bg-fresh-50/60 text-brand-800')}
        >
          {rangeOpen ? <X size={16} /> : <ListFilter size={16} />} Filter
        </button>
      </div>

      {rangeOpen && (
        <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-line bg-white p-3">
          <CalendarRange size={16} className="text-brand-700" />
          <DateRangePicker from={from} to={to} onChange={(f, t) => { setFrom(f); setTo(t); }} />
        </div>
      )}

      {/* --------------------------------------------------- unpaid summary */}
      {unpaidTotal > 0 && tab !== 'paid' && (
        <div className="flex items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50/70 px-3.5 py-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-white text-amber-600"><IndianRupee size={19} /></span>
          <div className="min-w-0 flex-1">
            <p className="text-[13.5px] font-semibold text-ink">{inr(unpaidTotal)} to pay</p>
            <p className="text-[12px] text-muted">{counts.unpaid} invoice{counts.unpaid > 1 ? 's' : ''} pending{customer ? ` · ${customer.paymentTermsDays}-day terms` : ''}</p>
          </div>
          {tab !== 'unpaid' && <button onClick={() => setTab('unpaid')} className="text-[12.5px] font-semibold text-brand-800">View</button>}
        </div>
      )}

      {/* ------------------------------------------------------------- cards */}
      {invoices.length === 0 ? (
        <EmptyState
          icon={FileText}
          title={tab === 'unpaid' ? 'Nothing to pay' : rangeOpen ? 'No invoices in this range' : 'No invoices yet'}
          description={tab === 'unpaid' ? 'Every invoice is settled. Thank you!' : 'Invoices appear here the moment an order is delivered.'}
        />
      ) : (
        invoices.map((inv) => {
          const lines = linesBy.get(inv.id) ?? [];
          const order = orderById.get(inv.orderId);
          const pill = pillOf(inv);
          const d = parseISO(inv.invoiceDate);
          return (
            <div key={inv.id} className="rounded-2xl border border-line bg-white p-3.5">
              <div className="flex items-start gap-3">
                <div className="grid w-14 shrink-0 place-items-center rounded-xl bg-fresh-50 py-2">
                  <span className="text-[10.5px] font-semibold tracking-wide text-brand-700">{DAYS[d.getDay()]}</span>
                  <span className="tabular text-[22px] leading-none font-bold text-ink">{d.getDate()}</span>
                  <span className="text-[10px] font-semibold tracking-wide text-brand-700">{MONTHS[d.getMonth()]} {d.getFullYear()}</span>
                </div>

                <div className="min-w-0 flex-1">
                  <p className="tabular text-[14.5px] leading-tight font-bold break-all text-ink">{inv.invoiceNo}</p>
                  {order && <p className="tabular truncate text-[12px] text-muted">Order #{order.orderNo}</p>}
                  <p className="tabular mt-0.5 text-[12.5px] text-muted">{lines.length} items</p>
                  <div className="mt-2 flex items-center gap-1.5">
                    {lines.slice(0, 5).map((l) => {
                      const it = itemById.get(l.itemId);
                      return <span key={l.id} className="grid size-8 place-items-center rounded-lg bg-canvas text-[17px]">{it ? itemEmoji(it.name, it.category) : '🥬'}</span>;
                    })}
                    {lines.length > 5 && (
                      <span className="tabular grid h-8 min-w-[34px] place-items-center rounded-lg bg-canvas px-1.5 text-[12px] font-semibold text-muted">+{lines.length - 5}</span>
                    )}
                  </div>
                </div>

                <div className="flex shrink-0 flex-col items-end gap-1.5">
                  <span className={cn('flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-semibold whitespace-nowrap', PILL[pill.tone])}>
                    <pill.icon size={13} /> {pill.label}
                  </span>
                  <span className="tabular text-[19px] leading-tight font-bold text-ink">{inr(inv.total)}</span>
                  {inv.balance > 0 && inv.paid > 0 && <span className="tabular text-[11px] text-muted">{inr(inv.balance)} due</span>}
                </div>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-3">
                <span className="flex items-center gap-1.5 text-[12px] whitespace-nowrap text-muted">
                  <CalendarDays size={13} /> {inv.balance > 0 ? `Due ${fmtDate(inv.dueDate)}` : `Paid · due ${fmtDate(inv.dueDate)}`}
                </span>
                <div className="ml-auto flex items-center gap-2">
                  {inv.balance > 0 && (
                    <button onClick={() => setPaying(inv)} className="rounded-xl bg-brand-800 px-3.5 py-2 text-[12.5px] font-semibold whitespace-nowrap text-white">Pay Now</button>
                  )}
                  <button onClick={() => setViewing(inv)} className="flex items-center gap-1.5 rounded-xl border border-brand-300 px-3 py-2 text-[12.5px] font-semibold whitespace-nowrap text-brand-800">
                    <FileText size={14} /> View PDF
                  </button>
                </div>
              </div>
            </div>
          );
        })
      )}

      {/* ------------------------------------------------------ older range */}
      {!rangeOpen && (
        <button onClick={() => setRangeOpen(true)} className="flex w-full items-center gap-3 rounded-2xl bg-fresh-50/70 p-3.5 text-left active:bg-fresh-50">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-white text-brand-700"><CalendarRange size={19} /></span>
          <span className="min-w-0 flex-1">
            <span className="block text-[13.5px] font-semibold text-ink">Need an older invoice?</span>
            <span className="block text-[12px] text-muted">Tap to pick a date range.</span>
          </span>
          <span className="flex shrink-0 items-center gap-1.5 rounded-xl border border-brand-300 bg-white px-3 py-2 text-[12.5px] font-semibold whitespace-nowrap text-brand-800">
            <CalendarDays size={14} /> Select dates
          </span>
        </button>
      )}

      {/* ------------------------------------------------------ invoice view */}
      <Modal
        open={!!viewing}
        onClose={() => setViewing(null)}
        title={viewing?.invoiceNo}
        description={viewing ? `${fmtDate(viewing.invoiceDate)} · due ${fmtDate(viewing.dueDate)}` : undefined}
        footer={
          <>
            <Button variant="secondary" icon={Copy} onClick={() => viewing && copyNo(viewing.invoiceNo)}>Copy no.</Button>
            <Button variant="primary" icon={Printer} onClick={() => window.print()}>Print / Save PDF</Button>
          </>
        }
      >
        {viewing && (
          <div className="print-area text-[13px]">
            <div className="flex items-start justify-between gap-3 border-b border-line pb-3">
              <div>
                <p className="font-bold text-ink">{db.settings.companyName}</p>
                <p className="text-[11.5px] text-muted">GSTIN {db.settings.companyGstin}</p>
              </div>
              <div className="text-right">
                <p className="text-[11.5px] text-muted">Bill to</p>
                <p className="font-semibold text-ink">{customer?.name}</p>
              </div>
            </div>
            <div className="mt-3 flex flex-col divide-y divide-line">
              {(linesBy.get(viewing.id) ?? []).map((l) => {
                const it = itemById.get(l.itemId);
                return (
                  <div key={l.id} className="flex items-center gap-2.5 py-2">
                    <span className="text-[15px]">{it ? itemEmoji(it.name, it.category) : '🥬'}</span>
                    <span className="min-w-0 flex-1 truncate text-ink">{it?.name ?? l.itemId}</span>
                    <span className="tabular shrink-0 text-muted">{l.qty} {l.unit} × {inr(l.rate, true)}</span>
                    <span className="tabular w-20 shrink-0 text-right font-medium text-ink">{inr(l.amount)}</span>
                  </div>
                );
              })}
            </div>
            <div className="mt-3 flex flex-col gap-1 border-t border-line pt-3">
              <Row label="Subtotal" value={inr(viewing.subtotal)} />
              {viewing.taxAmount > 0 && <Row label="GST" value={inr(viewing.taxAmount)} />}
              <Row label="Total" value={inr(viewing.total)} strong />
              {viewing.paid > 0 && <Row label="Paid" value={inr(viewing.paid)} />}
              {viewing.balance > 0 && <Row label="Balance due" value={inr(viewing.balance)} strong />}
            </div>
          </div>
        )}
      </Modal>

      {/* ------------------------------------------------------------ pay now */}
      <Modal
        open={!!paying}
        onClose={() => setPaying(null)}
        title={paying ? `Pay ${inr(paying.balance)}` : ''}
        description={paying ? `${paying.invoiceNo} · due ${fmtDate(paying.dueDate)}` : undefined}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setPaying(null)}>Close</Button>
            <Button variant="primary" icon={Copy} onClick={() => paying && copyNo(paying.invoiceNo)}>Copy invoice no.</Button>
          </>
        }
      >
        {paying && (
          <div className="flex flex-col gap-3 text-[13px]">
            <p className="text-muted">Pay by UPI or bank transfer and quote the invoice number as the payment reference. Your invoice is marked paid once accounts receive it.</p>
            <div className="rounded-xl bg-canvas p-3">
              <Row label="Pay to" value={db.settings.companyName} />
              <Row label="Amount" value={inr(paying.balance)} strong />
              <Row label="Reference" value={paying.invoiceNo} />
              <Row label="Queries" value={db.settings.companyPhone} />
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 py-0.5">
      <span className="text-muted">{label}</span>
      <span className={cn('tabular text-right', strong ? 'text-[14px] font-bold text-brand-800' : 'font-medium text-ink')}>{value}</span>
    </div>
  );
}
