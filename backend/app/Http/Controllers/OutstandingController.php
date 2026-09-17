<?php

namespace App\Http\Controllers;

use App\Models\Customer;
use App\Models\Invoice;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class OutstandingController extends Controller
{
    /**
     * Customer-wise dues, split into the aging buckets collections runs on.
     *
     * Buckets are measured from the due date, not the invoice date: an invoice
     * on 60-day terms is not overdue on day 31, and treating it as such sends
     * the team chasing customers who are paying exactly as agreed.
     */
    public function index(Request $request): JsonResponse
    {
        $asOf = $request->query('as_of', now()->toDateString());

        $open = Invoice::with('customer:id,name,code,location,type,credit_limit')
            ->withSum('payments as paid_sum', 'amount')
            ->where('status', '!=', 'Cancelled')
            ->get()
            ->filter(fn (Invoice $i) => $i->balance() > 0.005);

        $rows = [];
        foreach ($open as $inv) {
            $cid = $inv->customer_id;
            $rows[$cid] ??= [
                'customerId' => (string) $cid,
                'customerName' => $inv->customer->name,
                'customerCode' => $inv->customer->code,
                'city' => $inv->customer->location,
                'type' => $inv->customer->type,
                'creditLimit' => (float) $inv->customer->credit_limit,
                'total' => 0.0, 'current' => 0.0, 'd1_30' => 0.0,
                'd31_60' => 0.0, 'd61_90' => 0.0, 'd90plus' => 0.0,
                'invoiceCount' => 0, 'oldestDueDate' => $inv->due_date->toDateString(),
                'status' => 'Current',
            ];

            $balance = $inv->balance();
            $overdue = $inv->daysOverdue($asOf);

            $bucket = match (true) {
                $overdue <= 0 => 'current',
                $overdue <= 30 => 'd1_30',
                $overdue <= 60 => 'd31_60',
                $overdue <= 90 => 'd61_90',
                default => 'd90plus',
            };

            $rows[$cid]['total'] += $balance;
            $rows[$cid][$bucket] += $balance;
            $rows[$cid]['invoiceCount']++;
            if ($inv->due_date->toDateString() < $rows[$cid]['oldestDueDate']) {
                $rows[$cid]['oldestDueDate'] = $inv->due_date->toDateString();
            }
            if ($overdue > 0) {
                $rows[$cid]['status'] = 'Overdue';
            }
        }

        $rows = collect($rows)->map(fn ($r) => array_map(
            fn ($v) => is_float($v) ? round($v, 2) : $v, $r,
        ))->sortByDesc('total')->values();

        return response()->json([
            'asOf' => $asOf,
            'rows' => $rows,
            'summary' => [
                'total' => round($rows->sum('total'), 2),
                'customers' => $rows->count(),
                'overdue' => round($rows->sum(fn ($r) => $r['d1_30'] + $r['d31_60'] + $r['d61_90'] + $r['d90plus']), 2),
                'over60' => round($rows->sum(fn ($r) => $r['d61_90'] + $r['d90plus']), 2),
                'buckets' => [
                    'current' => round($rows->sum('current'), 2),
                    'd1_30' => round($rows->sum('d1_30'), 2),
                    'd31_60' => round($rows->sum('d31_60'), 2),
                    'd61_90' => round($rows->sum('d61_90'), 2),
                    'd90plus' => round($rows->sum('d90plus'), 2),
                ],
            ],
        ]);
    }

    /** Every open invoice for one customer — the follow-up list for a call. */
    public function forCustomer(Request $request, Customer $customer): JsonResponse
    {
        $asOf = $request->query('as_of', now()->toDateString());

        $invoices = Invoice::withSum('payments as paid_sum', 'amount')
            ->where('customer_id', $customer->id)
            ->where('status', '!=', 'Cancelled')
            ->orderBy('due_date')
            ->get()
            ->filter(fn (Invoice $i) => $i->balance() > 0.005)
            ->map(fn (Invoice $i) => [
                'invoiceNo' => $i->invoice_no,
                'invoiceDate' => $i->invoice_date->toDateString(),
                'dueDate' => $i->due_date->toDateString(),
                'total' => (float) $i->total,
                'paid' => $i->paidAmount(),
                'balance' => $i->balance(),
                'daysOverdue' => $i->daysOverdue($asOf),
                'status' => $i->derivedStatus($asOf),
            ])->values();

        return response()->json([
            'customer' => $customer->toPortableArray(),
            'invoices' => $invoices,
            'total' => round($invoices->sum('balance'), 2),
        ]);
    }
}
