<?php

namespace Database\Seeders;

use App\Models\Customer;
use App\Models\CustomerItemPrice;
use App\Models\Item;
use App\Models\Route;
use App\Models\Supplier;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;
use RuntimeException;

/**
 * The business's real masters: 5 routes, 5 suppliers, 40 customers and ~125
 * items with their per-customer price list.
 *
 * The data is exported from the front end's own seed (src/data/seed/generate.ts)
 * into database/seeders/data/masters.json, so the same figures the demo shows
 * are the ones the server holds — the two never quietly diverge. Everything is
 * keyed on the business code and written with updateOrCreate, so running this
 * again corrects drift rather than duplicating rows.
 *
 * Run on its own with:
 *   php artisan db:seed --class=Database\\Seeders\\MasterSeeder
 */
class MasterSeeder extends Seeder
{
    public function run(): void
    {
        $path = database_path('seeders/data/masters.json');

        if (! is_file($path)) {
            throw new RuntimeException(
                "masters.json not found at {$path}. Export it from the front end first "
                . '(see the MasterSeeder docblock).',
            );
        }

        $data = json_decode(file_get_contents($path), true, flags: JSON_THROW_ON_ERROR);

        DB::transaction(function () use ($data) {
            $routeIds = $this->seedRoutes($data['routes'] ?? []);
            $this->seedSuppliers($data['suppliers'] ?? []);
            $customerIds = $this->seedCustomers($data['customers'] ?? [], $routeIds);
            $itemIds = $this->seedItems($data['items'] ?? []);
            $this->seedPrices($data['prices'] ?? [], $customerIds, $itemIds);

            $this->command?->info(sprintf(
                'Masters loaded: %d routes, %d suppliers, %d customers, %d items.',
                count($routeIds), count($data['suppliers'] ?? []), count($customerIds), count($itemIds),
            ));
        });
    }

    /** @return array<string,int> route code → id */
    private function seedRoutes(array $rows): array
    {
        $ids = [];
        foreach ($rows as $r) {
            $route = Route::updateOrCreate(
                ['code' => $r['code']],
                [
                    'name' => $r['name'],
                    'area' => $r['area'] ?? '',
                    'vehicle_no' => $r['vehicleNo'] ?? '',
                    'departure_time' => $r['departureTime'] ?? '07:00',
                ],
            );
            $ids[$r['code']] = $route->id;
        }

        return $ids;
    }

    private function seedSuppliers(array $rows): void
    {
        foreach ($rows as $s) {
            Supplier::updateOrCreate(
                ['code' => $s['code']],
                [
                    'name' => $s['name'],
                    'market' => $s['market'] ?? '',
                    'contact_person' => $s['contactPerson'] ?? '',
                    'mobile' => $s['mobile'] ?? '',
                    'categories' => $s['categories'] ?? [],
                ],
            );
        }
    }

    /**
     * @param  array<string,int>  $routeIds
     * @return array<string,int>  customer code → id
     */
    private function seedCustomers(array $rows, array $routeIds): array
    {
        $ids = [];
        foreach ($rows as $c) {
            $routeId = $routeIds[$c['routeCodeRef'] ?? ''] ?? null;
            if ($routeId === null) {
                // A customer must sit on a route — that is what orders their
                // consolidation column and delivery stop. Skipping is safer than
                // guessing a route it does not belong to.
                $this->command?->warn("Customer {$c['code']} has no known route ({$c['routeCodeRef']}) — skipped.");

                continue;
            }

            $customer = Customer::updateOrCreate(
                ['code' => $c['code']],
                [
                    'route_code' => $c['routeCode'] ?? '',
                    'short_label' => $c['shortLabel'] ?? '',
                    'route_order' => $c['routeOrder'] ?? 0,
                    'route_id' => $routeId,
                    'name' => $c['name'],
                    'legal_name' => $c['legalName'] ?? '',
                    'type' => $c['type'],
                    'location' => $c['location'] ?? '',
                    'contact_person' => $c['contactPerson'] ?? '',
                    'mobile' => $c['mobile'] ?? '',
                    'alt_mobile' => $c['altMobile'] ?? '',
                    'email' => $c['email'] ?? '',
                    'billing_address' => $c['billingAddress'] ?? '',
                    'delivery_address' => $c['deliveryAddress'] ?? '',
                    'gstin' => $c['gstin'] ?? '',
                    'pan' => $c['pan'] ?? '',
                    'payment_terms_days' => $c['paymentTermsDays'] ?? 15,
                    'credit_limit' => $c['creditLimit'] ?? 0,
                    'order_frequency' => $c['orderFrequency'] ?? 'Daily',
                    'special_instructions' => $c['specialInstructions'] ?? '',
                    'active' => $c['active'] ?? true,
                ],
            );
            $ids[$c['code']] = $customer->id;
        }

        return $ids;
    }

    /** @return array<string,int> item code → id */
    private function seedItems(array $rows): array
    {
        $ids = [];
        foreach ($rows as $i) {
            $item = Item::updateOrCreate(
                ['code' => $i['code']],
                [
                    'name' => $i['name'],
                    'excel_name' => $i['excelName'] ?? $i['name'],
                    'category' => $i['category'],
                    // Item + Unit is the SKU; the item is bought and sold in the
                    // one unit and nothing is ever converted.
                    'unit' => $i['unit'],
                    'purchase_unit' => $i['unit'],
                    'selling_unit' => $i['unit'],
                    'min_stock' => $i['minStock'] ?? 0,
                    'reorder_level' => $i['reorderLevel'] ?? 0,
                    'default_purchase_price' => $i['defaultPurchasePrice'],
                    'default_selling_price' => $i['defaultSellingPrice'] ?? round($i['defaultPurchasePrice'] * 1.32, 2),
                    'tax_rate' => $i['taxRate'] ?? 0,
                    'sort_order' => $i['sortOrder'] ?? 0,
                    'active' => $i['active'] ?? true,
                ],
            );
            $ids[$i['code']] = $item->id;
        }

        return $ids;
    }

    /**
     * @param  array<string,int>  $customerIds
     * @param  array<string,int>  $itemIds
     */
    private function seedPrices(array $rows, array $customerIds, array $itemIds): void
    {
        foreach ($rows as $p) {
            $customerId = $customerIds[$p['customerCode'] ?? ''] ?? null;
            $itemId = $itemIds[$p['itemCode'] ?? ''] ?? null;
            if ($customerId === null || $itemId === null) {
                continue;
            }

            // One open price per customer+item. Keying updateOrCreate on the pair
            // (with effective_to null) keeps a reseed from stacking duplicates.
            CustomerItemPrice::updateOrCreate(
                ['customer_id' => $customerId, 'item_id' => $itemId, 'effective_to' => null],
                [
                    'unit' => $p['unit'],
                    'price' => $p['price'],
                    'effective_from' => $p['effectiveFrom'] ?? now()->toDateString(),
                ],
            );
        }
    }
}
