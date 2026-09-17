<?php

namespace Tests\Feature;

use App\Models\Customer;
use App\Models\Invoice;
use App\Models\Payment;
use App\Models\Route;
use App\Models\User;
use Database\Seeders\RoleSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Invoice status is worked out from the payments and the due date every time it
 * is asked for. These tests pin that, and pin the refusal of an overpayment —
 * the entry that would silently corrupt every outstanding figure downstream.
 */
class FinanceTest extends TestCase
{
    use RefreshDatabase;

    private Customer $customer;
    private User $accounts;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RoleSeeder::class);

        $route = Route::create(['code' => 'R1', 'name' => 'R1', 'departure_time' => '07:00']);
        $this->customer = Customer::create([
            'code' => 'SPC-001', 'name' => 'Kitchen', 'type' => 'Restaurant',
            'route_id' => $route->id, 'route_order' => 1, 'payment_terms_days' => 10,
        ]);
        $this->accounts = User::factory()->create(['role_key' => 'accounts']);
    }

    private function invoice(float $total, string $invoiceDate, string $dueDate): Invoice
    {
        return Invoice::create([
            'invoice_no' => 'INV-' . uniqid(),
            'customer_id' => $this->customer->id,
            'order_id' => null,
            'invoice_date' => $invoiceDate,
            'due_date' => $dueDate,
            'subtotal' => $total,
            'tax_amount' => 0,
            'total' => $total,
            'status' => 'Generated',
            'created_by' => $this->accounts->id,
        ]);
    }

    private function pay(Invoice $invoice, float $amount): void
    {
        Payment::create([
            'receipt_no' => 'RC-' . uniqid(),
            'customer_id' => $invoice->customer_id,
            'invoice_id' => $invoice->id,
            'payment_date' => now()->toDateString(),
            'mode' => 'UPI',
            'amount' => $amount,
            'recorded_by' => $this->accounts->id,
            'recorded_at' => now(),
        ]);
    }

    public function test_a_settled_invoice_reads_as_paid_with_no_balance(): void
    {
        $inv = $this->invoice(1000, '2026-09-01', '2026-09-10');
        $this->pay($inv, 1000);

        $this->assertSame(0.0, $inv->fresh()->balance());
        $this->assertSame('Paid', $inv->fresh()->derivedStatus('2026-09-13'));
    }

    public function test_a_part_paid_invoice_within_terms_reads_as_partially_paid(): void
    {
        $inv = $this->invoice(2000, '2026-09-10', '2026-09-20');
        $this->pay($inv, 800);

        $this->assertSame(1200.0, $inv->fresh()->balance());
        $this->assertSame('Partially Paid', $inv->fresh()->derivedStatus('2026-09-13'));
    }

    public function test_an_unpaid_invoice_past_its_due_date_reads_as_overdue(): void
    {
        $inv = $this->invoice(500, '2026-08-20', '2026-08-31');

        $this->assertSame('Overdue', $inv->derivedStatus('2026-09-13'));
        $this->assertSame(13, $inv->daysOverdue('2026-09-13'));
    }

    public function test_aging_is_measured_from_the_due_date_not_the_invoice_date(): void
    {
        // Raised 40 days ago but only due 5 days ago: not yet a 31-60 day case.
        $inv = $this->invoice(100, '2026-08-04', '2026-09-08');

        $this->assertSame(5, $inv->daysOverdue('2026-09-13'));
    }

    public function test_the_api_refuses_a_payment_larger_than_the_balance(): void
    {
        Sanctum::actingAs($this->accounts);
        $inv = $this->invoice(1000, '2026-09-01', '2026-09-10');
        $this->pay($inv, 600);

        $this->postJson('/api/payments', [
            'invoice_id' => $inv->id,
            'amount' => 500,           // only 400 is outstanding
            'payment_date' => now()->toDateString(),
            'mode' => 'Cash',
        ])->assertStatus(422);

        $this->assertSame(400.0, $inv->fresh()->balance());
    }

    public function test_the_api_refuses_a_payment_against_a_settled_invoice(): void
    {
        Sanctum::actingAs($this->accounts);
        $inv = $this->invoice(1000, '2026-09-01', '2026-09-10');
        $this->pay($inv, 1000);

        $this->postJson('/api/payments', [
            'invoice_id' => $inv->id,
            'amount' => 1,
            'payment_date' => now()->toDateString(),
            'mode' => 'Cash',
        ])->assertStatus(422);
    }

    public function test_a_payment_that_clears_the_balance_is_accepted(): void
    {
        Sanctum::actingAs($this->accounts);
        $inv = $this->invoice(1000, '2026-09-01', '2026-09-10');
        $this->pay($inv, 600);

        $this->postJson('/api/payments', [
            'invoice_id' => $inv->id,
            'amount' => 400,
            'payment_date' => now()->toDateString(),
            'mode' => 'UPI',
        ])->assertCreated();

        $this->assertSame(0.0, $inv->fresh()->balance());
        $this->assertSame('Paid', $inv->fresh()->derivedStatus());
    }

    public function test_recorded_payments_never_push_the_balance_below_zero(): void
    {
        // Written directly, bypassing the controller guard, to prove the model
        // itself clamps rather than reporting a negative balance.
        $inv = $this->invoice(1000, '2026-09-01', '2026-09-10');
        $this->pay($inv, 1000);
        $this->pay($inv, 500);

        $this->assertSame(0.0, $inv->fresh()->balance());
        $this->assertSame(1000.0, $inv->fresh()->paidAmount());
    }
}
