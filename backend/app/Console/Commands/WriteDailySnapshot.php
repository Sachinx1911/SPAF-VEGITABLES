<?php

namespace App\Console\Commands;

use App\Models\Challan;
use App\Models\DailySnapshot;
use App\Models\Invoice;
use App\Models\Order;
use App\Models\PurchaseRequirement;
use App\Models\Receiving;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

/**
 * Freezes the day's numbers so the dashboard can show a real change since
 * yesterday.
 *
 * Without this, "12% more orders than yesterday" would have to be recomputed
 * from live tables, and would quietly change as back-dated entries land. A
 * snapshot is what the day actually looked like when it closed.
 *
 * Runs from cron: php artisan snapshot:write
 */
class WriteDailySnapshot extends Command
{
    protected $signature = 'snapshot:write {--date= : The day to snapshot, defaults to today}';

    protected $description = "Record the day's operational and financial totals";

    public function handle(): int
    {
        $date = $this->option('date') ?: now()->toDateString();

        $outstanding = Invoice::withSum('payments as paid_sum', 'amount')
            ->where('status', '!=', 'Cancelled')
            ->get()
            ->sum(fn (Invoice $i) => $i->balance());

        $salesValue = (float) DB::table('order_items')
            ->join('orders', 'orders.id', '=', 'order_items.order_id')
            ->whereDate('orders.delivery_date', $date)
            ->whereNotNull('order_items.qty_delivered')
            ->selectRaw('SUM(order_items.qty_delivered * order_items.rate) as t')
            ->value('t');

        DailySnapshot::updateOrCreate(['date' => $date], [
            'orders_received' => Order::whereDate('order_date', $date)->count(),
            'pending_approval' => Order::forDelivery($date)->awaitingApproval()->count(),
            'locked' => Order::forDelivery($date)->where('status', 'Locked')->count(),
            'purchase_required' => PurchaseRequirement::whereDate('delivery_date', $date)->count(),
            'received_lines' => Receiving::whereDate('received_at', $date)->withCount('lines')->get()->sum('lines_count'),
            'packing_pending' => Order::forDelivery($date)->where('packing_status', '!=', 'Packed')->count(),
            'dispatch_pending' => Challan::whereDate('challan_date', $date)->where('status', 'Ready')->count(),
            'delivered' => Challan::whereDate('challan_date', $date)->whereIn('status', ['Delivered', 'Partial'])->count(),
            'outstanding' => round($outstanding, 2),
            'sales_value' => round($salesValue, 2),
        ]);

        $this->info("Snapshot written for {$date}.");

        return self::SUCCESS;
    }
}
