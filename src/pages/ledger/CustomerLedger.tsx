import { useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Boxes,
  CalendarDays,
  ChevronRight,
  CreditCard,
  Download,
  Ellipsis,
  FileText,
  Grid3x3,
  IndianRupee,
  LayoutList,
  Mail,
  MapPin,
  MessageSquare,
  Phone,
  Receipt,
  Search,
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
import { useLedgerSync } from "../../store/useApiSync";
import { API_MODE } from "../../lib/api";
import {
  buildLedger,
  invoiceViews,
  type LedgerRow,
} from "../../domain/finance";
import {
  addDays,
  fmtDate,
  fmtDateTime,
  inr,
  inrCompact,
  num,
  relativeTime,
} from "../../lib/format";
import { nowISO, todayISO } from "../../lib/clock";
import { cn } from "../../lib/cn";

const TOOLTIP = {
  fontSize: 12,
  borderRadius: 8,
  border: "1px solid #e3e8e4",
  boxShadow: "0 4px 12px rgba(16,40,26,0.1)",
};

const TABS = [
  { key: "all", label: "Transactions" },
  { key: "invoices", label: "Invoice History" },
  { key: "payments", label: "Payment History" },
  { key: "summary", label: "Summary" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

const TYPE_TONE: Record<string, string> = {
  Invoice: "bg-blue-50 text-blue-700",
  Payment: "bg-emerald-50 text-emerald-700",
  Opening: "bg-violet-50 text-violet-700",
};
const STATUS_TONE: Record<string, string> = {
  Success: "bg-emerald-50 text-emerald-700",
  Open: "bg-amber-50 text-amber-700",
  Settled: "bg-emerald-50 text-emerald-700",
  Applied: "bg-blue-50 text-blue-700",
};

export function CustomerLedgerPage() {
  const db = useDb();
  const today = todayISO();
  const now = nowISO();

  const [customerId, setCustomerId] = useState(db.customers[0]?.id ?? "");
  const [from, setFrom] = useState(addDays(today, -260));
  const [to, setTo] = useState(today);
  const [tab, setTab] = useState<TabKey>("all");
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [view, setView] = useState<"grid" | "list">("grid");
  const [page, setPage] = useState(1);
  const [showFilters, setShowFilters] = useState(false);
  const [minAmount, setMinAmount] = useState("");

  const customer = db.customers.find((c) => c.id === customerId);
  const { data: ledgerData } = useLedgerSync(customerId, from, to);

  const allRows = useMemo((): LedgerRow[] => {
    if (API_MODE && ledgerData) {
      return ledgerData.rows.map((r) => ({
        date: r.date, type: r.type as LedgerRow['type'], reference: r.reference,
        description: r.description, debit: r.debit, credit: r.credit,
        balance: r.balance, status: r.status as any,
      }));
    }
    return customerId ? buildLedger(db, customerId, from, to) : [];
  }, [db, customerId, from, to, ledgerData]);

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return [...allRows]
      .reverse()
      .filter((r) =>
        tab === "invoices"
          ? r.type === "Invoice"
          : tab === "payments"
            ? r.type === "Payment"
            : true,
      )
      .filter((r) => !typeFilter || r.type === typeFilter)
      .filter(
        (r) =>
          !term ||
          r.reference.toLowerCase().includes(term) ||
          r.description.toLowerCase().includes(term),
      )
      .filter(
        (r) => !minAmount || Math.max(r.debit, r.credit) >= Number(minAmount),
      );
  }, [allRows, tab, typeFilter, search, minAmount]);

  const activeFilters = [search, typeFilter, minAmount].filter(Boolean).length;
  const clearFilters = () => {
    setSearch("");
    setTypeFilter("");
    setMinAmount("");
    setPage(1);
  };

  const pageSize = 10;
  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const pageRows = rows.slice((page - 1) * pageSize, page * pageSize);

  /* ------------------------------------------------------------- numbers */
  const invoices = useMemo(
    () => invoiceViews(db, today).filter((i) => i.customerId === customerId),
    [db, today, customerId],
  );
  const payments = useMemo(
    () => db.payments.filter((p) => p.customerId === customerId),
    [db.payments, customerId],
  );

  const totalInvoiced = invoices.reduce((s, i) => s + i.total, 0);
  const totalPaid = payments.reduce((s, p) => s + p.amount, 0);
  const opening =
    db.openingBalances.find((o) => o.customerId === customerId)?.amount ?? 0;
  const outstanding = invoices.reduce((s, i) => s + i.balance, 0);
  const oldestOverdue = invoices
    .filter((i) => i.balance > 0)
    .sort((a, b) => b.daysOverdue - a.daysOverdue)[0];
  const lastRow = allRows.at(-1);

  const aging = useMemo(() => {
    const b = {
      current: 0,
      d1_30: 0,
      d31_60: 0,
      d61_90: 0,
      d90plus: 0,
      c: [0, 0, 0, 0, 0],
    };
    for (const i of invoices.filter((x) => x.balance > 0)) {
      if (i.daysOverdue <= 0) {
        b.current += i.balance;
        b.c[0]++;
      } else if (i.daysOverdue <= 30) {
        b.d1_30 += i.balance;
        b.c[1]++;
      } else if (i.daysOverdue <= 60) {
        b.d31_60 += i.balance;
        b.c[2]++;
      } else if (i.daysOverdue <= 90) {
        b.d61_90 += i.balance;
        b.c[3]++;
      } else {
        b.d90plus += i.balance;
        b.c[4]++;
      }
    }
    return b;
  }, [invoices]);

  const trend = useMemo(() => {
    const out: { label: string; value: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = addDays(today, -30 * i);
      const bal = invoices
        .filter((inv) => inv.invoiceDate <= d)
        .reduce(
          (s, inv) =>
            s +
            Math.max(
              inv.total -
                payments
                  .filter((p) => p.invoiceId === inv.id && p.paymentDate <= d)
                  .reduce((x, p) => x + p.amount, 0),
              0,
            ),
          0,
        );
      out.push({
        label: new Date(d).toLocaleDateString("en-IN", { month: "short" }),
        value: bal,
      });
    }
    return out;
  }, [invoices, payments, today]);

  const topProducts = useMemo(() => {
    const orderIds = new Set(
      db.orders.filter((o) => o.customerId === customerId).map((o) => o.id),
    );
    const byItem = new Map<string, number>();
    for (const l of db.orderItems) {
      if (!orderIds.has(l.orderId)) continue;
      const q = l.qty.delivered ?? l.qty.packed ?? l.qty.ordered ?? 0;
      byItem.set(l.itemId, (byItem.get(l.itemId) ?? 0) + q);
    }
    return [...byItem.entries()]
      .map(([itemId, q]) => ({
        item: db.items.find((i) => i.id === itemId),
        q,
      }))
      .filter((r) => r.item)
      .sort((a, b) => b.q - a.q)
      .slice(0, 5);
  }, [db.orders, db.orderItems, db.items, customerId]);

  const notes = useMemo(
    () => db.auditLogs.filter((a) => a.customerId === customerId).slice(0, 3),
    [db.auditLogs, customerId],
  );

  const exportCsv = () => {
    const head = [
      "Date",
      "Type",
      "Reference",
      "Description",
      "Debit",
      "Credit",
      "Balance",
    ];
    const body = rows.map((r) => [
      fmtDate(r.date),
      r.type,
      r.reference,
      r.description,
      r.debit,
      r.credit,
      r.balance,
    ]);
    const csv = [head, ...body]
      .map((line) => line.map((v) => `"${String(v)}"`).join(","))
      .join("\r\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(
      new Blob([csv], { type: "text/csv;charset=utf-8;" }),
    );
    a.download = `${customer?.code ?? "customer"}-ledger.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  return (
    <div className="flex flex-col gap-4">
      <nav className="no-print flex items-center gap-1 text-[12.5px] text-muted">
        <span>Finance</span>
        <ChevronRight size={13} className="text-subtle" />
        <span className="font-medium text-ink">Customer Ledger</span>
      </nav>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 max-w-md">
          <h1 className="text-[26px] leading-tight font-bold tracking-[-0.01em] text-ink">
            Customer Ledger
          </h1>
          <p className="mt-1 text-[13px] text-muted">
            View complete transaction history for each customer including
            invoices, payments and adjustments.
          </p>
        </div>
        <div className="no-print flex flex-wrap items-center gap-2.5">
          <Select
            value={customerId}
            onChange={(e) => {
              setCustomerId(e.target.value);
              setPage(1);
            }}
            className="w-60"
            options={db.customers.map((c) => ({
              value: c.id,
              label: `${c.name} (${c.code})`,
            }))}
          />
          <Button
            variant="primary"
            icon={Download}
            onClick={exportCsv}
            disabled={!customerId}
          >
            Export Ledger
          </Button>
        </div>
      </div>

      {!customer ? (
        <EmptyState
          title="Choose a customer"
          description="Select a customer to view their statement."
        />
      ) : (
        <>
          {/* ------------------------------------------ profile + KPI strip */}
          <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
            <div className="rounded-card border border-line bg-white p-4 shadow-card">
              <div className="flex items-center gap-3">
                <span className="grid size-11 shrink-0 place-items-center rounded-full bg-fresh-50 text-[16px] font-bold text-brand-800">
                  {customer.name.slice(0, 1)}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-[16px] leading-tight font-bold text-ink">
                    {customer.name}
                  </p>
                  <p className="text-[12px] text-muted">{customer.code}</p>
                </div>
                <span
                  className={cn(
                    "ml-auto shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold",
                    customer.active
                      ? "bg-emerald-50 text-emerald-700"
                      : "bg-canvas text-muted",
                  )}
                >
                  {customer.active ? "Active" : "Inactive"}
                </span>
              </div>
              <div className="mt-3 grid grid-cols-1 gap-1.5 text-[12px] text-muted sm:grid-cols-2">
                <span className="flex items-center gap-1.5">
                  <MapPin size={13} className="shrink-0 text-subtle" />
                  {customer.location}
                </span>
                <span className="flex items-center gap-1.5">
                  <Phone size={13} className="shrink-0 text-subtle" />
                  {customer.mobile}
                </span>
                <span className="flex items-center gap-1.5 truncate">
                  <Mail size={13} className="shrink-0 text-subtle" />
                  {customer.email}
                </span>
                <span className="flex items-center gap-1.5">
                  <Receipt size={13} className="shrink-0 text-subtle" />
                  {customer.type}
                </span>
                <span className="flex items-center gap-1.5">
                  <CreditCard size={13} className="shrink-0 text-subtle" />
                  Credit Limit: {inr(customer.creditLimit)}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Kpi
                icon={FileText}
                tone="bg-blue-50 text-blue-600"
                value={inr(totalInvoiced)}
                label="Total Invoiced"
                note={`${invoices.length} invoices`}
              />
              <Kpi
                icon={Wallet}
                tone="bg-emerald-50 text-emerald-600"
                value={inr(totalPaid)}
                label="Total Paid"
                note={`${payments.length} payments`}
              />
              <Kpi
                icon={IndianRupee}
                tone="bg-orange-50 text-orange-600"
                value={inr(outstanding)}
                label="Outstanding"
                note={
                  oldestOverdue?.daysOverdue
                    ? `${oldestOverdue.daysOverdue} days overdue`
                    : "within terms"
                }
              />
              <Kpi
                icon={CalendarDays}
                tone="bg-violet-50 text-violet-600"
                value={lastRow ? fmtDate(lastRow.date) : "—"}
                label="Last Transaction"
                note={
                  lastRow
                    ? lastRow.type === "Payment"
                      ? "Payment Received"
                      : "Invoice Raised"
                    : "—"
                }
              />
            </div>
          </div>

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
            <div className="flex min-w-0 flex-col gap-4">
              {/* ------------------------------------------ tabs + table */}
              <div className="overflow-hidden rounded-card border border-line bg-white shadow-card">
                <div className="no-print flex gap-1 overflow-x-auto border-b border-line px-3 pt-2">
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
                      {t.label}
                    </button>
                  ))}
                </div>

                {tab !== "summary" && (
                  <div className="no-print flex flex-wrap items-center gap-2.5 border-b border-line px-3 py-3">
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
                    <Select
                      value={typeFilter}
                      onChange={(e) => setTypeFilter(e.target.value)}
                      placeholder="All Transaction Types"
                      options={["Invoice", "Payment", "Opening"]}
                      className="w-44"
                    />
                    <Input
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Search by invoice no., payment no., reference…"
                      leading={<Search size={15} />}
                      className="w-full sm:w-56"
                    />
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
                          view === "grid"
                            ? "bg-brand-800 text-white"
                            : "text-muted",
                        )}
                      >
                        <Grid3x3 size={14} />
                      </button>
                      <button
                        onClick={() => setView("list")}
                        className={cn(
                          "grid size-7 place-items-center rounded-md",
                          view === "list"
                            ? "bg-brand-800 text-white"
                            : "text-muted",
                        )}
                      >
                        <LayoutList size={14} />
                      </button>
                    </div>
                  </div>
                )}

                <FilterPanel
                  open={showFilters && tab !== "summary"}
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

                {tab === "summary" ? (
                  <div className="grid gap-3 p-4 sm:grid-cols-2">
                    <SummaryRow
                      icon={Wallet}
                      label="Opening Balance"
                      value={inr(opening)}
                    />
                    <SummaryRow
                      icon={FileText}
                      label="Total Invoiced"
                      value={inr(totalInvoiced)}
                    />
                    <SummaryRow
                      icon={Receipt}
                      label="Total Paid"
                      value={inr(totalPaid)}
                    />
                    <SummaryRow
                      icon={IndianRupee}
                      label="Current Outstanding"
                      value={inr(outstanding)}
                      strong
                    />
                    <SummaryRow
                      icon={CreditCard}
                      label="Credit Limit"
                      value={inr(customer.creditLimit)}
                    />
                    <SummaryRow
                      icon={CreditCard}
                      label="Available Credit"
                      value={inr(
                        Math.max(customer.creditLimit - outstanding, 0),
                      )}
                      strong
                    />
                  </div>
                ) : rows.length === 0 ? (
                  <EmptyState
                    icon={Receipt}
                    title="No transactions"
                    description="Nothing in this range or filter."
                  />
                ) : (
                  <>
                    <div className="scrollbar-thin overflow-x-auto print-area">
                      <table className="w-full border-collapse text-[12.5px]">
                        <thead>
                          <tr className="border-b border-line bg-canvas/70 text-[11px] font-semibold tracking-wide text-subtle uppercase">
                            <th className="w-10 px-2 py-2.5 text-center">#</th>
                            <th className="px-3 py-2.5 text-left">Date</th>
                            <th className="px-3 py-2.5 text-left">Type</th>
                            <th className="px-3 py-2.5 text-left">
                              Reference No.
                            </th>
                            <th className="px-3 py-2.5 text-left">
                              Description
                            </th>
                            <th className="px-3 py-2.5 text-right">
                              Debit (₹)
                            </th>
                            <th className="px-3 py-2.5 text-right">
                              Credit (₹)
                            </th>
                            <th className="px-3 py-2.5 text-right">
                              Balance (₹)
                            </th>
                            <th className="px-3 py-2.5 text-center">Status</th>
                            <th className="w-10 px-2 py-2.5" />
                          </tr>
                        </thead>
                        <tbody>
                          {pageRows.map((r, i) => (
                            <tr
                              key={`${r.date}-${r.reference}-${i}`}
                              className="border-b border-line last:border-0 hover:bg-fresh-50/40"
                            >
                              <td className="tabular px-2 py-2.5 text-center text-subtle">
                                {(page - 1) * pageSize + i + 1}
                              </td>
                              <td className="px-3 py-2.5 whitespace-nowrap text-ink">
                                {fmtDate(r.date)}
                              </td>
                              <td className="px-3 py-2.5">
                                <span
                                  className={cn(
                                    "rounded-full px-2 py-0.5 text-[11px] font-semibold",
                                    TYPE_TONE[r.type],
                                  )}
                                >
                                  {r.type}
                                </span>
                              </td>
                              <td className="px-3 py-2.5 font-medium whitespace-nowrap text-ink">
                                {r.reference}
                              </td>
                              <td className="px-3 py-2.5 text-muted">
                                {r.description}
                              </td>
                              <td className="tabular px-3 py-2.5 text-right text-ink">
                                {r.debit ? num(r.debit) : "-"}
                              </td>
                              <td className="tabular px-3 py-2.5 text-right text-emerald-700">
                                {r.credit ? num(r.credit) : "-"}
                              </td>
                              <td className="tabular px-3 py-2.5 text-right font-semibold text-ink">
                                {num(r.balance)}
                              </td>
                              <td className="px-3 py-2.5 text-center">
                                <span
                                  className={cn(
                                    "rounded-full px-2 py-0.5 text-[11px] font-semibold",
                                    STATUS_TONE[r.status] ??
                                      "bg-canvas text-muted",
                                  )}
                                >
                                  {r.status}
                                </span>
                              </td>
                              <td className="px-2 py-2.5 text-center text-subtle">
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
                        {Math.min(page * pageSize, rows.length)} of{" "}
                        {rows.length} transactions
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

              {/* --------------------------------------------- bottom cards */}
              <div className="grid gap-4 lg:grid-cols-3">
                <SideCard icon={IndianRupee} title="Aging Analysis">
                  <div className="grid grid-cols-2 gap-2 p-3 sm:grid-cols-3">
                    {[
                      {
                        label: "Current",
                        amount: aging.current,
                        count: aging.c[0],
                        tone: "bg-emerald-50 text-emerald-700",
                      },
                      {
                        label: "1 - 30 Days",
                        amount: aging.d1_30,
                        count: aging.c[1],
                        tone: "bg-amber-50 text-amber-700",
                      },
                      {
                        label: "31 - 60 Days",
                        amount: aging.d31_60,
                        count: aging.c[2],
                        tone: "bg-orange-50 text-orange-700",
                      },
                      {
                        label: "61 - 90 Days",
                        amount: aging.d61_90,
                        count: aging.c[3],
                        tone: "bg-red-50 text-red-700",
                      },
                      {
                        label: "> 90 Days",
                        amount: aging.d90plus,
                        count: aging.c[4],
                        tone: "bg-violet-50 text-violet-700",
                      },
                    ].map((b) => (
                      <div
                        key={b.label}
                        className={cn("rounded-lg p-2.5", b.tone)}
                      >
                        <p className="text-[11px] font-semibold">{b.label}</p>
                        <p className="tabular mt-0.5 text-[14px] leading-tight font-bold">
                          {inr(b.amount)}
                        </p>
                        <p className="text-[10.5px] opacity-80">
                          {b.count} invoices ·{" "}
                          {outstanding
                            ? Math.round((b.amount / outstanding) * 100)
                            : 0}
                          %
                        </p>
                      </div>
                    ))}
                  </div>
                </SideCard>

                <SideCard icon={Boxes} title="Top Products Supplied">
                  <div className="flex flex-col divide-y divide-line">
                    {topProducts.map((r, i) => (
                      <div
                        key={r.item!.id}
                        className="flex items-center gap-2.5 px-4 py-2.5"
                      >
                        <span className="grid size-5 shrink-0 place-items-center rounded-full bg-brand-50 text-[10.5px] font-bold text-brand-800">
                          {i + 1}
                        </span>
                        <p className="min-w-0 flex-1 truncate text-[12.5px] text-ink">
                          {r.item!.name}
                        </p>
                        <p className="tabular shrink-0 text-[12.5px] font-semibold text-ink">
                          {num(r.q)} {r.item!.unit}
                        </p>
                      </div>
                    ))}
                    {topProducts.length === 0 && (
                      <p className="px-4 py-3 text-[12.5px] text-muted">
                        No supplies recorded yet.
                      </p>
                    )}
                  </div>
                </SideCard>

                <SideCard icon={MessageSquare} title="Recent Notes">
                  <div className="flex flex-col divide-y divide-line">
                    {notes.map((a) => (
                      <div key={a.id} className="flex gap-2.5 px-4 py-2.5">
                        <span className="grid size-6 shrink-0 place-items-center rounded-full bg-brand-50 text-[10.5px] font-bold text-brand-800">
                          {(
                            db.users.find((u) => u.id === a.userId)?.name ?? "?"
                          ).slice(0, 1)}
                        </span>
                        <div className="min-w-0">
                          <p className="text-[12px] leading-snug text-ink">
                            {a.action}
                            {a.newValue ? ` — ${a.newValue}` : ""}
                          </p>
                          <p className="text-[11px] text-subtle">
                            {fmtDateTime(a.at)} ·{" "}
                            {db.users.find((u) => u.id === a.userId)?.name ??
                              "—"}
                          </p>
                        </div>
                      </div>
                    ))}
                    {notes.length === 0 && (
                      <p className="px-4 py-3 text-[12.5px] text-muted">
                        No notes for this customer.
                      </p>
                    )}
                  </div>
                </SideCard>
              </div>
            </div>

            {/* ============================================ right sidebar */}
            <div className="no-print flex flex-col gap-4">
              <SideCard icon={Receipt} title="Ledger Summary">
                <div className="flex flex-col">
                  <SummaryRow
                    icon={Wallet}
                    label="Opening Balance"
                    value={inr(opening)}
                  />
                  <SummaryRow
                    icon={FileText}
                    label="Total Invoiced"
                    value={inr(totalInvoiced)}
                  />
                  <SummaryRow
                    icon={Receipt}
                    label="Total Paid"
                    value={inr(totalPaid)}
                  />
                  <SummaryRow
                    icon={IndianRupee}
                    label="Current Outstanding"
                    value={inr(outstanding)}
                    strong
                  />
                  <SummaryRow
                    icon={CreditCard}
                    label="Credit Limit"
                    value={inr(customer.creditLimit)}
                  />
                  <SummaryRow
                    icon={CreditCard}
                    label="Available Credit"
                    value={inr(Math.max(customer.creditLimit - outstanding, 0))}
                    strong
                  />
                </div>
              </SideCard>

              <SideCard icon={CalendarDays} title="Outstanding Trend">
                <div className="h-40 p-3">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={trend}>
                      <defs>
                        <linearGradient
                          id="ledgerTrend"
                          x1="0"
                          y1="0"
                          x2="0"
                          y2="1"
                        >
                          <stop
                            offset="0%"
                            stopColor="#3aa64b"
                            stopOpacity={0.35}
                          />
                          <stop
                            offset="100%"
                            stopColor="#3aa64b"
                            stopOpacity={0}
                          />
                        </linearGradient>
                      </defs>
                      <XAxis
                        dataKey="label"
                        tick={{ fontSize: 11 }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <YAxis
                        tick={{ fontSize: 10 }}
                        axisLine={false}
                        tickLine={false}
                        tickFormatter={(v) => inrCompact(v)}
                        width={46}
                      />
                      <Tooltip
                        contentStyle={TOOLTIP}
                        formatter={(v: any) => inr(Number(v))}
                      />
                      <Area
                        type="monotone"
                        dataKey="value"
                        stroke="#2c873a"
                        strokeWidth={2}
                        fill="url(#ledgerTrend)"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </SideCard>

              <div className="rounded-card border border-line bg-white p-4 shadow-card">
                <p className="text-[12.5px] text-muted">Statement period</p>
                <p className="mt-0.5 text-[13.5px] font-semibold text-ink">
                  {fmtDate(from)} – {fmtDate(to)}
                </p>
                <p className="mt-2 text-[11.5px] text-subtle">
                  Last activity{" "}
                  {lastRow
                    ? relativeTime(`${lastRow.date}T10:00:00`, now)
                    : "—"}
                </p>
              </div>
            </div>
          </div>
        </>
      )}

      <div className="no-print rounded-card bg-gradient-to-r from-brand-800 to-fresh-600 p-5 text-white">
        <p className="text-[15px] font-semibold">
          Stronger Partnerships. Healthier Businesses.
        </p>
        <p className="text-[12.5px] text-white/80">
          Maintain transparent records and build trust with your customers.
        </p>
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
            "grid size-10 shrink-0 place-items-center rounded-xl",
            tone,
          )}
        >
          <Icon size={18} />
        </span>
        <div className="min-w-0">
          <p className="tabular text-[17px] leading-none font-bold text-ink">
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

function SummaryRow({
  icon: Icon,
  label,
  value,
  strong,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div className="flex items-center gap-2.5 border-b border-line px-4 py-2.5 last:border-0">
      <Icon size={14} className="shrink-0 text-subtle" />
      <p className="min-w-0 flex-1 truncate text-[12.5px] text-muted">
        {label}
      </p>
      <p
        className={cn(
          "tabular shrink-0 text-[12.5px] font-semibold",
          strong ? "text-brand-700" : "text-ink",
        )}
      >
        {value}
      </p>
    </div>
  );
}

export type { LedgerRow };
