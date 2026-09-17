<?php

namespace Tests\Feature;

use App\Models\Customer;
use App\Models\Order;
use App\Models\Route;
use App\Models\User;
use Database\Seeders\RoleSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * The prototype only hid screens. These tests prove the server refuses the
 * request too — which is the difference between a hidden button and actual
 * protection.
 */
class PermissionTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RoleSeeder::class);
    }

    private function actingAsRole(string $role, ?int $customerId = null): User
    {
        $user = User::factory()->create(['role_key' => $role, 'customer_id' => $customerId]);
        Sanctum::actingAs($user);

        return $user;
    }

    public function test_an_unauthenticated_request_is_rejected(): void
    {
        $this->getJson('/api/orders')->assertStatus(401);
    }

    public function test_admin_reaches_users_and_settings(): void
    {
        $this->actingAsRole('admin');

        $this->getJson('/api/users')->assertOk();
        $this->getJson('/api/settings')->assertOk();
    }

    public function test_a_customer_cannot_reach_any_staff_module(): void
    {
        $route = Route::create(['code' => 'R1', 'name' => 'R1', 'departure_time' => '07:00']);
        $customer = Customer::create([
            'code' => 'SPC-001', 'name' => 'Kitchen', 'type' => 'Restaurant',
            'route_id' => $route->id, 'route_order' => 1,
        ]);
        $this->actingAsRole('customer', $customer->id);

        foreach ([
            '/api/orders', '/api/consolidation', '/api/purchase/requirements', '/api/allocations',
            '/api/packings', '/api/challans', '/api/invoices', '/api/payments',
            '/api/outstanding', '/api/users', '/api/settings', '/api/audit-logs',
        ] as $url) {
            $this->getJson($url)->assertStatus(403, "{$url} should be refused for a customer");
        }
    }

    public function test_a_driver_is_limited_to_the_driver_app(): void
    {
        $this->actingAsRole('driver');

        $this->getJson('/api/driver/today')->assertOk();
        $this->getJson('/api/invoices')->assertStatus(403);
        $this->getJson('/api/users')->assertStatus(403);
    }

    public function test_a_non_admin_cannot_edit_users_or_settings(): void
    {
        foreach (['ops_manager', 'order_exec', 'purchase_manager', 'warehouse', 'delivery', 'accounts'] as $role) {
            $this->actingAsRole($role);

            $this->postJson('/api/users', [
                'name' => 'X', 'email' => "x-{$role}@test.in", 'role_key' => 'warehouse',
            ])->assertStatus(403, "{$role} must not create users");

            $this->putJson('/api/settings', ['settings' => ['order_cutoff_time' => '21:00']])
                ->assertStatus(403, "{$role} must not edit settings");
        }
    }

    public function test_an_order_executive_cannot_approve_an_order(): void
    {
        $user = $this->actingAsRole('order_exec');

        // A real order, so the refusal is about permission and not a missing row.
        $route = Route::create(['code' => 'R9', 'name' => 'R9', 'departure_time' => '07:00']);
        $customer = Customer::create([
            'code' => 'SPC-009', 'name' => 'Kitchen', 'type' => 'Restaurant',
            'route_id' => $route->id, 'route_order' => 1,
        ]);
        $order = Order::create([
            'order_no' => 'SO-PERM-0001', 'customer_id' => $customer->id,
            'order_date' => now()->toDateString(), 'delivery_date' => now()->addDay()->toDateString(),
            'received_at' => now(), 'created_by' => $user->id,
        ]);

        // They may capture and edit orders, but approving is not theirs.
        $this->getJson('/api/orders')->assertOk();
        $this->postJson("/api/orders/{$order->id}/approve")->assertStatus(403);
    }

    public function test_only_ops_can_lock_the_day(): void
    {
        $this->actingAsRole('warehouse');
        $this->postJson('/api/consolidation/lock', ['delivery_date' => now()->toDateString()])
            ->assertStatus(403);
    }

    public function test_an_inactive_account_is_refused_everywhere(): void
    {
        $user = User::factory()->create(['role_key' => 'admin', 'status' => 'Inactive']);
        Sanctum::actingAs($user);

        $this->getJson('/api/users')->assertStatus(403);
    }
}
