<?php

namespace App\Http\Controllers;

use App\Models\Challan;
use App\Models\Customer;
use App\Models\CustomerItemPrice;
use App\Models\Invoice;
use App\Models\Item;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\StandingOrderTemplate;
use App\Models\StandingOrderTemplateLine;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * The customer's own portal.
 *
 * Every method reads its customer from the request attribute set by
 * ScopeToCustomer, never from the request body — otherwise a portal login could
 * ask for somebody else's orders, prices and dues by changing one number.
 */
class PortalController extends Controller
{
    private function customerId(Request $request): int
    {
        return (int) $request->attributes->get('customer_id');
    }

    public function summary(Request $request): JsonResponse
    {
        $customer = Customer::findOrFail($this->customerId($request));
        $today = now()->toDateString();

        $cutoff = (string) setting('order_cutoff_time', '22:00');
        $nextDelivery = Order::isLateArrival(date('Y-m-d', strtotime('+1 day')), now())
            ? date('Y-m-d', strtotime('+2 days'))
            : date('Y-m-d', strtotime('+1 day'));

        $pending = Order::where('customer_id', $customer->id)
            ->whereDate('delivery_date', $nextDelivery)
            ->whereIn('status', ['Draft', 'Submitted', 'Late'])
            ->withCount('lines')
            ->first();

        $outstanding = Invoice::withSum('payments as paid_sum', 'amount')
            ->where('customer_id', $customer->id)
            ->where('status', '!=', 'Cancelled')
            ->get()
            ->sum(fn (Invoice $i) => $i->balance());

        return response()->json([
            'customer' => $customer->toPortableArray(),
            'cutoffTime' => $cutoff,
            'nextDeliveryDate' => $nextDelivery,
            'pendingOrder' => $pending ? [
                'id' => (string) $pending->id,
                'orderNo' => $pending->order_no,
                'status' => $pending->status,
                'lines' => $pending->lines_count,
            ] : null,
            'arrivingToday' => Challan::where('customer_id', $customer->id)
                ->whereDate('challan_date', $today)->exists(),
            'outstanding' => round($outstanding, 2),
            'templates' => StandingOrderTemplate::withCount('lines')
                ->where('customer_id', $customer->id)->get()
                ->map(fn ($t) => ['id' => (string) $t->id, 'name' => $t->name, 'lines' => $t->lines_count]),
        ]);
    }

    /** The catalogue at this customer's own prices. */
    public function catalogue(Request $request): JsonResponse
    {
        $customerId = $this->customerId($request);
        $date = $request->query('for_date', date('Y-m-d', strtotime('+1 day')));

        $items = Item::active()->orderBy('sort_order')->get()->map(fn (Item $i) => [
            'id' => (string) $i->id,
            'name' => $i->name,
            'unit' => $i->unit,
            'category' => $i->category,
            'rate' => CustomerItemPrice::rateFor($customerId, $i->id, $date),
        ]);

        return response()->json(['items' => $items, 'forDate' => $date]);
    }

    public function orders(Request $request): JsonResponse
    {
        $orders = Order::with('lines.item:id,name,unit')
            ->where('customer_id', $this->customerId($request))
            ->orderByDesc('delivery_date')
            ->limit(50)
            ->get()
            ->map(fn (Order $o) => [
                'id' => (string) $o->id,
                'orderNo' => $o->order_no,
                'deliveryDate' => $o->delivery_date->toDateString(),
                'status' => $o->status,
                'deliveryStatus' => $o->delivery_status,
                'value' => $o->value(),
                'lines' => $o->lines->map(fn (OrderItem $l) => [
                    'itemName' => $l->item->name,
                    'unit' => $l->unit,
                    'ordered' => (float) $l->qty_ordered,
                    // Shown so the customer can see what actually arrived
                    // against what they asked for, without having to ring up.
                    'delivered' => $l->qty_delivered === null ? null : (float) $l->qty_delivered,
                    'rate' => (float) $l->rate,
                ]),
            ]);

        return response()->json(['orders' => $orders]);
    }

    public function placeOrder(Request $request): JsonResponse
    {
        $data = $request->validate([
            'delivery_date' => ['required', 'date_format:Y-m-d', 'after_or_equal:today'],
            'lines' => ['required', 'array', 'min:1'],
            'lines.*.item_id' => ['required', 'exists:items,id'],
            'lines.*.qty' => ['required', 'numeric', 'gt:0'],
            'remarks' => ['sometimes', 'nullable', 'string', 'max:500'],
        ]);

        $customerId = $this->customerId($request);
        $user = $request->user();
        $now = now();
        $late = Order::isLateArrival($data['delivery_date'], $now);

        $order = DB::transaction(function () use ($data, $customerId, $user, $late, $now) {
            $order = Order::create([
                'order_no' => 'SO-' . $now->format('ym') . '-' . str_pad(
                    (string) (((int) substr((string) Order::where('order_no', 'like', 'SO-' . $now->format('ym') . '-%')->max('order_no'), -4)) + 1),
                    4, '0', STR_PAD_LEFT,
                ),
                'customer_id' => $customerId,
                'order_date' => $now->toDateString(),
                'delivery_date' => $data['delivery_date'],
                'order_type' => 'Regular',
                'source' => 'Customer Portal',
                'status' => $late ? 'Late' : 'Submitted',
                'is_late' => $late,
                'received_at' => $now,
                'remarks' => $data['remarks'] ?? '',
                'created_by' => $user->id,
            ]);

            foreach ($data['lines'] as $line) {
                $item = Item::findOrFail($line['item_id']);
                OrderItem::create([
                    'order_id' => $order->id,
                    'item_id' => $item->id,
                    'unit' => $item->unit,
                    'rate' => CustomerItemPrice::rateFor($customerId, $item->id, $data['delivery_date']),
                    'qty_ordered' => $line['qty'],
                ]);
            }

            return $order;
        });

        activity_log(
            $user, $late ? 'Portal order (late)' : 'Portal order placed', 'orders',
            $order->order_no, $customerId, '', count($data['lines']) . ' items',
            $late ? 'Warning' : 'Success',
        );

        return response()->json(['order' => $order->toPortableArray()], 201);
    }

    /* ------------------------------------------------------------ templates */

    public function templates(Request $request): JsonResponse
    {
        $templates = StandingOrderTemplate::with('lines.item:id,name,unit')
            ->where('customer_id', $this->customerId($request))
            ->get();

        return response()->json(['templates' => $templates]);
    }

    /** Saves the customer's own "fixed order", so tomorrow is one tap. */
    public function saveTemplate(Request $request): JsonResponse
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:80'],
            'lines' => ['required', 'array', 'min:1'],
            'lines.*.item_id' => ['required', 'exists:items,id'],
            'lines.*.qty' => ['required', 'numeric', 'gt:0'],
        ]);

        $customerId = $this->customerId($request);

        $template = DB::transaction(function () use ($data, $customerId) {
            $t = StandingOrderTemplate::create(['customer_id' => $customerId, 'name' => $data['name']]);

            foreach ($data['lines'] as $line) {
                $item = Item::findOrFail($line['item_id']);
                StandingOrderTemplateLine::create([
                    'standing_order_template_id' => $t->id,
                    'item_id' => $item->id,
                    'unit' => $item->unit,
                    'qty' => $line['qty'],
                ]);
            }

            return $t;
        });

        return response()->json(['template' => $template->load('lines')], 201);
    }

    public function deleteTemplate(Request $request, StandingOrderTemplate $template): JsonResponse
    {
        if ($template->customer_id !== $this->customerId($request)) {
            return response()->json(['message' => 'Not found.'], 404);
        }

        $template->delete();

        return response()->json(['message' => 'Removed.']);
    }

    /* -------------------------------------------------------------- finance */

    public function invoices(Request $request): JsonResponse
    {
        $invoices = Invoice::withSum('payments as paid_sum', 'amount')
            ->where('customer_id', $this->customerId($request))
            ->where('status', '!=', 'Cancelled')
            ->orderByDesc('invoice_date')
            ->limit(100)
            ->get()
            ->map(fn (Invoice $i) => [
                'invoiceNo' => $i->invoice_no,
                'invoiceDate' => $i->invoice_date->toDateString(),
                'dueDate' => $i->due_date->toDateString(),
                'total' => (float) $i->total,
                'paid' => $i->paidAmount(),
                'balance' => $i->balance(),
                'status' => $i->derivedStatus(),
            ]);

        return response()->json(['invoices' => $invoices]);
    }

    public function ledger(Request $request, LedgerController $ledger): JsonResponse
    {
        return $ledger->show($request, Customer::findOrFail($this->customerId($request)));
    }
}
