import { useNavigate } from 'react-router';
import { StatusBadge } from '../../components/ui/Badge';
import { EmptyState } from '../../components/ui/States';
import { useCurrentUser, useDb } from '../../store/useStore';
import { fmtDate } from '../../lib/format';
import { todayISO } from '../../lib/clock';

export function DriverChallansPage() {
  const db = useDb();
  const user = useCurrentUser()!;
  const nav = useNavigate();
  const today = todayISO();
  const rows = db.challans.filter((c) => c.driverId === user.id && c.challanDate === today).sort((a, b) => a.challanNo < b.challanNo ? -1 : 1);

  return (
    <div className="flex flex-col gap-3">
      <h1 className="text-[18px] font-semibold text-ink">Today's challans</h1>
      {rows.length === 0 ? (
        <EmptyState title="No challans yet" description="They'll appear here once your route is packed." />
      ) : (
        rows.map((c) => {
          const customer = db.customers.find((cu) => cu.id === c.customerId);
          return (
            <button key={c.id} onClick={() => nav(`/driver/challans/${c.id}`)} className="rounded-lg border border-line bg-white p-3 text-left">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[13.5px] font-semibold text-brand-700">{c.challanNo}</p>
                <StatusBadge status={c.status} />
              </div>
              <p className="mt-0.5 text-xs text-muted">{customer?.name} · {fmtDate(c.challanDate)}</p>
            </button>
          );
        })
      )}
    </div>
  );
}
