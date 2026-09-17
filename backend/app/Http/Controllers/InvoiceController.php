<?php

namespace App\Http\Controllers;

use App\Models\Invoice;
use App\Models\InvoiceItem;
use App\Models\Order;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class InvoiceController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $data = $request->validate([
            'customer_id' => ['sometimes', 'exists:customers,id'],
            'status' => ['sometimes', 'string', 'max:20'],
            'from' => ['sometimes', 'date_format:Y-m-d'],
            'to' => ['sometimes', 'date_format:Y-m-d'],
            'per_page' => ['sometimes', 'integer', 'min:1', 'max:200'],
        ]);

        $query = Invoice::with(['customer:id,name,code'])
            ->withSum('payments as paid_sum', 'amount')
            ->when($data['customer_id'] ?? null, fn ($q, $c) => $q->where('customer_id', $c))
            ->when($data['from'] ?? null, fn ($q, $d) => $q->whereDate('invoice_date', '>=', $d))
            ->when($data['to'] ?? null, fn ($q, $d) => $q->whereDate('invoice_date', '<=', $d))
            ->orderByDesc('invoice_date')
            ->orderByDesc('id');

        $page = $query->paginate($data['per_page'] ?? 50);

        // Status is derived, so filtering by it happens after the sums are known.
        $rows = collect($page->items())->map(fn (Invoice $i) => $this->row($i));

        if ($status = $data['status'] ?? null) {
            $rows = $rows->where('status', $status)->values();
        }

        return response()->json([
            'data' => $rows,
            'total' => $page->total(),
            'currentPage' => $page->currentPage(),
            'lastPage' => $page->lastPage(),
        ]);
    }

    public function show(Invoice $invoice): JsonResponse
    {
        $invoice->load(['lines.item:id,name,unit', 'customer', 'order:id,order_no', 'payments']);

        return response()->json([
            'invoice' => $this->row($invoice),
            'customer' => $invoice->customer->toPortableArray(),
            'lines' => $invoice->lines->map(fn (InvoiceItem $l) => [
                'itemName' => $l->item->name,
                'unit' => $l->unit,
                'qty' => (float) $l->qty,
                'rate' => (float) $l->rate,
                'taxRate' => (float) $l->tax_rate,
                'amount' => (float) $l->amount,
            ]),
            'payments' => $invoice->payments,
        ]);
    }

    /** Orders that were delivered and not yet billed. */
    public function readyToInvoice(): JsonResponse
    {
        $orders = Order::with('customer:id,name,code')
            ->where('invoice_status', 'Ready')
            ->whereIn('status', ['Completed', 'Partially Fulfilled'])
            ->doesntHave('invoice')
            ->get()
            ->map(fn (Order $o) => [
                'orderId' => (string) $o->id,
                'orderNo' => $o->order_no,
                'customerName' => $o->customer->name,
                'deliveryDate' => $o->delivery_date->toDateString(),
                'value' => $o->value(),
            ]);

        return response()->json(['orders' => $orders]);
    }

    /**
     * Bills an order from what was actually delivered.
     *
     * Not from what was ordered, and not from what was dispatched — a customer
     * who refused two crates at the door must not be charged for them. Because
     * the chain keeps every stage, the invoice can use `qty_delivered` while the
     * original request stays visible beside it.
     */
    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'order_id' => ['required', 'exists:orders,id'],
            'invoice_date' => ['sometimes', 'date_format:Y-m-d'],
        ]);

        $order = Order::with(['lines.item', 'customer'])->findOrFail($data['order_id']);

        if ($order->invoice()->exists()) {
            return response()->json(['message' => "{$order->order_no} is already invoiced."], 422);
        }

        $billable = $order->lines->filter(fn ($l) => $l->qty_delivered !== null && (float) $l->qty_delivered > 0);

        if ($billable->isEmpty()) {
            return response()->json([
                'message' => 'Nothing was delivered on this order, so there is nothing to bill.',
            ], 422);
        }

        $invoiceDate = $data['invoice_date'] ?? now()->toDateString();
        $terms = (int) ($order->customer->payment_terms_days ?: setting('default_payment_terms_days', 15));
        $user = $request->user();

        $invoice = DB::transaction(function () use ($order, $billable, $invoiceDate, $terms, $user) {
            $subtotal = 0.0;
            $tax = 0.0;

            foreach ($billable as $line) {
                $amount = (float) $line->qty_delivered * (float) $line->rate;
                $subtotal += $amount;
                $tax += $amount * ((float) $line->item->tax_rate / 100);
            }

            $invoice = Invoice::create([
                'invoice_no' => $this->nextInvoiceNo(),
                'customer_id' => $order->customer_id,
                'order_id' => $order->id,
                'challan_id' => $order->challan?->id,
                'invoice_date' => $invoiceDate,
                'due_date' => date('Y-m-d', strtotime("{$invoiceDate} +{$terms} days")),
                'subtotal' => round($subtotal, 2),
                'tax_amount' => round($tax, 2),
                'total' => round($subtotal + $tax, 2),
                'status' => 'Generated',
                'created_by' => $user->id,
            ]);

            foreach ($billable as $line) {
                $amount = (float) $line->qty_delivered * (float) $line->rate;

                InvoiceItem::create([
                    'invoice_id' => $invoice->id,
                    'order_item_id' => $line->id,
                    'item_id' => $line->item_id,
                    'unit' => $line->unit,
                    'qty' => $line->qty_delivered,
                    'rate' => $line->rate,
                    'tax_rate' => $line->item->tax_rate,
                    'amount' => round($amount, 2),
                ]);

                $line->recordStage('invoiced', (float) $line->qty_delivered);
            }

            $order->update(['invoice_status' => 'Invoiced']);

            return $invoice;
        });

        activity_log($user, 'Invoice generated', 'invoices', $invoice->invoice_no, $order->customer_id, '', $order->order_no);

        return response()->json(['invoice' => $this->row($invoice->fresh())], 201);
    }

    /** Shared shape, with the derived status worked out once. */
    private function row(Invoice $i): array
    {
        $paid = $i->paidAmount();

        return [
            'id' => (string) $i->id,
            'invoiceNo' => $i->invoice_no,
            'customerId' => (string) $i->customer_id,
            'customerName' => $i->customer?->name,
            'orderId' => (string) $i->order_id,
            'invoiceDate' => $i->invoice_date->toDateString(),
            'dueDate' => $i->due_date->toDateString(),
            'subtotal' => (float) $i->subtotal,
            'taxAmount' => (float) $i->tax_amount,
            'total' => (float) $i->total,
            'paid' => $paid,
            'balance' => $i->balance(),
            'daysOverdue' => $i->daysOverdue(),
            // Never stored: worked out from the payments and the due date.
            'status' => $i->derivedStatus(),
        ];
    }

    private function nextInvoiceNo(): string
    {
        $fy = (int) now()->format('n') >= 4
            ? now()->format('y') . '-' . now()->addYear()->format('y')
            : now()->subYear()->format('y') . '-' . now()->format('y');

        $prefix = setting('invoice_prefix', 'SPAF') . "/{$fy}/";
        $last = Invoice::where('invoice_no', 'like', "{$prefix}%")->max('invoice_no');
        $n = $last ? ((int) substr($last, strrpos($last, '/') + 1)) + 1 : 1001;

        return $prefix . $n;
    }
}
