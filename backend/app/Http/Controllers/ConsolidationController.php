<?php

namespace App\Http\Controllers;

use App\Models\ConsolidationLock;
use App\Models\Item;
use App\Models\Order;
use App\Models\PurchaseRequirement;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class ConsolidationController extends Controller
{
    /**
     * The day's matrix: items down the side, customers across the top, in route
     * order so the printed sheet matches the order the van loads in.
     */
    public function matrix(Request $request): JsonResponse
    {
        $date = $request->validate([
            'delivery_date' => ['required', 'date_format:Y-m-d'],
        ])['delivery_date'];

        $orders = Order::with(['lines.item', 'customer'])
            ->forDelivery($date)
            ->consolidatable()
            ->get();

        $customers = $orders->pluck('customer')
            ->unique('id')
            ->sortBy('route_order')
            ->values();

        // Keyed by item, because Item + Unit is already one row — two units of
        // the same produce stay two rows, which is the whole point.
        $rows = [];
        foreach ($orders as $order) {
            foreach ($order->lines as $line) {
                // Approved quantity is what gets bought. Falling back to ordered
                // covers an approved-but-unadjusted line.
                $qty = (float) ($line->qty_approved ?? $line->qty_ordered);
                if ($qty <= 0) {
                    continue;
                }

                $key = $line->item_id;
                $rows[$key] ??= [
                    'itemId' => (string) $line->item_id,
                    'name' => $line->item->name,
                    'unit' => $line->unit,
                    'category' => $line->item->category,
                    'sortOrder' => $line->item->sort_order,
                    'byCustomer' => [],
                    'total' => 0.0,
                ];
                $cid = (string) $order->customer_id;
                $rows[$key]['byCustomer'][$cid] = ($rows[$key]['byCustomer'][$cid] ?? 0) + $qty;
                $rows[$key]['total'] += $qty;
            }
        }

        usort($rows, fn ($a, $b) => $a['sortOrder'] <=> $b['sortOrder']);

        $pending = Order::forDelivery($date)->awaitingApproval()->count();
        $lock = ConsolidationLock::whereDate('delivery_date', $date)->first();

        return response()->json([
            'deliveryDate' => $date,
            'locked' => (bool) $lock,
            'lockedAt' => $lock?->locked_at?->toIso8601String(),
            'customers' => $customers->map->toPortableArray(),
            'rows' => array_values($rows),
            'orderCount' => $orders->count(),
            'pendingApproval' => $pending,
        ]);
    }

    /**
     * Locks the day and snapshots what must be bought, in one transaction.
     *
     * These two must not be separable: a locked day with no requirement leaves
     * the buyer with nothing to act on, and a requirement without a lock can be
     * invalidated by an order edited a minute later.
     */
    public function lock(Request $request): JsonResponse
    {
        $date = $request->validate([
            'delivery_date' => ['required', 'date_format:Y-m-d'],
        ])['delivery_date'];

        if (ConsolidationLock::whereDate('delivery_date', $date)->exists()) {
            return response()->json(['message' => "Delivery {$date} is already locked."], 422);
        }

        $orders = Order::with('lines')->forDelivery($date)->where('status', 'Approved')->get();

        if ($orders->isEmpty()) {
            return response()->json([
                'message' => "Nothing is approved for {$date}. Approve orders before locking.",
            ], 422);
        }

        $user = $request->user();

        $requirementCount = DB::transaction(function () use ($orders, $date, $user) {
            $lock = ConsolidationLock::create([
                'delivery_date' => $date,
                'locked_at' => now(),
                'locked_by' => $user->id,
            ]);
            $lock->orders()->attach($orders->pluck('id'));

            // Sum the approved quantity per item+unit.
            $totals = [];
            foreach ($orders as $order) {
                foreach ($order->lines as $line) {
                    $qty = (float) ($line->qty_approved ?? $line->qty_ordered);
                    if ($qty <= 0) {
                        continue;
                    }
                    $k = $line->item_id . '|' . $line->unit;
                    $totals[$k] ??= ['item_id' => $line->item_id, 'unit' => $line->unit, 'qty' => 0.0];
                    $totals[$k]['qty'] += $qty;
                }
            }

            // Replace any earlier snapshot for this date rather than adding to it.
            PurchaseRequirement::whereDate('delivery_date', $date)->delete();

            foreach ($totals as $t) {
                $stock = (float) Item::whereKey($t['item_id'])->value('stock');

                PurchaseRequirement::create([
                    'delivery_date' => $date,
                    'item_id' => $t['item_id'],
                    'unit' => $t['unit'],
                    'required_qty' => $t['qty'],
                    // Only stock that can actually serve this requirement counts.
                    'stock_qty' => min($stock, $t['qty']),
                    'generated_at' => now(),
                ]);
            }

            Order::whereIn('id', $orders->pluck('id'))
                ->update(['status' => 'Locked', 'locked_at' => now()]);

            return count($totals);
        });

        activity_log($user, 'Purchase requirement generated', 'purchase', "PR {$date}", null, '', "{$requirementCount} items");
        activity_log($user, 'Consolidation locked', 'consolidation', "Delivery {$date}", null, '', "{$orders->count()} orders");

        return response()->json([
            'message' => "Locked {$orders->count()} orders and generated {$requirementCount} requirement lines.",
            'deliveryDate' => $date,
            'orders' => $orders->count(),
            'requirements' => $requirementCount,
        ]);
    }

    /** Item-wise totals for the weighing floor. */
    public function itemQuantity(Request $request): JsonResponse
    {
        $date = $request->validate([
            'delivery_date' => ['required', 'date_format:Y-m-d'],
        ])['delivery_date'];

        $rows = DB::table('order_items')
            ->join('orders', 'orders.id', '=', 'order_items.order_id')
            ->join('items', 'items.id', '=', 'order_items.item_id')
            ->whereDate('orders.delivery_date', $date)
            ->whereIn('orders.status', ['Approved', 'Locked'])
            ->groupBy('items.id', 'items.name', 'items.category', 'order_items.unit', 'items.sort_order')
            ->orderBy('items.sort_order')
            ->selectRaw('items.id as item_id, items.name, items.category, order_items.unit,
                         SUM(COALESCE(order_items.qty_approved, order_items.qty_ordered)) as total,
                         COUNT(DISTINCT orders.customer_id) as customers')
            ->get();

        return response()->json(['deliveryDate' => $date, 'rows' => $rows]);
    }
}
