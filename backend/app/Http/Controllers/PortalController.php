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

    /**
     * Amends the customer's own pending order.
     *
     * ScopeToCustomer fixes which customer the request speaks for, but the order
     * id still arrives from the client, so ownership is checked here — route
     * model binding would otherwise hand over anybody's order.
     *
     * The editing rules live in OrderController::update and are not repeated:
     * the portal decides who may ask, not what an amendment means.
     */
    public function amendOrder(Request $request, Order $order): JsonResponse
    {
        if ((int) $order->customer_id !== $this->customerId($request)) {
            return response()->json(['message' => 'That order belongs to another customer.'], 403);
        }

        return app(OrderController::class)->update($request, $order);
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
    /**
     * What this customer may order, and at what price.
     *
     * Items come in the front end's own shape and the customer's price list
     * comes with them, so the ordering screen works out a rate exactly as the
     * staff screens do rather than trusting a number sent per item. Only this
     * customer's prices are included — a price list is commercially sensitive.
     */
    public function catalogue(Request $request): JsonResponse
    {
        $customerId = $this->customerId($request);
        $date = $request->query('for_date', date('Y-m-d', strtotime('+1 day')));

        $items = Item::active()->orderBy('sort_order')->get()
            ->map(fn (Item $i) => $i->toPortableArray());

        $prices = CustomerItemPrice::where('customer_id', $customerId)->get()->map(fn (CustomerItemPrice $p) => [
            'id' => (string) $p->id,
            'customerId' => (string) $p->customer_id,
            'itemId' => (string) $p->item_id,
            'unit' => $p->unit,
            'price' => (float) $p->price,
            'effectiveFrom' => $p->effective_from?->toDateString(),
            'effectiveTo' => $p->effective_to?->toDateString(),
        ]);

        return response()->json(['items' => $items, 'prices' => $prices, 'forDate' => $date]);
    }

    /**
     * The customer's own orders, in the shape the front end's own model uses.
     *
     * Deliberately identical to OrderController::index, minus the customer
     * filter, which comes from the token. The portal screens read the same
     * store tables as the staff screens, so a portal-only shape would mean a
     * second set of mappings that could drift from the first.
     *
     * The full quantity chain is included: seeing ordered against delivered is
     * the point of the screen.
     */
    public function orders(Request $request): JsonResponse
    {
        $orders = Order::with(['customer:id,name,code', 'lines'])
            ->where('customer_id', $this->customerId($request))
            ->orderByDesc('delivery_date')
            ->orderByDesc('id')
            ->limit(100)
            ->get()
            ->map(fn (Order $o) => $o->toPortableArray() + [
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
        // Mapped rather than returned raw: the models are snake_case and the
        // front end's StandingOrderTemplate nests its lines.
        $templates = StandingOrderTemplate::with('lines')
            ->where('customer_id', $this->customerId($request))
            ->get()
            ->map(fn (StandingOrderTemplate $t) => [
                'id' => (string) $t->id,
                'customerId' => (string) $t->customer_id,
                'name' => $t->name,
                'lines' => $t->lines->map(fn (StandingOrderTemplateLine $l) => [
                    'itemId' => (string) $l->item_id,
                    'unit' => $l->unit,
                    'qty' => (float) $l->qty,
                ]),
                'createdAt' => $t->created_at?->toIso8601String(),
                'updatedAt' => $t->updated_at?->toIso8601String(),
            ]);

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

    /**
     * This customer's invoices, built by InvoiceController's own row mapper so
     * the portal and the office agree on what is paid, due and overdue.
     */
    public function invoices(Request $request, InvoiceController $invoices): JsonResponse
    {
        $request->merge(['customer_id' => $this->customerId($request)]);

        return $invoices->index($request);
    }

    public function ledger(Request $request, LedgerController $ledger): JsonResponse
    {
        return $ledger->show($request, Customer::findOrFail($this->customerId($request)));
    }
}
