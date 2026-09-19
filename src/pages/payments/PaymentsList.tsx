import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import {
  Bar,
  Cell,
  ComposedChart,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts";
import {
  ArrowUpRight,
  Banknote,
  CalendarClock,
  ChevronRight,
  CreditCard,
  Ellipsis,
  ExternalLink,
  FileText,
  Grid3x3,
  LayoutList,
  Plus,
  Receipt,
  Search,
  TrendingUp,
  Upload,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { Button } from "../../components/ui/Button";
import { Input, Select } from "../../components/ui/Field";
import { EmptyState } from "../../components/ui/States";
import {
  FilterPanel,
  FilterField,
  FilterToggle,
} from "../../components/ui/FilterPanel";
import { useDb } from "../../store/useStore";
import { usePaymentsSync } from "../../store/useApiSync";
import type { Payment, PaymentMode } from "../../types/models";
import {
  addDays,
  fmtDate,
  fmtDateTime,
  inr,
  inrCompact,
} from "../../lib/format";
import { todayISO } from "../../lib/clock";
import { cn } from "../../lib/cn";
import { RecordPaymentModal } from "./RecordPaymentModal";

const MODES: PaymentMode[] = [
  "Cash",
  "Bank Transfer",
  "UPI",
  "Cheque",
  "Other",
];
const MODE_COLOR: Record<string, string> = {
  "Bank Transfer": "#22683f",
  UPI: "#3b82f6",
  Cash: "#f59e0b",
  Cheque: "#ef4444",
  Other: "#8b5cf6",
};
const TOOLTIP = {
  fontSize: 12,
  borderRadius: 8,
  border: "1px solid #e3e8e4",
  boxShadow: "0 4px 12px rgba(16,40,26,0.1)",
};

const TABS = [
  { key: "all", label: "All Payments" },
  { key: "today", label: "Today" },
  { key: "week", label: "This Week" },
  { key: "month", label: "This Month" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

export function PaymentsListPage() {
  const db = useDb();
  const nav = useNavigate();
  const loc = useLocation();
  const today = todayISO();

  const [tab, setTab] = useState<TabKey>("all");
  const [search, setSearch] = useState("");
  const [mode, setMode] = useState("");
  const [from, setFrom] = useState(addDays(today, -30));
  const [to, setTo] = useState(today);
  const [view, setView] = useState<"grid" | "list">("grid");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Payment | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [minAmount, setMinAmount] = useState("");
  const [modalOpen, setModalOpen] = useState(false);

  usePaymentsSync({ from, to, mode: mode || undefined });

  useEffect(() => {
    if (loc.pathname === "/payments/new") setModalOpen(true);
  }, [loc.pathname]);
  const closeModal = () => {
    setModalOpen(false);
    if (loc.pathname === "/payments/new") nav("/payments");
  };

  const custById = useMemo(
    () => new Map(db.customers.map((c) => [c.id, c])),
    [db.customers],
  );
  const invById = useMemo(
    () => new Map(db.invoices.map((i) => [i.id, i])),
    [db.invoices],
  );

  const inTab = (p: Payment) => {
    if (tab === "today") return p.paymentDate === today;
    if (tab === "week") return p.paymentDate >= addDays(today, -7);
    if (tab === "month") return p.paymentDate.slice(0, 7) === today.slice(0, 7);
    return true;
  };

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return [...db.payments]
      .filter(inTab)
      .filter((p) => {
        const cust = custById.get(p.customerId);
        if (
          term &&
          !(
            p.receiptNo.toLowerCase().includes(term) ||
            (cust?.name ?? "").toLowerCase().includes(term) ||
            (invById.get(p.invoiceId)?.invoiceNo ?? "")
              .toLowerCase()
              .includes(term)
          )
        )
          return false;
        if (mode && p.mode !== mode) return false;
        if (p.paymentDate < from || p.paymentDate > to) return false;
        if (minAmount && p.amount < Number(minAmount)) return false;
        return true;
      })
      .sort((a, b) =>
        a.paymentDate < b.paymentDate
          ? 1
          : a.paymentDate > b.paymentDate
            ? -1
            : b.receiptNo.localeCompare(a.receiptNo),
      );
  }, [
    db.payments,
    search,
    mode,
    tab,
    from,
    to,
    minAmount,
    custById,
    invById,
    today,
  ]);

  const activeFilters = [search, mode, minAmount].filter(Boolean).length;
  const clearFilters = () => {
    setSearch("");
    setMode("");
    setMinAmount("");
    setPage(1);
  };

  const pageSize = 10;
  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const pageRows = rows.slice((page - 1) * pageSize, page * pageSize);
  const detail = selected ?? pageRows[0] ?? null;

  const tabCount = (key: TabKey) =>
    db.payments.filter((p) =>
      key === "today"
        ? p.paymentDate === today
        : key === "week"
          ? p.paymentDate >= addDays(today, -7)
          : key === "month"
            ? p.paymentDate.slice(0, 7) === today.slice(0, 7)
            : true,
    ).length;

  /* ------------------------------------------------------------- numbers */
  const totalPayments = db.payments.reduce((s, p) => s + p.amount, 0);
  const monthTotal = db.payments
    .filter((p) => p.paymentDate.slice(0, 7) === today.slice(0, 7))
    .reduce((s, p) => s + p.amount, 0);
  const lastMonth = db.payments
    .filter(
      (p) => p.paymentDate.slice(0, 7) === addDays(today, -30).slice(0, 7),
    )
    .reduce((s, p) => s + p.amount, 0);
  const vsLastMonth = lastMonth
    ? Math.max(
        -99,
        Math.min(99, Math.round(((monthTotal - lastMonth) / lastMonth) * 100)),
      )
    : 0;
  const avgValue = db.payments.length
    ? Math.round(totalPayments / db.payments.length)
    : 0;
  const pendingInvoices = db.invoices.filter((inv) => {
    const paid = db.payments
      .filter((p) => p.invoiceId === inv.id)
      .reduce((s, p) => s + p.amount, 0);
    return paid < inv.total;
  }).length;

  const byMode = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of db.payments) m.set(p.mode, (m.get(p.mode) ?? 0) + 1);
    return [...m.entries()]
      .map(([name, value]) => ({
        name,
        value,
        color: MODE_COLOR[name] ?? "#94a3b8",
      }))
      .sort((a, b) => b.value - a.value);
  }, [db.payments]);

  const trend = useMemo(() => {
    const out: { label: string; amount: number; count: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const month = addDays(today, -30 * i).slice(0, 7);
      const list = db.payments.filter(
        (p) => p.paymentDate.slice(0, 7) === month,
      );
      out.push({
        label: new Date(`${month}-01`).toLocaleDateString("en-IN", {
          month: "short",
        }),
        amount: list.reduce((s, p) => s + p.amount, 0),
        count: list.length,
      });
    }
    return out;
  }, [db.payments, today]);

  const recent = [...db.payments]
    .sort((a, b) => (a.paymentDate < b.paymentDate ? 1 : -1))
    .slice(0, 5);

  const exportCsv = () => {
    const head = [
      "Payment ID",
      "Customer",
      "Invoice No.",
      "Payment Date",
      "Amount",
      "Method",
      "Reference No.",
    ];
    const body = rows.map((p) => [
      p.receiptNo,
      custById.get(p.customerId)?.name ?? "",
      invById.get(p.invoiceId)?.invoiceNo ?? "",
      fmtDate(p.paymentDate),
      p.amount,
      p.mode,
      p.reference,
    ]);
    const csv = [head, ...body]
      .map((line) => line.map((v) => `"${String(v)}"`).join(","))
      .join("\r\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(
      new Blob([csv], { type: "text/csv;charset=utf-8;" }),
    );
    a.download = `payments-${today}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  return (
    <div className="flex flex-col gap-4">
      <nav className="flex items-center gap-1 text-[12.5px] text-muted">
        <span>Finance</span>
        <ChevronRight size={13} className="text-subtle" />
        <span className="font-medium text-ink">Payments</span>
      </nav>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 max-w-md">
          <h1 className="text-[26px] leading-tight font-bold tracking-[-0.01em] text-ink">
            Payment Management
          </h1>
          <p className="mt-1 text-[13px] text-muted">
            Track customer payments, manage receipts and reconcile outstanding
            amounts.
          </p>
        </div>
        <Button
          variant="primary"
          icon={Plus}
          onClick={() => setModalOpen(true)}
        >
          Record Payment
        </Button>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex min-w-0 flex-col gap-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Kpi
              icon={Wallet}
              tone="bg-fresh-50 text-fresh-600"
              value={inr(totalPayments)}
              label="Total Payments"
              note={`${vsLastMonth >= 0 ? "↑" : "↓"} ${Math.abs(vsLastMonth)}% vs last month`}
            />
            <Kpi
              icon={CreditCard}
              tone="bg-blue-50 text-blue-600"
              value={String(db.payments.length)}
              label="Payments Received"
              note={`${tabCount("month")} this month`}
            />
            <Kpi
              icon={CalendarClock}
              tone="bg-violet-50 text-violet-600"
              value={String(pendingInvoices)}
              label="Pending Payments"
              note="invoices with balance"
            />
            <Kpi
              icon={TrendingUp}
              tone="bg-orange-50 text-orange-600"
              value={inr(avgValue)}
              label="Average Payment Value"
              note="across all receipts"
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
                    "shrink-0 border-b-2 px-3 pb-2.5 text-[13px] font-semibold whitespace-nowrap transition-colors",
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
                placeholder="Search by payment ID, customer name, invoice no…"
                leading={<Search size={15} />}
                className="w-full sm:w-64"
              />
              <Select
                value={mode}
                onChange={(e) => {
                  setMode(e.target.value);
                  setPage(1);
                }}
                placeholder="All Payment Methods"
                options={MODES}
                className="w-44"
              />
              <label className="flex items-center gap-1.5 text-[12.5px] text-muted">
                <input
                  type="date"
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                  className="h-9 rounded-lg border border-line bg-white px-2 text-[12.5px] text-ink"
                />
                <span>→</span>
                <input
                  type="date"
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                  className="h-9 rounded-lg border border-line bg-white px-2 text-[12.5px] text-ink"
                />
              </label>
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
              <FilterField label="Amount at least (₹)">
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
            </FilterPanel>

            {rows.length === 0 ? (
              <EmptyState
                icon={Receipt}
                title="No payments found"
                description="Nothing matches this filter."
                action={
                  <Button
                    size="sm"
                    variant="primary"
                    icon={Plus}
                    onClick={() => setModalOpen(true)}
                    className="mt-1"
                  >
                    Record Payment
                  </Button>
                }
              />
            ) : (
              <>
                <div className="scrollbar-thin overflow-x-auto">
                  <table className="w-full border-collapse text-[12.5px]">
                    <thead>
                      <tr className="border-b border-line bg-canvas/70 text-[11px] font-semibold tracking-wide text-subtle uppercase">
                        <th className="w-10 px-2 py-2.5 text-center">#</th>
                        <th className="px-3 py-2.5 text-left">Payment ID</th>
                        <th className="px-3 py-2.5 text-left">Customer Name</th>
                        <th className="px-3 py-2.5 text-left">Invoice No.</th>
                        <th className="px-3 py-2.5 text-left">Payment Date</th>
                        <th className="px-3 py-2.5 text-right">Amount (₹)</th>
                        <th className="px-3 py-2.5 text-left">Method</th>
                        <th className="px-3 py-2.5 text-left">Reference No.</th>
                        <th className="px-3 py-2.5 text-center">Status</th>
                        <th className="w-10 px-2 py-2.5" />
                      </tr>
                    </thead>
                    <tbody>
                      {pageRows.map((p, i) => (
                        <tr
                          key={p.id}
                          onClick={() => setSelected(p)}
                          className={cn(
                            "cursor-pointer border-b border-line last:border-0 hover:bg-fresh-50/40",
                            detail?.id === p.id && "bg-fresh-50/60",
                          )}
                        >
                          <td className="tabular px-2 py-2.5 text-center text-subtle">
                            {(page - 1) * pageSize + i + 1}
                          </td>
                          <td className="px-3 py-2.5 font-medium whitespace-nowrap text-brand-700">
                            {p.receiptNo}
                          </td>
                          <td className="px-3 py-2.5 whitespace-nowrap text-ink">
                            {custById.get(p.customerId)?.name ?? "—"}
                          </td>
                          <td className="px-3 py-2.5 whitespace-nowrap text-muted">
                            {invById.get(p.invoiceId)?.invoiceNo ?? "—"}
                          </td>
                          <td className="px-3 py-2.5 whitespace-nowrap text-muted">
                            {fmtDate(p.paymentDate)}
                          </td>
                          <td className="tabular px-3 py-2.5 text-right font-semibold text-ink">
                            {inr(p.amount)}
                          </td>
                          <td className="px-3 py-2.5 whitespace-nowrap text-muted">
                            {p.mode}
                          </td>
                          <td className="px-3 py-2.5 whitespace-nowrap text-muted">
                            {p.reference || "-"}
                          </td>
                          <td className="px-3 py-2.5 text-center">
                            <span
                              className={cn(
                                "rounded-full px-2 py-0.5 text-[11px] font-semibold",
                                p.mode === "Cheque"
                                  ? "bg-blue-50 text-blue-700"
                                  : "bg-emerald-50 text-emerald-700",
                              )}
                            >
                              {p.mode === "Cheque" ? "Cleared" : "Success"}
                            </span>
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
                    payments
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
                    {Array.from(
                      { length: Math.min(totalPages, 7) },
                      (_, i) => i + 1,
                    ).map((p) => (
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
                    ))}
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

          {/* -------------------------------------------------- bottom cards */}
          <div className="grid gap-4 lg:grid-cols-3">
            <SideCard icon={CreditCard} title="Payment Method Distribution">
              <div className="flex items-center gap-3 p-4">
                <div className="relative h-32 w-32 shrink-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={byMode}
                        dataKey="value"
                        nameKey="name"
                        innerRadius={38}
                        outerRadius={58}
                        paddingAngle={2}
                      >
                        {byMode.map((s) => (
                          <Cell key={s.name} fill={s.color} />
                        ))}
                      </Pie>
                      <Tooltip contentStyle={TOOLTIP} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
                    <div>
                      <p className="tabular text-[17px] leading-none font-bold text-ink">
                        {db.payments.length}
                      </p>
                      <p className="text-[10px] text-subtle">Total Payments</p>
                    </div>
                  </div>
                </div>
                <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                  {byMode.map((s) => (
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
                        {s.value}{" "}
                        <span className="font-normal text-subtle">
                          (
                          {db.payments.length
                            ? Math.round((s.value / db.payments.length) * 100)
                            : 0}
                          %)
                        </span>
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </SideCard>

            <SideCard icon={TrendingUp} title="Payment Trend">
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
                      width={44}
                    />
                    <YAxis
                      yAxisId="r"
                      orientation="right"
                      tick={{ fontSize: 10 }}
                      axisLine={false}
                      tickLine={false}
                      width={26}
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
                      name="Payment Amount"
                    />
                    <Line
                      yAxisId="r"
                      type="monotone"
                      dataKey="count"
                      stroke="#f59e0b"
                      strokeWidth={2}
                      dot={{ r: 3 }}
                      name="No. of Payments"
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </SideCard>

            <SideCard icon={Receipt} title="Recent Payments">
              <div className="flex flex-col divide-y divide-line">
                {recent.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => setSelected(p)}
                    className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left hover:bg-fresh-50/40"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[12.5px] font-medium text-ink">
                        {custById.get(p.customerId)?.name ?? "—"}
                      </p>
                      <p className="text-[11px] text-subtle">
                        {fmtDate(p.paymentDate)} · {p.mode}
                      </p>
                    </div>
                    <p className="tabular shrink-0 text-[12.5px] font-semibold text-ink">
                      {inr(p.amount)}
                    </p>
                  </button>
                ))}
              </div>
            </SideCard>
          </div>
        </div>

        {/* ================================================ right sidebar */}
        <div className="flex flex-col gap-4">
          {detail && (
            <SideCard icon={Receipt} title="Payment Details">
              <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-2.5">
                <p className="text-[14px] font-bold text-ink">
                  {detail.receiptNo}
                </p>
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 text-[11px] font-semibold",
                    detail.mode === "Cheque"
                      ? "bg-blue-50 text-blue-700"
                      : "bg-emerald-50 text-emerald-700",
                  )}
                >
                  {detail.mode === "Cheque" ? "Cleared" : "Success"}
                </span>
              </div>
              <div className="flex flex-col">
                <DetailRow
                  label="Customer"
                  value={custById.get(detail.customerId)?.name ?? "—"}
                />
                <DetailRow
                  label="Invoice No."
                  value={invById.get(detail.invoiceId)?.invoiceNo ?? "—"}
                />
                <DetailRow
                  label="Payment Date"
                  value={fmtDate(detail.paymentDate)}
                />
                <DetailRow label="Amount" value={inr(detail.amount)} strong />
                <DetailRow label="Payment Method" value={detail.mode} />
                <DetailRow
                  label="Reference No."
                  value={detail.reference || "—"}
                />
                <DetailRow
                  label="Remarks"
                  value={detail.remarks || "Payment received"}
                />
                <DetailRow
                  label="Recorded By"
                  value={
                    db.users.find((u) => u.id === detail.recordedBy)?.name ??
                    "—"
                  }
                />
                <DetailRow
                  label="Recorded At"
                  value={fmtDateTime(detail.recordedAt)}
                />
              </div>
              <div className="p-3">
                <Button
                  variant="secondary"
                  size="sm"
                  iconRight={ExternalLink}
                  className="w-full"
                  onClick={() => nav(`/invoices/${detail.invoiceId}`)}
                >
                  View Related Invoice
                </Button>
              </div>
            </SideCard>
          )}

          <SideCard icon={Banknote} title="Quick Actions">
            <div className="flex flex-col divide-y divide-line">
              {[
                {
                  icon: Plus,
                  label: "Record New Payment",
                  action: () => setModalOpen(true),
                },
                {
                  icon: Upload,
                  label: "Bulk Upload Payments",
                  action: () => setModalOpen(true),
                },
                {
                  icon: ArrowUpRight,
                  label: "Reconcile Payments",
                  action: () => nav("/outstanding"),
                },
                {
                  icon: FileText,
                  label: "Payment Report",
                  action: () => nav("/reports/sales"),
                },
                {
                  icon: Receipt,
                  label: "Export Payment Data",
                  action: exportCsv,
                },
              ].map((q) => (
                <button
                  key={q.label}
                  onClick={q.action}
                  className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left hover:bg-fresh-50/40"
                >
                  <q.icon size={15} className="shrink-0 text-brand-700" />
                  <span className="min-w-0 flex-1 truncate text-[12.5px] text-ink">
                    {q.label}
                  </span>
                  <ChevronRight size={14} className="shrink-0 text-subtle" />
                </button>
              ))}
            </div>
          </SideCard>
        </div>
      </div>

      <div className="rounded-card bg-gradient-to-r from-brand-800 to-fresh-600 p-5 text-white">
        <p className="text-[15px] font-semibold">
          Faster Payments. Stronger Partnerships.
        </p>
        <p className="text-[12.5px] text-white/80">
          Keep track of payments, reduce outstanding and maintain healthy cash
          flow for your business.
        </p>
      </div>

      <RecordPaymentModal open={modalOpen} onClose={closeModal} />
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

function DetailRow({
  label,
  value,
  strong,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div className="flex items-start gap-2.5 border-b border-line px-4 py-2 last:border-0">
      <p className="w-28 shrink-0 text-[12px] text-muted">{label}</p>
      <p
        className={cn(
          "min-w-0 flex-1 text-[12.5px] font-medium break-words",
          strong ? "tabular text-brand-700" : "text-ink",
        )}
      >
        {value}
      </p>
    </div>
  );
}
