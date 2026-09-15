import { useState } from 'react';
import { useNavigate } from 'react-router';
import { Bell, Building2, CalendarClock, CreditCard, FileText, Settings as SettingsIcon, ShieldCheck, Truck } from 'lucide-react';
import { PageHeader, Card, CardBody, CardHeader } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Field, Input, Textarea, Switch, Checkbox } from '../../components/ui/Field';
import { Tabs } from '../../components/ui/Tabs';
import { Badge } from '../../components/ui/Badge';
import { useCurrentUser, useDb } from '../../store/useStore';
import { updateSettings } from '../../store/adminActions';
import { useToast } from '../../components/ui/Toast';
import { UNITS } from '../../types/models';

const SECTIONS = [
  { key: 'company', label: 'Company Profile', icon: Building2 },
  { key: 'tax', label: 'Tax & Units', icon: FileText },
  { key: 'cutoff', label: 'Order Cutoff', icon: CalendarClock },
  { key: 'delivery', label: 'Delivery Settings', icon: Truck },
  { key: 'invoice', label: 'Invoice & Payment Terms', icon: CreditCard },
  { key: 'notify', label: 'Notifications', icon: Bell },
  { key: 'roles', label: 'User Roles', icon: ShieldCheck },
  { key: 'system', label: 'System Preferences', icon: SettingsIcon },
];

export function SettingsPage() {
  const db = useDb();
  const user = useCurrentUser()!;
  const nav = useNavigate();
  const toast = useToast();
  const [section, setSection] = useState('company');
  const [form, setForm] = useState(db.settings);
  const [notify, setNotify] = useState({ lateOrders: true, shortages: true, paymentDue: true, dailySummary: false });

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));
  const save = () => { updateSettings(form, user.id); toast({ tone: 'success', title: 'Settings saved' }); };

  return (
    <div>
      <PageHeader title="Settings" description="Company profile, tax, cutoff, invoicing and system preferences." />
      <div className="grid gap-4 lg:grid-cols-[220px_1fr]">
        <Tabs
          items={SECTIONS.map((s) => ({ key: s.key, label: <span className="flex items-center gap-1.5"><s.icon size={13} />{s.label}</span> }))}
          value={section} onChange={setSection} variant="pill"
        />
        <Card className="lg:col-start-2">
          {section === 'company' && (
            <>
              <CardHeader title="Company Profile" />
              <CardBody className="grid gap-3.5 sm:grid-cols-2">
                <Field label="Company name" className="sm:col-span-2">{(id) => <Input id={id} value={form.companyName} onChange={(e) => set('companyName', e.target.value)} />}</Field>
                <Field label="Address" className="sm:col-span-2">{(id) => <Textarea id={id} value={form.companyAddress} onChange={(e) => set('companyAddress', e.target.value)} rows={2} />}</Field>
                <Field label="GSTIN">{(id) => <Input id={id} value={form.companyGstin} onChange={(e) => set('companyGstin', e.target.value)} />}</Field>
                <Field label="Phone">{(id) => <Input id={id} value={form.companyPhone} onChange={(e) => set('companyPhone', e.target.value)} />}</Field>
                <Field label="Email" className="sm:col-span-2">{(id) => <Input id={id} value={form.companyEmail} onChange={(e) => set('companyEmail', e.target.value)} />}</Field>
              </CardBody>
            </>
          )}

          {section === 'tax' && (
            <>
              <CardHeader title="Tax & Units" subtitle="Units are fixed system-wide to keep every SKU unambiguous." />
              <CardBody className="flex flex-col gap-4">
                <div className="flex flex-wrap gap-2">{UNITS.map((u) => <Badge key={u} tone="brand">{u}</Badge>)}</div>
                <p className="text-[13px] text-muted">Per-item GST rate is set on each item (default 0% for fresh produce, 5% for select frozen/imported lines) — see <button className="text-brand-700 underline" onClick={() => nav('/items')}>Items</button>.</p>
              </CardBody>
            </>
          )}

          {section === 'cutoff' && (
            <>
              <CardHeader title="Order Cutoff" />
              <CardBody className="grid gap-3.5 sm:grid-cols-2">
                <Field label="Daily cutoff time" hint="Orders after this time are flagged Late and roll to the next delivery slot.">
                  {(id) => <Input id={id} type="time" value={form.orderCutoffTime} onChange={(e) => set('orderCutoffTime', e.target.value)} />}
                </Field>
                <Field label="Max customer columns per printed sheet">
                  {(id) => <Input id={id} type="number" value={form.maxSheetColumns} onChange={(e) => set('maxSheetColumns', Number(e.target.value))} />}
                </Field>
              </CardBody>
            </>
          )}

          {section === 'delivery' && (
            <>
              <CardHeader title="Delivery Settings" subtitle="Routes and drivers — manage drivers under Users & Roles." />
              <CardBody className="flex flex-col gap-2">
                {db.routes.map((r) => (
                  <div key={r.id} className="flex items-center justify-between rounded-lg border border-line px-3 py-2 text-[13px]">
                    <div><p className="font-medium text-ink">{r.name}</p><p className="text-xs text-muted">{r.area}</p></div>
                    <div className="text-right text-xs text-muted">{r.vehicleNo} · departs {r.departureTime}</div>
                  </div>
                ))}
              </CardBody>
            </>
          )}

          {section === 'invoice' && (
            <>
              <CardHeader title="Invoice & Payment Terms" />
              <CardBody className="grid gap-3.5 sm:grid-cols-2">
                <Field label="Invoice prefix">{(id) => <Input id={id} value={form.invoicePrefix} onChange={(e) => set('invoicePrefix', e.target.value)} />}</Field>
                <Field label="Challan prefix">{(id) => <Input id={id} value={form.challanPrefix} onChange={(e) => set('challanPrefix', e.target.value)} />}</Field>
                <Field label="Default payment terms (days)">{(id) => <Input id={id} type="number" value={form.defaultPaymentTermsDays} onChange={(e) => set('defaultPaymentTermsDays', Number(e.target.value))} />}</Field>
              </CardBody>
            </>
          )}

          {section === 'notify' && (
            <>
              <CardHeader title="Notification Settings" />
              <CardBody className="flex flex-col gap-3">
                <Switch checked={notify.lateOrders} onChange={(v) => setNotify((n) => ({ ...n, lateOrders: v }))} label="Alert on late orders" />
                <Switch checked={notify.shortages} onChange={(v) => setNotify((n) => ({ ...n, shortages: v }))} label="Alert on purchase shortages" />
                <Switch checked={notify.paymentDue} onChange={(v) => setNotify((n) => ({ ...n, paymentDue: v }))} label="Alert on payments due soon" />
                <Switch checked={notify.dailySummary} onChange={(v) => setNotify((n) => ({ ...n, dailySummary: v }))} label="Daily summary email" />
              </CardBody>
            </>
          )}

          {section === 'roles' && (
            <CardBody>
              <p className="mb-3 text-[13px] text-muted">Manage users and the module-level permission matrix.</p>
              <Button variant="primary" onClick={() => nav('/users')}>Open Users & Roles</Button>
            </CardBody>
          )}

          {section === 'system' && (
            <>
              <CardHeader title="System Preferences" />
              <CardBody className="flex flex-col gap-3">
                <Checkbox label="Keep demo data in this browser (localStorage)" checked disabled />
                <p className="text-[12.5px] text-muted">This prototype stores all data locally in your browser. Use Reset Demo Data (in the profile menu) to restore the original seed.</p>
              </CardBody>
            </>
          )}

          {section !== 'roles' && section !== 'system' && section !== 'delivery' && section !== 'tax' && (
            <div className="flex justify-end border-t border-line p-4">
              <Button variant="primary" onClick={save}>Save changes</Button>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
