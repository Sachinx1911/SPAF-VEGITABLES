import { useMemo, useState } from "react";
import { useNavigate } from "react-router";
import {
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  Line,
  Bar,
  ComposedChart,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts";
import {
  AlertTriangle,
  CalendarClock,
  ChevronRight,
  Download,
  Ellipsis,
  Grid3x3,
  LayoutList,
  Search,
  TrendingUp,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { Button } from "../../components/ui/Button";
import { Input, Select, Switch } from "../../components/ui/Field";
import { EmptyState } from "../../components/ui/States";
import {
  FilterPanel,
  FilterField,
  FilterToggle,
} from "../../components/ui/FilterPanel";
import { useDb } from "../../store/useStore";
import { useOutstandingSync } from "../../store/useApiSync";
import { API_MODE } from "../../lib/api";
import {
  customerAgingRows,
  outstandingAsOf,
  outstandingSummary,
  type CustomerAgingRow,
} from "../../domain/finance";
import { CUSTOMER_TYPES } from "../../types/models";
import { fmtDate, inr, inrCompact, addDays } from "../../lib/format";
import { todayISO } from "../../lib/clock";
import { cn } from "../../lib/cn";

const TOOLTIP = {
  fontSize: 12,
  borderRadius: 8,
  border: "1px solid #e3e8e4",
  boxShadow: "0 4px 12px rgba(16,40,26,0.1)",
};
const TYPE_COLOR: Record<string, string> = {
  Hotel: "#22683f",
  Restaurant: "#f59e0b",
  Cafe: "#3b82f6",
  Caterer: "#8b5cf6",
  Corporate: "#ec4899",
  Other: "#94a3b8",
};

const TABS = [
  { key: "all", label: "All Customers" },
  { key: "current", label: "Current" },
  { key: "1_30", label: "1 - 30 Days" },
  { key: "31_60", label: "31 - 60 Days" },
  { key: "61_90", label: "61 - 90 Days" },
  { key: "90plus", label: "> 90 Days" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

const bucketOf = (r: CustomerAgingRow, tab: TabKey) => {
  if (tab === "current") return r.current;
  if (tab === "1_30") return r.d1_30;
  if (tab === "31_60") return r.d31_60;
  if (tab === "61_90") return r.d61_90;
  if (tab === "90plus") return r.d90plus;
  return r.total;
};

export function OutstandingPage() {
  const db = useDb();
  const nav = useNavigate();
  const today = todayISO();

  const [tab, setTab] = useState<TabKey>("all");
  const [search, setSearch] = useState("");
  const [type, setType] = useState("");
  const [city, setCity] = useState("");
  const [view, setView] = useState<"grid" | "list">("grid");
  const [showFilters, setShowFilters] = useState(false);
  const [minAmount, setMinAmount] = useState("");
  const [overdueOnly, setOverdueOnly] = useState(false);

  const { data: apiOutstanding } = useOutstandingSync(today);

  const custById = useMemo(() => new Map(db.customers.map((c) => [c.id, c])), [db.customers]);

  const allRows = useMemo((): CustomerAgingRow[] => {
    if (API_MODE && apiOutstanding) {
      return apiOutstanding.rows.flatMap((r) => {
        const customer = custById.get(r.customerId);
        if (!customer) return [];
        return [{
          customer,
          total: r.total, current: r.current, d1_30: r.d1_30, d31_60: r.d31_60, d61_90: r.d61_90, d90plus: r.d90plus,
          invoiceCount: r.invoiceCount, oldestDueDate: r.oldestDueDate, status: r.status,
        }];
      });
    }
    return customerAgingRows(db, today);
  }, [db, today, apiOutstanding, custById]);

  const summary = useMemo(() => {
    if (API_MODE && apiOutstanding) {
      return {
        total: apiOutstanding.summary.total, overdue: apiOutstanding.summary.overdue,
        dueToday: 0, dueSoon: 0,
        aging: Object.entries(apiOutstanding.summary.buckets).map(([label, amount]) => ({ label, amount, count: 0 })),
        customers: apiOutstanding.summary.customers,
      };
    }
    return outstandingSummary(db, today);
  }, [db, today, apiOutstanding]);
  const cities = useMemo(
    () =>
      [...new Set(db.customers.map((c) => c.location).filter(Boolean))].sort(),
    [db.customers],
  );

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return allRows
      .filter((r) => bucketOf(r, tab) > 0)
      .filter(
        (r) =>
          !term ||
          r.customer.name.toLowerCase().includes(term) ||
          r.customer.code.toLowerCase().includes(term),
      )
      .filter((r) => !type || r.customer.type === type)
      .filter((r) => !city || r.customer.location === city)
      .filter((r) => !minAmount || r.total >= Number(minAmount))
      .filter((r) => !overdueOnly || r.status === "Overdue");
  }, [allRows, tab, search, type, city, minAmount, overdueOnly]);

  const [page, setPage] = useState(1);
  const pageSize = 10;
  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const pageRows = rows.slice((page - 1) * pageSize, page * pageSize);

  const activeFilters = [
    search,
    type,
    city,
    minAmount,
    overdueOnly ? "y" : "",
  ].filter(Boolean).length;
  const clearFilters = () => {
    setSearch("");
    setType("");
    setCity("");
    setMinAmount("");
    setOverdueOnly(false);
    setPage(1);
  };

  const tabCount = (key: TabKey) =>
    allRows.filter((r) => bucketOf(r, key) > 0).length;

  const over60 = allRows.reduce((s, r) => s + r.d61_90 + r.d90plus, 0);
  const lastMonthTotal = outstandingAsOf(db, addDays(today, -30));
  const vsLastMonth =
    lastMonthTotal > summary.total * 0.1
      ? Math.max(
          -99,
          Math.min(
            99,
            Math.round(
              ((summary.total - lastMonthTotal) / lastMonthTotal) * 100,
            ),
          ),
        )
      : 0;

  const byType = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of allRows)
      m.set(r.customer.type, (m.get(r.customer.type) ?? 0) + r.total);
    return [...m.entries()].map(([name, value]) => ({
      name,
      value,
      color: TYPE_COLOR[name] ?? "#94a3b8",
    }));
  }, [allRows]);

  const trend = useMemo(() => {
    const months: { label: string; amount: number; customers: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = addDays(today, -30 * i);
      const label = new Date(d).toLocaleDateString("en-IN", { month: "short" });
      const amount = outstandingAsOf(db, d);
      const customers = new Set(
        db.invoices
          .filter(
            (inv) =>
              inv.invoiceDate <= d &&
              inv.total >
                db.payments
                  .filter((p) => p.invoiceId === inv.id && p.paymentDate <= d)
                  .reduce((s, p) => s + p.amount, 0),
          )
          .map((inv) => inv.customerId),
      ).size;
      months.push({ label, amount, customers });
    }
    return months;
  }, [db, today]);

  const collected = db.payments.reduce((s, p) => {
    const d = p.paymentDate.slice(0, 7);
    return d === today.slice(0, 7) ? s + p.amount : s;
  }, 0);
  const billedMTD = db.invoices.reduce(
    (s, inv) =>
      inv.invoiceDate.slice(0, 7) === today.slice(0, 7) ? s + inv.total : s,
    0,
  );
  const collectionRate = billedMTD
    ? Math.min(100, Math.round((collected / billedMTD) * 100))
    : 0;

  const topCustomers = [...allRows].slice(0, 5);
  const reminders = [...allRows]
    .filter((r) => r.status === "Overdue" || r.current > 0)
    .sort((a, b) =>
      a.status === b.status ? 0 : a.status === "Overdue" ? -1 : 1,
    )
    .slice(0, 5);

  const exportCsv = () => {
    const head = [
      "Customer",
      "Code",
      "City",
      "Total Outstanding",
      "Current",
      "1-30",
      "31-60",
      "61-90",
      "90+",
    ];
    const body = rows.map((r) => [
      r.customer.name,
      r.customer.code,
      r.customer.location,
      r.total,
      r.current,
      r.d1_30,
      r.d31_60,
      r.d61_90,
      r.d90plus,
    ]);
    const csv = [head, ...body]
      .map((line) => line.map((v) => `"${String(v)}"`).join(","))
      .join("\r\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(
      new Blob([csv], { type: "text/csv;charset=utf-8;" }),
    );
    a.download = `outstanding-${today}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  return (
    <div className="flex flex-col gap-4">
      <nav className="flex items-center gap-1 text-[12.5px] text-muted">
        <span>Finance</span>
        <ChevronRight size={13} className="text-subtle" />
        <span className="font-medium text-ink">Outstanding</span>
      </nav>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 max-w-md">
          <h1 className="text-[26px] leading-tight font-bold tracking-[-0.01em] text-ink">
            Outstanding Management
          </h1>
          <p className="mt-1 text-[13px] text-muted">
            Track customer-wise outstanding amounts, aging analysis and follow
            up on pending payments.
          </p>
        </div>
        <Button variant="primary" icon={Download} onClick={exportCsv}>
          Export Report
        </Button>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex min-w-0 flex-col gap-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Kpi
              icon={Wallet}
              tone="bg-red-50 text-red-500"
              value={inr(summary.total)}
              label="Total Outstanding"
              note={`${vsLastMonth >= 0 ? "↑" : "↓"} ${Math.abs(vsLastMonth)}% vs last month`}
            />
            <Kpi
              icon={Users}
              tone="bg-blue-50 text-blue-600"
              value={String(allRows.length)}
              label="Customers with Dues"
              note={`${db.customers.length ? Math.round((allRows.length / db.customers.length) * 100) : 0}% of total`}
            />
            <Kpi
              icon={CalendarClock}
              tone="bg-orange-50 text-orange-600"
              value={inr(summary.overdue)}
              label="Overdue Amount"
              note={`${summary.total ? Math.round((summary.overdue / summary.total) * 100) : 0}% of total`}
            />
            <Kpi
              icon={AlertTriangle}
              tone="bg-violet-50 text-violet-600"
              value={inr(over60)}
              label="> 60 Days Outstanding"
              note={`${summary.total ? Math.round((over60 / summary.total) * 100) : 0}% of total`}
            />
          </div>

          <div className="overflow-hidden rounded-card border border-line bg-white shadow-card">
            <div className="flex gap-1 overflow-x-auto border-b border-line px-3 pt-2">
              {TABS.map((t) => (
                <button
                  key={t.key}
                  onClick={() => {
                    setTab(t.key);
                    setPage(1);
                  }}
                  className={cn(
                    "flex shrink-0 items-center gap-1.5 border-b-2 px-3 pb-2.5 text-[13px] font-semibold whitespace-nowrap transition-colors",
                    tab === t.key
                      ? "border-brand-700 text-brand-800"
                      : "border-transparent text-muted hover:text-ink",
                  )}
                >
                  {t.label}{" "}
                  <span className="tabular text-[11px] text-subtle">
                    ({tabCount(t.key)})
                  </span>
                </button>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-2.5 border-b border-line px-3 py-3">
              <Input
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                placeholder="Search by customer name, code, city…"
                leading={<Search size={15} />}
                className="w-full sm:w-64"
              />
              <Select
                value={type}
                onChange={(e) => {
                  setType(e.target.value);
                  setPage(1);
                }}
                placeholder="All Customer Types"
                options={[...CUSTOMER_TYPES]}
                className="w-44"
              />
              <Select
                value={city}
                onChange={(e) => {
                  setCity(e.target.value);
                  setPage(1);
                }}
                placeholder="All Cities"
                options={cities}
                className="w-36"
              />
              <span className="flex items-center gap-1.5 text-[12.5px] text-muted">
                As on {fmtDate(today)}
              </span>
              <FilterToggle
                open={showFilters}
                activeCount={activeFilters}
                onToggle={() => setShowFilters((v) => !v)}
              />
              <div className="ml-auto flex items-center gap-1 rounded-lg border border-line p-0.5">
                <button
                  onClick={() => setView("grid")}
                  className={cn(
                    "grid size-7 place-items-center rounded-md",
                    view === "grid" ? "bg-brand-800 text-white" : "text-muted",
                  )}
                >
                  <Grid3x3 size={14} />
                </button>
                <button
                  onClick={() => setView("list")}
                  className={cn(
                    "grid size-7 place-items-center rounded-md",
                    view === "list" ? "bg-brand-800 text-white" : "text-muted",
                  )}
                >
                  <LayoutList size={14} />
                </button>
              </div>
            </div>

            <FilterPanel
              open={showFilters}
              onClear={clearFilters}
              canClear={activeFilters > 0}
            >
              <FilterField label="Outstanding at least (₹)">
                <Input
                  type="number"
                  min={0}
                  value={minAmount}
                  onChange={(e) => {
                    setMinAmount(e.target.value);
                    setPage(1);
                  }}
                  placeholder="0"
                  className="w-36"
                />
              </FilterField>
              <FilterField label="Overdue only">
                <Switch
                  checked={overdueOnly}
                  onChange={(v) => {
                    setOverdueOnly(v);
                    setPage(1);
                  }}
                  label="Hide customers within terms"
                />
              </FilterField>
            </FilterPanel>

            {rows.length === 0 ? (
              <EmptyState
                icon={Wallet}
                title="No outstanding dues"
                description="Nothing matches this filter."
              />
            ) : (
              <>
                <div className="scrollbar-thin overflow-x-auto">
                  <table className="w-full border-collapse text-[12.5px]">
                    <thead>
                      <tr className="border-b border-line bg-canvas/70 text-[11px] font-semibold tracking-wide text-subtle uppercase">
                        <th className="w-10 px-2 py-2.5 text-center">#</th>
                        <th className="px-3 py-2.5 text-left">Customer Name</th>
                        <th className="px-3 py-2.5 text-left">Customer Code</th>
                        <th className="px-3 py-2.5 text-left">City</th>
                        <th className="px-3 py-2.5 text-right">
                          Total Outstanding (₹)
                        </th>
                        <th className="px-3 py-2.5 text-right">Current</th>
                        <th className="px-3 py-2.5 text-right">1-30 Days</th>
                        <th className="px-3 py-2.5 text-right">31-60 Days</th>
                        <th className="px-3 py-2.5 text-right">61-90 Days</th>
                        <th className="px-3 py-2.5 text-right">&gt; 90 Days</th>
                        <th className="w-10 px-2 py-2.5" />
                      </tr>
                    </thead>
                    <tbody>
                      {pageRows.map((r, i) => (
                        <tr
                          key={r.customer.id}
                          className="cursor-pointer border-b border-line last:border-0 hover:bg-fresh-50/40"
                          onClick={() => nav(`/customers/${r.customer.id}`)}
                        >
                          <td className="tabular px-2 py-2.5 text-center text-subtle">
                            {(page - 1) * pageSize + i + 1}
                          </td>
                          <td className="px-3 py-2.5 font-medium whitespace-nowrap text-ink">
                            {r.customer.name}
                          </td>
                          <td className="px-3 py-2.5 text-muted">
                            {r.customer.code}
                          </td>
                          <td className="px-3 py-2.5 text-muted">
                            {r.customer.location}
                          </td>
                          <td className="tabular px-3 py-2.5 text-right font-semibold text-ink">
                            {inr(r.total)}
                          </td>
                          <td className="tabular px-3 py-2.5 text-right text-muted">
                            {r.current ? inr(r.current) : "-"}
                          </td>
                          <td className="tabular px-3 py-2.5 text-right text-muted">
                            {r.d1_30 ? inr(r.d1_30) : "-"}
                          </td>
                          <td className="tabular px-3 py-2.5 text-right text-muted">
                            {r.d31_60 ? inr(r.d31_60) : "-"}
                          </td>
                          <td className="tabular px-3 py-2.5 text-right text-muted">
                            {r.d61_90 ? inr(r.d61_90) : "-"}
                          </td>
                          <td className="tabular px-3 py-2.5 text-right text-muted">
                            {r.d90plus ? inr(r.d90plus) : "-"}
                          </td>
                          <td
                            className="px-2 py-2.5 text-center text-subtle"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <Ellipsis size={15} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line px-3.5 py-2.5 text-[12.5px] text-muted">
                  <span>
                    Showing {(page - 1) * pageSize + 1} to{" "}
                    {Math.min(page * pageSize, rows.length)} of {rows.length}{" "}
                    customers
                  </span>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={page <= 1}
                      onClick={() => setPage((p) => p - 1)}
                    >
                      ‹
                    </Button>
                    {Array.from({ length: totalPages }, (_, i) => i + 1).map(
                      (p) => (
                        <button
                          key={p}
                          onClick={() => setPage(p)}
                          className={cn(
                            "grid size-7 place-items-center rounded-md text-[12.5px] font-medium",
                            p === page
                              ? "bg-brand-800 text-white"
                              : "text-muted hover:bg-canvas",
                          )}
                        >
                          {p}
                        </button>
                      ),
                    )}
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={page >= totalPages}
                      onClick={() => setPage((p) => p + 1)}
                    >
                      ›
                    </Button>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* -------------------------------------------------- bottom charts */}
          <div className="grid gap-4 lg:grid-cols-3">
            <SideCard icon={Users} title="Outstanding by Customer Type">
              <div className="flex items-center gap-3 p-4">
                <div className="h-32 w-32 shrink-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={byType}
                        dataKey="value"
                        nameKey="name"
                        innerRadius={38}
                        outerRadius={58}
                        paddingAngle={2}
                      >
                        {byType.map((s) => (
                          <Cell key={s.name} fill={s.color} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={TOOLTIP}
                        formatter={(v: any) => inr(Number(v))}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                  {byType.map((s) => (
                    <div
                      key={s.name}
                      className="flex items-center gap-1.5 text-[11.5px]"
                    >
                      <span
                        className="size-2 shrink-0 rounded-full"
                        style={{ background: s.color }}
                      />
                      <span className="min-w-0 flex-1 truncate text-muted">
                        {s.name}
                      </span>
                      <span className="tabular font-semibold text-ink">
                        {summary.total
                          ? Math.round((s.value / summary.total) * 100)
                          : 0}
                        %
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </SideCard>

            <SideCard icon={TrendingUp} title="Outstanding Trend">
              <div className="h-44 p-3">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={trend}>
                    <CartesianGrid vertical={false} stroke="#e3e8e4" />
                    <XAxis
                      dataKey="label"
                      tick={{ fontSize: 11 }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      yAxisId="l"
                      tick={{ fontSize: 10 }}
                      axisLine={false}
                      tickLine={false}
                      tickFormatter={(v) => inrCompact(v)}
                    />
                    <YAxis
                      yAxisId="r"
                      orientation="right"
                      tick={{ fontSize: 10 }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip
                      contentStyle={TOOLTIP}
                      formatter={(v: any, n: any) =>
                        n === "amount" ? inr(Number(v)) : v
                      }
                    />
                    <Bar
                      yAxisId="l"
                      dataKey="amount"
                      fill="#3aa64b"
                      radius={[4, 4, 0, 0]}
                      barSize={18}
                      name="Outstanding Amount"
                    />
                    <Line
                      yAxisId="r"
                      type="monotone"
                      dataKey="customers"
                      stroke="#f59e0b"
                      strokeWidth={2}
                      dot={{ r: 3 }}
                      name="No. of Customers"
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </SideCard>

            <SideCard icon={Wallet} title="Collection Efficiency">
              <div className="flex flex-col items-center gap-2 p-4">
                <div
                  className="grid size-24 shrink-0 place-items-center rounded-full"
                  style={{
                    background: `conic-gradient(#22683f ${collectionRate * 3.6}deg, #e3e8e4 0deg)`,
                  }}
                >
                  <div className="grid size-[76px] place-items-center rounded-full bg-white text-center">
                    <div>
                      <p className="tabular text-[19px] leading-none font-bold text-ink">
                        {collectionRate}%
                      </p>
                      <p className="text-[9.5px] text-subtle">
                        Collection Rate
                      </p>
                    </div>
                  </div>
                </div>
                <div className="flex w-full justify-between text-[11.5px]">
                  <div>
                    <p className="text-subtle">Total Billed (MTD)</p>
                    <p className="tabular font-semibold text-ink">
                      {inr(billedMTD)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-subtle">Collected (MTD)</p>
                    <p className="tabular font-semibold text-ink">
                      {inr(collected)}
                    </p>
                  </div>
                </div>
              </div>
            </SideCard>
          </div>
        </div>

        {/* ================================================ right sidebar */}
        <div className="flex flex-col gap-4">
          <SideCard icon={AlertTriangle} title="Aging Summary">
            <div className="flex flex-col gap-3 px-4 py-3.5">
              {[
                {
                  label: "Current",
                  amount: allRows.reduce((s, r) => s + r.current, 0),
                  color: "#3aa64b",
                },
                {
                  label: "1 - 30 Days",
                  amount: allRows.reduce((s, r) => s + r.d1_30, 0),
                  color: "#f59e0b",
                },
                {
                  label: "31 - 60 Days",
                  amount: allRows.reduce((s, r) => s + r.d31_60, 0),
                  color: "#f97316",
                },
                {
                  label: "61 - 90 Days",
                  amount: allRows.reduce((s, r) => s + r.d61_90, 0),
                  color: "#ef4444",
                },
                {
                  label: "> 90 Days",
                  amount: allRows.reduce((s, r) => s + r.d90plus, 0),
                  color: "#8b5cf6",
                },
              ].map((b) => {
                const pctv = summary.total
                  ? Math.round((b.amount / summary.total) * 100)
                  : 0;
                return (
                  <div key={b.label}>
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-[12.5px] text-ink">{b.label}</p>
                      <p className="tabular text-[12.5px] font-semibold text-ink">
                        {inr(b.amount)}{" "}
                        <span className="font-normal text-muted">
                          ({pctv}%)
                        </span>
                      </p>
                    </div>
                    <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-canvas">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${Math.max(2, pctv)}%`,
                          background: b.color,
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </SideCard>

          <SideCard icon={TrendingUp} title="Top 5 Customers by Outstanding">
            <div className="flex flex-col divide-y divide-line">
              {topCustomers.map((r, i) => (
                <button
                  key={r.customer.id}
                  onClick={() => nav(`/customers/${r.customer.id}`)}
                  className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left hover:bg-fresh-50/40"
                >
                  <span className="grid size-5 shrink-0 place-items-center rounded-full bg-brand-50 text-[10.5px] font-bold text-brand-800">
                    {i + 1}
                  </span>
                  <p className="min-w-0 flex-1 truncate text-[12.5px] text-ink">
                    {r.customer.name}
                  </p>
                  <p className="tabular shrink-0 text-[12.5px] font-semibold text-ink">
                    {inr(r.total)}
                  </p>
                </button>
              ))}
            </div>
          </SideCard>

          <SideCard icon={Wallet} title="Payment Reminders">
            <div className="flex flex-col divide-y divide-line">
              {reminders.map((r) => {
                const days =
                  r.status === "Overdue"
                    ? Math.max(1, Math.round(r.total > 0 ? 1 : 0))
                    : 0;
                return (
                  <button
                    key={r.customer.id}
                    onClick={() => nav(`/customers/${r.customer.id}`)}
                    className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left hover:bg-fresh-50/40"
                  >
                    <span className="grid size-7 shrink-0 place-items-center rounded-full bg-brand-50 text-[11px] font-bold text-brand-800">
                      {r.customer.name.slice(0, 1)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[12.5px] font-medium text-ink">
                        {r.customer.name}
                      </p>
                      <p className="text-[11px] text-subtle">
                        Due {fmtDate(r.oldestDueDate)}
                      </p>
                    </div>
                    <span
                      className={cn(
                        "shrink-0 rounded-full px-2 py-0.5 text-[10.5px] font-semibold",
                        r.status === "Overdue"
                          ? "bg-red-50 text-red-600"
                          : "bg-amber-50 text-amber-700",
                      )}
                    >
                      {r.status === "Overdue" ? "Overdue" : "Due Soon"}
                    </span>
                  </button>
                );
              })}
            </div>
          </SideCard>
        </div>
      </div>

      <div className="flex flex-col gap-1 rounded-card bg-gradient-to-r from-brand-800 to-fresh-600 p-5 text-white sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-[15px] font-semibold">
            Stronger Collections. Healthier Business.
          </p>
          <p className="text-[12.5px] text-white/80">
            Stay on top of your receivables, follow up with customers and ensure
            smooth cash flow.
          </p>
        </div>
      </div>
    </div>
  );
}

function Kpi({
  icon: Icon,
  tone,
  value,
  label,
  note,
}: {
  icon: LucideIcon;
  tone: string;
  value: string;
  label: string;
  note: string;
}) {
  return (
    <div className="rounded-card border border-line bg-white p-3.5 shadow-card">
      <div className="flex items-center gap-3">
        <span
          className={cn(
            "grid size-11 shrink-0 place-items-center rounded-xl",
            tone,
          )}
        >
          <Icon size={20} />
        </span>
        <div className="min-w-0">
          <p className="tabular text-[19px] leading-none font-bold text-ink">
            {value}
          </p>
          <p className="mt-1 text-[12px] leading-tight font-medium text-ink">
            {label}
          </p>
          <p className="text-[11px] leading-tight text-subtle">{note}</p>
        </div>
      </div>
    </div>
  );
}

function SideCard({
  icon: Icon,
  title,
  children,
}: {
  icon: LucideIcon;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-card border border-line bg-white shadow-card">
      <div className="flex items-center gap-2 border-b border-line px-4 py-3">
        <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-fresh-50 text-fresh-600">
          <Icon size={15} />
        </span>
        <h3 className="truncate text-[13.5px] font-semibold text-ink">
          {title}
        </h3>
      </div>
      {children}
    </div>
  );
}
