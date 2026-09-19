<?php

namespace App\Http\Controllers;

use App\Models\Challan;
use App\Models\ChallanItem;
use App\Models\Order;
use App\Models\Packing;
use App\Models\PackingItem;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

class PackingController extends Controller
{
    /** The day's board, in route order so the floor packs in loading sequence. */
    public function index(Request $request): JsonResponse
    {
        $data = $request->validate([
            'delivery_date' => ['required', 'date_format:Y-m-d'],
            'route_id' => ['sometimes', 'exists:routes,id'],
            'status' => ['sometimes', 'nullable', 'string', 'max:20'],
        ]);

        $orders = Order::with(['customer.route', 'lines'])
            ->forDelivery($data['delivery_date'])
            ->whereIn('status', ['Locked', 'Approved', 'Partially Fulfilled', 'Completed'])
            ->when($data['route_id'] ?? null, fn ($q, $r) => $q->whereHas('customer', fn ($c) => $c->where('route_id', $r)))
            ->get()
            ->sortBy(fn (Order $o) => $o->customer->route_order)
            ->values();

        $rows = $orders->map(function (Order $o) {
            $allocatedLines = $o->lines->whereNotNull('qty_allocated');
            $packing = $o->packing;

            return [
                'orderId' => (string) $o->id,
                'orderNo' => $o->order_no,
                'customerId' => (string) $o->customer_id,
                'customerName' => $o->customer->name,
                'routeName' => $o->customer->route?->name,
                'items' => $allocatedLines->count(),
                'totalQty' => round((float) $allocatedLines->sum('qty_allocated'), 3),
                'packingId' => $packing ? (string) $packing->id : null,
                'status' => $packing?->status ?? ($allocatedLines->isEmpty() ? 'Not Started' : 'To Pack'),
                'packages' => $packing?->packages ?? 0,
                'verified' => (bool) $packing?->verified,
            ];
        });

        return response()->json([
            'deliveryDate' => $data['delivery_date'],
            'rows' => $data['status'] ?? null ? $rows->where('status', $data['status'])->values() : $rows,
        ]);
    }

    /**
     * Opens (or creates) the packing sheet for one order.
     *
     * Lines come from the allocation, not from the order — the floor packs what
     * was set aside for this customer, which on a short day is less than what
     * they asked for.
     */
    public function show(Order $order): JsonResponse
    {
        $order->load(['lines.item:id,name,unit,category', 'customer']);

        $packing = Packing::firstOrCreate(
            ['order_id' => $order->id],
            [
                'packing_no' => $this->nextPackingNo(),
                'customer_id' => $order->customer_id,
                'delivery_date' => $order->delivery_date,
                'status' => 'To Pack',
                'packages' => 0,
                'verified' => false,
            ],
        );

        $allocated = $order->lines->whereNotNull('qty_allocated');

        foreach ($allocated as $line) {
            $row = PackingItem::firstOrNew(
                ['packing_id' => $packing->id, 'order_item_id' => $line->id],
            );

            // A line that is not packed yet follows the current allocation:
            // stock can arrive or be re-split after the sheet is first opened,
            // and the floor must weigh out what is set aside now, not what was
            // set aside when somebody happened to open the screen.
            if ($row->packed_qty === null) {
                $row->fill([
                    'allocation_id' => $line->allocation?->id,
                    'item_id' => $line->item_id,
                    'unit' => $line->unit,
                    'allocated_qty' => $line->qty_allocated,
                    'package_type' => $row->package_type ?? 'Crate',
                ])->save();
            }
        }

        $packing->load('lines.item:id,name,unit,category');

        return response()->json([
            'packing' => $packing,
            'customer' => $order->customer->toPortableArray(),
            'lines' => $packing->lines->map(fn (PackingItem $l) => [
                'id' => (string) $l->id,
                'itemId' => (string) $l->item_id,
                'itemName' => $l->item->name,
                'unit' => $l->unit,
                'allocatedQty' => (float) $l->allocated_qty,
                'packedQty' => $l->packed_qty === null ? null : (float) $l->packed_qty,
                'packageType' => $l->package_type,
            ]),
        ]);
    }

    /** Records packed quantities as the floor weighs them out. */
    public function update(Request $request, Packing $packing): JsonResponse
    {
        $data = $request->validate([
            'lines' => ['required', 'array', 'min:1'],
            'lines.*.id' => ['required', 'exists:packing_items,id'],
            'lines.*.packed_qty' => ['required', 'numeric', 'gte:0'],
            'lines.*.package_type' => ['sometimes', Rule::in(['Bag', 'Box', 'Crate', 'Other'])],
            'packages' => ['sometimes', 'integer', 'min:0'],
            'issue' => ['sometimes', 'nullable', 'string', 'max:500'],
        ]);

        if ($packing->verified) {
            return response()->json(['message' => 'This packing is verified and the challan is issued.'], 422);
        }

        DB::transaction(function () use ($data, $packing, $request) {
            foreach ($data['lines'] as $row) {
                $line = $packing->lines()->findOrFail($row['id']);

                // Packing more than was set aside would take stock meant for the
                // next customer on the route.
                if ((float) $row['packed_qty'] > (float) $line->allocated_qty) {
                    abort(422, "Cannot pack {$row['packed_qty']} {$line->unit} when only {$line->allocated_qty} was allocated.");
                }

                $line->update([
                    'packed_qty' => $row['packed_qty'],
                    'package_type' => $row['package_type'] ?? $line->package_type,
                ]);
            }

            $packing->update([
                'status' => 'Packing',
                'packages' => $data['packages'] ?? $packing->packages,
                'issue' => $data['issue'] ?? $packing->issue,
                'started_at' => $packing->started_at ?? now(),
                'packed_by' => $request->user()->id,
            ]);
        });

        return response()->json(['packing' => $packing->fresh('lines')]);
    }

    /**
     * Verifies packing and issues the challan.
     *
     * The challan's quantities are copied from the packed lines — never accepted
     * from the request — so the paper travelling with the van and the record in
     * the system cannot disagree. This is also where qty_packed is written into
     * the order's chain.
     */
    public function verify(Request $request, Packing $packing): JsonResponse
    {
        $data = $request->validate([
            'vehicle_no' => ['sometimes', 'nullable', 'string', 'max:20'],
            'driver_id' => ['sometimes', 'exists:users,id'],
        ]);

        if ($packing->verified) {
            return response()->json(['message' => 'Already verified.'], 422);
        }

        $packing->load(['lines.orderItem', 'order.customer']);

        $unpacked = $packing->lines->whereNull('packed_qty');
        if ($unpacked->isNotEmpty()) {
            return response()->json([
                'message' => "{$unpacked->count()} line(s) have no packed quantity yet.",
            ], 422);
        }

        $user = $request->user();
        $customer = $packing->order->customer;

        $challan = DB::transaction(function () use ($packing, $customer, $user, $data) {
            foreach ($packing->lines as $line) {
                $line->orderItem->recordStage('packed', (float) $line->packed_qty);
            }

            $challan = Challan::create([
                'challan_no' => $this->nextChallanNo(),
                'packing_id' => $packing->id,
                'order_id' => $packing->order_id,
                'customer_id' => $customer->id,
                'route_id' => $customer->route_id,
                'challan_date' => $packing->delivery_date,
                'driver_id' => $data['driver_id'] ?? $customer->route?->driver_id,
                'vehicle_no' => $data['vehicle_no'] ?? $customer->route?->vehicle_no ?? '',
                'status' => 'Ready',
                'packages' => $packing->packages ?: max(1, (int) ceil($packing->lines->count() / 6)),
                'prepared_by' => $user->id,
                'packed_by' => $packing->packed_by,
            ]);

            foreach ($packing->lines as $line) {
                ChallanItem::create([
                    'challan_id' => $challan->id,
                    'order_item_id' => $line->order_item_id,
                    'item_id' => $line->item_id,
                    'unit' => $line->unit,
                    'qty' => $line->packed_qty,
                ]);
            }

            $packing->update(['status' => 'Packed', 'verified' => true, 'packed_at' => now()]);
            $packing->order->update(['packing_status' => 'Packed', 'delivery_status' => 'Ready']);

            return $challan;
        });

        activity_log($user, 'Packing verified · challan generated', 'packing', $challan->challan_no, $customer->id, '', $packing->packing_no);

        return response()->json(['challan' => $challan->load('lines')], 201);
    }

    private function nextPackingNo(): string
    {
        $prefix = 'PK-' . now()->format('ym') . '-';
        $last = Packing::where('packing_no', 'like', "{$prefix}%")->max('packing_no');
        $n = $last ? ((int) substr($last, -4)) + 1 : 1;

        return $prefix . str_pad((string) $n, 4, '0', STR_PAD_LEFT);
    }

    private function nextChallanNo(): string
    {
        $prefix = setting('challan_prefix', 'DC') . '-' . now()->format('ym') . '-';
        $last = Challan::where('challan_no', 'like', "{$prefix}%")->max('challan_no');
        $n = $last ? ((int) substr($last, -4)) + 1 : 1;

        return $prefix . str_pad((string) $n, 4, '0', STR_PAD_LEFT);
    }
}
