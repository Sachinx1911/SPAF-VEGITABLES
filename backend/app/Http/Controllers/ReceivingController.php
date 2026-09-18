<?php

namespace App\Http\Controllers;

use App\Models\PurchaseOrder;
use App\Models\Receiving;
use App\Models\ReceivingItem;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

class ReceivingController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $data = $request->validate([
            'pending' => ['sometimes', 'boolean'],
            'per_page' => ['sometimes', 'integer', 'min:1', 'max:200'],
        ]);

        // The queue: confirmed purchases that have not been fully received.
        if ($data['pending'] ?? false) {
            $queue = PurchaseOrder::with(['supplier:id,name', 'lines'])
                ->whereIn('status', ['Confirmed', 'Partially Received'])
                ->orderBy('for_delivery_date')
                ->get()
                ->map(fn (PurchaseOrder $po) => [
                    'id' => (string) $po->id,
                    'poNo' => $po->po_no,
                    'supplier' => $po->supplier->name,
                    'purchaseDate' => $po->purchase_date->toDateString(),
                    'forDeliveryDate' => $po->for_delivery_date->toDateString(),
                    'lineCount' => $po->lines->count(),
                    'totalQty' => (float) $po->lines->sum('qty'),
                    'status' => $po->status,
                ]);

            return response()->json(['queue' => $queue]);
        }

        $grns = Receiving::with(['purchaseOrder:id,po_no', 'receivedBy:id,name'])
            ->orderByDesc('received_at')
            ->paginate($data['per_page'] ?? 50);

        return response()->json($grns);
    }

    /**
     * Records a GRN — what actually turned up.
     *
     * The purchase order is never edited: a short delivery leaves the ordered
     * quantity intact and the difference visible, which is what a supplier
     * conversation later depends on.
     */
    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'purchase_order_id' => ['required', 'exists:purchase_orders,id'],
            'lines' => ['required', 'array', 'min:1'],
            'lines.*.purchase_order_item_id' => ['required', 'exists:purchase_order_items,id'],
            'lines.*.received_qty' => ['required', 'numeric', 'gte:0'],
            'lines.*.condition' => ['sometimes', Rule::in(['Good', 'Average', 'Damaged'])],
        ]);

        $po = PurchaseOrder::with('lines')->findOrFail($data['purchase_order_id']);

        if ($po->status === 'Received') {
            return response()->json(['message' => "{$po->po_no} has already been fully received."], 422);
        }

        $user = $request->user();

        $grn = DB::transaction(function () use ($data, $po, $user) {
            $shortAny = false;
            $anyReceived = false;

            $grn = Receiving::create([
                'grn_no' => $this->nextGrnNo(),
                'purchase_order_id' => $po->id,
                'received_at' => now(),
                'received_by' => $user->id,
                'status' => 'Received',   // corrected below once the lines are known
            ]);

            foreach ($data['lines'] as $line) {
                $poLine = $po->lines->firstWhere('id', $line['purchase_order_item_id']);
                if (! $poLine) {
                    abort(422, "Line {$line['purchase_order_item_id']} does not belong to {$po->po_no}.");
                }

                $received = (float) $line['received_qty'];
                $ordered = (float) $poLine->qty;

                if ($received < $ordered) $shortAny = true;
                if ($received > 0) $anyReceived = true;

                ReceivingItem::create([
                    'receiving_id' => $grn->id,
                    'purchase_order_item_id' => $poLine->id,
                    'item_id' => $poLine->item_id,
                    'unit' => $poLine->unit,
                    // Copied for the record. The purchase order stays as it was.
                    'ordered_qty' => $ordered,
                    'received_qty' => $received,
                    'condition' => $line['condition'] ?? 'Good',
                ]);
            }

            $status = ! $anyReceived ? 'Rejected' : ($shortAny ? 'Partial' : 'Received');
            $grn->update(['status' => $status]);

            $po->update([
                'status' => match ($status) {
                    'Received' => 'Received',
                    'Partial' => 'Partially Received',
                    default => $po->status,
                },
            ]);

            return $grn;
        });

        activity_log(
            $user,
            $grn->status === 'Partial' ? 'Stock received (partial)' : 'Stock received',
            'receiving',
            $grn->grn_no,
            null,
            '',
            $po->po_no,
            $grn->status === 'Received' ? 'Success' : 'Warning',
        );

        return response()->json(['receiving' => $grn->load('lines')], 201);
    }

    public function show(Receiving $receiving): JsonResponse
    {
        $receiving->load(['lines.item:id,name,unit,category', 'lines.qualityCheck', 'purchaseOrder.supplier']);

        return response()->json([
            'receiving' => $receiving,
            'lines' => $receiving->lines->map(fn (ReceivingItem $l) => [
                'id' => (string) $l->id,
                'itemId' => (string) $l->item_id,
                'itemName' => $l->item->name,
                'unit' => $l->unit,
                'orderedQty' => (float) $l->ordered_qty,
                'receivedQty' => (float) $l->received_qty,
                'variance' => $l->variance(),
                'condition' => $l->condition,
                'qualityChecked' => (bool) $l->qualityCheck,
            ]),
        ]);
    }

    /**
     * The normalised procurement tables for the operational window, in the front
     * end's own shape, so the Receiving and Quality Check screens fill their
     * store and their existing queue logic runs unchanged.
     *
     * Scoped to recent delivery dates plus anything still open, so it stays a
     * small, bounded payload rather than the whole history.
     */
    public function context(Request $request): JsonResponse
    {
        $data = $request->validate([
            'since' => ['sometimes', 'date_format:Y-m-d'],
        ]);
        $since = $data['since'] ?? now()->subDays(30)->toDateString();

        $orders = PurchaseOrder::with(['lines', 'receivings.lines.qualityCheck'])
            ->where(fn ($q) => $q
                ->whereDate('for_delivery_date', '>=', $since)
                ->orWhereIn('status', ['Confirmed', 'Partially Received']))
            ->get();

        $purchaseOrders = [];
        $purchaseOrderItems = [];
        $receivings = [];
        $receivingItems = [];
        $qualityChecks = [];

        foreach ($orders as $po) {
            $purchaseOrders[] = [
                'id' => (string) $po->id,
                'poNo' => $po->po_no,
                'supplierId' => (string) $po->supplier_id,
                'purchaseDate' => $po->purchase_date->toDateString(),
                'forDeliveryDate' => $po->for_delivery_date->toDateString(),
                'supplierInvoiceNo' => $po->supplier_invoice_no,
                'status' => $po->status,
                'taxAmount' => (float) $po->tax_amount,
                'createdBy' => (string) $po->created_by,
                'createdAt' => $po->created_at?->toIso8601String() ?? '',
            ];

            foreach ($po->lines as $l) {
                $purchaseOrderItems[] = [
                    'id' => (string) $l->id,
                    'purchaseOrderId' => (string) $l->purchase_order_id,
                    'itemId' => (string) $l->item_id,
                    'unit' => $l->unit,
                    'qty' => (float) $l->qty,
                    'rate' => (float) $l->rate,
                    'remarks' => '',
                ];
            }

            foreach ($po->receivings as $grn) {
                $receivings[] = [
                    'id' => (string) $grn->id,
                    'grnNo' => $grn->grn_no,
                    'purchaseOrderId' => (string) $grn->purchase_order_id,
                    'receivedAt' => $grn->received_at?->toIso8601String() ?? '',
                    'receivedBy' => (string) $grn->received_by,
                    'status' => $grn->status,
                ];

                foreach ($grn->lines as $ri) {
                    $receivingItems[] = [
                        'id' => (string) $ri->id,
                        'receivingId' => (string) $ri->receiving_id,
                        'purchaseOrderItemId' => (string) $ri->purchase_order_item_id,
                        'itemId' => (string) $ri->item_id,
                        'unit' => $ri->unit,
                        'orderedQty' => (float) $ri->ordered_qty,
                        'receivedQty' => (float) $ri->received_qty,
                        'condition' => $ri->condition,
                    ];

                    if ($ri->qualityCheck) {
                        $qc = $ri->qualityCheck;
                        $qualityChecks[] = [
                            'id' => (string) $qc->id,
                            'receivingItemId' => (string) $qc->receiving_item_id,
                            'itemId' => (string) $qc->item_id,
                            'unit' => $qc->unit,
                            'acceptedQty' => (float) $qc->accepted_qty,
                            'rejectedQty' => (float) $qc->rejected_qty,
                            'grade' => $qc->grade,
                            'reason' => $qc->reason,
                            'remarks' => $qc->remarks ?? '',
                            'checkedBy' => (string) $qc->checked_by,
                            'checkedAt' => $qc->checked_at?->toIso8601String() ?? '',
                        ];
                    }
                }
            }
        }

        return response()->json(compact(
            'purchaseOrders', 'purchaseOrderItems', 'receivings', 'receivingItems', 'qualityChecks',
        ));
    }

    /** GRN-YYMM-NNNN, restarting each month. */
    private function nextGrnNo(): string
    {
        $prefix = 'GRN-' . now()->format('ym') . '-';
        $last = Receiving::where('grn_no', 'like', "{$prefix}%")->max('grn_no');
        $n = $last ? ((int) substr($last, -4)) + 1 : 1;

        return $prefix . str_pad((string) $n, 4, '0', STR_PAD_LEFT);
    }
}
