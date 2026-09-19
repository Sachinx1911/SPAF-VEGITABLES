import { useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import {
  Bell,
  CheckCircle2,
  ChevronRight,
  CircleX,
  Clock,
  Download,
  Ellipsis,
  Grid3x3,
  LayoutList,
  MapPin,
  Phone,
  Route as RouteIcon,
  Search,
  Settings,
  Truck,
  User,
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
import { useConfirm } from "../../components/ui/ConfirmDialog";
import { useToast } from "../../components/ui/Toast";
import { useCurrentUser, useDb } from "../../store/useStore";
import { dispatchChallan } from "../../store/packingActions";
import { useChallansSync } from "../../store/useApiSync";
import { deliveryRows, type DeliveryBoardRow } from "../../domain/packing";
import { addDays, fmtDate, fmtTime } from "../../lib/format";
import { todayISO } from "../../lib/clock";
import { cn } from "../../lib/cn";

const TOOLTIP = {
  fontSize: 12,
  borderRadius: 8,
  border: "1px solid #e3e8e4",
  boxShadow: "0 4px 12px rgba(16,40,26,0.1)",
};

const TABS = [
  { key: "all", label: "All Deliveries" },
  { key: "transit", label: "In Transit" },
  { key: "delivered", label: "Delivered" },
  { key: "ready", label: "Ready to Dispatch" },
  { key: "failed", label: "Failed" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

const STATUS_TONE: Record<string, string> = {
  Delivered: "bg-emerald-50 text-emerald-700",
  Partial: "bg-amber-50 text-amber-700",
  "In Transit": "bg-blue-50 text-blue-700",
  Dispatched: "bg-blue-50 text-blue-700",
  Ready: "bg-amber-50 text-amber-700",
  Failed: "bg-red-50 text-red-600",
  Pending: "bg-canvas text-muted",
};
const STATUS_COLOR: Record<string, string> = {
  Delivered: "#22683f",
  Partial: "#f97316",
  "In Transit": "#3b82f6",
  Dispatched: "#60a5fa",
  Ready: "#f59e0b",
  Failed: "#ef4444",
  Pending: "#cbd4cf",
};

export function DeliveryDashboardPage() {
  const db = useDb();
  const user = useCurrentUser()!;
  const nav = useNavigate();
  const confirm = useConfirm();
  const toast = useToast();

  const today = todayISO();
  const [date, setDate] = useState(today);

  useChallansSync(date);
  const [tab, setTab] = useState<TabKey>("all");
  const [search, setSearch] = useState("");
  const [routeId, setRouteId] = useState("");
  const [driverId, setDriverId] = useState("");
  const [status, setStatus] = useState("");
  const [view, setView] = useState<"grid" | "list">("grid");
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [openOnly, setOpenOnly] = useState(false);

  const allRows = useMemo(() => deliveryRows(db, date), [db, date]);
  const drivers = useMemo(
    () => db.users.filter((u) => u.role === "driver"),
    [db.users],
  );

  const inTab = (r: DeliveryBoardRow) => {
    const s = r.challan.status;
    if (tab === "transit") return s === "In Transit" || s === "Dispatched";
    if (tab === "delivered") return s === "Delivered" || s === "Partial";
    if (tab === "ready") return s === "Ready";
    if (tab === "failed") return s === "Failed";
    return true;
  };

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return allRows
      .filter(inTab)
      .filter(
        (r) =>
          !term ||
          (r.customer?.name ?? "").toLowerCase().includes(term) ||
          (r.order?.orderNo ?? "").toLowerCase().includes(term) ||
          r.driverName.toLowerCase().includes(term),
      )
      .filter((r) => !routeId || r.route?.id === routeId)
      .filter((r) => !driverId || r.challan.driverId === driverId)
      .filter((r) => !status || r.challan.status === status)
      .filter(
        (r) =>
          !openOnly ||
          (r.challan.status !== "Delivered" && r.challan.status !== "Partial"),
      );
  }, [allRows, tab, search, routeId, driverId, status, openOnly]);

  const activeFilters = [
    search,
    routeId,
    driverId,
    status,
    openOnly ? "y" : "",
  ].filter(Boolean).length;
  const clearFilters = () => {
    setSearch("");
    setRouteId("");
    setDriverId("");
    setStatus("");
    setOpenOnly(false);
    setPage(1);
  };

  const pageSize = 10;
  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const pageRows = rows.slice((page - 1) * pageSize, page * pageSize);
  const detail =
    allRows.find((r) => r.challan.id === selectedId) ?? pageRows[0] ?? null;

  const tabCount = (key: TabKey) =>
    allRows.filter((r) => {
      const s = r.challan.status;
      if (key === "transit") return s === "In Transit" || s === "Dispatched";
      if (key === "delivered") return s === "Delivered" || s === "Partial";
      if (key === "ready") return s === "Ready";
      if (key === "failed") return s === "Failed";
      return true;
    }).length;

  /* ------------------------------------------------------------- numbers */
  const delivered = tabCount("delivered");
  const inTransit = tabCount("transit");
  const failed = tabCount("failed");
  const delayed = allRows.filter(
    (r) =>
      r.challan.status !== "Delivered" &&
      r.challan.dispatchedAt &&
      r.challan.dispatchedAt < `${date}T13:00:00`,
  ).length;
  const lastMonth = deliveryRows(db, addDays(date, -30)).length;
  const vsLastMonth = lastMonth
    ? Math.max(
        -99,
        Math.min(
          99,
          Math.round(((allRows.length - lastMonth) / lastMonth) * 100),
        ),
      )
    : 0;

  const byStatus = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of allRows)
      m.set(r.challan.status, (m.get(r.challan.status) ?? 0) + 1);
    return [...m.entries()]
      .map(([name, value]) => ({
        name,
        value,
        color: STATUS_COLOR[name] ?? "#94a3b8",
      }))
      .sort((a, b) => b.value - a.value);
  }, [allRows]);

  const driverLoad = useMemo(
    () =>
      drivers
        .map((d) => ({
          driver: d,
          count: allRows.filter((r) => r.challan.driverId === d.id).length,
          onDuty: allRows.some(
            (r) =>
              r.challan.driverId === d.id && r.challan.status !== "Delivered",
          ),
        }))
        .sort((a, b) => b.count - a.count),
    [drivers, allRows],
  );

  /* ------------------------------------------------------------- actions */
  const doDispatch = async (r: DeliveryBoardRow) => {
    const ok = await confirm({
      title: `Dispatch ${r.challan.challanNo}?`,
      description: `${r.customer?.name} · ${r.route?.name}`,
      confirmLabel: "Dispatch",
    });
    if (ok) {
      try {
        await dispatchChallan(r.challan.id, user.id);
        toast({ tone: "success", title: "Dispatched", description: r.challan.challanNo });
      } catch (e) {
        toast({ tone: "error", title: "Dispatch failed", description: (e as Error).message });
      }
    }
  };

  const dispatchAllReady = async () => {
    const ready = rows.filter((r) => r.challan.status === "Ready");
    if (!ready.length) {
      toast({ tone: "info", title: "Nothing to dispatch", description: "No challans are waiting." });
      return;
    }
    const ok = await confirm({
      title: `Dispatch ${ready.length} challan${ready.length > 1 ? "s" : ""}?`,
      description: "Every packed order in this filter goes out for delivery.",
      confirmLabel: "Dispatch all",
    });
    if (!ok) return;
    try {
      await Promise.all(ready.map((r) => dispatchChallan(r.challan.id, user.id)));
      toast({ tone: "success", title: "Dispatched", description: `${ready.length} challans are on the road.` });
    } catch (e) {
      toast({ tone: "error", title: "Dispatch failed", description: (e as Error).message });
    }
  };

  const exportCsv = () => {
    const head = [
      "Order No.",
      "Customer",
      "Delivery Address",
      "Driver",
      "Vehicle No.",
      "Scheduled",
      "Actual",
      "Status",
    ];
    const body = rows.map((r) => [
      r.order?.orderNo ?? "",
      r.customer?.name ?? "",
      r.customer?.deliveryAddress ?? "",
      r.driverName,
      r.challan.vehicleNo,
      r.route?.departureTime ?? "",
      r.challan.deliveredAt ? fmtTime(r.challan.deliveredAt) : "",
      r.challan.status,
    ]);
    const csv = [head, ...body]
      .map((line) => line.map((v) => `"${String(v)}"`).join(","))
      .join("\r\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(
      new Blob([csv], { type: "text/csv;charset=utf-8;" }),
    );
    a.download = `deliveries-${date}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  return (
    <div className="flex flex-col gap-4">
      <nav className="flex items-center gap-1 text-[12.5px] text-muted">
        <span>Delivery</span>
        <ChevronRight size={13} className="text-subtle" />
        <span className="font-medium text-ink">Delivery Management</span>
      </nav>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 max-w-md">
          <h1 className="text-[26px] leading-tight font-bold tracking-[-0.01em] text-ink">
            Delivery Management
          </h1>
          <p className="mt-1 text-[13px] text-muted">
            Track deliveries, manage your fleet and ensure fresh produce reaches
            customers on time.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <label className="flex items-center gap-2 text-[12.5px] font-medium text-muted">
            Date
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="h-9 rounded-lg border border-line bg-white px-2.5 text-[13px] text-ink"
            />
          </label>
          <Button variant="primary" icon={Truck} onClick={dispatchAllReady}>
            Assign Delivery
          </Button>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex min-w-0 flex-col gap-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <Kpi
              icon={Truck}
              tone="bg-fresh-50 text-fresh-600"
              value={String(allRows.length)}
              label="Total Deliveries"
              note={`${vsLastMonth >= 0 ? "↑" : "↓"} ${Math.abs(vsLastMonth)}% vs last month`}
            />
            <Kpi
              icon={RouteIcon}
              tone="bg-blue-50 text-blue-600"
              value={String(inTransit)}
              label="In Transit"
              note={`${allRows.length ? Math.round((inTransit / allRows.length) * 100) : 0}% of total`}
            />
            <Kpi
              icon={CheckCircle2}
              tone="bg-emerald-50 text-emerald-600"
              value={String(delivered)}
              label="Delivered"
              note={`${allRows.length ? Math.round((delivered / allRows.length) * 100) : 0}% of total`}
            />
            <Kpi
              icon={Clock}
              tone="bg-amber-50 text-amber-600"
              value={String(delayed)}
              label="Delayed"
              note="past expected time"
            />
            <Kpi
              icon={CircleX}
              tone="bg-red-50 text-red-500"
              value={String(failed)}
              label="Failed / Returned"
              note={`${allRows.length ? Math.round((failed / allRows.length) * 100) : 0}% of total`}
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
                placeholder="Search order no, customer, driver…"
                leading={<Search size={15} />}
                className="w-full sm:w-60"
              />
              <Select
                value={status}
                onChange={(e) => {
                  setStatus(e.target.value);
                  setPage(1);
                }}
                placeholder="All Status"
                options={[
                  "Ready",
                  "Dispatched",
                  "In Transit",
                  "Delivered",
                  "Partial",
                  "Failed",
                ]}
                className="w-36"
              />
              <Select
                value={driverId}
                onChange={(e) => {
                  setDriverId(e.target.value);
                  setPage(1);
                }}
                placeholder="All Drivers"
                className="w-40"
                options={drivers.map((d) => ({ value: d.id, label: d.name }))}
              />
              <Select
                value={routeId}
                onChange={(e) => {
                  setRouteId(e.target.value);
                  setPage(1);
                }}
                placeholder="All Routes"
                className="w-44"
                options={db.routes.map((r) => ({ value: r.id, label: r.name }))}
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
              <FilterField label="Still out">
                <Switch
                  checked={openOnly}
                  onChange={(v) => {
                    setOpenOnly(v);
                    setPage(1);
                  }}
                  label="Hide completed deliveries"
                />
              </FilterField>
            </FilterPanel>

            {rows.length === 0 ? (
              <EmptyState
                icon={Truck}
                title="No deliveries yet"
                description="Challans appear here once orders are packed."
              />
            ) : (
              <>
                <div className="scrollbar-thin overflow-x-auto">
                  <table className="w-full border-collapse text-[12.5px]">
                    <thead>
                      <tr className="border-b border-line bg-canvas/70 text-[11px] font-semibold tracking-wide text-subtle uppercase">
                        <th className="w-10 px-2 py-2.5 text-center">#</th>
                        <th className="px-3 py-2.5 text-left">Order No.</th>
                        <th className="px-3 py-2.5 text-left">Customer</th>
                        <th className="px-3 py-2.5 text-left">
                          Delivery Address
                        </th>
                        <th className="px-3 py-2.5 text-left">Driver</th>
                        <th className="px-3 py-2.5 text-left">Vehicle No.</th>
                        <th className="px-3 py-2.5 text-left">Scheduled</th>
                        <th className="px-3 py-2.5 text-left">Actual</th>
                        <th className="px-3 py-2.5 text-center">Status</th>
                        <th className="px-3 py-2.5 text-center">Action</th>
                        <th className="w-10 px-2 py-2.5" />
                      </tr>
                    </thead>
                    <tbody>
                      {pageRows.map((r, i) => (
                        <tr
                          key={r.challan.id}
                          onClick={() => setSelectedId(r.challan.id)}
                          className={cn(
                            "cursor-pointer border-b border-line last:border-0 hover:bg-fresh-50/40",
                            detail?.challan.id === r.challan.id &&
                              "bg-fresh-50/60",
                          )}
                        >
                          <td className="tabular px-2 py-2.5 text-center text-subtle">
                            {(page - 1) * pageSize + i + 1}
                          </td>
                          <td className="px-3 py-2.5 font-medium whitespace-nowrap text-brand-700">
                            {r.order?.orderNo ?? "—"}
                          </td>
                          <td className="px-3 py-2.5 whitespace-nowrap text-ink">
                            {r.customer?.name ?? "—"}
                          </td>
                          <td className="max-w-[160px] truncate px-3 py-2.5 text-muted">
                            {r.customer?.location ?? "—"}
                          </td>
                          <td className="px-3 py-2.5 whitespace-nowrap text-muted">
                            {r.driverName}
                          </td>
                          <td className="tabular px-3 py-2.5 whitespace-nowrap text-muted">
                            {r.challan.vehicleNo}
                          </td>
                          <td className="px-3 py-2.5 whitespace-nowrap text-muted">
                            {r.route?.departureTime ?? "—"}
                          </td>
                          <td className="px-3 py-2.5 whitespace-nowrap text-muted">
                            {r.challan.deliveredAt
                              ? fmtTime(r.challan.deliveredAt)
                              : "–"}
                          </td>
                          <td className="px-3 py-2.5 text-center">
                            <span
                              className={cn(
                                "rounded-full px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap",
                                STATUS_TONE[r.challan.status] ??
                                  "bg-canvas text-muted",
                              )}
                            >
                              {r.challan.status}
                            </span>
                          </td>
                          <td
                            className="px-3 py-2.5 text-center"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {r.challan.status === "Ready" ? (
                              <Button
                                size="sm"
                                variant="primary"
                                onClick={() => doDispatch(r)}
                              >
                                Dispatch
                              </Button>
                            ) : (
                              <Button
                                size="sm"
                                variant="secondary"
                                onClick={() => nav(`/challans/${r.challan.id}`)}
                              >
                                View
                              </Button>
                            )}
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
                    deliveries
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
            <SideCard icon={Truck} title="Delivery Status Distribution">
              <div className="flex items-center gap-3 p-4">
                <div className="relative h-32 w-32 shrink-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={byStatus}
                        dataKey="value"
                        nameKey="name"
                        innerRadius={38}
                        outerRadius={58}
                        paddingAngle={2}
                      >
                        {byStatus.map((s) => (
                          <Cell key={s.name} fill={s.color} />
                        ))}
                      </Pie>
                      <Tooltip contentStyle={TOOLTIP} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
                    <div>
                      <p className="tabular text-[17px] leading-none font-bold text-ink">
                        {allRows.length}
                      </p>
                      <p className="text-[10px] text-subtle">
                        Total Deliveries
                      </p>
                    </div>
                  </div>
                </div>
                <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                  {byStatus.map((s) => (
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
                          {allRows.length
                            ? Math.round((s.value / allRows.length) * 100)
                            : 0}
                          %)
                        </span>
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </SideCard>

            <SideCard icon={User} title="Drivers">
              <div className="flex flex-col divide-y divide-line">
                {driverLoad.map((d) => (
                  <div
                    key={d.driver.id}
                    className="flex items-center gap-2.5 px-4 py-2.5"
                  >
                    <span className="grid size-7 shrink-0 place-items-center rounded-full bg-fresh-50 text-[11px] font-bold text-brand-800">
                      {d.driver.name.slice(0, 1)}
                    </span>
                    <p className="min-w-0 flex-1 truncate text-[12.5px] text-ink">
                      {d.driver.name}
                    </p>
                    <span
                      className={cn(
                        "shrink-0 rounded-full px-2 py-0.5 text-[10.5px] font-semibold",
                        d.onDuty
                          ? "bg-emerald-50 text-emerald-700"
                          : "bg-canvas text-muted",
                      )}
                    >
                      {d.onDuty ? "On Duty" : "Off Duty"}
                    </span>
                    <p className="tabular shrink-0 text-[11.5px] text-muted">
                      {d.count} deliveries
                    </p>
                  </div>
                ))}
                {driverLoad.length === 0 && (
                  <p className="px-4 py-3 text-[12.5px] text-muted">
                    No drivers configured.
                  </p>
                )}
              </div>
            </SideCard>

            <SideCard icon={Settings} title="Quick Actions">
              <div className="flex flex-col divide-y divide-line">
                {[
                  {
                    icon: Truck,
                    label: "Assign Delivery",
                    desc: "Assign driver to orders",
                    action: dispatchAllReady,
                  },
                  {
                    icon: RouteIcon,
                    label: "Optimize Routes",
                    desc: "Route order from customer master",
                    action: () => nav("/customers"),
                  },
                  {
                    icon: Bell,
                    label: "Notify Customers",
                    desc: "Send delivery updates",
                    action: () => nav("/notifications"),
                  },
                  {
                    icon: Download,
                    label: "Download Delivery Report",
                    desc: "Export delivery data",
                    action: exportCsv,
                  },
                  {
                    icon: User,
                    label: "Manage Fleet",
                    desc: "Add / update drivers",
                    action: () => nav("/users"),
                  },
                ].map((q) => (
                  <button
                    key={q.label}
                    onClick={q.action}
                    className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left hover:bg-fresh-50/40"
                  >
                    <q.icon size={15} className="shrink-0 text-brand-700" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[12.5px] font-medium text-ink">
                        {q.label}
                      </p>
                      <p className="truncate text-[11px] text-subtle">
                        {q.desc}
                      </p>
                    </div>
                    <ChevronRight size={14} className="shrink-0 text-subtle" />
                  </button>
                ))}
              </div>
            </SideCard>
          </div>
        </div>

        {/* ================================================ right sidebar */}
        <div className="flex flex-col gap-4">
          {detail && (
            <SideCard icon={MapPin} title="Delivery Details">
              <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-2.5">
                <p className="text-[14px] font-bold text-ink">
                  {detail.order?.orderNo ?? detail.challan.challanNo}
                </p>
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 text-[11px] font-semibold",
                    STATUS_TONE[detail.challan.status] ??
                      "bg-canvas text-muted",
                  )}
                >
                  {detail.challan.status}
                </span>
              </div>
              <div className="flex flex-col gap-2 px-4 py-3 text-[12.5px]">
                <p className="font-semibold text-ink">
                  {detail.customer?.name ?? "—"}
                </p>
                <span className="flex items-center gap-2 text-muted">
                  <MapPin size={13} className="shrink-0 text-subtle" />
                  {detail.customer?.deliveryAddress ||
                    detail.customer?.location}
                </span>
                <span className="flex items-center gap-2 text-muted">
                  <User size={13} className="shrink-0 text-subtle" />
                  {detail.driverName}
                </span>
                <span className="flex items-center gap-2 text-muted">
                  <Phone size={13} className="shrink-0 text-subtle" />
                  {detail.customer?.mobile ?? "—"}
                </span>
                <span className="flex items-center gap-2 text-muted">
                  <Truck size={13} className="shrink-0 text-subtle" />
                  {detail.challan.vehicleNo}
                </span>
                <span className="flex items-center gap-2 text-muted">
                  <Clock size={13} className="shrink-0 text-subtle" />
                  Scheduled: {fmtDate(detail.challan.challanDate)},{" "}
                  {detail.route?.departureTime ?? "—"}
                </span>
                <span className="flex items-center gap-2 text-muted">
                  <CheckCircle2 size={13} className="shrink-0 text-subtle" />
                  {detail.challan.deliveredAt
                    ? `Delivered ${fmtTime(detail.challan.deliveredAt)}`
                    : detail.challan.dispatchedAt
                      ? `Dispatched ${fmtTime(detail.challan.dispatchedAt)}`
                      : "Not dispatched yet"}
                </span>
                <span className="flex items-center gap-2 text-muted">
                  <Truck size={13} className="shrink-0 text-subtle" />
                  {detail.challan.packages} packages
                </span>
              </div>
              <div className="p-3">
                <Button
                  variant="primary"
                  size="sm"
                  className="w-full"
                  onClick={() => nav(`/challans/${detail.challan.id}`)}
                >
                  Open Challan
                </Button>
              </div>
            </SideCard>
          )}

          <SideCard icon={RouteIcon} title="Routes Today">
            <div className="flex flex-col divide-y divide-line">
              {db.routes.map((r) => {
                const list = allRows.filter((x) => x.route?.id === r.id);
                const done = list.filter(
                  (x) =>
                    x.challan.status === "Delivered" ||
                    x.challan.status === "Partial",
                ).length;
                return (
                  <button
                    key={r.id}
                    onClick={() => {
                      setRouteId(r.id);
                      setPage(1);
                    }}
                    className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left hover:bg-fresh-50/40"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[12.5px] text-ink">
                        {r.name}
                      </p>
                      <p className="text-[11px] text-subtle">
                        Departs {r.departureTime}
                      </p>
                    </div>
                    <p className="tabular shrink-0 text-[12px] font-semibold text-ink">
                      {done}/{list.length}
                    </p>
                  </button>
                );
              })}
            </div>
          </SideCard>
        </div>
      </div>

      <div className="rounded-card bg-gradient-to-r from-brand-800 to-fresh-600 p-5 text-white">
        <p className="text-[15px] font-semibold">
          Fresh Produce. On Time. Every Time.
        </p>
        <p className="text-[12.5px] text-white/80">
          Delivering freshness to build stronger relationships.
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
      <div className="flex items-center gap-2.5">
        <span
          className={cn(
            "grid size-10 shrink-0 place-items-center rounded-xl",
            tone,
          )}
        >
          <Icon size={18} />
        </span>
        <div className="min-w-0">
          <p className="tabular text-[20px] leading-none font-bold text-ink">
            {value}
          </p>
          <p className="mt-1 text-[11.5px] leading-tight font-medium text-ink">
            {label}
          </p>
          <p className="text-[10.5px] leading-tight text-subtle">{note}</p>
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
