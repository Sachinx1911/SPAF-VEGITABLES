<?php

namespace Tests\Feature;

use App\Models\Customer;
use App\Models\Item;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\Route;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use RuntimeException;
use Tests\TestCase;

/**
 * The chain is the system's central promise: each stage records its own number
 * and never overwrites the one before it. These tests hold the server to it.
 */
class QuantityChainTest extends TestCase
{
    use RefreshDatabase;

    private function line(float $ordered = 10): OrderItem
    {
        $route = Route::create(['code' => 'R1', 'name' => 'Route 1', 'departure_time' => '07:00']);
        $customer = Customer::create([
            'code' => 'SPC-001', 'name' => 'Test Kitchen', 'type' => 'Restaurant',
            'route_id' => $route->id, 'route_order' => 1,
        ]);
        $item = Item::create([
            'code' => 'IV-001', 'name' => 'Tomato', 'category' => 'Indian Vegetables',
            'unit' => 'Kg', 'purchase_unit' => 'Kg', 'selling_unit' => 'Kg',
            'default_purchase_price' => 30, 'default_selling_price' => 40,
        ]);
        $user = User::factory()->create(['role_key' => 'admin']);

        $order = Order::create([
            'order_no' => 'SO-TEST-0001', 'customer_id' => $customer->id,
            'order_date' => now()->toDateString(), 'delivery_date' => now()->addDay()->toDateString(),
            'received_at' => now(), 'created_by' => $user->id,
        ]);

        return OrderItem::create([
            'order_id' => $order->id, 'item_id' => $item->id, 'unit' => 'Kg',
            'rate' => 40, 'qty_ordered' => $ordered,
        ]);
    }

    public function test_recording_a_stage_leaves_the_ordered_quantity_alone(): void
    {
        $line = $this->line(10);
        $line->recordStage('approved', 8);

        $this->assertSame('10.000', $line->fresh()->qty_ordered);
        $this->assertSame('8.000', $line->fresh()->qty_approved);
    }

    public function test_the_ordered_stage_can_never_be_rewritten(): void
    {
        $line = $this->line(10);

        $this->expectException(RuntimeException::class);
        $line->recordStage('ordered', 99);
    }

    public function test_a_stage_that_already_has_a_value_is_not_overwritten(): void
    {
        $line = $this->line(10);
        $line->recordStage('approved', 8);

        $this->expectException(RuntimeException::class);
        $line->recordStage('approved', 6);
    }

    public function test_an_unknown_stage_is_refused(): void
    {
        $this->expectException(RuntimeException::class);
        $this->line()->recordStage('invented', 1);
    }

    public function test_a_negative_quantity_is_refused(): void
    {
        $this->expectException(RuntimeException::class);
        $this->line()->recordStage('approved', -1);
    }

    public function test_a_reset_stage_can_be_recorded_again(): void
    {
        $line = $this->line(10);
        $line->recordStage('allocated', 5);
        $line->resetStage('allocated');
        $line->recordStage('allocated', 7);

        $this->assertSame('7.000', $line->fresh()->qty_allocated);
    }

    public function test_the_shortfall_is_the_gap_between_ordered_and_delivered(): void
    {
        $line = $this->line(10);
        $line->recordStage('approved', 10);
        $line->recordStage('allocated', 9);
        $line->recordStage('packed', 9);
        $line->recordStage('dispatched', 9);
        $line->recordStage('delivered', 8.5);

        $this->assertSame(1.5, $line->fresh()->shortfall());
    }

    public function test_the_current_stage_is_the_furthest_one_filled(): void
    {
        $line = $this->line();
        $this->assertSame('ordered', $line->currentStage());

        $line->recordStage('approved', 10);
        $this->assertSame('approved', $line->fresh()->currentStage());
    }

    public function test_the_chain_exposes_every_stage_to_the_front_end(): void
    {
        $chain = $this->line()->chain();

        $this->assertCount(12, $chain);
        $this->assertSame(10.0, $chain['ordered']);
        $this->assertNull($chain['delivered']);
        $this->assertArrayHasKey('customerAccepted', $chain);
    }
}
