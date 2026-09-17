<?php

namespace App\Domain;

use App\Models\Allocation;
use App\Models\Item;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\PurchaseRequirement;
use App\Models\QualityCheck;
use App\Models\User;
use Illuminate\Support\Facades\DB;

/**
 * Splits the stock that actually arrived across the orders waiting for it.
 *
 * On a short day this is the decision that matters most, so the rule is the one
 * the business already used on paper: everyone is cut by the same proportion,
 * and what rounding leaves over goes down the route in delivery order. Nobody
 * is zeroed out while a later stop gets its full amount.
 *
 * Ported from src/domain + src/store/procurementActions.ts, which the front end
 * test suite covers; behaviour is kept identical so both halves agree while the
 * migration is in progress.
 */
class Allocator
{
    /**
     * What can be handed out for one item on one delivery date: stock that was
     * already on hand when the day was locked, plus everything quality accepted
     * against purchases raised for that date.
     */
    public function available(string $deliveryDate, int $itemId): float
    {
        $onHand = (float) PurchaseRequirement::whereDate('delivery_date', $deliveryDate)
            ->where('item_id', $itemId)
            ->value('stock_qty');

        $accepted = (float) QualityCheck::query()
            ->join('receiving_items', 'receiving_items.id', '=', 'quality_checks.receiving_item_id')
            ->join('purchase_order_items', 'purchase_order_items.id', '=', 'receiving_items.purchase_order_item_id')
            ->join('purchase_orders', 'purchase_orders.id', '=', 'purchase_order_items.purchase_order_id')
            ->where('quality_checks.item_id', $itemId)
            ->whereDate('purchase_orders.for_delivery_date', $deliveryDate)
            ->sum('quality_checks.accepted_qty');

        return round($onHand + $accepted, 3);
    }

    /**
     * Allocates one item across every approved line for the date.
     *
     * With `override` the caller is deliberately promising more than arrived —
     * used when a substitute is coming — and each line gets its full requirement.
     *
     * @return array{lines:int, available:float, allocated:float, short:float}
     */
    public function allocateItem(string $deliveryDate, int $itemId, User $user, bool $override = false): array
    {
        $item = Item::findOrFail($itemId);
        $available = $this->available($deliveryDate, $itemId);

        // Route order, because that is the sequence the van loads and delivers in.
        // Lines already packed are left alone: their crate is filled and the
        // challan may be issued, so re-planning them would contradict the floor
        // and would orphan the packing rows that point at their allocation.
        $lines = OrderItem::query()
            ->join('orders', 'orders.id', '=', 'order_items.order_id')
            ->join('customers', 'customers.id', '=', 'orders.customer_id')
            ->whereDate('orders.delivery_date', $deliveryDate)
            ->whereIn('orders.status', ['Approved', 'Locked'])
            ->where('order_items.item_id', $itemId)
            ->whereNotNull('order_items.qty_approved')
            ->whereNull('order_items.qty_packed')
            ->orderBy('customers.route_order')
            ->select('order_items.*', 'orders.customer_id as cust_id')
            ->get();

        if ($lines->isEmpty()) {
            return ['lines' => 0, 'available' => $available, 'allocated' => 0.0, 'short' => 0.0];
        }

        $totalRequired = (float) $lines->sum(fn ($l) => (float) $l->qty_approved);
        $ratio = $totalRequired > 0 ? min(1.0, $available / $totalRequired) : 1.0;

        // Weighed goods are cut to the half kilo; countable goods to the piece.
        $step = $item->unit === 'Kg' ? 0.5 : 1.0;
        $round = fn (float $v) => round($v / $step, 3) * $step;

        // Each share is rounded DOWN to a whole step. Rounding to nearest would
        // let several lines round up at once and promise more than arrived —
        // which on the floor means the last stop on the route opens an empty
        // crate. Everything held back by the rounding is given out below.
        $floor = fn (float $v) => floor(round($v / $step, 6)) * $step;

        $plan = [];
        $allocatedSum = 0.0;
        foreach ($lines as $line) {
            $required = (float) $line->qty_approved;
            $qty = $override ? $required : max(0.0, min($required, $floor($required * $ratio)));
            $plan[] = ['line' => $line, 'required' => $required, 'qty' => $qty];
            $allocatedSum += $qty;
        }

        // Hand the remainder out one step at a time, down the route in delivery
        // order, never past a line's requirement and never past what arrived.
        $spare = $override ? 0.0 : $floor($available - $allocatedSum);
        foreach ($plan as &$p) {
            if ($spare < $step) {
                break;
            }
            if ($p['qty'] + $step <= $p['required']) {
                $p['qty'] = $round($p['qty'] + $step);
                $spare = $round($spare - $step);
            }
        }
        unset($p);

        DB::transaction(function () use ($plan, $deliveryDate, $itemId, $item, $user, $override) {
            foreach ($plan as $p) {
                /** @var OrderItem $line */
                $line = $p['line'];

                // Allocation stays adjustable until packing starts, so a re-run
                // clears the stage first rather than being refused by recordStage.
                $line->resetStage('allocated');
                $line->recordStage('allocated', $p['qty']);

                // Updated in place rather than deleted and recreated: once the
                // packing sheet is open its rows point at this allocation, and
                // replacing the row would break that link. One allocation per
                // order line is enforced by a unique key.
                Allocation::updateOrCreate(
                    ['order_item_id' => $line->id],
                    [
                        'order_id' => $line->order_id,
                        'customer_id' => $line->cust_id,
                        'item_id' => $itemId,
                        'unit' => $item->unit,
                        'delivery_date' => $deliveryDate,
                        'required_qty' => $p['required'],
                        'allocated_qty' => $p['qty'],
                        'override' => $override,
                        'allocated_by' => $user->id,
                        'allocated_at' => now(),
                    ],
                );
            }
        });

        $allocated = round(array_sum(array_column($plan, 'qty')), 3);
        $short = round(max($totalRequired - $allocated, 0), 3);

        activity_log(
            $user,
            $override ? 'Stock allocated (override)' : 'Stock allocated',
            'allocation',
            "{$item->name} · {$deliveryDate}",
            null,
            '',
            count($plan) . " lines · available {$available} {$item->unit}",
            $short > 0 ? 'Warning' : 'Success',
        );

        return ['lines' => count($plan), 'available' => $available, 'allocated' => $allocated, 'short' => $short];
    }

    /** Every item that still has approved demand for a date. */
    public function itemsNeedingAllocation(string $deliveryDate): array
    {
        return OrderItem::query()
            ->join('orders', 'orders.id', '=', 'order_items.order_id')
            ->whereDate('orders.delivery_date', $deliveryDate)
            ->whereIn('orders.status', ['Approved', 'Locked'])
            ->whereNotNull('order_items.qty_approved')
            ->distinct()
            ->pluck('order_items.item_id')
            ->all();
    }
}
