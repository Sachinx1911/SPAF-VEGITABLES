<?php

namespace App\Http\Controllers;

use App\Models\Item;
use App\Models\PurchaseOrder;
use App\Models\PurchaseOrderItem;
use App\Models\PurchaseRequirement;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class PurchaseController extends Controller
{
    /**
     * What the locked day needs, minus stock on hand, minus what has already
     * been ordered against it — so the buyer sees the gap, not the gross figure.
     */
    public function requirements(Request $request): JsonResponse
    {
        $date = $request->validate([
            'delivery_date' => ['required', 'date_format:Y-m-d'],
        ])['delivery_date'];

        $requirements = PurchaseRequirement::with('item:id,name,unit,category,sort_order,default_purchase_price')
            ->whereDate('delivery_date', $date)
            ->get();

        // Everything already on a purchase order for this date, per item. The
        // sum is aliased: plucking a bare DB::raw('SUM(...)') makes Laravel look
        // for a property literally named "SUM(...)" on each row, which is not
        // there, so the endpoint 500s the moment any purchase exists for the day.
        $purchased = PurchaseOrderItem::query()
            ->join('purchase_orders', 'purchase_orders.id', '=', 'purchase_order_items.purchase_order_id')
            ->whereDate('purchase_orders.for_delivery_date', $date)
            ->groupBy('purchase_order_items.item_id')
            ->selectRaw('purchase_order_items.item_id as item_id, SUM(purchase_order_items.qty) as total')
            ->pluck('total', 'item_id');

        $rows = $requirements->map(function (PurchaseRequirement $r) use ($purchased) {
            $already = (float) ($purchased[$r->item_id] ?? 0);
            $toBuy = round(max($r->toBuy() - $already, 0), 3);

            return [
                'itemId' => (string) $r->item_id,
                'name' => $r->item->name,
                'unit' => $r->unit,
                'category' => $r->item->category,
                'requiredQty' => (float) $r->required_qty,
                'stockQty' => (float) $r->stock_qty,
                'purchasedQty' => $already,
                'toBuyQty' => $toBuy,
                'estimatedRate' => (float) $r->item->default_purchase_price,
                // "Critical" means the day cannot be served unless somebody buys
                // this; "OK" means it is already covered.
                'status' => $toBuy <= 0 ? 'OK' : ($already > 0 ? 'Partial' : 'Required'),
                'sortOrder' => $r->item->sort_order,
            ];
        })->sortBy('sortOrder')->values();

        return response()->json(['deliveryDate' => $date, 'rows' => $rows]);
    }

    public function index(Request $request): JsonResponse
    {
        $data = $request->validate([
            'for_delivery_date' => ['sometimes', 'date_format:Y-m-d'],
            'status' => ['sometimes', 'nullable', 'string', 'max:25'],
            'per_page' => ['sometimes', 'integer', 'min:1', 'max:200'],
        ]);

        $orders = PurchaseOrder::with(['supplier:id,name,market', 'lines'])
            ->when($data['for_delivery_date'] ?? null, fn ($q, $d) => $q->whereDate('for_delivery_date', $d))
            ->when($data['status'] ?? null, fn ($q, $s) => $q->where('status', $s))
            ->orderByDesc('purchase_date')
            ->orderByDesc('id')
            ->paginate($data['per_page'] ?? 50);

        return response()->json($orders);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'supplier_id' => ['required', 'exists:suppliers,id'],
            'purchase_date' => ['required', 'date_format:Y-m-d'],
            'for_delivery_date' => ['required', 'date_format:Y-m-d'],
            'supplier_invoice_no' => ['sometimes', 'nullable', 'string', 'max:40'],
            'tax_amount' => ['sometimes', 'numeric', 'gte:0'],
            'lines' => ['required', 'array', 'min:1'],
            'lines.*.item_id' => ['required', 'exists:items,id'],
            'lines.*.qty' => ['required', 'numeric', 'gt:0'],
            'lines.*.rate' => ['required', 'numeric', 'gt:0'],
        ]);

        $user = $request->user();

        $po = DB::transaction(function () use ($data, $user) {
            $po = PurchaseOrder::create([
                'po_no' => $this->nextPoNo(),
                'supplier_id' => $data['supplier_id'],
                'purchase_date' => $data['purchase_date'],
                'for_delivery_date' => $data['for_delivery_date'],
                'supplier_invoice_no' => $data['supplier_invoice_no'] ?? '',
                'status' => 'Confirmed',
                'tax_amount' => $data['tax_amount'] ?? 0,
                'created_by' => $user->id,
            ]);

            foreach ($data['lines'] as $line) {
                $item = Item::findOrFail($line['item_id']);

                PurchaseOrderItem::create([
                    'purchase_order_id' => $po->id,
                    'item_id' => $item->id,
                    // Bought in the item's own unit; nothing is converted.
                    'unit' => $item->purchase_unit ?: $item->unit,
                    'qty' => $line['qty'],
                    'rate' => $line['rate'],
                ]);
            }

            return $po;
        });

        activity_log($user, 'Purchase confirmed', 'purchase', $po->po_no, null, '', count($data['lines']) . ' items');

        return response()->json(['purchaseOrder' => $po->load('lines')], 201);
    }

    public function show(PurchaseOrder $purchaseOrder): JsonResponse
    {
        $purchaseOrder->load(['supplier', 'lines.item:id,name,unit,category', 'receivings.lines']);

        return response()->json([
            'purchaseOrder' => $purchaseOrder,
            'subtotal' => $purchaseOrder->subtotal(),
            'total' => $purchaseOrder->subtotal() + (float) $purchaseOrder->tax_amount,
        ]);
    }

    /** PO-YYMM-NNNN, restarting each month. */
    private function nextPoNo(): string
    {
        $prefix = 'PO-' . now()->format('ym') . '-';
        $last = PurchaseOrder::where('po_no', 'like', "{$prefix}%")->max('po_no');
        $n = $last ? ((int) substr($last, -4)) + 1 : 1;

        return $prefix . str_pad((string) $n, 4, '0', STR_PAD_LEFT);
    }
}
