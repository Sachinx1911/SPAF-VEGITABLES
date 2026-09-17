<?php

namespace App\Http\Controllers;

use App\Models\Customer;
use App\Models\CustomerItemPrice;
use App\Models\Item;
use App\Models\Route;
use App\Models\Supplier;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * Customers, items, prices, routes and suppliers.
 *
 * Grouped into one controller because they are all plain records with the same
 * shape of work; anything with a workflow attached lives in its own controller.
 */
class MasterController extends Controller
{
    /* ------------------------------------------------------------ customers */

    public function customers(Request $request): JsonResponse
    {
        $data = $request->validate([
            'search' => ['sometimes', 'string', 'max:120'],
            'type' => ['sometimes', 'string', 'max:30'],
            'active' => ['sometimes', 'boolean'],
            'per_page' => ['sometimes', 'integer', 'min:1', 'max:500'],
        ]);

        $customers = Customer::with('route:id,name')
            ->when($data['search'] ?? null, fn ($q, $s) => $q->where(fn ($w) => $w
                ->where('name', 'like', "%{$s}%")
                ->orWhere('code', 'like', "%{$s}%")
                ->orWhere('contact_person', 'like', "%{$s}%")))
            ->when($data['type'] ?? null, fn ($q, $t) => $q->where('type', $t))
            ->when(isset($data['active']), fn ($q) => $q->where('active', $data['active']))
            ->orderBy('route_order')
            ->paginate($data['per_page'] ?? 100);

        return response()->json($customers);
    }

    public function showCustomer(Customer $customer): JsonResponse
    {
        $customer->load('route');

        return response()->json(['customer' => $customer->toPortableArray()]);
    }

    public function storeCustomer(Request $request): JsonResponse
    {
        $data = $this->validateCustomer($request);
        $data['code'] ??= $this->nextCustomerCode();
        $data['route_order'] = (int) Customer::max('route_order') + 1;
        $data['short_label'] ??= strtoupper(substr(explode(' ', $data['name'])[0], 0, 12));

        $customer = Customer::create($data);
        activity_log($request->user(), 'Customer created', 'customers', $customer->code, $customer->id, '', $customer->name);

        return response()->json(['customer' => $customer->toPortableArray()], 201);
    }

    public function updateCustomer(Request $request, Customer $customer): JsonResponse
    {
        $data = $this->validateCustomer($request, $customer->id);
        $before = $customer->name;
        $customer->update($data);

        activity_log($request->user(), 'Customer updated', 'customers', $customer->code, $customer->id, $before, $customer->name);

        return response()->json(['customer' => $customer->fresh()->toPortableArray()]);
    }

    /* ---------------------------------------------------------------- items */

    public function items(Request $request): JsonResponse
    {
        $data = $request->validate([
            'search' => ['sometimes', 'string', 'max:120'],
            'category' => ['sometimes', 'string', 'max:40'],
            'active' => ['sometimes', 'boolean'],
            'per_page' => ['sometimes', 'integer', 'min:1', 'max:500'],
        ]);

        $items = Item::query()
            ->when($data['search'] ?? null, fn ($q, $s) => $q->where(fn ($w) => $w
                ->where('name', 'like', "%{$s}%")->orWhere('code', 'like', "%{$s}%")))
            ->when($data['category'] ?? null, fn ($q, $c) => $q->where('category', $c))
            ->when(isset($data['active']), fn ($q) => $q->where('active', $data['active']))
            ->orderBy('sort_order')
            ->paginate($data['per_page'] ?? 200);

        $items->getCollection()->transform(fn (Item $i) => $i->toPortableArray() + ['stockState' => $i->stockState()]);

        return response()->json($items);
    }

    public function storeItem(Request $request): JsonResponse
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:120'],
            // Item + Unit is the SKU, so the pair must be unique — the same
            // produce in another unit is a separate item, not a duplicate.
            'unit' => ['required', Rule::in(['Kg', 'Pcs', 'Bdl', 'Dozen', 'Pkt', 'Box']),
                Rule::unique('items')->where(fn ($q) => $q->where('name', $request->input('name')))],
            'category' => ['required', 'string', 'max:40'],
            'code' => ['sometimes', 'string', 'max:20', 'unique:items,code'],
            'default_purchase_price' => ['required', 'numeric', 'gt:0'],
            'default_selling_price' => ['sometimes', 'numeric', 'gt:0'],
            'min_stock' => ['sometimes', 'numeric', 'gte:0'],
            'reorder_level' => ['sometimes', 'numeric', 'gte:0'],
            'tax_rate' => ['sometimes', 'numeric', 'gte:0', 'lte:28'],
        ], [
            'unit.unique' => 'This item already exists in that unit.',
        ]);

        $data['code'] ??= $this->nextItemCode($data['category']);
        $data['excel_name'] ??= $data['name'];
        $data['purchase_unit'] = $data['unit'];
        $data['selling_unit'] = $data['unit'];
        $data['default_selling_price'] ??= round($data['default_purchase_price'] * 1.32, 2);
        $data['sort_order'] = (int) Item::max('sort_order') + 1;

        $item = Item::create($data);
        activity_log($request->user(), 'Item created', 'items', $item->code, null, '', "{$item->name} ({$item->unit})");

        return response()->json(['item' => $item->toPortableArray()], 201);
    }

    public function updateItem(Request $request, Item $item): JsonResponse
    {
        $data = $request->validate([
            'name' => ['sometimes', 'string', 'max:120'],
            'category' => ['sometimes', 'string', 'max:40'],
            'default_purchase_price' => ['sometimes', 'numeric', 'gt:0'],
            'default_selling_price' => ['sometimes', 'numeric', 'gt:0'],
            'min_stock' => ['sometimes', 'numeric', 'gte:0'],
            'reorder_level' => ['sometimes', 'numeric', 'gte:0'],
            'tax_rate' => ['sometimes', 'numeric', 'gte:0', 'lte:28'],
            'active' => ['sometimes', 'boolean'],
        ]);

        // The unit is half the identity. Changing it would silently turn this
        // row into a different SKU, taking its history with it.
        if ($request->has('unit') && $request->input('unit') !== $item->unit) {
            return response()->json([
                'message' => 'A unit cannot be changed — Item + Unit is the SKU. Create a separate item instead.',
            ], 422);
        }

        $item->update($data);
        activity_log($request->user(), 'Item updated', 'items', $item->code, null, '', $item->name);

        return response()->json(['item' => $item->fresh()->toPortableArray()]);
    }

    public function stock(): JsonResponse
    {
        $items = Item::active()->orderBy('sort_order')->get()
            ->map(fn (Item $i) => [
                'itemId' => (string) $i->id,
                'name' => $i->name,
                'unit' => $i->unit,
                'category' => $i->category,
                'stock' => (float) $i->stock,
                'minStock' => (float) $i->min_stock,
                'reorderLevel' => (float) $i->reorder_level,
                'state' => $i->stockState(),
            ]);

        return response()->json(['rows' => $items]);
    }

    /* --------------------------------------------------------------- prices */

    public function prices(Request $request): JsonResponse
    {
        $data = $request->validate([
            'customer_id' => ['sometimes', 'exists:customers,id'],
            'item_id' => ['sometimes', 'exists:items,id'],
        ]);

        $prices = CustomerItemPrice::with(['customer:id,name', 'item:id,name,unit'])
            ->when($data['customer_id'] ?? null, fn ($q, $c) => $q->where('customer_id', $c))
            ->when($data['item_id'] ?? null, fn ($q, $i) => $q->where('item_id', $i))
            ->whereNull('effective_to')
            ->get();

        return response()->json(['prices' => $prices]);
    }

    /**
     * Sets a customer price from a date.
     *
     * The previous price is closed off rather than edited, so an invoice raised
     * last week still explains itself at the rate that applied then.
     */
    public function setPrice(Request $request): JsonResponse
    {
        $data = $request->validate([
            'customer_id' => ['required', 'exists:customers,id'],
            'item_id' => ['required', 'exists:items,id'],
            'price' => ['required', 'numeric', 'gt:0'],
            'effective_from' => ['required', 'date_format:Y-m-d'],
        ]);

        $item = Item::findOrFail($data['item_id']);

        CustomerItemPrice::where('customer_id', $data['customer_id'])
            ->where('item_id', $data['item_id'])
            ->whereNull('effective_to')
            ->update(['effective_to' => date('Y-m-d', strtotime($data['effective_from'] . ' -1 day'))]);

        $price = CustomerItemPrice::create($data + ['unit' => $item->unit]);

        activity_log($request->user(), 'Price updated', 'prices', $item->name, $data['customer_id'], '', (string) $data['price']);

        return response()->json(['price' => $price], 201);
    }

    /* ------------------------------------------------------ routes/suppliers */

    public function routes(): JsonResponse
    {
        return response()->json(['routes' => Route::with('driver:id,name')->orderBy('code')->get()]);
    }

    public function suppliers(): JsonResponse
    {
        return response()->json(['suppliers' => Supplier::orderBy('name')->get()]);
    }

    /* -------------------------------------------------------------- helpers */

    private function validateCustomer(Request $request, ?int $ignoreId = null): array
    {
        return $request->validate([
            'name' => ['required', 'string', 'max:160'],
            'code' => ['sometimes', 'string', 'max:20', Rule::unique('customers', 'code')->ignore($ignoreId)],
            'legal_name' => ['sometimes', 'string', 'max:200'],
            'type' => ['required', Rule::in(['Hotel', 'Restaurant', 'Cafe', 'Caterer', 'Corporate', 'Other'])],
            'route_id' => ['required', 'exists:routes,id'],
            'location' => ['sometimes', 'string', 'max:120'],
            'contact_person' => ['sometimes', 'string', 'max:120'],
            'mobile' => ['sometimes', 'string', 'max:20'],
            'alt_mobile' => ['sometimes', 'string', 'max:20'],
            'email' => ['sometimes', 'nullable', 'email', 'max:160'],
            'billing_address' => ['sometimes', 'string', 'max:500'],
            'delivery_address' => ['sometimes', 'string', 'max:500'],
            'gstin' => ['sometimes', 'string', 'max:20'],
            'pan' => ['sometimes', 'string', 'max:15'],
            'payment_terms_days' => ['sometimes', 'integer', 'min:0', 'max:180'],
            'credit_limit' => ['sometimes', 'numeric', 'gte:0'],
            'order_frequency' => ['sometimes', Rule::in(['Daily', 'Alternate Days', 'Weekly', 'On Demand'])],
            'special_instructions' => ['sometimes', 'string', 'max:500'],
            'active' => ['sometimes', 'boolean'],
        ]);
    }

    private function nextCustomerCode(): string
    {
        $last = Customer::where('code', 'like', 'SPC-%')->max('code');
        $n = $last ? ((int) substr($last, 4)) + 1 : 1;

        return 'SPC-' . str_pad((string) $n, 3, '0', STR_PAD_LEFT);
    }

    private function nextItemCode(string $category): string
    {
        $prefix = match ($category) {
            'Indian Vegetables' => 'IV', 'Imported Produce' => 'IP', 'Herbs & Leafy' => 'HL',
            'Fresh Fruits' => 'FF', 'Exotic Vegetables' => 'EX', default => 'IT',
        };
        $last = Item::where('code', 'like', "{$prefix}-%")->max('code');
        $n = $last ? ((int) substr($last, 3)) + 1 : 1;

        return "{$prefix}-" . str_pad((string) $n, 3, '0', STR_PAD_LEFT);
    }
}
