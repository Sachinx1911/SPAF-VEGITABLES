import { useNavigate, useParams } from "react-router";
import { ArrowLeft, Download, Printer, Send, Truck } from "lucide-react";
import { Card, PageHeader } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { StatusBadge } from "../../components/ui/Badge";
import { Breadcrumb } from "../../components/ui/Breadcrumb";
import { EmptyState } from "../../components/ui/States";
import { useConfirm } from "../../components/ui/ConfirmDialog";
import { useToast } from "../../components/ui/Toast";
import { useCurrentUser, useDb } from "../../store/useStore";
import { dispatchChallan } from "../../store/packingActions";
import { fmtDate, fmtDateTime, num } from "../../lib/format";

export function ChallanDetailPage() {
  const { id } = useParams();
  const db = useDb();
  const user = useCurrentUser()!;
  const nav = useNavigate();
  const confirm = useConfirm();
  const toast = useToast();

  const challan = db.challans.find((c) => c.id === id);
  const order = challan
    ? db.orders.find((o) => o.id === challan.orderId)
    : null;
  const customer = challan
    ? db.customers.find((c2) => c2.id === challan.customerId)
    : null;
  const userById = new Map(db.users.map((u) => [u.id, u]));
  const itemById = new Map(db.items.map((i) => [i.id, i]));
  const backPath = user.role === "driver" ? "/driver" : "/delivery";

  if (!challan || !order || !customer) {
    return (
      <EmptyState
        title="Challan not found"
        action={
          <Button size="sm" onClick={() => nav(backPath)}>
            Back
          </Button>
        }
      />
    );
  }

  const doDispatch = async () => {
    const ok = await confirm({ title: `Dispatch ${challan.challanNo}?`, confirmLabel: "Dispatch" });
    if (!ok) return;
    try {
      await dispatchChallan(challan.id, user.id);
      toast({ tone: "success", title: "Dispatched" });
    } catch (e) {
      toast({ tone: "error", title: "Dispatch failed", description: (e as Error).message });
    }
  };

  return (
    <div>
      <PageHeader
        breadcrumb={
          <Breadcrumb
            items={[
              {
                label: user.role === "driver" ? "Today" : "Delivery",
                to: backPath,
              },
              { label: challan.challanNo },
            ]}
          />
        }
        title={
          <span className="flex items-center gap-2">
            {challan.challanNo} <StatusBadge status={challan.status} />
          </span>
        }
        description={`${customer.name} · ${fmtDate(challan.challanDate)}`}
        actions={
          <>
            <Button
              variant="secondary"
              icon={ArrowLeft}
              onClick={() => nav(backPath)}
            >
              Back
            </Button>
            <Button
              variant="secondary"
              icon={Printer}
              onClick={() => window.print()}
            >
              Print
            </Button>
            <Button
              variant="secondary"
              icon={Download}
              onClick={() =>
                toast({ tone: "success", title: "PDF downloaded (prototype)" })
              }
            >
              Download PDF
            </Button>
            <Button
              variant="secondary"
              icon={Send}
              onClick={() =>
                toast({
                  tone: "success",
                  title: "Sent to customer (prototype)",
                })
              }
            >
              Send
            </Button>
            {challan.status === "Ready" && user.role !== "driver" && (
              <Button variant="primary" icon={Truck} onClick={doDispatch}>
                Mark Dispatched
              </Button>
            )}
          </>
        }
      />

      <Card className="print-area mx-auto max-w-2xl p-8">
        <div className="flex items-start justify-between border-b border-line pb-4">
          <div>
            <p className="text-[16px] font-bold text-ink">
              {db.settings.companyName}
            </p>
            <p className="max-w-xs text-[11.5px] text-muted">
              {db.settings.companyAddress}
            </p>
            <p className="text-[11.5px] text-muted">
              GSTIN: {db.settings.companyGstin} · {db.settings.companyPhone}
            </p>
          </div>
          <div className="text-right">
            <p className="text-[14px] font-semibold text-ink">
              Delivery Challan
            </p>
            <p className="text-[12px] text-muted">
              Challan No: <b>{challan.challanNo}</b>
            </p>
            <p className="text-[12px] text-muted">
              Date: {fmtDate(challan.challanDate)}
            </p>
            <p className="text-[12px] text-muted">Order No: {order.orderNo}</p>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-4 text-[12.5px]">
          <div>
            <p className="text-[11px] font-semibold tracking-wide text-subtle uppercase">
              Deliver to
            </p>
            <p className="mt-1 font-medium text-ink">{customer.name}</p>
            <p className="text-muted">
              {customer.deliveryAddress || customer.billingAddress}
            </p>
            <p className="text-muted">{customer.mobile}</p>
          </div>
          <div className="text-right">
            <p className="text-[11px] font-semibold tracking-wide text-subtle uppercase">
              Route
            </p>
            <p className="mt-1 text-ink">
              {db.routes.find((r) => r.id === challan.routeId)?.name}
            </p>
            <p className="text-muted">Vehicle: {challan.vehicleNo}</p>
            <p className="text-muted">
              Driver: {userById.get(challan.driverId ?? "")?.name ?? "—"}
            </p>
          </div>
        </div>

        <table className="mt-5 w-full border-collapse text-[12.5px]">
          <thead>
            <tr className="border-y border-ink/70 text-left">
              <th className="w-10 py-1.5 font-semibold">Sr</th>
              <th className="py-1.5 font-semibold">Item</th>
              <th className="py-1.5 text-right font-semibold">Unit</th>
              <th className="py-1.5 text-right font-semibold">Qty</th>
            </tr>
          </thead>
          <tbody>
            {challan.lines.map((l, i) => (
              <tr key={l.orderItemId} className="border-b border-line">
                <td className="py-1.5 text-muted">{i + 1}</td>
                <td className="py-1.5 text-ink">
                  {itemById.get(l.itemId)?.name}
                </td>
                <td className="py-1.5 text-right text-muted">{l.unit}</td>
                <td className="py-1.5 text-right tabular font-medium">
                  {num(l.qty)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-1 text-right text-[12px] text-muted">
          Packages: {challan.packages}
        </p>

        {challan.deliveryRemarks && (
          <p className="mt-3 rounded bg-orange-50 p-2 text-[12px] text-orange-800">
            {challan.deliveryRemarks}
          </p>
        )}
        {challan.deliveredAt && (
          <p className="mt-2 text-[12px] text-muted">
            Delivered {fmtDateTime(challan.deliveredAt)} · received by{" "}
            {challan.receivedByName || "—"}
          </p>
        )}

        <div className="mt-10 grid grid-cols-4 gap-4 text-center text-[11px] text-muted">
          {[
            ["Prepared By", userById.get(challan.preparedBy)?.name],
            [
              "Packed By",
              challan.packedBy ? userById.get(challan.packedBy)?.name : "—",
            ],
            [
              "Delivered By",
              challan.driverId ? userById.get(challan.driverId)?.name : "—",
            ],
            ["Customer Received By", challan.receivedByName || "—"],
          ].map(([label, name]) => (
            <div key={label}>
              <div className="h-10 border-b border-ink/40" />
              <p className="mt-1">{label}</p>
              <p className="text-ink">{name}</p>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
