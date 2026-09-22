import { useMemo } from 'react';
import { EmptyState } from '../../components/ui/States';
import { useCurrentUser, useDb } from '../../store/useStore';
import { usePortalLedgerSync } from '../../store/useApiSync';
import { buildLedger } from '../../domain/finance';
import { API_MODE } from '../../lib/api';
import { fmtDate, inr } from '../../lib/format';

export function PortalLedgerPage() {
  const db = useDb();
  const user = useCurrentUser()!;
  const { data } = usePortalLedgerSync();

  // Computed server-side, because the running balance starts from an opening
  // balance the browser never sees.
  const rows = useMemo(
    () => (API_MODE && data ? data.rows : user.customerId ? buildLedger(db, user.customerId) : []),
    [data, db, user.customerId],
  );
  const balance = (API_MODE && data ? data.summary.closingBalance : rows.at(-1)?.balance) ?? 0;

  return (
    <div className="flex flex-col gap-3">
      <h1 className="text-[18px] font-semibold text-ink">Ledger</h1>
      <div className={`rounded-lg p-4 text-center ${balance > 0 ? 'bg-orange-50' : 'bg-emerald-50'}`}>
        <p className="text-[11.5px] font-medium text-muted">Current balance</p>
        <p className={`tabular mt-1 text-[24px] font-bold ${balance > 0 ? 'text-orange-700' : 'text-emerald-700'}`}>{inr(balance)}</p>
      </div>
      {rows.length === 0 ? (
        <EmptyState title="No ledger entries yet" />
      ) : (
        <div className="flex flex-col divide-y divide-line rounded-lg border border-line bg-white">
          {rows.map((r, i) => (
            <div key={i} className="flex items-center justify-between gap-3 px-3 py-2.5">
              <div className="min-w-0">
                <p className="truncate text-[13px] font-medium text-ink">{r.reference}</p>
                <p className="text-xs text-muted">{fmtDate(r.date)} · {r.description}</p>
              </div>
              <div className="shrink-0 text-right">
                <p className={`tabular text-[13px] font-semibold ${r.debit ? 'text-ink' : 'text-emerald-700'}`}>{r.debit ? inr(r.debit) : `−${inr(r.credit)}`}</p>
                <p className="tabular text-[11px] text-subtle">bal {inr(r.balance)}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
