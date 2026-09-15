import { useNavigate } from 'react-router';
import {
  AlertTriangle, ChevronRight, ClipboardCheck, ClipboardList, HandCoins, Layers, Package, PackageCheck, PackageOpen,
  PackagePlus, ShoppingCart, TrendingUp, Truck, Users, Wallet,
} from 'lucide-react';
import { Card, CardBody, CardHeader, PageHeader } from '../../components/ui/Card';
import { KpiCard, StatTile } from '../../components/ui/Kpi';
import { Button } from '../../components/ui/Button';
import { Badge, StatusBadge } from '../../components/ui/Badge';
import { Alert } from '../../components/ui/Alert';
import { EmptyState } from '../../components/ui/States';
import { useCurrentUser, useDb } from '../../store/useStore';
import { todayISO, nowISO } from '../../lib/clock';
import { addDays, fmtDate, inr, inrCompact, pct, relativeTime, weekday } from '../../lib/format';
import { deliveryBoard, liveStats, operationsTimeline, orderBoard, requirementRows, type StepState } from '../../domain/ops';
import { outstandingSummary } from '../../domain/finance';
import { deriveNotifications } from '../../domain/notifications';
import { can } from '../../lib/nav';
import { cn } from '../../lib/cn';

const STEP_DOT: Record<StepState, string> = { done: 'bg-emerald-500', active: 'bg-blue-500', pending: 'bg-[#cbd4cf]', attention: 'bg-red-500' };
const STEP_TEXT: Record<StepState, string> = { done: 'text-emerald-700', active: 'text-blue-700', pending: 'text-subtle', attention: 'text-red-700' };

export function DashboardPage() {
  const db = useDb();
  const user = useCurrentUser()!;
  const nav = useNavigate();
  const today = todayISO();
  const yesterday = addDays(today, -1);
  const now = nowISO();

  const stats = liveStats(db, today);
  const prev = db.snapshots.find((s) => s.date === yesterday);
  const delta = (key: keyof typeof stats) => {
    const p = prev?.[key] as number | undefined;
    const c = stats[key] as number;
    if (!p) return undefined;
    return Math.round(((c - p) / p) * 100);
  };

  const board = orderBoard(db, today);
  const deliveries = deliveryBoard(db, today);
  const reqs = requirementRows(db, today);
  const outstanding = outstandingSummary(db, today);
  const notifications = deriveNotifications(db, today, now).slice(0, 5);
  const cust = new Map(db.customers.map((c) => [c.id, c]));
  const recentAudit = [...db.auditLogs].filter((a) => a.at <= now).slice(0, 8);
  const userById = new Map(db.users.map((u) => [u.id, u]));
  const timeline = operationsTimeline(db, today);

  const quickActions = [
    { label: 'New Order', icon: ClipboardList, path: '/orders/new', module: 'orders' as const },
    { label: 'New Customer', icon: Users, path: '/customers/new', module: 'customers' as const },
    { label: 'Purchase Entry', icon: ShoppingCart, path: '/purchase/new', module: 'purchase' as const },
    { label: 'Receive Stock', icon: PackageOpen, path: '/receiving/new', module: 'receiving' as const },
    { label: 'Create Challan', icon: Truck, path: '/challans', module: 'delivery' as const },
  ].filter((a) => can(db, user.role, a.module, 'create'));

  const hour = new Date(now).getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  const criticalReqs = reqs.filter((r) => r.status === 'Critical').length;
  const lateOrders = board.Late.length;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title={`${greeting}, ${user.name.split(' ')[0]}`}
        description={`${weekday(today)}, ${fmtDate(today)} · Here's what's moving across the operation today.`}
        actions={quickActions.map((a) => (
          <Button key={a.label} size="sm" variant="secondary" icon={a.icon} onClick={() => nav(a.path)}>{a.label}</Button>
        ))}
      />

      {(lateOrders > 0 || outstanding.total > 0 || criticalReqs > 0) && (
        <div className="grid gap-2.5 sm:grid-cols-3">
          {lateOrders > 0 && (
            <Alert tone="warning" title={`${lateOrders} Late Order${lateOrders > 1 ? 's' : ''}`} actions={<Button size="xs" variant="secondary" onClick={() => nav('/orders?status=Late')}>Review</Button>}>
              Received after the {db.settings.orderCutoffTime} cutoff — approve or reject.
            </Alert>
          )}
          {outstanding.total > 0 && (
            <Alert tone="error" title={`${inr(outstanding.total)} Outstanding`} actions={<Button size="xs" variant="secondary" onClick={() => nav('/outstanding')}>View aging</Button>}>
              {outstanding.customers} customers with open balances, {inr(outstanding.overdue)} overdue.
            </Alert>
          )}
          {criticalReqs > 0 && (
            <Alert tone="error" title={`${criticalReqs} Critical Shortage${criticalReqs > 1 ? 's' : ''}`} actions={<Button size="xs" variant="secondary" onClick={() => nav('/purchase')}>Go to purchase</Button>}>
              These items are badly short of what customers ordered today.
            </Alert>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
        <KpiCard label="Today's Orders" value={stats.ordersReceived} deltaPct={delta('ordersReceived')} icon={ClipboardList} onClick={() => nav('/orders')} />
        <KpiCard label="Pending Approval" value={stats.pendingApproval} deltaPct={delta('pendingApproval')} deltaGoodDirection="down" icon={ClipboardCheck} tone="orange" onClick={() => nav('/orders?status=Submitted')} />
        <KpiCard label="Locked" value={stats.locked} deltaPct={delta('locked')} icon={Layers} onClick={() => nav('/consolidation')} />
        <KpiCard label="Purchase Required" value={stats.purchaseRequired} deltaPct={delta('purchaseRequired')} deltaGoodDirection="down" icon={ShoppingCart} tone={stats.purchaseRequired ? 'orange' : 'green'} onClick={() => nav('/purchase')} />
        <KpiCard label="Received Today" value={stats.receivedLines} deltaPct={delta('receivedLines')} icon={PackageOpen} onClick={() => nav('/receiving')} />
        <KpiCard label="Packing Pending" value={stats.packingPending} deltaPct={delta('packingPending')} deltaGoodDirection="down" icon={PackagePlus} tone={stats.packingPending ? 'orange' : 'green'} onClick={() => nav('/packing')} />
        <KpiCard label="Dispatch Pending" value={stats.dispatchPending} deltaPct={delta('dispatchPending')} deltaGoodDirection="down" icon={Truck} tone={stats.dispatchPending ? 'orange' : 'green'} onClick={() => nav('/delivery')} />
        <KpiCard label="Delivered" value={stats.delivered} deltaPct={delta('delivered')} icon={PackageCheck} tone="green" onClick={() => nav('/delivery')} />
        <KpiCard label="Outstanding Amount" value={inrCompact(stats.outstanding)} deltaPct={delta('outstanding')} deltaGoodDirection="down" icon={Wallet} tone="red" onClick={() => nav('/outstanding')} />
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title="Today's Operations" subtitle="Orders → Consolidation → Purchase → Receiving → Packing → Delivery" icon={<TrendingUp size={16} />} />
          <CardBody className="flex flex-col gap-3.5">
            {timeline.map((step) => (
              <button key={step.key} onClick={() => nav(step.link)} className="group flex w-full items-center gap-3 text-left">
                <span className={cn('size-2.5 shrink-0 rounded-full', STEP_DOT[step.state])} />
                <div className="w-28 shrink-0">
                  <p className={cn('text-[13px] font-semibold', STEP_TEXT[step.state])}>{step.label}</p>
                </div>
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-canvas">
                  <div className={cn('h-full rounded-full transition-all', step.state === 'attention' ? 'bg-red-500' : step.state === 'done' ? 'bg-emerald-500' : 'bg-blue-500')} style={{ width: `${step.progress}%` }} />
                </div>
                <p className="w-56 shrink-0 truncate text-right text-xs text-muted group-hover:text-ink">{step.detail}</p>
                <ChevronRight size={15} className="shrink-0 text-subtle group-hover:text-ink" />
              </button>
            ))}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Purchase Alerts" icon={<ShoppingCart size={16} />} actions={<Button size="xs" variant="ghost" onClick={() => nav('/purchase')}>View all</Button>} />
          <CardBody className="grid grid-cols-2 gap-2">
            <StatTile label="To Purchase" value={reqs.filter((r) => r.status === 'Purchase Required').length} tone="orange" />
            <StatTile label="Critical" value={reqs.filter((r) => r.status === 'Critical').length} tone="red" />
            <StatTile label="Shortage" value={reqs.filter((r) => r.shortage > 0).length} tone="red" />
            <StatTile label="Excess" value={reqs.filter((r) => r.excess > 0).length} tone="blue" />
          </CardBody>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Order Status" icon={<ClipboardList size={16} />} actions={<Button size="xs" variant="ghost" onClick={() => nav('/orders')}>Open Orders</Button>} />
          <CardBody className="grid grid-cols-3 gap-2 sm:grid-cols-6">
            {(['Draft', 'Submitted', 'Approved', 'Late', 'Rejected', 'Locked'] as const).map((k) => (
              <button key={k} onClick={() => nav(`/orders?status=${k}`)} className="rounded-lg border border-line p-2.5 text-center hover:border-brand-300 hover:bg-brand-50/50">
                <p className="tabular text-[18px] font-semibold text-ink">{board[k].length}</p>
                <StatusBadge status={k} className="mt-1" />
              </button>
            ))}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Delivery Status" icon={<Truck size={16} />} actions={<Button size="xs" variant="ghost" onClick={() => nav('/delivery')}>Open Delivery</Button>} />
          <CardBody className="grid grid-cols-3 gap-2 sm:grid-cols-6">
            {(['Packing', 'Packed', 'Dispatched', 'Delivered', 'Partial', 'Issue'] as const).map((k) => (
              <button key={k} onClick={() => nav('/delivery')} className="rounded-lg border border-line p-2.5 text-center hover:border-brand-300 hover:bg-brand-50/50">
                <p className="tabular text-[18px] font-semibold text-ink">{deliveries[k]}</p>
                <StatusBadge status={k === 'Packing' ? 'Packing' : k} className="mt-1" />
              </button>
            ))}
          </CardBody>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title="Recent Activity" icon={<ClipboardCheck size={16} />} actions={<Button size="xs" variant="ghost" onClick={() => nav('/audit-logs')}>Audit log</Button>} />
          {recentAudit.length === 0 ? (
            <EmptyState title="No activity yet today" className="py-8" />
          ) : (
            <div className="divide-y divide-line">
              {recentAudit.map((a) => (
                <div key={a.id} className="flex items-center gap-3 px-4 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] text-ink">
                      <span className="font-medium">{a.action}</span>
                      {a.customerId && <span className="text-muted"> · {cust.get(a.customerId)?.name}</span>}
                    </p>
                    <p className="truncate text-xs text-muted">{a.recordRef} · {userById.get(a.userId)?.name ?? a.userId}</p>
                  </div>
                  <Badge tone={a.status === 'Failed' ? 'red' : a.status === 'Warning' ? 'orange' : 'neutral'}>{a.status}</Badge>
                  <span className="w-16 shrink-0 text-right text-xs text-subtle">{relativeTime(a.at, now)}</span>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card>
          <CardHeader title="Alerts" icon={<AlertTriangle size={16} />} actions={<Button size="xs" variant="ghost" onClick={() => nav('/notifications')}>View all</Button>} />
          {notifications.length === 0 ? (
            <EmptyState title="No alerts" className="py-8" />
          ) : (
            <div className="divide-y divide-line">
              {notifications.map((n) => (
                <button key={n.id} onClick={() => nav(n.link)} className="flex w-full flex-col gap-1 px-4 py-2.5 text-left hover:bg-canvas">
                  <div className="flex items-center justify-between gap-2">
                    <Badge tone={n.priority === 'High' ? 'red' : n.priority === 'Medium' ? 'orange' : 'neutral'}>{n.type}</Badge>
                  </div>
                  <p className="text-[13px] font-medium text-ink">{n.title}</p>
                </button>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
