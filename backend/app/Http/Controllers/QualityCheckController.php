<?php

namespace App\Http\Controllers;

use App\Models\QualityCheck;
use App\Models\ReceivingItem;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

class QualityCheckController extends Controller
{
    /** Received lines that nobody has graded yet. */
    public function index(Request $request): JsonResponse
    {
        $pending = ReceivingItem::with(['item:id,name,unit,category', 'receiving:id,grn_no,received_at'])
            ->doesntHave('qualityCheck')
            ->where('received_qty', '>', 0)
            ->get()
            ->map(fn (ReceivingItem $l) => [
                'receivingItemId' => (string) $l->id,
                'grnNo' => $l->receiving->grn_no,
                'itemId' => (string) $l->item_id,
                'itemName' => $l->item->name,
                'unit' => $l->unit,
                'receivedQty' => (float) $l->received_qty,
                'condition' => $l->condition,
                'receivedAt' => $l->receiving->received_at?->toIso8601String(),
            ]);

        return response()->json(['queue' => $pending]);
    }

    /**
     * Grades a received line — and this is the only thing in the system that
     * adds to stock, with the accepted quantity alone. Rejected produce never
     * becomes sellable, which is why the two numbers are recorded separately
     * instead of as one "usable" figure.
     */
    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'receiving_item_id' => ['required', 'exists:receiving_items,id'],
            'accepted_qty' => ['required', 'numeric', 'gte:0'],
            'rejected_qty' => ['required', 'numeric', 'gte:0'],
            'grade' => ['required', Rule::in(['A', 'B', 'C', 'Rejected'])],
            'reason' => ['nullable', Rule::in(['Damaged', 'Overripe', 'Underripe', 'Poor Quality', 'Wrong Item', 'Wrong Qty', 'Other'])],
            'remarks' => ['sometimes', 'string', 'max:500'],
        ]);

        $line = ReceivingItem::with('item')->findOrFail($data['receiving_item_id']);

        if ($line->qualityCheck) {
            return response()->json(['message' => 'This line has already been quality checked.'], 422);
        }

        $accepted = (float) $data['accepted_qty'];
        $rejected = (float) $data['rejected_qty'];
        $received = (float) $line->received_qty;

        // Accepted plus rejected has to account for what arrived — otherwise
        // produce silently disappears from the record.
        if (round($accepted + $rejected, 3) > round($received, 3)) {
            return response()->json([
                'message' => "Accepted ({$accepted}) plus rejected ({$rejected}) is more than the {$received} {$line->unit} received.",
            ], 422);
        }

        if ($rejected > 0 && empty($data['reason'])) {
            return response()->json(['message' => 'A rejection needs a reason.'], 422);
        }

        $user = $request->user();

        $qc = DB::transaction(function () use ($data, $line, $accepted, $user) {
            $qc = QualityCheck::create([
                'receiving_item_id' => $line->id,
                'item_id' => $line->item_id,
                'unit' => $line->unit,
                'accepted_qty' => $accepted,
                'rejected_qty' => $data['rejected_qty'],
                'grade' => $data['grade'],
                'reason' => $data['reason'] ?? null,
                'remarks' => $data['remarks'] ?? '',
                'checked_by' => $user->id,
                'checked_at' => now(),
            ]);

            if ($accepted > 0) {
                $line->item->creditStock($accepted);
            }

            return $qc;
        });

        activity_log(
            $user,
            'Quality check recorded',
            'receiving',
            $line->item->name,
            null,
            '',
            "Grade {$data['grade']} · accepted {$accepted} {$line->unit}",
            $data['rejected_qty'] > 0 ? 'Warning' : 'Success',
        );

        return response()->json([
            'qualityCheck' => $qc,
            'stockNow' => (float) $line->item->fresh()->stock,
        ], 201);
    }
}
