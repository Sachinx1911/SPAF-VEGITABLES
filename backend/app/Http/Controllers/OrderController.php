<?php

namespace App\Http\Controllers;

use App\Models\Customer;
use App\Models\CustomerItemPrice;
use App\Models\Order;
use App\Models\OrderItem;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

class OrderController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $data = $request->validate([
            'delivery_date' => ['sometimes', 'date_format:Y-m-d'],
            'from' => ['sometimes', 'date_format:Y-m-d'],
            'to' => ['sometimes', 'date_format:Y-m-d'],
            'status' => ['sometimes', 'nullable', 'string', 'max:25'],
            'customer_id' => ['sometimes', 'integer'],
            'per_page' => ['sometimes', 'integer', 'min:1', 'max:200'],
        ]);

        $orders = Order::with(['customer:id,name,code', 'lines'])
            ->when($data['delivery_date'] ?? null, fn ($q, $d) => $q->whereDate('delivery_date', $d))
            ->when($data['from'] ?? null, fn ($q, $d) => $q->whereDate('delivery_date', '>=', $d))
            ->when($data['to'] ?? null, fn ($q, $d) => $q->whereDate('delivery_date', '<=', $d))
            ->when($data['status'] ?? null, fn ($q, $s) => $q->where('status', $s))
            ->when($data['customer_id'] ?? null, fn ($q, $c) => $q->where('customer_id', $c))
            ->orderByDesc('delivery_date')
            ->orderByDesc('id')
            ->paginate($data['per_page'] ?? 50);

        // The same shape the front end's own model uses, so a list row needs no
        // translating on arrival — and the lines come with it, because every
        // screen that lists orders also shows what is on them.
        $orders->getCollection()->transform(fn (Order $o) => $o->toPortableArray() + [
            'customerName' => $o->customer?->name,
            'customerCode' => $o->customer?->code,
            'lineCount' => $o->lines->count(),
            'value' => $o->value(),
            'lines' => $o->lines->map(fn (OrderItem $l) => [
                'id' => (string) $l->id,
                'orderId' => (string) $l->order_id,
                'itemId' => (string) $l->item_id,
                'unit' => $l->unit,
                'rate' => (float) $l->rate,
                'qty' => $l->chain(),
                'remarks' => $l->remarks ?? '',
            ]),
        ]);

        return response()->json($orders);
    }

    public function show(Order $order): JsonResponse
    {
        $order->load(['lines.item:id,name,unit,category', 'customer']);

        return response()->json([
            'order' => $order->toPortableArray(),
            'customer' => $order->customer->toPortableArray(),
            'lines' => $order->lines->map(fn (OrderItem $l) => [
                'id' => (string) $l->id,
                'itemId' => (string) $l->item_id,
                'itemName' => $l->item->name,
                'unit' => $l->unit,
                'rate' => (float) $l->rate,
                // The whole chain, so the screen can show ordered vs delivered
                // without asking a second time.
                'qty' => $l->chain(),
                'remarks' => $l->remarks ?? '',
            ]),
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'customer_id' => ['required', 'exists:customers,id'],
            'delivery_date' => ['required', 'date_format:Y-m-d'],
            'order_type' => ['sometimes', Rule::in(['Regular', 'Urgent', 'Trial'])],
            'source' => ['sometimes', Rule::in(['Staff', 'Customer Portal', 'WhatsApp', 'Phone'])],
            'draft' => ['sometimes', 'boolean'],
            'remarks' => ['sometimes', 'nullable', 'string', 'max:1000'],
            'lines' => ['required', 'array', 'min:1'],
            'lines.*.item_id' => ['required', 'exists:items,id'],
            'lines.*.qty' => ['required', 'numeric', 'gt:0'],
            'lines.*.remarks' => ['sometimes', 'nullable', 'string', 'max:255'],
        ]);

        $user = $request->user();
        $customer = Customer::findOrFail($data['customer_id']);
        $draft = $data['draft'] ?? false;
        $now = now();

        $late = ! $draft && Order::isLateArrival($data['delivery_date'], $now);

        $order = DB::transaction(function () use ($data, $customer, $user, $draft, $late, $now) {
            $order = Order::create([
                'order_no' => $this->nextOrderNo(),
                'customer_id' => $customer->id,
                'order_date' => $now->toDateString(),
                'delivery_date' => $data['delivery_date'],
                'order_type' => $data['order_type'] ?? 'Regular',
                'source' => $data['source'] ?? 'Staff',
                'status' => $draft ? 'Draft' : ($late ? 'Late' : 'Submitted'),
                'is_late' => $late,
                'received_at' => $now,
                'remarks' => $data['remarks'] ?? '',
                'created_by' => $user->id,
            ]);

            foreach ($data['lines'] as $line) {
                $item = \App\Models\Item::findOrFail($line['item_id']);

                OrderItem::create([
                    'order_id' => $order->id,
                    'item_id' => $item->id,
                    // The unit travels with the line: it is half the SKU.
                    'unit' => $item->unit,
                    // The rate is captured now, so a later price change cannot
                    // rewrite what this customer was quoted.
                    'rate' => CustomerItemPrice::rateFor($customer->id, $item->id, $data['delivery_date']),
                    'qty_ordered' => $line['qty'],
                    'remarks' => $line['remarks'] ?? '',
                ]);
            }

            return $order;
        });

        activity_log(
            $user,
            $draft ? 'Order draft saved' : ($late ? 'Late order flagged' : 'Order submitted'),
            'orders',
            $order->order_no,
            $customer->id,
            '',
            count($data['lines']) . ' items',
            $late ? 'Warning' : 'Success',
        );

        return response()->json(['order' => $order->fresh()->toPortableArray()], 201);
    }

    /**
     * Approval fills qty_approved and nothing else.
     *
     * An adjusted quantity is recorded as the approved amount; what the customer
     * originally asked for stays in qty_ordered, which is what makes a shortfall
     * explainable later. recordStage() refuses to touch qty_ordered at all.
     */
    public function approve(Request $request, Order $order): JsonResponse
    {
        $data = $request->validate([
            'adjustments' => ['sometimes', 'array'],
            'adjustments.*' => ['numeric', 'gte:0'],
        ]);

        if (! in_array($order->status, ['Submitted', 'Late'], true)) {
            return response()->json([
                'message' => "Only a submitted or late order can be approved. This one is {$order->status}.",
            ], 422);
        }

        $adjustments = $data['adjustments'] ?? [];

        DB::transaction(function () use ($order, $adjustments, $request) {
            foreach ($order->lines as $line) {
                $approved = $adjustments[$line->id] ?? (float) $line->qty_ordered;

                if ($approved > (float) $line->qty_ordered) {
                    abort(422, "Approved quantity cannot exceed what was ordered on line {$line->id}.");
                }

                $line->recordStage('approved', (float) $approved);
            }

            $order->update([
                'status' => 'Approved',
                'approved_by' => $request->user()->id,
                'approved_at' => now(),
            ]);
        });

        activity_log($request->user(), 'Order approved', 'orders', $order->order_no, $order->customer_id, 'Submitted', 'Approved');

        return response()->json(['order' => $order->fresh()->toPortableArray()]);
    }

    public function reject(Request $request, Order $order): JsonResponse
    {
        $data = $request->validate(['reason' => ['required', 'string', 'max:500']]);

        if (! in_array($order->status, ['Submitted', 'Late'], true)) {
            return response()->json(['message' => "This order is {$order->status} and cannot be rejected."], 422);
        }

        $before = $order->status;
        // Rejecting leaves the chain untouched: nothing was approved, so no
        // stage is filled and the record simply stops here.
        $order->update(['status' => 'Rejected', 'remarks' => $data['reason']]);

        activity_log(
            $request->user(), 'Order rejected', 'orders', $order->order_no,
            $order->customer_id, $before, "Rejected — {$data['reason']}", 'Warning',
        );

        return response()->json(['order' => $order->fresh()->toPortableArray()]);
    }

    /**
     * Replaces an order's lines with what the customer now wants.
     *
     * Approval is withdrawn on every change, so nothing reaches consolidation
     * without somebody having seen the final list. A line whose quantity changes
     * has its approved stage cleared rather than overwritten.
     */
    public function update(Request $request, Order $order): JsonResponse
    {
        $data = $request->validate([
            'lines' => ['required', 'array', 'min:1'],
            'lines.*.item_id' => ['required', 'exists:items,id'],
            'lines.*.qty' => ['required', 'numeric', 'gt:0'],
        ]);

        if (in_array($order->status, ['Locked', 'Completed', 'Partially Fulfilled'], true)) {
            return response()->json([
                'message' => "This order is {$order->status}. Changes are no longer possible.",
            ], 422);
        }

        $before = $order->lines->count();

        DB::transaction(function () use ($order, $data) {
            $keep = [];

            foreach ($data['lines'] as $line) {
                $item = \App\Models\Item::findOrFail($line['item_id']);
                $existing = $order->lines->firstWhere('item_id', $item->id);

                if ($existing) {
                    if ((float) $existing->qty_ordered !== (float) $line['qty']) {
                        $existing->resetStage('approved');
                        $existing->update(['qty_ordered' => $line['qty']]);
                    }
                    $keep[] = $existing->id;
                } else {
                    $new = OrderItem::create([
                        'order_id' => $order->id,
                        'item_id' => $item->id,
                        'unit' => $item->unit,
                        'rate' => CustomerItemPrice::rateFor($order->customer_id, $item->id, $order->delivery_date->toDateString()),
                        'qty_ordered' => $line['qty'],
                    ]);
                    $keep[] = $new->id;
                }
            }

            $order->lines()->whereNotIn('id', $keep)->delete();

            $order->update([
                'status' => Order::isLateArrival($order->delivery_date->toDateString(), now()) ? 'Late' : 'Submitted',
                'approved_by' => null,
                'approved_at' => null,
            ]);
        });

        activity_log(
            $request->user(), 'Order changed', 'orders', $order->order_no, $order->customer_id,
            "{$before} items", count($data['lines']) . ' items',
        );

        return response()->json(['order' => $order->fresh()->toPortableArray()]);
    }

    /** SO-YYMM-NNNN, restarting the sequence each month. */
    private function nextOrderNo(): string
    {
        $prefix = 'SO-' . now()->format('ym') . '-';
        $last = Order::where('order_no', 'like', "{$prefix}%")->max('order_no');
        $n = $last ? ((int) substr($last, -4)) + 1 : 1;

        return $prefix . str_pad((string) $n, 4, '0', STR_PAD_LEFT);
    }
}
