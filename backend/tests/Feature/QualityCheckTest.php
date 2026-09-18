<?php

namespace Tests\Feature;

use App\Models\Item;
use App\Models\PurchaseOrder;
use App\Models\PurchaseOrderItem;
use App\Models\Receiving;
use App\Models\ReceivingItem;
use App\Models\Supplier;
use App\Models\User;
use Database\Seeders\RoleSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Quality check is the one place stock is created, and only the accepted
 * quantity is. These pin that, and pin the empty-remarks case that used to be
 * rejected outright.
 */
class QualityCheckTest extends TestCase
{
    use RefreshDatabase;

    private User $warehouse;
    private Item $item;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RoleSeeder::class);
        $this->warehouse = User::factory()->create(['role_key' => 'warehouse']);
        $this->item = Item::create([
            'code' => 'IV-001', 'name' => 'Cauliflower', 'category' => 'Indian Vegetables',
            'unit' => 'Kg', 'purchase_unit' => 'Kg', 'selling_unit' => 'Kg',
            'default_purchase_price' => 36, 'default_selling_price' => 48, 'stock' => 0,
        ]);
    }

    /** A received line for the item, ready to grade. */
    private function receivedLine(float $received): ReceivingItem
    {
        $po = PurchaseOrder::create([
            'po_no' => 'PO-' . uniqid(),
            'supplier_id' => Supplier::create(['code' => 'S-' . uniqid(), 'name' => 'S', 'market' => 'APMC', 'categories' => []])->id,
            'purchase_date' => now()->toDateString(), 'for_delivery_date' => now()->addDay()->toDateString(),
            'status' => 'Confirmed', 'created_by' => $this->warehouse->id,
        ]);
        $poItem = PurchaseOrderItem::create([
            'purchase_order_id' => $po->id, 'item_id' => $this->item->id, 'unit' => 'Kg', 'qty' => $received, 'rate' => 36,
        ]);
        $grn = Receiving::create([
            'grn_no' => 'GRN-' . uniqid(), 'purchase_order_id' => $po->id,
            'received_at' => now(), 'received_by' => $this->warehouse->id, 'status' => 'Received',
        ]);

        return ReceivingItem::create([
            'receiving_id' => $grn->id, 'purchase_order_item_id' => $poItem->id, 'item_id' => $this->item->id,
            'unit' => 'Kg', 'ordered_qty' => $received, 'received_qty' => $received, 'condition' => 'Good',
        ]);
    }

    public function test_only_the_accepted_quantity_is_credited_to_stock(): void
    {
        Sanctum::actingAs($this->warehouse);
        $line = $this->receivedLine(10);

        $this->postJson('/api/quality-checks', [
            'receiving_item_id' => $line->id,
            'accepted_qty' => 8, 'rejected_qty' => 2,
            'grade' => 'B', 'reason' => 'Poor Quality',
        ])->assertCreated();

        // The two rejected kilos never became sellable.
        $this->assertSame(8.0, (float) $this->item->fresh()->stock);
    }

    /**
     * Regression: remarks was validated as a bare string, and Laravel's
     * ConvertEmptyStringsToNull turns "" into null before validation, so a grade
     * saved without a note — the common case — was rejected with 422. It is now
     * nullable.
     */
    public function test_a_grade_saves_without_a_remark(): void
    {
        Sanctum::actingAs($this->warehouse);
        $line = $this->receivedLine(18);

        $this->postJson('/api/quality-checks', [
            'receiving_item_id' => $line->id,
            'accepted_qty' => 18, 'rejected_qty' => 0,
            'grade' => 'A', 'reason' => null, 'remarks' => '',
        ])->assertCreated();
    }

    public function test_a_rejection_without_a_reason_is_refused(): void
    {
        Sanctum::actingAs($this->warehouse);
        $line = $this->receivedLine(10);

        $this->postJson('/api/quality-checks', [
            'receiving_item_id' => $line->id,
            'accepted_qty' => 8, 'rejected_qty' => 2, 'grade' => 'B',
        ])->assertStatus(422);
    }

    public function test_accepting_more_than_arrived_is_refused(): void
    {
        Sanctum::actingAs($this->warehouse);
        $line = $this->receivedLine(10);

        $this->postJson('/api/quality-checks', [
            'receiving_item_id' => $line->id,
            'accepted_qty' => 12, 'rejected_qty' => 0, 'grade' => 'A',
        ])->assertStatus(422);
    }
}
