import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { Bell, CheckCheck } from 'lucide-react';
import { IconButton } from '../ui/Button';
import { DropdownPanel, useClickOutside } from '../ui/Overlay';
import { Badge, statusTone } from '../ui/Badge';
import { EmptyState } from '../ui/States';
import { useDb, useUi } from '../../store/useStore';
import { deriveNotifications } from '../../domain/notifications';
import { todayISO, nowISO } from '../../lib/clock';
import { relativeTime } from '../../lib/format';

export function NotificationsMenu() {
  const db = useDb();
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useClickOutside<HTMLDivElement>(() => setOpen(false));
  const readIds = useUi((s) => s.readNotificationIds);
  const markRead = useUi((s) => s.markRead);
  const now = nowISO();
  const notifications = useMemo(() => deriveNotifications(db, todayISO(), now), [db, now]);
  const unread = notifications.filter((n) => !readIds.includes(n.id));

  return (
    <div className="relative" ref={ref}>
      <IconButton
        icon={Bell}
        label="Notifications"
        badge={unread.length}
        onClick={() => {
          setOpen((v) => !v);
          if (!open) markRead(notifications.map((n) => n.id));
        }}
      />
      {open && (
        <DropdownPanel className="top-full right-0 mt-1.5 w-96 py-0">
          <div className="flex items-center justify-between border-b border-line px-3.5 py-2.5">
            <p className="text-[13px] font-semibold text-ink">Notifications</p>
            <button
              onClick={() => nav('/notifications')}
              className="flex items-center gap-1 text-xs font-medium text-brand-700 hover:underline"
            >
              View all <CheckCheck size={12} />
            </button>
          </div>
          <div className="scrollbar-thin max-h-96 overflow-y-auto">
            {notifications.length === 0 ? (
              <EmptyState title="All caught up" description="No alerts right now." className="py-8" />
            ) : (
              notifications.slice(0, 8).map((n) => (
                <button
                  key={n.id}
                  onClick={() => { nav(n.link); setOpen(false); }}
                  className="flex w-full flex-col gap-1 border-b border-line px-3.5 py-2.5 text-left last:border-0 hover:bg-canvas"
                >
                  <div className="flex items-center justify-between gap-2">
                    <Badge tone={statusTone(n.priority)}>{n.type}</Badge>
                    <span className="text-[11px] text-subtle">{relativeTime(n.at, now)}</span>
                  </div>
                  <p className="text-[13px] font-medium text-ink">{n.title}</p>
                  <p className="line-clamp-2 text-xs text-muted">{n.message}</p>
                </button>
              ))
            )}
          </div>
        </DropdownPanel>
      )}
    </div>
  );
}
