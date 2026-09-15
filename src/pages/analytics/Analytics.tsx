import { useMemo } from 'react';
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { PageHeader, Card, CardHeader } from '../../components/ui/Card';
import { useDb } from '../../store/useStore';
import { salesByCustomer, salesByItem, deliveryReport } from '../../domain/reports';
import { addDays, inr, inrCompact } from '../../lib/format';
import { todayISO } from '../../lib/clock';

const GREEN = '#2f7f50';
const FRESH = '#3aa64b';
const ORANGE = '#f97316';
const RED = '#ef4444';
const BLUE = '#3b82f6';
const AXIS = { fontSize: 11, fill: '#8a968e' };
const tooltipStyle = { fontSize: 12, borderRadius: 8, border: '1px solid #e3e8e4', boxShadow: '0 4px 12px rgba(16,40,26,0.1)' };

export function AnalyticsPage() {
  const db = useDb();
  const today = todayISO();
  const from = addDays(today, -29);

  const volumeData = useMemo(
    () => db.snapshots.filter((s) => s.date >= from).map((s) => ({ date: s.date.slice(5), orders: s.ordersReceived })).sort((a, b) => (a.date < b.date ? -1 : 1)),
    [db.snapshots, from],
  );
  const outstandingData = useMemo(
    () => db.snapshots.filter((s) => s.date >= from).map((s) => ({ date: s.date.slice(5), outstanding: s.outstanding })).sort((a, b) => (a.date < b.date ? -1 : 1)),
    [db.snapshots, from],
  );
  const salesVsPurchase = useMemo(
    () => db.snapshots.filter((s) => s.date >= from).map((s) => ({ date: s.date.slice(5), sales: s.salesValue })).sort((a, b) => (a.date < b.date ? -1 : 1)),
    [db.snapshots, from],
  );
  const topCustomers = useMemo(() => salesByCustomer(db, from, today).slice(0, 8).map((c) => ({ name: c.name.length > 16 ? c.name.slice(0, 15) + '…' : c.name, amount: c.amount })), [db, from, today]);
  const topItems = useMemo(() => salesByItem(db, from, today).slice(0, 8).map((i) => ({ name: `${i.name} (${i.unit})`.length > 20 ? i.name.slice(0, 16) + '… ' + `(${i.unit})` : `${i.name} (${i.unit})`, amount: i.amount })), [db, from, today]);
  const delivery = useMemo(() => deliveryReport(db, from, today).map((d) => ({ date: d.date.slice(5), delivered: d.delivered, partial: d.partial, failed: d.failed })), [db, from, today]);
  const fulfillment = useMemo(() => {
    const rows = deliveryReport(db, from, today);
    return rows.map((d) => ({ date: d.date.slice(5), pct: d.onTimePct }));
  }, [db, from, today]);

  const fulfilledOrders = db.orders.filter((o) => o.orderDate >= from && (o.status === 'Completed' || o.status === 'Partially Fulfilled')).length;
  const totalClosedOrders = db.orders.filter((o) => o.orderDate >= from && ['Completed', 'Partially Fulfilled', 'Rejected'].includes(o.status)).length;
  const fulfillmentRate = totalClosedOrders ? Math.round((fulfilledOrders / totalClosedOrders) * 100) : 0;

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Analytics" description="Last 30 days · volume, sales, delivery performance and fulfilment." />

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="Daily Order Volume">
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={volumeData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e3e8e4" vertical={false} />
              <XAxis dataKey="date" tick={AXIS} axisLine={false} tickLine={false} />
              <YAxis tick={AXIS} axisLine={false} tickLine={false} width={28} />
              <Tooltip contentStyle={tooltipStyle} />
              <Line type="monotone" dataKey="orders" stroke={GREEN} strokeWidth={2} dot={false} name="Orders" />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Outstanding Trend">
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={outstandingData}>
              <defs>
                <linearGradient id="outstandingFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={ORANGE} stopOpacity={0.35} />
                  <stop offset="100%" stopColor={ORANGE} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#e3e8e4" vertical={false} />
              <XAxis dataKey="date" tick={AXIS} axisLine={false} tickLine={false} />
              <YAxis tick={AXIS} axisLine={false} tickLine={false} width={40} tickFormatter={(v) => inrCompact(v)} />
              <Tooltip contentStyle={tooltipStyle} formatter={(v: any) => inr(v)} />
              <Area type="monotone" dataKey="outstanding" stroke={ORANGE} fill="url(#outstandingFill)" strokeWidth={2} name="Outstanding" />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Top Customers (by sales)">
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={topCustomers} layout="vertical" margin={{ left: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e3e8e4" horizontal={false} />
              <XAxis type="number" tick={AXIS} axisLine={false} tickLine={false} tickFormatter={(v) => inrCompact(v)} />
              <YAxis type="category" dataKey="name" tick={AXIS} axisLine={false} tickLine={false} width={110} />
              <Tooltip contentStyle={tooltipStyle} formatter={(v: any) => inr(v)} />
              <Bar dataKey="amount" fill={GREEN} radius={[0, 4, 4, 0]} name="Sales" />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Top Items (by sales)">
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={topItems} layout="vertical" margin={{ left: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e3e8e4" horizontal={false} />
              <XAxis type="number" tick={AXIS} axisLine={false} tickLine={false} tickFormatter={(v) => inrCompact(v)} />
              <YAxis type="category" dataKey="name" tick={AXIS} axisLine={false} tickLine={false} width={130} />
              <Tooltip contentStyle={tooltipStyle} formatter={(v: any) => inr(v)} />
              <Bar dataKey="amount" fill={FRESH} radius={[0, 4, 4, 0]} name="Sales" />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Sales Value">
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={salesVsPurchase}>
              <defs>
                <linearGradient id="salesFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={GREEN} stopOpacity={0.3} />
                  <stop offset="100%" stopColor={GREEN} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#e3e8e4" vertical={false} />
              <XAxis dataKey="date" tick={AXIS} axisLine={false} tickLine={false} />
              <YAxis tick={AXIS} axisLine={false} tickLine={false} width={40} tickFormatter={(v) => inrCompact(v)} />
              <Tooltip contentStyle={tooltipStyle} formatter={(v: any) => inr(v)} />
              <Area type="monotone" dataKey="sales" stroke={GREEN} fill="url(#salesFill)" strokeWidth={2} name="Sales" />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Delivery Performance">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={delivery}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e3e8e4" vertical={false} />
              <XAxis dataKey="date" tick={AXIS} axisLine={false} tickLine={false} />
              <YAxis tick={AXIS} axisLine={false} tickLine={false} width={28} />
              <Tooltip contentStyle={tooltipStyle} />
              <Bar dataKey="delivered" stackId="d" fill={GREEN} name="Delivered" radius={[0, 0, 0, 0]} />
              <Bar dataKey="partial" stackId="d" fill={ORANGE} name="Partial" />
              <Bar dataKey="failed" stackId="d" fill={RED} name="Failed" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Order Fulfilment Rate (%)">
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={fulfillment}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e3e8e4" vertical={false} />
              <XAxis dataKey="date" tick={AXIS} axisLine={false} tickLine={false} />
              <YAxis tick={AXIS} axisLine={false} tickLine={false} width={30} domain={[0, 100]} />
              <Tooltip contentStyle={tooltipStyle} formatter={(v: any) => `${v}%`} />
              <Line type="monotone" dataKey="pct" stroke={BLUE} strokeWidth={2} dot={false} name="Fulfilled %" />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        <Card className="flex flex-col items-center justify-center gap-1 p-6 text-center">
          <p className="text-[12px] font-medium text-muted">30-day Order Fulfilment Rate</p>
          <p className="tabular text-[36px] font-bold text-brand-700">{fulfillmentRate}%</p>
          <p className="text-[11.5px] text-subtle">{fulfilledOrders} of {totalClosedOrders} closed orders fully or partially fulfilled</p>
        </Card>
      </div>
    </div>
  );
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader title={title} />
      <div className="p-3">{children}</div>
    </Card>
  );
}
