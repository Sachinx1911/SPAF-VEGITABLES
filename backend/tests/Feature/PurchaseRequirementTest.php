<?php

namespace Tests\Feature;

use App\Models\Item;
use App\Models\PurchaseOrder;
use App\Models\PurchaseOrderItem;
use App\Models\PurchaseRequirement;
use App\Models\Supplier;
use App\Models\User;
use Database\Seeders\RoleSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * The purchase requirement subtracts what has already been bought for the day
 * from what the locked consolidation asked for. The subtraction is the whole
 * point of the screen, so it is pinned here — including the case that used to
 * take the endpoint down.
 */
class PurchaseRequirementTest extends TestCase
{
    use RefreshDatabase;

    private string $date;
    private User $buyer;
    private Item $lemonKg;
    private Item $lemonPcs;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RoleSeeder::class);

        $this->date = now()->addDay()->toDateString();
        $this->buyer = User::factory()->create(['role_key' => 'purchase_manager']);

        // The same produce in two units — two SKUs, never merged.
        $this->lemonKg = Item::create([
            'code' => 'IV-013', 'name' => 'Yellow Lemon', 'category' => 'Indian Vegetables',
            'unit' => 'Kg', 'purchase_unit' => 'Kg', 'selling_unit' => 'Kg',
            'default_purchase_price' => 24, 'default_selling_price' => 32,
        ]);
        $this->lemonPcs = Item::create([
            'code' => 'IV-011', 'name' => 'Yellow Lemon', 'category' => 'Indian Vegetables',
            'unit' => 'Pcs', 'purchase_unit' => 'Pcs', 'selling_unit' => 'Pcs',
            'default_purchase_price' => 3, 'default_selling_price' => 4,
        ]);

        foreach ([[$this->lemonKg, 'Kg', 18], [$this->lemonPcs, 'Pcs', 150]] as [$item, $unit, $qty]) {
            PurchaseRequirement::create([
                'delivery_date' => $this->date, 'item_id' => $item->id, 'unit' => $unit,
                'required_qty' => $qty, 'stock_qty' => 0, 'generated_at' => now(),
            ]);
        }
    }

    private function buy(Item $item, float $qty, float $rate): void
    {
        $po = PurchaseOrder::create([
            'po_no' => 'PO-' . uniqid(), 'supplier_id' => Supplier::create([
                'code' => 'SUP-' . uniqid(), 'name' => 'Test Supplier', 'market' => 'APMC', 'categories' => [],
            ])->id,
            'purchase_date' => now()->toDateString(), 'for_delivery_date' => $this->date,
            'status' => 'Confirmed', 'created_by' => $this->buyer->id,
        ]);
        PurchaseOrderItem::create([
            'purchase_order_id' => $po->id, 'item_id' => $item->id, 'unit' => $item->unit, 'qty' => $qty, 'rate' => $rate,
        ]);
    }

    public function test_a_fresh_requirement_lists_the_full_quantity_to_buy(): void
    {
        Sanctum::actingAs($this->buyer);

        $rows = $this->getJson("/api/purchase/requirements?delivery_date={$this->date}")
            ->assertOk()->json('rows');

        $this->assertCount(2, $rows);
        foreach ($rows as $row) {
            $this->assertSame(0.0, (float) $row['purchasedQty']);
            $this->assertSame((float) $row['requiredQty'], (float) $row['toBuyQty']);
            $this->assertSame('Required', $row['status']);
        }
    }

    /**
     * Regression: the "already bought" total was plucked from a bare
     * DB::raw('SUM(...)'), so Laravel looked for a property literally called
     * "SUM(...)" on each row and threw. The endpoint returned 500 the instant a
     * single purchase existed for the day — which is to say, always, in use.
     */
    public function test_the_requirement_still_loads_once_a_purchase_exists(): void
    {
        Sanctum::actingAs($this->buyer);
        $this->buy($this->lemonKg, 18, 24);

        $this->getJson("/api/purchase/requirements?delivery_date={$this->date}")->assertOk();
    }

    public function test_a_purchase_reduces_only_its_own_sku(): void
    {
        Sanctum::actingAs($this->buyer);

        // Buy the Kg lemon in full; the Pcs lemon is a different SKU and untouched.
        $this->buy($this->lemonKg, 18, 24);

        $rows = collect($this->getJson("/api/purchase/requirements?delivery_date={$this->date}")
            ->assertOk()->json('rows'))->keyBy(fn ($r) => $r['unit']);

        $this->assertSame(18.0, (float) $rows['Kg']['purchasedQty']);
        $this->assertSame(0.0, (float) $rows['Kg']['toBuyQty']);
        $this->assertSame('OK', $rows['Kg']['status']);

        $this->assertSame(0.0, (float) $rows['Pcs']['purchasedQty']);
        $this->assertSame(150.0, (float) $rows['Pcs']['toBuyQty']);
        $this->assertSame('Required', $rows['Pcs']['status']);
    }
}
