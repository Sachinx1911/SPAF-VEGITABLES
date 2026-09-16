import { useNavigate } from 'react-router';
import { BookOpen, Building2, ChevronRight, LogOut, Mail, MapPin, Phone, Receipt, Truck, User, Wallet } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { useConfirm } from '../../components/ui/ConfirmDialog';
import { useCurrentUser, useDb, useStore } from '../../store/useStore';
import { customerOutstanding, invoiceViews } from '../../domain/finance';
import { todayISO } from '../../lib/clock';
import { initials, inr } from '../../lib/format';
import { cn } from '../../lib/cn';

export function PortalAccountPage() {
  const db = useDb();
  const user = useCurrentUser()!;
  const nav = useNavigate();
  const confirm = useConfirm();
  const logout = useStore((s) => s.logout);
  const customer = db.customers.find((c) => c.id === user.customerId)!;
  const today = todayISO();

  const outstanding = customerOutstanding(db, today).get(customer.id) ?? 0;
  const overdue = invoiceViews(db, today).filter((i) => i.customerId === customer.id && i.derivedStatus === 'Overdue');
  const route = db.routes.find((r) => r.id === customer.routeId);

  const signOut = async () => {
    const ok = await confirm({ title: 'Sign out?', confirmLabel: 'Sign out', tone: 'danger' });
    if (ok) { logout(); nav('/login'); }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <span className="grid size-14 shrink-0 place-items-center rounded-2xl bg-brand-700 text-[17px] font-semibold text-white">{initials(user.name)}</span>
        <div className="min-w-0">
          <h1 className="truncate text-[19px] leading-tight font-bold text-ink">{user.name}</h1>
          <p className="truncate text-[12.5px] text-muted">{customer.name}</p>
        </div>
      </div>

      {/* --------------------------------------------------------- balance */}
      <button
        onClick={() => nav('/portal/ledger')}
        className={cn('flex items-center gap-3 rounded-2xl p-4 text-left', outstanding > 0 ? 'bg-orange-50' : 'bg-emerald-50')}
      >
        <span className={cn('grid size-11 shrink-0 place-items-center rounded-xl bg-white', outstanding > 0 ? 'text-orange-600' : 'text-emerald-600')}>
          <Wallet size={21} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[12px] text-muted">Outstanding balance</p>
          <p className={cn('tabular text-[22px] leading-tight font-bold', outstanding > 0 ? 'text-orange-700' : 'text-emerald-700')}>{inr(outstanding)}</p>
          {overdue.length > 0 && <p className="text-[12px] font-medium text-red-600">{overdue.length} invoice{overdue.length > 1 ? 's' : ''} overdue</p>}
        </div>
        <ChevronRight size={20} className="shrink-0 text-subtle" />
      </button>

      {/* ------------------------------------------------------- shortcuts */}
      <div className="flex flex-col gap-2">
        <NavRow icon={Receipt} label="Invoices" onClick={() => nav('/portal/invoices')} />
        <NavRow icon={BookOpen} label="Ledger" onClick={() => nav('/portal/ledger')} />
        <NavRow icon={Truck} label="Order history" onClick={() => nav('/portal/orders')} />
      </div>

      {/* --------------------------------------------------- business card */}
      <Section title="Business details">
        <Line icon={Building2}>{customer.legalName || customer.name}</Line>
        <Line icon={User}>{customer.contactPerson}</Line>
        <Line icon={Phone}>{customer.mobile}</Line>
        <Line icon={Mail}>{customer.email || '—'}</Line>
        <Line icon={MapPin}>{customer.deliveryAddress || customer.location}</Line>
        <Line icon={Building2}>GST: {customer.gstin || '—'}</Line>
      </Section>

      <Section title="Delivery">
        <Line icon={Truck}>{route ? `${route.name} · leaves ${route.departureTime}` : 'Route not assigned'}</Line>
        <Line icon={MapPin}>Stop #{customer.routeOrder} on the route</Line>
        <Line icon={BookOpen}>Payment terms: {customer.paymentTermsDays} days</Line>
      </Section>

      <Button variant="secondary" icon={LogOut} onClick={signOut} className="mt-1 border-red-200 text-red-600">Sign out</Button>

      <p className="pb-2 text-center text-[11px] text-subtle">SPAF Ordering Portal · {db.settings.companyName}</p>
    </div>
  );
}

function NavRow({ icon: Icon, label, onClick }: { icon: typeof Receipt; label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex items-center gap-3 rounded-2xl border border-line bg-white p-3.5 text-left active:bg-canvas">
      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-700"><Icon size={19} /></span>
      <span className="min-w-0 flex-1 truncate text-[14px] font-medium text-ink">{label}</span>
      <ChevronRight size={18} className="shrink-0 text-subtle" />
    </button>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-line bg-white p-4">
      <p className="mb-2.5 text-[11px] font-semibold tracking-wide text-subtle uppercase">{title}</p>
      <div className="flex flex-col gap-2 text-[12.5px] text-muted">{children}</div>
    </div>
  );
}

function Line({ icon: Icon, children }: { icon: typeof Phone; children: React.ReactNode }) {
  return <span className="flex items-start gap-2"><Icon size={14} className="mt-0.5 shrink-0" /><span className="min-w-0 break-words">{children}</span></span>;
}
