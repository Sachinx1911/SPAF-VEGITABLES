<?php

namespace App\Http\Controllers;

use App\Models\Challan;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;

class DriverController extends Controller
{
    /** The driver's run for today, in the order the van stops. */
    public function today(Request $request): JsonResponse
    {
        $driver = $request->user();
        $date = $request->query('date', now()->toDateString());

        $challans = $this->runFor($driver->id, $date);

        return response()->json([
            'date' => $date,
            'driver' => ['id' => (string) $driver->id, 'name' => $driver->name],
            'stops' => $challans->map(fn (Challan $c) => $this->stop($c)),
            'summary' => [
                'total' => $challans->count(),
                'delivered' => $challans->whereIn('status', ['Delivered', 'Partial'])->count(),
                'pending' => $challans->whereIn('status', ['Ready', 'In Transit', 'Dispatched'])->count(),
                'failed' => $challans->where('status', 'Failed')->count(),
            ],
        ]);
    }

    public function deliveries(Request $request): JsonResponse
    {
        $date = $request->query('date', now()->toDateString());

        return response()->json([
            'stops' => $this->runFor($request->user()->id, $date)->map(fn (Challan $c) => $this->stop($c)),
        ]);
    }

    public function history(Request $request): JsonResponse
    {
        $from = $request->query('from', now()->subDays(14)->toDateString());

        $challans = Challan::with('customer:id,name,location')
            ->where('driver_id', $request->user()->id)
            ->whereDate('challan_date', '>=', $from)
            ->whereIn('status', ['Delivered', 'Partial', 'Failed'])
            ->orderByDesc('challan_date')
            ->get();

        return response()->json(['stops' => $challans->map(fn (Challan $c) => $this->stop($c))]);
    }

    /**
     * Confirms a delivery at the customer's door.
     *
     * The per-line quantities the driver enters become `qty_delivered` and
     * `qty_customer_accepted` — the numbers the invoice is later built from.
     * Billing off what was dispatched instead would charge for produce that was
     * refused at the door, so these two stages exist separately on purpose.
     */
    public function confirmDelivery(Request $request, Challan $challan): JsonResponse
    {
        $data = $request->validate([
            'outcome' => ['required', 'in:Delivered,Partial,Failed'],
            'received_by_name' => ['required_unless:outcome,Failed', 'string', 'max:120'],
            'remarks' => ['sometimes', 'string', 'max:500'],
            'lines' => ['sometimes', 'array'],
            'lines.*.id' => ['required', 'exists:challan_items,id'],
            'lines.*.delivered_qty' => ['required', 'numeric', 'gte:0'],
            'lines.*.reason' => ['sometimes', 'nullable', 'string', 'max:120'],
            'signature' => ['sometimes', 'string'],   // data URL from the pad
            'photo' => ['sometimes', 'string'],
        ]);

        if ($challan->driver_id !== $request->user()->id) {
            return response()->json(['message' => 'This delivery is assigned to another driver.'], 403);
        }

        if (in_array($challan->status, ['Delivered', 'Partial', 'Failed'], true)) {
            return response()->json(['message' => "This delivery is already marked {$challan->status}."], 422);
        }

        $challan->load('lines.orderItem', 'order');
        $byId = collect($data['lines'] ?? [])->keyBy('id');
        $user = $request->user();

        DB::transaction(function () use ($challan, $data, $byId, $user) {
            foreach ($challan->lines as $line) {
                // No entry for a line means it went in full; a Failed delivery
                // means nothing arrived at all.
                $delivered = $data['outcome'] === 'Failed'
                    ? 0.0
                    : (float) ($byId[$line->id]['delivered_qty'] ?? $line->qty);

                $line->orderItem->recordStage('delivered', $delivered);
                $line->orderItem->recordStage('customer_accepted', $delivered);
            }

            $challan->update([
                'status' => $data['outcome'],
                'delivered_at' => now(),
                'received_by_name' => $data['received_by_name'] ?? '',
                'delivery_remarks' => $data['remarks'] ?? '',
                'signature_path' => $this->storeDataUrl($data['signature'] ?? null, "signatures/{$challan->challan_no}"),
                'photo_path' => $this->storeDataUrl($data['photo'] ?? null, "delivery-photos/{$challan->challan_no}"),
            ]);

            $challan->order->update([
                'delivery_status' => $data['outcome'],
                'status' => match ($data['outcome']) {
                    'Delivered' => 'Completed',
                    'Partial' => 'Partially Fulfilled',
                    default => $challan->order->status,
                },
                // Only a delivery that actually happened can be billed.
                'invoice_status' => $data['outcome'] === 'Failed' ? 'Not Ready' : 'Ready',
            ]);
        });

        activity_log(
            $user, "Delivery {$data['outcome']}", 'delivery', $challan->challan_no,
            $challan->customer_id, 'In Transit', $data['outcome'],
            $data['outcome'] === 'Delivered' ? 'Success' : 'Warning',
        );

        return response()->json(['challan' => $challan->fresh()]);
    }

    private function runFor(int $driverId, string $date)
    {
        return Challan::with(['customer:id,name,location,mobile,delivery_address,route_order', 'lines.item:id,name,unit'])
            ->where('driver_id', $driverId)
            ->whereDate('challan_date', $date)
            ->get()
            ->sortBy(fn (Challan $c) => $c->customer->route_order)
            ->values();
    }

    private function stop(Challan $c): array
    {
        return [
            'challanId' => (string) $c->id,
            'challanNo' => $c->challan_no,
            'customerName' => $c->customer->name,
            'address' => $c->customer->delivery_address ?: $c->customer->location,
            'mobile' => $c->customer->mobile,
            'packages' => $c->packages,
            'status' => $c->status,
            'deliveredAt' => $c->delivered_at?->toIso8601String(),
            'lines' => $c->relationLoaded('lines') ? $c->lines->map(fn ($l) => [
                'id' => (string) $l->id,
                'itemName' => $l->item->name,
                'unit' => $l->unit,
                'qty' => (float) $l->qty,
            ]) : [],
        ];
    }

    /** Stores a data-URL capture as a file and returns its path. */
    private function storeDataUrl(?string $dataUrl, string $base): ?string
    {
        if (! $dataUrl || ! str_starts_with($dataUrl, 'data:')) {
            return null;
        }

        [$meta, $encoded] = explode(',', $dataUrl, 2);
        $ext = str_contains($meta, 'png') ? 'png' : (str_contains($meta, 'jpeg') ? 'jpg' : 'bin');
        $binary = base64_decode($encoded, true);

        if ($binary === false) {
            return null;
        }

        $path = "{$base}-" . now()->format('YmdHis') . ".{$ext}";
        Storage::disk('local')->put($path, $binary);

        return $path;
    }
}
