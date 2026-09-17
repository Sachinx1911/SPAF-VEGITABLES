import { useState } from "react";
import { useNavigate, useParams } from "react-router";
import { ArrowLeft, Download, HandCoins, Printer, Send } from "lucide-react";
import { Card, PageHeader } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { StatusBadge } from "../../components/ui/Badge";
import { Breadcrumb } from "../../components/ui/Breadcrumb";
import { EmptyState } from "../../components/ui/States";
import { useToast } from "../../components/ui/Toast";
import { useDb } from "../../store/useStore";
import { invoiceViews } from "../../domain/finance";
import { fmtDate, inr, num } from "../../lib/format";
import { todayISO } from "../../lib/clock";
import { RecordPaymentModal } from "../payments/RecordPaymentModal";

export function InvoiceDetailPage() {
  const { id } = useParams();
  const db = useDb();
  const nav = useNavigate();
  const toast = useToast();
  const [payOpen, setPayOpen] = useState(false);
  const today = todayISO();

  const invoice = invoiceViews(db, today).find((i) => i.id === id);
  const customer = invoice
    ? db.customers.find((c) => c.id === invoice.customerId)
    : null;
  const lines = invoice
    ? db.invoiceItems.filter((l) => l.invoiceId === invoice.id)
    : [];
  const itemById = new Map(db.items.map((i) => [i.id, i]));
  const payments = invoice
    ? db.payments.filter((p) => p.invoiceId === invoice.id)
    : [];

  if (!invoice || !customer) {
    return (
      <EmptyState
        title="Invoice not found"
        action={
          <Button size="sm" onClick={() => nav("/invoices")}>
            Back to invoices
          </Button>
        }
      />
    );
  }

  return (
    <div>
      <PageHeader
        breadcrumb={
          <Breadcrumb
            items={[
              { label: "Invoices", to: "/invoices" },
              { label: invoice.invoiceNo },
            ]}
          />
        }
        title={
          <span className="flex items-center gap-2">
            {invoice.invoiceNo} <StatusBadge status={invoice.derivedStatus} />
          </span>
        }
        description={`${customer.name} · ${fmtDate(invoice.invoiceDate)}`}
        actions={
          <>
            <Button
              variant="secondary"
              icon={ArrowLeft}
              onClick={() => nav("/invoices")}
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
              Download
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
            {invoice.balance > 0 && (
              <Button
                variant="primary"
                icon={HandCoins}
                onClick={() => setPayOpen(true)}
              >
                Record Payment
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
            <p className="text-[14px] font-semibold text-ink">Tax Invoice</p>
            <p className="text-[12px] text-muted">
              Invoice No: <b>{invoice.invoiceNo}</b>
            </p>
            <p className="text-[12px] text-muted">
              Date: {fmtDate(invoice.invoiceDate)}
            </p>
            <p className="text-[12px] text-muted">
              Due: {fmtDate(invoice.dueDate)}
            </p>
          </div>
        </div>

        <div className="mt-4 text-[12.5px]">
          <p className="text-[11px] font-semibold tracking-wide text-subtle uppercase">
            Bill to
          </p>
          <p className="mt-1 font-medium text-ink">{customer.legalName}</p>
          <p className="text-muted">{customer.billingAddress}</p>
          <p className="text-muted">GSTIN: {customer.gstin}</p>
        </div>

        <table className="mt-5 w-full border-collapse text-[12.5px]">
          <thead>
            <tr className="border-y border-ink/70 text-left">
              <th className="py-1.5 font-semibold">Item</th>
              <th className="py-1.5 text-right font-semibold">Qty</th>
              <th className="py-1.5 text-right font-semibold">Unit</th>
              <th className="py-1.5 text-right font-semibold">Rate</th>
              <th className="py-1.5 text-right font-semibold">Tax %</th>
              <th className="py-1.5 text-right font-semibold">Amount</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => (
              <tr key={l.id} className="border-b border-line">
                <td className="py-1.5 text-ink">
                  {itemById.get(l.itemId)?.name}
                </td>
                <td className="py-1.5 text-right tabular">{num(l.qty)}</td>
                <td className="py-1.5 text-right text-muted">{l.unit}</td>
                <td className="py-1.5 text-right tabular">
                  {inr(l.rate, true)}
                </td>
                <td className="py-1.5 text-right text-muted">{l.taxRate}%</td>
                <td className="py-1.5 text-right tabular font-medium">
                  {inr(l.amount)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="mt-3 flex flex-col items-end gap-1 text-[12.5px]">
          <div className="flex w-56 justify-between">
            <span className="text-muted">Subtotal</span>
            <span className="tabular">{inr(invoice.subtotal)}</span>
          </div>
          <div className="flex w-56 justify-between">
            <span className="text-muted">Tax</span>
            <span className="tabular">{inr(invoice.taxAmount)}</span>
          </div>
          <div className="flex w-56 justify-between text-[15px] font-semibold">
            <span>Total</span>
            <span className="tabular">{inr(invoice.total)}</span>
          </div>
          {invoice.paid > 0 && (
            <div className="flex w-56 justify-between text-emerald-700">
              <span>Paid</span>
              <span className="tabular">{inr(invoice.paid)}</span>
            </div>
          )}
          {invoice.balance > 0 && (
            <div className="flex w-56 justify-between font-semibold text-orange-600">
              <span>Balance Due</span>
              <span className="tabular">{inr(invoice.balance)}</span>
            </div>
          )}
        </div>

        {payments.length > 0 && (
          <div className="mt-5 border-t border-line pt-3 text-[12px]">
            <p className="mb-1.5 font-semibold text-ink">Payments received</p>
            {payments.map((p) => (
              <div key={p.id} className="flex justify-between text-muted">
                <span>
                  {fmtDate(p.paymentDate)} · {p.receiptNo} · {p.mode}
                </span>
                <span className="tabular">{inr(p.amount)}</span>
              </div>
            ))}
          </div>
        )}
      </Card>

      <RecordPaymentModal
        open={payOpen}
        onClose={() => setPayOpen(false)}
        invoiceId={invoice.id}
      />
    </div>
  );
}
