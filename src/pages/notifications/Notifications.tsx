import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { Bell } from 'lucide-react';
import { PageHeader, Card } from '../../components/ui/Card';
import { Select } from '../../components/ui/Field';
import { Badge } from '../../components/ui/Badge';
import { EmptyState } from '../../components/ui/States';
import { useDb, useUi } from '../../store/useStore';
import { deriveNotifications, type NotificationType } from '../../domain/notifications';
import { todayISO, nowISO } from '../../lib/clock';
import { relativeTime } from '../../lib/format';

const TYPES: NotificationType[] = ['Late Order', 'Pending Approval', 'Purchase Required', 'Shortage', 'Packing Pending', 'Packing Issue', 'Dispatch Pending', 'Payment Due', 'Overdue Invoice'];

export function NotificationsPage() {
  const db = useDb();
  const nav = useNavigate();
  const markRead = useUi((s) => s.markRead);
  const [type, setType] = useState('');
  const [priority, setPriority] = useState('');
  const now = nowISO();
  const today = todayISO();

  const all = useMemo(() => deriveNotifications(db, today, now), [db, today, now]);
  const rows = all.filter((n) => (!type || n.type === type) && (!priority || n.priority === priority));

  return (
    <div>
      <PageHeader
        title="Notifications"
        description={`${all.length} active alerts across the operation`}
        actions={<button onClick={() => markRead(all.map((n) => n.id))} className="text-[13px] font-medium text-brand-700 hover:underline">Mark all read</button>}
      />
      <Card className="mb-4">
        <div className="flex flex-wrap gap-3 p-3.5">
          <Select value={type} onChange={(e) => setType(e.target.value)} placeholder="All types" options={TYPES} className="w-48" />
          <Select value={priority} onChange={(e) => setPriority(e.target.value)} placeholder="All priorities" options={['High', 'Medium', 'Low']} className="w-40" />
        </div>
      </Card>
      <Card>
        {rows.length === 0 ? (
          <EmptyState icon={Bell} title="No alerts" description="Nothing needs attention right now." />
        ) : (
          <div className="divide-y divide-line">
            {rows.map((n) => (
              <button key={n.id} onClick={() => nav(n.link)} className="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-canvas">
                <span className={`mt-1 size-2 shrink-0 rounded-full ${n.priority === 'High' ? 'bg-red-500' : n.priority === 'Medium' ? 'bg-orange-500' : 'bg-subtle'}`} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <Badge tone={n.priority === 'High' ? 'red' : n.priority === 'Medium' ? 'orange' : 'neutral'}>{n.type}</Badge>
                    <span className="text-[11px] text-subtle">{relativeTime(n.at, now)}</span>
                  </div>
                  <p className="mt-1 text-[13.5px] font-medium text-ink">{n.title}</p>
                  <p className="text-[12.5px] text-muted">{n.message}</p>
                </div>
              </button>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
