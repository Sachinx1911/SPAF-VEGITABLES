<?php

namespace App\Http\Controllers;

use App\Models\Challan;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class ChallanController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $data = $request->validate([
            'challan_date' => ['sometimes', 'date_format:Y-m-d'],
            'route_id' => ['sometimes', 'exists:routes,id'],
            'driver_id' => ['sometimes', 'exists:users,id'],
            'status' => ['sometimes', 'nullable', 'string', 'max:20'],
        ]);

        $challans = Challan::with(['customer:id,name,location,mobile', 'route:id,name,departure_time', 'driver:id,name', 'order:id,order_no'])
            ->when($data['challan_date'] ?? null, fn ($q, $d) => $q->whereDate('challan_date', $d))
            ->when($data['route_id'] ?? null, fn ($q, $r) => $q->where('route_id', $r))
            ->when($data['driver_id'] ?? null, fn ($q, $d) => $q->where('driver_id', $d))
            ->when($data['status'] ?? null, fn ($q, $s) => $q->where('status', $s))
            ->get()
            ->sortBy(fn (Challan $c) => $c->customer->route_order ?? 0)
            ->values();

        return response()->json(['challans' => $challans]);
    }

    public function show(Challan $challan): JsonResponse
    {
        $challan->load(['lines.item:id,name,unit,category', 'customer', 'route', 'driver:id,name,mobile', 'order:id,order_no']);

        return response()->json(['challan' => $challan]);
    }

    /** Sends a packed order out. Writes qty_dispatched into the chain. */
    public function dispatch(Request $request, Challan $challan): JsonResponse
    {
        if ($challan->status !== 'Ready') {
            return response()->json(['message' => "This challan is {$challan->status} and cannot be dispatched."], 422);
        }

        $data = $request->validate([
            'driver_id' => ['sometimes', 'exists:users,id'],
            'vehicle_no' => ['sometimes', 'nullable', 'string', 'max:20'],
        ]);

        $challan->load('lines.orderItem', 'order');
        $user = $request->user();

        DB::transaction(function () use ($challan, $data) {
            foreach ($challan->lines as $line) {
                // What left the building. Equal to packed unless something was
                // held back at the door.
                $line->orderItem->recordStage('dispatched', (float) $line->qty);
            }

            $challan->update([
                'status' => 'In Transit',
                'dispatched_at' => now(),
                'driver_id' => $data['driver_id'] ?? $challan->driver_id,
                'vehicle_no' => $data['vehicle_no'] ?? $challan->vehicle_no,
            ]);

            $challan->order->update(['delivery_status' => 'In Transit']);
        });

        activity_log($user, 'Challan dispatched', 'delivery', $challan->challan_no, $challan->customer_id, 'Ready', 'In Transit');

        return response()->json(['challan' => $challan->fresh()]);
    }
}
