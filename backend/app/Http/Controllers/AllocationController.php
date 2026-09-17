<?php

namespace App\Http\Controllers;

use App\Domain\Allocator;
use App\Models\Allocation;
use App\Models\Item;
use App\Models\OrderItem;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class AllocationController extends Controller
{
    public function __construct(private readonly Allocator $allocator) {}

    /**
     * One row per item: what arrived, what the day needs, what has been given
     * out, and the gap. The per-customer split hangs off each row.
     */
    public function index(Request $request): JsonResponse
    {
        $date = $request->validate([
            'delivery_date' => ['required', 'date_format:Y-m-d'],
        ])['delivery_date'];

        $demand = OrderItem::query()
            ->join('orders', 'orders.id', '=', 'order_items.order_id')
            ->join('items', 'items.id', '=', 'order_items.item_id')
            ->whereDate('orders.delivery_date', $date)
            ->whereIn('orders.status', ['Approved', 'Locked'])
            ->whereNotNull('order_items.qty_approved')
            ->groupBy('items.id', 'items.name', 'items.category', 'order_items.unit', 'items.sort_order')
            ->orderBy('items.sort_order')
            ->selectRaw('items.id as item_id, items.name, items.category, order_items.unit,
                         SUM(order_items.qty_approved) as required,
                         SUM(COALESCE(order_items.qty_allocated, 0)) as allocated')
            ->get();

        $rows = $demand->map(function ($d) use ($date) {
            $available = $this->allocator->available($date, (int) $d->item_id);
            $required = (float) $d->required;
            $allocated = (float) $d->allocated;
            $balance = round($available - $required, 3);

            return [
                'itemId' => (string) $d->item_id,
                'name' => $d->name,
                'category' => $d->category,
                'unit' => $d->unit,
                'availableQty' => $available,
                'requiredQty' => $required,
                'allocatedQty' => $allocated,
                'balance' => $balance,
                'status' => $balance < 0 ? 'Shortage' : ($allocated > 0 ? 'Allocated' : 'Pending'),
            ];
        });

        return response()->json([
            'deliveryDate' => $date,
            'rows' => $rows,
            'totals' => [
                'items' => $rows->count(),
                'available' => round($rows->sum('availableQty'), 3),
                'required' => round($rows->sum('requiredQty'), 3),
                'allocated' => round($rows->sum('allocatedQty'), 3),
                'shortage' => round($rows->where('balance', '<', 0)->sum(fn ($r) => abs($r['balance'])), 3),
            ],
        ]);
    }

    /** The per-customer split for one item, in route order. */
    public function lines(Request $request): JsonResponse
    {
        $data = $request->validate([
            'delivery_date' => ['required', 'date_format:Y-m-d'],
            'item_id' => ['required', 'exists:items,id'],
        ]);

        $lines = OrderItem::query()
            ->join('orders', 'orders.id', '=', 'order_items.order_id')
            ->join('customers', 'customers.id', '=', 'orders.customer_id')
            ->whereDate('orders.delivery_date', $data['delivery_date'])
            ->whereIn('orders.status', ['Approved', 'Locked'])
            ->where('order_items.item_id', $data['item_id'])
            ->whereNotNull('order_items.qty_approved')
            ->orderBy('customers.route_order')
            ->select(
                'order_items.id', 'order_items.unit', 'order_items.qty_approved', 'order_items.qty_allocated',
                'customers.name as customer_name', 'customers.id as customer_id', 'customers.route_order',
            )
            ->get()
            ->map(fn ($l) => [
                'orderItemId' => (string) $l->id,
                'customerId' => (string) $l->customer_id,
                'customerName' => $l->customer_name,
                'unit' => $l->unit,
                'requiredQty' => (float) $l->qty_approved,
                'allocatedQty' => $l->qty_allocated === null ? null : (float) $l->qty_allocated,
                'status' => $l->qty_allocated === null
                    ? 'Pending'
                    : ((float) $l->qty_allocated >= (float) $l->qty_approved ? 'Available' : ((float) $l->qty_allocated > 0 ? 'Partial' : 'Shortage')),
            ]);

        return response()->json(['lines' => $lines]);
    }

    /** Runs the proportional split for one item, or for every item of the day. */
    public function auto(Request $request): JsonResponse
    {
        $data = $request->validate([
            'delivery_date' => ['required', 'date_format:Y-m-d'],
            'item_id' => ['sometimes', 'exists:items,id'],
            'override' => ['sometimes', 'boolean'],
        ]);

        $user = $request->user();
        $override = $data['override'] ?? false;

        $itemIds = isset($data['item_id'])
            ? [(int) $data['item_id']]
            : $this->allocator->itemsNeedingAllocation($data['delivery_date']);

        $results = [];
        foreach ($itemIds as $itemId) {
            $results[] = ['itemId' => (string) $itemId]
                + $this->allocator->allocateItem($data['delivery_date'], $itemId, $user, $override);
        }

        return response()->json([
            'allocated' => count($results),
            'results' => $results,
        ]);
    }

    /**
     * Overrides one line by hand.
     *
     * Allowed to exceed what stock supports — the warehouse sometimes knows a
     * substitute is on the way — but it is flagged as an override and audited,
     * so the decision is attributable.
     */
    public function setManual(Request $request, OrderItem $orderItem): JsonResponse
    {
        $data = $request->validate([
            'allocated_qty' => ['required', 'numeric', 'gte:0'],
        ]);

        if ($orderItem->qty_packed !== null) {
            return response()->json([
                'message' => 'This line is already packed. Allocation can no longer change.',
            ], 422);
        }

        $before = $orderItem->qty_allocated;
        $qty = (float) $data['allocated_qty'];
        $user = $request->user();

        $orderItem->resetStage('allocated');
        $orderItem->recordStage('allocated', $qty);

        Allocation::updateOrCreate(
            ['order_item_id' => $orderItem->id],
            [
                'order_id' => $orderItem->order_id,
                'customer_id' => $orderItem->order->customer_id,
                'item_id' => $orderItem->item_id,
                'unit' => $orderItem->unit,
                'delivery_date' => $orderItem->order->delivery_date,
                'required_qty' => $orderItem->qty_approved ?? $orderItem->qty_ordered,
                'allocated_qty' => $qty,
                'override' => true,
                'allocated_by' => $user->id,
                'allocated_at' => now(),
            ],
        );

        activity_log(
            $user, 'Allocation adjusted', 'allocation',
            Item::whereKey($orderItem->item_id)->value('name') ?? (string) $orderItem->item_id,
            $orderItem->order->customer_id, (string) $before, (string) $qty, 'Warning',
        );

        return response()->json(['orderItemId' => (string) $orderItem->id, 'allocatedQty' => $qty]);
    }
}
