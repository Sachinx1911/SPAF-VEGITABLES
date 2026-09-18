<?php

namespace App\Http\Controllers;

use App\Models\Invoice;
use App\Models\Payment;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

class PaymentController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $data = $request->validate([
            'customer_id' => ['sometimes', 'exists:customers,id'],
            'mode' => ['sometimes', 'nullable', 'string', 'max:20'],
            'from' => ['sometimes', 'date_format:Y-m-d'],
            'to' => ['sometimes', 'date_format:Y-m-d'],
            'per_page' => ['sometimes', 'integer', 'min:1', 'max:200'],
        ]);

        $payments = Payment::with(['customer:id,name,code', 'invoice:id,invoice_no'])
            ->when($data['customer_id'] ?? null, fn ($q, $c) => $q->where('customer_id', $c))
            ->when($data['mode'] ?? null, fn ($q, $m) => $q->where('mode', $m))
            ->when($data['from'] ?? null, fn ($q, $d) => $q->whereDate('payment_date', '>=', $d))
            ->when($data['to'] ?? null, fn ($q, $d) => $q->whereDate('payment_date', '<=', $d))
            ->orderByDesc('payment_date')
            ->orderByDesc('id')
            ->paginate($data['per_page'] ?? 50);

        return response()->json($payments);
    }

    /**
     * Records money against an invoice.
     *
     * Refuses anything that would take the invoice past its total — an
     * overpayment is nearly always a typo or a duplicate entry, and letting it
     * through quietly corrupts the outstanding figure the whole follow-up
     * process runs on.
     */
    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'invoice_id' => ['required', 'exists:invoices,id'],
            'amount' => ['required', 'numeric', 'gt:0'],
            'payment_date' => ['required', 'date_format:Y-m-d'],
            'mode' => ['required', Rule::in(['Cash', 'Bank Transfer', 'UPI', 'Cheque', 'Other'])],
            'reference' => ['sometimes', 'nullable', 'string', 'max:60'],
            'remarks' => ['sometimes', 'nullable', 'string', 'max:500'],
        ]);

        $invoice = Invoice::findOrFail($data['invoice_id']);
        $balance = $invoice->balance();
        $amount = (float) $data['amount'];

        if ($balance <= 0) {
            return response()->json(['message' => "{$invoice->invoice_no} is already settled."], 422);
        }

        if (round($amount, 2) > round($balance, 2)) {
            return response()->json([
                'message' => "Amount {$amount} is more than the {$balance} still outstanding on {$invoice->invoice_no}.",
            ], 422);
        }

        $user = $request->user();

        $payment = DB::transaction(function () use ($data, $invoice, $amount, $user) {
            $payment = Payment::create([
                'receipt_no' => $this->nextReceiptNo(),
                'customer_id' => $invoice->customer_id,
                'invoice_id' => $invoice->id,
                'payment_date' => $data['payment_date'],
                'mode' => $data['mode'],
                'reference' => $data['reference'] ?? '',
                'amount' => $amount,
                'remarks' => $data['remarks'] ?? '',
                'recorded_by' => $user->id,
                'recorded_at' => now(),
            ]);

            // Once an invoice is fully settled, mark the paid stage on the lines
            // it billed, completing the chain.
            if ($invoice->fresh()->balance() <= 0) {
                foreach ($invoice->lines as $line) {
                    $orderItem = $line->orderItem ?? \App\Models\OrderItem::find($line->order_item_id);
                    if ($orderItem && $orderItem->qty_paid === null) {
                        $orderItem->recordStage('paid', (float) $line->qty);
                    }
                }
            }

            return $payment;
        });

        activity_log(
            $user, 'Payment received', 'payments', $payment->receipt_no,
            $invoice->customer_id, '', "{$amount} against {$invoice->invoice_no}",
        );

        return response()->json([
            'payment' => $payment,
            'invoiceStatus' => $invoice->fresh()->derivedStatus(),
            'balance' => $invoice->fresh()->balance(),
        ], 201);
    }

    private function nextReceiptNo(): string
    {
        $prefix = 'RCPT-' . now()->format('ym') . '-';
        $last = Payment::where('receipt_no', 'like', "{$prefix}%")->max('receipt_no');
        $n = $last ? ((int) substr($last, -4)) + 1 : 1;

        return $prefix . str_pad((string) $n, 4, '0', STR_PAD_LEFT);
    }
}
