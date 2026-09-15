import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { Lock, LockOpen, Printer, ShoppingCart } from 'lucide-react';
import { PageHeader, Card, CardHeader } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Select } from '../../components/ui/Field';
import { Badge, StatusBadge } from '../../components/ui/Badge';
import { Tabs } from '../../components/ui/Tabs';
import { EmptyState } from '../../components/ui/States';
import { useConfirm } from '../../components/ui/ConfirmDialog';
import { useToast } from '../../components/ui/Toast';
import { useCurrentUser, useDb } from '../../store/useStore';
import { lockConsolidation } from '../../store/orderActions';
import { buildConsolidation, itemQuantityReport } from '../../domain/orders';
import { CATEGORIES } from '../../types/models';
import { fmtDate, fmtDateTime, num, qty, weekday } from '../../lib/format';
import { addDays } from '../../lib/format';
import { todayISO } from '../../lib/clock';

export function ConsolidationPage() {
  const db = useDb();
  const user = useCurrentUser()!;
  const nav = useNavigate();
  const confirm = useConfirm();
  const toast = useToast();
  const today = todayISO();

  const [date, setDate] = useState(addDays(today, 1));
  const [category, setCategory] = useState('');
  const [tab, setTab] = useState<'matrix' | 'itemqty'>('matrix');

  const matrix = useMemo(() => buildConsolidation(db, date), [db, date]);
  const rows = category ? matrix.rows.filter((r) => r.item.category === category) : matrix.rows;
  const lock = db.locks.find((l) => l.deliveryDate === date);
  const isLocked = !!lock;
  const pendingCount = db.orders.filter((o) => o.deliveryDate === date && (o.status === 'Submitted' || o.status === 'Late')).length;
  const itemQtyRows = itemQuantityReport({ ...matrix, rows });

  const doLock = async () => {
    const ok = await confirm({
      title: 'Lock orders for this delivery date?',
      description: `Orders can no longer be edited, and the purchase requirement generates automatically.`,
      confirmLabel: 'Lock orders',
      details: [{ label: 'Delivery date', value: fmtDate(date) }, { label: 'Orders', value: matrix.orders.length }, { label: 'Items', value: rows.length }],
    });
    if (!ok) return;
    lockConsolidation(date, user.id);
    toast({ tone: 'success', title: 'Consolidation locked', description: 'Purchase requirement generated.' });
  };

  return (
    <div>
      <PageHeader
        title="Daily Consolidation"
        description="Every approved order for one delivery date, in route order — items × customers."
        actions={
          <>
            <Button variant="secondary" icon={Printer} onClick={() => window.print()}>Print</Button>
            {!isLocked ? (
              <Button variant="primary" icon={Lock} onClick={doLock} disabled={!matrix.orders.length}>Lock Orders</Button>
            ) : (
              <Button variant="secondary" icon={ShoppingCart} onClick={() => nav('/purchase')}>View Purchase Requirement</Button>
            )}
          </>
        }
      />

      <Card className="mb-4">
        <div className="flex flex-wrap items-center gap-3 p-3.5">
          <div>
            <label className="mb-1 block text-[11.5px] font-medium text-muted">Delivery date</label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-9 rounded-lg border border-line px-3 text-[13px]" />
          </div>
          <Select value={category} onChange={(e) => setCategory(e.target.value)} placeholder="All categories" options={[...CATEGORIES]} className="mt-5 w-44" />
          <div className="ml-auto mt-5 flex items-center gap-2">
            {isLocked ? (
              <Badge tone="violet" dot><Lock size={11} className="mr-1 inline" />Locked · {fmtDateTime(lock!.lockedAt)}</Badge>
            ) : (
              <Badge tone="neutral" dot><LockOpen size={11} className="mr-1 inline" />Open for changes</Badge>
            )}
            {pendingCount > 0 && !isLocked && <Badge tone="orange">{pendingCount} awaiting approval</Badge>}
          </div>
        </div>
      </Card>

      {matrix.orders.length === 0 ? (
        <Card><EmptyState title="No approved orders yet" description={`No orders are approved for ${fmtDate(date)} delivery. Approve orders first — they'll appear here automatically.`} action={<Button size="sm" variant="primary" onClick={() => nav('/orders?status=Submitted')} className="mt-1">Review pending orders</Button>} /></Card>
      ) : (
        <Card>
          <CardHeader
            title={`${weekday(date)}, ${fmtDate(date)}`}
            subtitle={`${matrix.customers.length} customers · ${rows.length} items · ${matrix.lineCount} lines`}
            actions={<Tabs variant="pill" value={tab} onChange={(k) => setTab(k as any)} items={[{ key: 'matrix', label: 'Matrix' }, { key: 'itemqty', label: 'Item Quantity' }]} />}
          />
          <div className="print-area">
            {tab === 'matrix' ? (
              <div className="scrollbar-thin overflow-x-auto">
                <table className="w-full border-collapse text-[12px]">
                  <thead>
                    <tr className="border-b border-line bg-canvas/70">
                      <th className="sticky left-0 z-10 min-w-[170px] bg-canvas/70 px-3 py-2 text-left text-[11px] font-semibold uppercase">Item</th>
                      {matrix.customers.map((c) => (
                        <th key={c.id} className="min-w-[64px] px-1.5 py-2 text-center text-[10px] font-semibold text-muted" title={c.name}>
                          {c.routeCode}<br />{c.shortLabel}
                        </th>
                      ))}
                      <th className="min-w-[64px] bg-brand-50 px-2 py-2 text-center text-[11px] font-semibold text-brand-800">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr key={row.item.id} className="border-b border-line hover:bg-brand-50/30">
                        <td className="sticky left-0 z-10 bg-white px-3 py-1.5 font-medium whitespace-nowrap text-ink">
                          {row.item.name} <span className="text-subtle">({row.item.unit})</span>
                        </td>
                        {matrix.customers.map((c) => {
                          const v = row.byCustomer.get(c.id);
                          return <td key={c.id} className="tabular px-1.5 py-1.5 text-center text-ink">{v ? num(v) : ''}</td>;
                        })}
                        <td className="tabular bg-brand-50/60 px-2 py-1.5 text-center font-semibold text-brand-800">{num(row.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="scrollbar-thin overflow-x-auto">
                <table className="w-full border-collapse text-[13px]">
                  <thead>
                    <tr className="border-b border-line bg-canvas/70 text-[11.5px] font-semibold uppercase text-muted">
                      <th className="px-3 py-2 text-left">Category</th>
                      <th className="px-3 py-2 text-left">Item</th>
                      <th className="px-3 py-2 text-right">Total Quantity</th>
                      <th className="px-3 py-2 text-right">Customers</th>
                    </tr>
                  </thead>
                  <tbody>
                    {itemQtyRows.map((r) => (
                      <tr key={r.item.id} className="border-b border-line last:border-0">
                        <td className="px-3 py-1.5 text-muted">{r.item.category}</td>
                        <td className="px-3 py-1.5 font-medium text-ink">{r.item.name}</td>
                        <td className="tabular px-3 py-1.5 text-right font-semibold">{qty(r.totalQty, r.item.unit)}</td>
                        <td className="tabular px-3 py-1.5 text-right text-muted">{r.customerCount}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </Card>
      )}
    </div>
  );
}
