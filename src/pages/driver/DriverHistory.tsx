import { useState } from 'react';
import { useNavigate } from 'react-router';
import { StatusBadge } from '../../components/ui/Badge';
import { EmptyState } from '../../components/ui/States';
import { SearchInput } from '../../components/ui/Field';
import { useCurrentUser, useDb } from '../../store/useStore';
import { fmtDate } from '../../lib/format';

export function DriverHistoryPage() {
  const db = useDb();
  const user = useCurrentUser()!;
  const nav = useNavigate();
  const [search, setSearch] = useState('');

  const term = search.trim().toLowerCase();
  const rows = db.challans
    .filter((c) => c.driverId === user.id && (c.status === 'Delivered' || c.status === 'Partial' || c.status === 'Failed'))
    .filter((c) => {
      const cust = db.customers.find((cu) => cu.id === c.customerId);
      return !term || c.challanNo.toLowerCase().includes(term) || cust?.name.toLowerCase().includes(term);
    })
    .sort((a, b) => (a.challanDate < b.challanDate ? 1 : -1));

  return (
    <div className="flex flex-col gap-3">
      <h1 className="text-[18px] font-semibold text-ink">Delivery history</h1>
      <SearchInput value={search} onChange={setSearch} placeholder="Search customer or challan…" />
      {rows.length === 0 ? (
        <EmptyState title="No deliveries yet" />
      ) : (
        rows.map((c) => {
          const customer = db.customers.find((cu) => cu.id === c.customerId);
          return (
            <button key={c.id} onClick={() => nav(`/driver/challans/${c.id}`)} className="rounded-lg border border-line bg-white p-3 text-left">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[13.5px] font-semibold text-ink">{customer?.name}</p>
                <StatusBadge status={c.status} />
              </div>
              <p className="mt-0.5 text-xs text-muted">{c.challanNo} · {fmtDate(c.challanDate)}</p>
            </button>
          );
        })
      )}
    </div>
  );
}
