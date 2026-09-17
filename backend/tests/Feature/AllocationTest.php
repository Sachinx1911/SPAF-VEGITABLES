<?php

namespace Tests\Feature;

use App\Domain\Allocator;
use App\Models\Customer;
use App\Models\Item;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\PurchaseRequirement;
use App\Models\Route;
use App\Models\User;
use Database\Seeders\RoleSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * On a short day, allocation decides who goes without. The rule is that
 * everybody is cut by the same proportion and the rounding remainder runs down
 * the route in delivery order — nobody is zeroed while a later stop is filled.
 */
class AllocationTest extends TestCase
{
    use RefreshDatabase;

    private string $date;
    private Item $item;
    private User $user;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RoleSeeder::class);

        $this->date = now()->addDay()->toDateString();
        $this->user = User::factory()->create(['role_key' => 'warehouse']);

        $this->item = Item::create([
            'code' => 'IV-001', 'name' => 'Tomato', 'category' => 'Indian Vegetables',
            'unit' => 'Kg', 'purchase_unit' => 'Kg', 'selling_unit' => 'Kg',
            'default_purchase_price' => 30, 'default_selling_price' => 40,
        ]);
    }

    /** Creates a locked order for one customer at a given route position. */
    private function demand(string $name, int $routeOrder, float $approved): OrderItem
    {
        $route = Route::firstOrCreate(
            ['code' => 'R1'],
            ['name' => 'Route 1', 'departure_time' => '07:00'],
        );
        $customer = Customer::create([
            'code' => 'SPC-' . str_pad((string) $routeOrder, 3, '0', STR_PAD_LEFT),
            'name' => $name, 'type' => 'Restaurant',
            'route_id' => $route->id, 'route_order' => $routeOrder,
        ]);

        $order = Order::create([
            'order_no' => 'SO-' . uniqid(), 'customer_id' => $customer->id,
            'order_date' => now()->toDateString(), 'delivery_date' => $this->date,
            'status' => 'Locked', 'received_at' => now(), 'created_by' => $this->user->id,
        ]);

        $line = OrderItem::create([
            'order_id' => $order->id, 'item_id' => $this->item->id, 'unit' => 'Kg',
            'rate' => 40, 'qty_ordered' => $approved,
        ]);

        // Stages are not mass assignable by design — recordStage is the only
        // way in, which is what stops a stray create() from rewriting history.
        $line->recordStage('approved', $approved);

        return $line;
    }

    private function stockOnHand(float $qty): void
    {
        PurchaseRequirement::create([
            'delivery_date' => $this->date, 'item_id' => $this->item->id, 'unit' => 'Kg',
            'required_qty' => $qty, 'stock_qty' => $qty, 'generated_at' => now(),
        ]);
    }

    public function test_everyone_is_served_in_full_when_enough_arrived(): void
    {
        $a = $this->demand('First', 1, 10);
        $b = $this->demand('Second', 2, 20);
        $this->stockOnHand(30);

        app(Allocator::class)->allocateItem($this->date, $this->item->id, $this->user);

        $this->assertSame('10.000', $a->fresh()->qty_allocated);
        $this->assertSame('20.000', $b->fresh()->qty_allocated);
    }

    public function test_a_shortage_is_shared_proportionally_rather_than_first_come_first_served(): void
    {
        $a = $this->demand('First', 1, 10);
        $b = $this->demand('Second', 2, 30);
        $this->stockOnHand(20);   // half of the 40 needed

        app(Allocator::class)->allocateItem($this->date, $this->item->id, $this->user);

        // Neither is zeroed; both are cut by roughly the same proportion.
        $this->assertGreaterThan(0, (float) $a->fresh()->qty_allocated);
        $this->assertGreaterThan(0, (float) $b->fresh()->qty_allocated);
        $this->assertLessThan(10, (float) $a->fresh()->qty_allocated);
        $this->assertLessThan(30, (float) $b->fresh()->qty_allocated);
    }

    public function test_nothing_more_than_what_arrived_is_ever_handed_out(): void
    {
        $a = $this->demand('First', 1, 10);
        $b = $this->demand('Second', 2, 30);
        $this->stockOnHand(20);

        app(Allocator::class)->allocateItem($this->date, $this->item->id, $this->user);

        $total = (float) $a->fresh()->qty_allocated + (float) $b->fresh()->qty_allocated;
        $this->assertLessThanOrEqual(20.0, $total);
    }

    public function test_no_line_receives_more_than_it_asked_for(): void
    {
        $a = $this->demand('First', 1, 5);
        $b = $this->demand('Second', 2, 5);
        $this->stockOnHand(50);   // far more than needed

        app(Allocator::class)->allocateItem($this->date, $this->item->id, $this->user);

        $this->assertSame('5.000', $a->fresh()->qty_allocated);
        $this->assertSame('5.000', $b->fresh()->qty_allocated);
    }

    public function test_override_gives_every_line_its_full_requirement(): void
    {
        $a = $this->demand('First', 1, 10);
        $b = $this->demand('Second', 2, 30);
        $this->stockOnHand(5);

        app(Allocator::class)->allocateItem($this->date, $this->item->id, $this->user, override: true);

        $this->assertSame('10.000', $a->fresh()->qty_allocated);
        $this->assertSame('30.000', $b->fresh()->qty_allocated);
    }

    public function test_weighed_goods_are_cut_to_the_half_kilo(): void
    {
        $a = $this->demand('First', 1, 10);
        $b = $this->demand('Second', 2, 10);
        $this->stockOnHand(13);

        app(Allocator::class)->allocateItem($this->date, $this->item->id, $this->user);

        foreach ([$a, $b] as $line) {
            $qty = (float) $line->fresh()->qty_allocated;
            $this->assertSame(0.0, fmod($qty * 10, 5.0), "{$qty} is not a half-kilo step");
        }
    }

    /**
     * Regression: with a ratio that does not divide evenly, rounding each share
     * to the NEAREST step let several lines round up at once and promised more
     * than arrived. 26 kg was handed out as 26.5.
     */
    public function test_a_ratio_that_rounds_badly_still_never_exceeds_what_arrived(): void
    {
        $a = $this->demand('First', 1, 10);
        $b = $this->demand('Second', 2, 9);
        $c = $this->demand('Third', 3, 25);
        $this->stockOnHand(26);   // against 44 required

        app(Allocator::class)->allocateItem($this->date, $this->item->id, $this->user);

        $total = (float) $a->fresh()->qty_allocated
            + (float) $b->fresh()->qty_allocated
            + (float) $c->fresh()->qty_allocated;

        $this->assertLessThanOrEqual(26.0, $total, "handed out {$total} of 26 available");
        // And the remainder is not simply discarded.
        $this->assertGreaterThanOrEqual(25.0, $total);
    }

    public function test_the_rounding_remainder_goes_down_the_route_in_order(): void
    {
        $a = $this->demand('First', 1, 10);
        $b = $this->demand('Second', 2, 10);
        $this->stockOnHand(13);   // 6.5 each exactly, nothing spare

        app(Allocator::class)->allocateItem($this->date, $this->item->id, $this->user);

        // The earlier stop is never worse off than the later one.
        $this->assertGreaterThanOrEqual(
            (float) $b->fresh()->qty_allocated,
            (float) $a->fresh()->qty_allocated,
        );
    }

    public function test_re_running_allocation_replaces_rather_than_accumulates(): void
    {
        $a = $this->demand('First', 1, 10);
        $this->stockOnHand(10);

        app(Allocator::class)->allocateItem($this->date, $this->item->id, $this->user);
        app(Allocator::class)->allocateItem($this->date, $this->item->id, $this->user);

        $this->assertSame('10.000', $a->fresh()->qty_allocated);
        $this->assertSame(1, \App\Models\Allocation::where('order_item_id', $a->id)->count());
    }

    public function test_allocating_leaves_the_approved_quantity_untouched(): void
    {
        $a = $this->demand('First', 1, 10);
        $this->stockOnHand(4);

        app(Allocator::class)->allocateItem($this->date, $this->item->id, $this->user);

        $this->assertSame('10.000', $a->fresh()->qty_approved);
        $this->assertSame('10.000', $a->fresh()->qty_ordered);
    }
}
