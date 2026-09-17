import { useState } from 'react';
import { useNavigate } from 'react-router';
import {
  Bell, Building, ChevronRight, CreditCard, Database, Download, FileText, Mail, MapPin, MessageSquare, Plug,
  Save, ShieldCheck, Trash, Users, type LucideIcon,
} from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Field, Input, Textarea, Select, Switch } from '../../components/ui/Field';
import { useConfirm } from '../../components/ui/ConfirmDialog';
import { useToast } from '../../components/ui/Toast';
import { useCurrentUser, useDb, useStore } from '../../store/useStore';
import { updateSettings } from '../../store/adminActions';
import { UNITS } from '../../types/models';
import { fmtDateTime } from '../../lib/format';
import { nowISO } from '../../lib/clock';
import { cn } from '../../lib/cn';

const TABS = [
  { key: 'company', label: 'Company Settings' },
  { key: 'users', label: 'User Management' },
  { key: 'roles', label: 'Roles & Permissions' },
  { key: 'general', label: 'General Settings' },
  { key: 'notifications', label: 'Notifications' },
  { key: 'integrations', label: 'Integrations' },
  { key: 'backup', label: 'Backup & Security' },
  { key: 'logs', label: 'System Logs' },
] as const;
type TabKey = (typeof TABS)[number]['key'];

/** Prototype-only preferences — real toggles live in Settings/roles; these drive UI copy. */
const PREFERENCES = [
  { key: 'lowStockAlerts', label: 'Enable Low Stock Alerts' },
  { key: 'autoOrderNumbers', label: 'Auto-generate Order Numbers' },
  { key: 'requireQc', label: 'Require Quality Check on Receiving' },
  { key: 'allowNegativeStock', label: 'Allow Negative Stock' },
  { key: 'emailNotifications', label: 'Enable Email Notifications' },
  { key: 'whatsappNotifications', label: 'Enable WhatsApp Notifications' },
  { key: 'showItemImages', label: 'Show Item Images' },
  { key: 'auditLogs', label: 'Enable Audit Logs' },
] as const;

const INTEGRATIONS = [
  { icon: MessageSquare, label: 'WhatsApp Business', status: 'Connected', tone: 'bg-emerald-50 text-emerald-700' },
  { icon: Mail, label: 'Email (SMTP)', status: 'Configured', tone: 'bg-blue-50 text-blue-700' },
  { icon: MapPin, label: 'Google Maps API', status: 'Not Configured', tone: 'bg-canvas text-muted' },
  { icon: FileText, label: 'Tally Integration', status: 'Not Configured', tone: 'bg-canvas text-muted' },
];

export function SettingsPage() {
  const db = useDb();
  const user = useCurrentUser()!;
  const nav = useNavigate();
  const toast = useToast();
  const confirm = useConfirm();
  const resetDemo = useStore((s) => s.resetDemo);

  const [tab, setTab] = useState<TabKey>('company');
  const [form, setForm] = useState(db.settings);
  const [prefs, setPrefs] = useState<Record<string, boolean>>({
    lowStockAlerts: true, autoOrderNumbers: true, requireQc: true, allowNegativeStock: false,
    emailNotifications: true, whatsappNotifications: true, showItemImages: true, auditLogs: true,
  });

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));
  const save = () => { updateSettings(form, user.id); toast({ tone: 'success', title: 'Settings saved' }); };

  const doReset = async () => {
    const ok = await confirm({
      title: 'Reset all demo data?',
      description: 'Every order, purchase, invoice and payment goes back to the seeded state. This cannot be undone.',
      tone: 'danger',
      confirmLabel: 'Reset system',
    });
    if (!ok) return;
    resetDemo();
    toast({ tone: 'warning', title: 'System reset', description: 'Demo data has been regenerated.' });
  };

  return (
    <div className="flex flex-col gap-4">
      <nav className="flex items-center gap-1 text-[12.5px] text-muted">
        <span>System</span>
        <ChevronRight size={13} className="text-subtle" />
        <span className="font-medium text-ink">Settings</span>
      </nav>

      <div className="min-w-0">
        <h1 className="text-[26px] leading-tight font-bold tracking-[-0.01em] text-ink">System Settings</h1>
        <p className="mt-1 text-[13px] text-muted">Configure your company details, preferences and system options.</p>
      </div>

      <div className="overflow-hidden rounded-card border border-line bg-white shadow-card">
        <div className="flex gap-1 overflow-x-auto px-3 pt-2">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={cn(
                'shrink-0 border-b-2 px-3 pb-2.5 text-[13px] font-semibold whitespace-nowrap transition-colors',
                tab === t.key ? 'border-brand-700 text-brand-800' : 'border-transparent text-muted hover:text-ink',
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {tab === 'company' && (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_320px]">
          <Panel icon={Building} title="Company Information" subtitle="Update your company details and business information.">
            <div className="grid gap-3.5 p-4 sm:grid-cols-2">
              <Field label="Company Name" className="sm:col-span-2">{(id) => <Input id={id} value={form.companyName} onChange={(e) => set('companyName', e.target.value)} />}</Field>
              <Field label="GST Number">{(id) => <Input id={id} value={form.companyGstin} onChange={(e) => set('companyGstin', e.target.value)} />}</Field>
              <Field label="Phone Number">{(id) => <Input id={id} value={form.companyPhone} onChange={(e) => set('companyPhone', e.target.value)} />}</Field>
              <Field label="Email Address" className="sm:col-span-2">{(id) => <Input id={id} value={form.companyEmail} onChange={(e) => set('companyEmail', e.target.value)} />}</Field>
              <Field label="Address" className="sm:col-span-2">{(id) => <Textarea id={id} value={form.companyAddress} onChange={(e) => set('companyAddress', e.target.value)} rows={3} />}</Field>
              <div className="sm:col-span-2 flex justify-end">
                <Button variant="primary" icon={Save} onClick={save}>Save Changes</Button>
              </div>
            </div>
          </Panel>

          <div className="flex flex-col gap-4">
            <Panel icon={FileText} title="Business Configuration" subtitle="Set business-specific preferences.">
              <div className="grid gap-3.5 p-4 sm:grid-cols-2">
                <Field label="Default Currency">{(id) => <Select id={id} value="INR" onChange={() => {}} options={['INR (₹)']} />}</Field>
                <Field label="Default Weight Unit">{(id) => <Select id={id} value="Kg" onChange={() => {}} options={[...UNITS]} />}</Field>
                <Field label="Order Cutoff Time" hint="Orders after this time are flagged Late.">
                  {(id) => <Input id={id} type="time" value={form.orderCutoffTime} onChange={(e) => set('orderCutoffTime', e.target.value)} />}
                </Field>
                <Field label="Default Payment Terms (days)">
                  {(id) => <Input id={id} type="number" value={form.defaultPaymentTermsDays} onChange={(e) => set('defaultPaymentTermsDays', Number(e.target.value))} />}
                </Field>
                <Field label="Invoice Prefix">{(id) => <Input id={id} value={form.invoicePrefix} onChange={(e) => set('invoicePrefix', e.target.value)} />}</Field>
                <Field label="Challan Prefix">{(id) => <Input id={id} value={form.challanPrefix} onChange={(e) => set('challanPrefix', e.target.value)} />}</Field>
                <Field label="Max Columns Per Printed Sheet" className="sm:col-span-2">
                  {(id) => <Input id={id} type="number" value={form.maxSheetColumns} onChange={(e) => set('maxSheetColumns', Number(e.target.value))} />}
                </Field>
              </div>
            </Panel>

            <Panel icon={Database} title="System Preferences" subtitle="Configure system behaviour and defaults.">
              <div className="flex flex-col divide-y divide-line">
                {PREFERENCES.map((p) => (
                  <div key={p.key} className="flex items-center gap-3 px-4 py-2.5">
                    <p className="min-w-0 flex-1 truncate text-[12.5px] text-ink">{p.label}</p>
                    <Switch checked={prefs[p.key]} onChange={(v) => setPrefs((s) => ({ ...s, [p.key]: v }))} />
                  </div>
                ))}
              </div>
            </Panel>
          </div>

          <div className="flex flex-col gap-4">
            <Panel icon={ShieldCheck} title="Subscription & License">
              <div className="p-4">
                <p className="text-[11.5px] text-muted">Current Plan</p>
                <div className="mt-0.5 flex items-center justify-between gap-2">
                  <p className="text-[18px] font-bold text-ink">Professional</p>
                  <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">Active</span>
                </div>
                <div className="mt-2 flex items-center justify-between text-[11.5px] text-muted">
                  <span>Valid till: 31 Dec 2026</span>
                  <span>Users: {db.users.length} / 10</span>
                </div>
                <Button variant="secondary" size="sm" className="mt-3 w-full" onClick={() => nav('/users')}>Manage Subscription</Button>
              </div>
            </Panel>

            <Panel icon={Database} title="Data Management" subtitle="Backup, export or reset your data.">
              <div className="flex flex-col divide-y divide-line">
                <ActionRow icon={Download} label="Download Backup" onClick={() => {
                  const a = document.createElement('a');
                  a.href = URL.createObjectURL(new Blob([JSON.stringify(db, null, 2)], { type: 'application/json' }));
                  a.download = `spaf-backup-${nowISO().slice(0, 10)}.json`;
                  a.click();
                  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
                  toast({ tone: 'success', title: 'Backup downloaded' });
                }} />
                <ActionRow icon={FileText} label="Export Master Data" onClick={() => nav('/reports/operations')} />
                <ActionRow icon={Trash} label="Reset System (Caution)" tone="text-red-600" onClick={doReset} />
              </div>
            </Panel>

            <Panel icon={Plug} title="Integration Settings" subtitle="Connect with third-party services.">
              <div className="flex flex-col divide-y divide-line">
                {INTEGRATIONS.map((i) => (
                  <div key={i.label} className="flex items-center gap-2.5 px-4 py-2.5">
                    <i.icon size={15} className="shrink-0 text-brand-700" />
                    <p className="min-w-0 flex-1 truncate text-[12.5px] text-ink">{i.label}</p>
                    <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-[10.5px] font-semibold', i.tone)}>{i.status}</span>
                    <ChevronRight size={14} className="shrink-0 text-subtle" />
                  </div>
                ))}
              </div>
            </Panel>
          </div>
        </div>
      )}

      {tab === 'users' && (
        <Panel icon={Users} title="User Management" subtitle={`${db.users.length} users across ${db.roles.length} roles.`}>
          <div className="scrollbar-thin overflow-x-auto">
            <table className="w-full border-collapse text-[12.5px]">
              <thead>
                <tr className="border-b border-line bg-canvas/70 text-[11px] font-semibold tracking-wide text-subtle uppercase">
                  <th className="w-10 px-2 py-2.5 text-center">#</th>
                  <th className="px-3 py-2.5 text-left">Name</th>
                  <th className="px-3 py-2.5 text-left">Email</th>
                  <th className="px-3 py-2.5 text-left">Role</th>
                  <th className="px-3 py-2.5 text-center">Status</th>
                </tr>
              </thead>
              <tbody>
                {db.users.map((u, i) => (
                  <tr key={u.id} className="border-b border-line last:border-0 hover:bg-fresh-50/40">
                    <td className="tabular px-2 py-2.5 text-center text-subtle">{i + 1}</td>
                    <td className="px-3 py-2.5 font-medium whitespace-nowrap text-ink">{u.name}</td>
                    <td className="px-3 py-2.5 text-muted">{u.email}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap text-muted">{db.roles.find((r) => r.key === u.role)?.name ?? u.role}</td>
                    <td className="px-3 py-2.5 text-center">
                      <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-semibold', u.status === 'Active' ? 'bg-emerald-50 text-emerald-700' : 'bg-canvas text-muted')}>
                        {u.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="p-3">
            <Button variant="secondary" size="sm" onClick={() => nav('/users')}>Open Users &amp; Roles</Button>
          </div>
        </Panel>
      )}

      {tab === 'roles' && (
        <Panel icon={ShieldCheck} title="Roles & Permissions" subtitle="The permission matrix lives in Users & Roles — it drives what every screen allows.">
          <div className="flex flex-col divide-y divide-line">
            {db.roles.map((r) => (
              <div key={r.key} className="flex items-center gap-2.5 px-4 py-2.5">
                <p className="min-w-0 flex-1 truncate text-[12.5px] font-medium text-ink">{r.name}</p>
                <p className="shrink-0 text-[11.5px] text-muted">{db.users.filter((u) => u.role === r.key).length} users</p>
                <ChevronRight size={14} className="shrink-0 text-subtle" />
              </div>
            ))}
          </div>
          <div className="p-3">
            <Button variant="secondary" size="sm" onClick={() => nav('/users')}>Edit permission matrix</Button>
          </div>
        </Panel>
      )}

      {tab === 'general' && (
        <Panel icon={FileText} title="General Settings" subtitle="Units are fixed system-wide so every SKU stays unambiguous.">
          <div className="flex flex-col gap-3 p-4">
            <div className="flex flex-wrap gap-2">
              {UNITS.map((u) => <span key={u} className="rounded-full bg-fresh-50 px-2.5 py-1 text-[12px] font-medium text-brand-800">{u}</span>)}
            </div>
            <p className="text-[12.5px] text-muted">
              Per-item GST rate is set on each item (0% for fresh produce, 5% for select frozen or imported lines) —
              see <button className="text-brand-700 underline" onClick={() => nav('/items')}>Items</button>.
            </p>
          </div>
        </Panel>
      )}

      {tab === 'notifications' && (
        <Panel icon={Bell} title="Notification Templates" subtitle="Which events raise a notification for staff and customers.">
          <div className="flex flex-col divide-y divide-line">
            {[
              'Late order received after cutoff',
              'Shortage detected during allocation',
              'Payment due / overdue reminder',
              'Delivery dispatched to customer',
              'Daily operations summary',
            ].map((n) => (
              <div key={n} className="flex items-center gap-3 px-4 py-2.5">
                <p className="min-w-0 flex-1 truncate text-[12.5px] text-ink">{n}</p>
                <Switch checked={prefs.emailNotifications} onChange={(v) => setPrefs((s) => ({ ...s, emailNotifications: v }))} />
              </div>
            ))}
          </div>
          <div className="p-3">
            <Button variant="secondary" size="sm" onClick={() => nav('/notifications')}>Open Notification Center</Button>
          </div>
        </Panel>
      )}

      {tab === 'integrations' && (
        <Panel icon={Plug} title="Integrations" subtitle="Connect with third-party services.">
          <div className="flex flex-col divide-y divide-line">
            {INTEGRATIONS.map((i) => (
              <div key={i.label} className="flex items-center gap-2.5 px-4 py-3">
                <i.icon size={16} className="shrink-0 text-brand-700" />
                <p className="min-w-0 flex-1 truncate text-[12.5px] text-ink">{i.label}</p>
                <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-[10.5px] font-semibold', i.tone)}>{i.status}</span>
              </div>
            ))}
          </div>
        </Panel>
      )}

      {tab === 'backup' && (
        <Panel icon={Database} title="Backup & Security" subtitle="Backup, export or reset your data.">
          <div className="flex flex-col divide-y divide-line">
            <ActionRow icon={Download} label="Download Backup" onClick={() => {
              const a = document.createElement('a');
              a.href = URL.createObjectURL(new Blob([JSON.stringify(db, null, 2)], { type: 'application/json' }));
              a.download = `spaf-backup-${nowISO().slice(0, 10)}.json`;
              a.click();
              setTimeout(() => URL.revokeObjectURL(a.href), 1000);
              toast({ tone: 'success', title: 'Backup downloaded' });
            }} />
            <ActionRow icon={FileText} label="Export Master Data" onClick={() => nav('/reports/operations')} />
            <ActionRow icon={Trash} label="Reset System (Caution)" tone="text-red-600" onClick={doReset} />
          </div>
        </Panel>
      )}

      {tab === 'logs' && (
        <Panel icon={FileText} title="System Logs" subtitle="Every change is recorded with who did it and what changed.">
          <div className="scrollbar-thin overflow-x-auto">
            <table className="w-full border-collapse text-[12.5px]">
              <thead>
                <tr className="border-b border-line bg-canvas/70 text-[11px] font-semibold tracking-wide text-subtle uppercase">
                  <th className="px-3 py-2.5 text-left">Time</th>
                  <th className="px-3 py-2.5 text-left">Action</th>
                  <th className="px-3 py-2.5 text-left">Module</th>
                  <th className="px-3 py-2.5 text-left">User</th>
                </tr>
              </thead>
              <tbody>
                {db.auditLogs.slice(0, 15).map((a) => (
                  <tr key={a.id} className="border-b border-line last:border-0">
                    <td className="px-3 py-2 whitespace-nowrap text-subtle">{fmtDateTime(a.at)}</td>
                    <td className="px-3 py-2 text-ink">{a.action}</td>
                    <td className="px-3 py-2 text-muted">{a.module}</td>
                    <td className="px-3 py-2 text-muted">{db.users.find((u) => u.id === a.userId)?.name ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="p-3">
            <Button variant="secondary" size="sm" onClick={() => nav('/audit-logs')}>Open Audit Log</Button>
          </div>
        </Panel>
      )}

      {/* ------------------------------------------------------ quick actions */}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <Panel icon={FileText} title="Quick Actions" subtitle="Common settings and configuration tasks.">
          <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { icon: Users, label: 'Manage Users', desc: 'Add / remove users', action: () => nav('/users') },
              { icon: ShieldCheck, label: 'Roles & Permissions', desc: 'Set access rights', action: () => nav('/users') },
              { icon: Bell, label: 'Notification Templates', desc: 'Customize messages', action: () => nav('/notifications') },
              { icon: FileText, label: 'System Logs', desc: 'View activity logs', action: () => nav('/audit-logs') },
            ].map((q) => (
              <button key={q.label} onClick={q.action} className="flex items-center gap-2.5 rounded-lg border border-line px-3 py-3 text-left hover:bg-fresh-50/40">
                <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-fresh-50 text-brand-700"><q.icon size={17} /></span>
                <div className="min-w-0">
                  <p className="truncate text-[12.5px] font-semibold text-ink">{q.label}</p>
                  <p className="truncate text-[11px] text-subtle">{q.desc}</p>
                </div>
              </button>
            ))}
          </div>
        </Panel>

        <Panel icon={Database} title="System Information">
          <div className="flex flex-col">
            <InfoRow label="Application Version" value="v1.0.0" />
            <InfoRow label="Last Updated" value={fmtDateTime(db.auditLogs[0]?.at ?? nowISO())} />
            <InfoRow label="Server Environment" value="Prototype (in-browser)" />
            <InfoRow label="Data Seed Version" value={String(db.meta.version)} />
            <InfoRow label="Records" value={`${db.orders.length} orders · ${db.invoices.length} invoices`} />
          </div>
        </Panel>
      </div>

      <div className="flex flex-col gap-2 rounded-card bg-gradient-to-r from-brand-800 to-fresh-600 p-5 text-white sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-[15px] font-semibold">Keep Your Business Growing</p>
          <p className="text-[12.5px] text-white/80">Well configured settings ensure smooth operations and better productivity.</p>
        </div>
        <Button variant="secondary" icon={Save} onClick={save}>Save Changes</Button>
      </div>
    </div>
  );
}

function Panel({ icon: Icon, title, subtitle, children }: { icon: LucideIcon; title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded-card border border-line bg-white shadow-card">
      <div className="flex items-start gap-2 border-b border-line px-4 py-3">
        <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg bg-fresh-50 text-fresh-600"><Icon size={15} /></span>
        <div className="min-w-0">
          <h3 className="truncate text-[13.5px] font-semibold text-ink">{title}</h3>
          {subtitle && <p className="truncate text-[11.5px] text-muted">{subtitle}</p>}
        </div>
      </div>
      {children}
    </div>
  );
}

function ActionRow({ icon: Icon, label, onClick, tone }: { icon: LucideIcon; label: string; onClick: () => void; tone?: string }) {
  return (
    <button onClick={onClick} className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left hover:bg-fresh-50/40">
      <Icon size={15} className={cn('shrink-0', tone ?? 'text-brand-700')} />
      <span className={cn('min-w-0 flex-1 truncate text-[12.5px]', tone ?? 'text-ink')}>{label}</span>
      <ChevronRight size={14} className="shrink-0 text-subtle" />
    </button>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center gap-2.5 border-b border-line px-4 py-2.5 last:border-0">
      <p className="min-w-0 flex-1 truncate text-[12.5px] text-muted">{label}</p>
      <p className="tabular shrink-0 text-[12.5px] font-medium text-ink">{value}</p>
    </div>
  );
}
