<?php

namespace App\Http\Controllers;

use App\Models\Customer;
use App\Models\Invoice;
use App\Models\Payment;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class LedgerController extends Controller
{
    /**
     * A customer's statement: opening balance, then every invoice and payment in
     * date order with a running balance.
     *
     * The balance is recomputed from the entries each time rather than stored.
     * A stored balance drifts the moment a back-dated payment is entered, and
     * the drift is invisible until somebody disputes a figure.
     */
    public function show(Request $request, Customer $customer): JsonResponse
    {
        $data = $request->validate([
            'from' => ['sometimes', 'date_format:Y-m-d'],
            'to' => ['sometimes', 'date_format:Y-m-d'],
        ]);

        $opening = $customer->openingBalance;
        $openingAmount = (float) ($opening->amount ?? 0);
        $openingDate = $opening?->as_of?->toDateString() ?? '2000-01-01';

        $entries = collect();

        foreach (Invoice::where('customer_id', $customer->id)->where('status', '!=', 'Cancelled')->get() as $inv) {
            $entries->push([
                'date' => $inv->invoice_date->toDateString(),
                'type' => 'Invoice',
                'reference' => $inv->invoice_no,
                'description' => 'Fresh produce supply',
                'debit' => (float) $inv->total,
                'credit' => 0.0,
                'status' => $inv->balance() <= 0 ? 'Settled' : 'Open',
            ]);
        }

        foreach (Payment::with('invoice:id,invoice_no')->where('customer_id', $customer->id)->get() as $pay) {
            $entries->push([
                'date' => $pay->payment_date->toDateString(),
                'type' => 'Payment',
                'reference' => $pay->receipt_no,
                'description' => "Payment received ({$pay->mode})"
                    . ($pay->invoice ? " · {$pay->invoice->invoice_no}" : ''),
                'debit' => 0.0,
                'credit' => (float) $pay->amount,
                'status' => 'Success',
            ]);
        }

        // Oldest first, so the running balance accumulates in the right order.
        $entries = $entries->sortBy('date')->values();

        $rows = collect([[
            'date' => $openingDate,
            'type' => 'Opening',
            'reference' => 'Opening',
            'description' => 'Opening balance',
            'debit' => $openingAmount > 0 ? $openingAmount : 0.0,
            'credit' => $openingAmount < 0 ? -$openingAmount : 0.0,
            'balance' => round($openingAmount, 2),
            'status' => 'Applied',
        ]]);

        $running = $openingAmount;
        foreach ($entries as $e) {
            $running += $e['debit'] - $e['credit'];
            $rows->push($e + ['balance' => round($running, 2)]);
        }

        // The range is applied only for display — the balance still reflects
        // everything that came before it.
        $visible = $rows->filter(fn ($r) => (! isset($data['from']) || $r['date'] >= $data['from'])
            && (! isset($data['to']) || $r['date'] <= $data['to']))->values();

        return response()->json([
            'customer' => $customer->toPortableArray(),
            'rows' => $visible,
            'summary' => [
                'openingBalance' => round($openingAmount, 2),
                'totalInvoiced' => round($entries->sum('debit'), 2),
                'totalPaid' => round($entries->sum('credit'), 2),
                'closingBalance' => round($running, 2),
                'creditLimit' => (float) $customer->credit_limit,
                'availableCredit' => round(max((float) $customer->credit_limit - $running, 0), 2),
            ],
        ]);
    }
}
