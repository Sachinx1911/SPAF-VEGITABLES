<?php

namespace App\Http\Controllers;

use App\Models\AuditLog;
use App\Models\DailySnapshot;
use App\Models\Invoice;
use App\Models\Item;
use App\Models\Order;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class ReportController extends Controller
{
    /** Sales by customer and by item over a range, from delivered quantity. */
    public function sales(Request $request): JsonResponse
    {
        [$from, $to] = $this->range($request);

        $byCustomer = DB::table('order_items')
            ->join('orders', 'orders.id', '=', 'order_items.order_id')
            ->join('customers', 'customers.id', '=', 'orders.customer_id')
            ->whereBetween('orders.delivery_date', [$from, $to])
            ->whereNotNull('order_items.qty_delivered')
            ->groupBy('customers.id', 'customers.name', 'customers.code')
            ->selectRaw('customers.id as customer_id, customers.name, customers.code,
                         COUNT(DISTINCT orders.id) as orders,
                         SUM(order_items.qty_delivered * order_items.rate) as amount')
            ->orderByDesc('amount')
            ->get();

        $byItem = DB::table('order_items')
            ->join('orders', 'orders.id', '=', 'order_items.order_id')
            ->join('items', 'items.id', '=', 'order_items.item_id')
            ->whereBetween('orders.delivery_date', [$from, $to])
            ->whereNotNull('order_items.qty_delivered')
            ->groupBy('items.id', 'items.name', 'items.category', 'order_items.unit')
            ->selectRaw('items.id as item_id, items.name, items.category, order_items.unit,
                         SUM(order_items.qty_delivered) as qty,
                         SUM(order_items.qty_delivered * order_items.rate) as amount')
            ->orderByDesc('amount')
            ->get();

        return response()->json([
            'from' => $from, 'to' => $to,
            'byCustomer' => $byCustomer,
            'byItem' => $byItem,
            'total' => round((float) $byCustomer->sum('amount'), 2),
        ]);
    }

    public function purchase(Request $request): JsonResponse
    {
        [$from, $to] = $this->range($request);

        $rows = DB::table('purchase_order_items')
            ->join('purchase_orders', 'purchase_orders.id', '=', 'purchase_order_items.purchase_order_id')
            ->join('suppliers', 'suppliers.id', '=', 'purchase_orders.supplier_id')
            ->join('items', 'items.id', '=', 'purchase_order_items.item_id')
            ->whereBetween('purchase_orders.purchase_date', [$from, $to])
            ->groupBy('suppliers.id', 'suppliers.name')
            ->selectRaw('suppliers.id as supplier_id, suppliers.name,
                         COUNT(DISTINCT purchase_orders.id) as orders,
                         SUM(purchase_order_items.qty * purchase_order_items.rate) as amount')
            ->orderByDesc('amount')
            ->get();

        // Purchase against sales, so margin is visible per day.
        $daily = DB::table('purchase_orders')
            ->whereBetween('purchase_date', [$from, $to])
            ->join('purchase_order_items', 'purchase_order_items.purchase_order_id', '=', 'purchase_orders.id')
            ->groupBy('purchase_orders.purchase_date')
            ->selectRaw('purchase_orders.purchase_date as date, SUM(purchase_order_items.qty * purchase_order_items.rate) as purchase')
            ->get();

        return response()->json(['from' => $from, 'to' => $to, 'bySupplier' => $rows, 'daily' => $daily]);
    }

    /**
     * The operations view: how much of what was ordered actually got delivered,
     * and where the gap opened up.
     */
    public function operations(Request $request): JsonResponse
    {
        [$from, $to] = $this->range($request);

        $shortage = DB::table('order_items')
            ->join('orders', 'orders.id', '=', 'order_items.order_id')
            ->join('items', 'items.id', '=', 'order_items.item_id')
            ->whereBetween('orders.delivery_date', [$from, $to])
            ->whereNotNull('order_items.qty_delivered')
            ->groupBy('items.id', 'items.name', 'order_items.unit')
            ->havingRaw('SUM(order_items.qty_ordered - order_items.qty_delivered) > 0')
            ->selectRaw('items.id as item_id, items.name, order_items.unit,
                         SUM(order_items.qty_ordered) as ordered,
                         SUM(order_items.qty_delivered) as delivered,
                         SUM(order_items.qty_ordered - order_items.qty_delivered) as short')
            ->orderByDesc('short')
            ->get();

        $fulfilment = DB::table('order_items')
            ->join('orders', 'orders.id', '=', 'order_items.order_id')
            ->whereBetween('orders.delivery_date', [$from, $to])
            ->selectRaw('SUM(order_items.qty_ordered) as ordered, SUM(COALESCE(order_items.qty_delivered,0)) as delivered')
            ->first();

        $ordered = (float) ($fulfilment->ordered ?? 0);
        $delivered = (float) ($fulfilment->delivered ?? 0);

        return response()->json([
            'from' => $from, 'to' => $to,
            'shortageByItem' => $shortage,
            'fulfilmentRate' => $ordered > 0 ? round($delivered / $ordered * 100, 1) : 0,
            'orderCount' => Order::whereBetween('delivery_date', [$from, $to])->count(),
            'deliveryOutcomes' => DB::table('challans')
                ->whereBetween('challan_date', [$from, $to])
                ->groupBy('status')->selectRaw('status, COUNT(*) as count')->get(),
        ]);
    }

    /** Headline numbers plus the series the dashboard charts. */
    public function analytics(Request $request): JsonResponse
    {
        [$from, $to] = $this->range($request);

        $sales = (float) DB::table('order_items')
            ->join('orders', 'orders.id', '=', 'order_items.order_id')
            ->whereBetween('orders.delivery_date', [$from, $to])
            ->whereNotNull('order_items.qty_delivered')
            ->selectRaw('SUM(order_items.qty_delivered * order_items.rate) as t')->value('t');

        $purchase = (float) DB::table('purchase_order_items')
            ->join('purchase_orders', 'purchase_orders.id', '=', 'purchase_order_items.purchase_order_id')
            ->whereBetween('purchase_orders.purchase_date', [$from, $to])
            ->selectRaw('SUM(purchase_order_items.qty * purchase_order_items.rate) as t')->value('t');

        $outstanding = Invoice::withSum('payments as paid_sum', 'amount')
            ->where('status', '!=', 'Cancelled')->get()
            ->sum(fn (Invoice $i) => $i->balance());

        return response()->json([
            'from' => $from, 'to' => $to,
            'totals' => [
                'sales' => round($sales, 2),
                'purchase' => round($purchase, 2),
                'margin' => round($sales - $purchase, 2),
                'orders' => Order::whereBetween('delivery_date', [$from, $to])->count(),
                'outstanding' => round($outstanding, 2),
                'lowStockItems' => Item::active()->whereColumn('stock', '<=', 'reorder_level')
                    ->where('min_stock', '>', 0)->where('stock', '>', 0)->count(),
            ],
            'trend' => DailySnapshot::whereBetween('date', [$from, $to])->orderBy('date')->get(),
        ]);
    }

    public function auditLogs(Request $request): JsonResponse
    {
        $data = $request->validate([
            'module' => ['sometimes', 'string', 'max:40'],
            'user_id' => ['sometimes', 'exists:users,id'],
            'per_page' => ['sometimes', 'integer', 'min:1', 'max:200'],
        ]);

        $logs = AuditLog::with('user:id,name')
            ->when($data['module'] ?? null, fn ($q, $m) => $q->where('module', $m))
            ->when($data['user_id'] ?? null, fn ($q, $u) => $q->where('user_id', $u))
            ->orderByDesc('at')
            ->paginate($data['per_page'] ?? 100);

        return response()->json($logs);
    }

    /** @return array{0:string,1:string} */
    private function range(Request $request): array
    {
        $data = $request->validate([
            'from' => ['sometimes', 'date_format:Y-m-d'],
            'to' => ['sometimes', 'date_format:Y-m-d'],
        ]);

        return [
            $data['from'] ?? now()->subDays(29)->toDateString(),
            $data['to'] ?? now()->toDateString(),
        ];
    }
}
