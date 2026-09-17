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

    /** GRN-YYMM-NNNN, restarting each month. */
    private function nextGrnNo(): string
    {
        $prefix = 'GRN-' . now()->format('ym') . '-';
        $last = Receiving::where('grn_no', 'like', "{$prefix}%")->max('grn_no');
        $n = $last ? ((int) substr($last, -4)) + 1 : 1;

        return $prefix . str_pad((string) $n, 4, '0', STR_PAD_LEFT);
    }
}
