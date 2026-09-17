<?php

namespace Database\Seeders;

use App\Models\Role;
use App\Models\RolePermission;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Cache;

/**
 * The permission matrix, in one place.
 *
 * This is the same matrix the front end reads to build its navigation, and the
 * same one CheckPermission enforces on every request — so what a role can see
 * and what it can actually fetch are decided by one source.
 *
 * Read the grid as: role => module => actions it may perform.
 */
class RoleSeeder extends Seeder
{
    private const ALL = ['view', 'create', 'edit', 'approve', 'delete', 'export', 'print'];
    private const READ = ['view', 'export', 'print'];
    private const WRITE = ['view', 'create', 'edit', 'export', 'print'];

    private const ROLES = [
        'admin' => ['Admin', 'Full access to every module, users and settings.'],
        'ops_manager' => ['Operations Manager', 'Runs the daily loop end to end: approvals, locking, purchase, packing and dispatch.'],
        'order_exec' => ['Order Executive', 'Captures and edits customer orders, handles late orders and repeats.'],
        'purchase_manager' => ['Purchase Manager', 'Converts locked consolidation into purchases, receiving and quality checks.'],
        'warehouse' => ['Warehouse / Packing Staff', 'Receives stock, packs customer orders and prepares challans.'],
        'delivery' => ['Delivery Supervisor', 'Assigns drivers, dispatches routes and tracks delivery confirmations.'],
        'accounts' => ['Accounts', 'Invoices, payments, outstanding follow-up and customer ledgers.'],
        'customer' => ['Customer', 'Places orders and views own deliveries, invoices and ledger.'],
        'driver' => ['Driver', 'Mobile delivery app: route, challans and delivery confirmation.'],
    ];

    public function run(): void
    {
        foreach (self::ROLES as $key => [$name, $description]) {
            Role::updateOrCreate(['key' => $key], ['name' => $name, 'description' => $description]);
        }

        $matrix = $this->matrix();

        RolePermission::query()->delete();
        foreach ($matrix as $role => $modules) {
            foreach ($modules as $module => $actions) {
                foreach ($actions as $action) {
                    RolePermission::create(['role_key' => $role, 'module' => $module, 'action' => $action]);
                }
            }
        }

        // The matrix is cached per role; a reseed must invalidate it.
        foreach (array_keys(self::ROLES) as $role) {
            Cache::forget("role.permissions.{$role}");
        }
    }

    private function matrix(): array
    {
        $everyModule = [
            'dashboard', 'orders', 'consolidation', 'purchase', 'receiving', 'allocation', 'packing',
            'delivery', 'customers', 'prices', 'items', 'categories', 'stock', 'invoices', 'payments',
            'outstanding', 'ledger', 'reports', 'analytics', 'users', 'notifications', 'audit',
            'settings', 'portal', 'driver_app',
        ];

        return [
            // Admin can do everything, everywhere.
            'admin' => array_fill_keys($everyModule, self::ALL),

            'ops_manager' => [
                'dashboard' => self::READ,
                'orders' => array_merge(self::WRITE, ['approve']),
                // Locking the day is an approval, and it is theirs to give.
                'consolidation' => array_merge(self::WRITE, ['approve']),
                'purchase' => self::WRITE, 'receiving' => self::WRITE, 'allocation' => self::WRITE,
                'packing' => self::WRITE, 'delivery' => self::WRITE,
                'customers' => self::WRITE, 'prices' => self::WRITE, 'items' => self::WRITE,
                'categories' => self::WRITE, 'stock' => self::READ,
                'invoices' => self::READ, 'payments' => self::READ, 'outstanding' => self::READ,
                'ledger' => self::READ, 'reports' => self::READ, 'analytics' => self::READ,
                'notifications' => ['view'], 'audit' => self::READ,
            ],

            'order_exec' => [
                'dashboard' => self::READ,
                'orders' => self::WRITE,
                'consolidation' => self::READ,
                'customers' => self::READ, 'prices' => self::READ, 'items' => self::READ,
                'notifications' => ['view'],
            ],

            'purchase_manager' => [
                'dashboard' => self::READ,
                'consolidation' => self::READ,
                'purchase' => self::WRITE, 'receiving' => self::WRITE,
                'allocation' => self::READ, 'stock' => self::WRITE,
                'items' => self::READ, 'reports' => self::READ,
                'notifications' => ['view'],
            ],

            'warehouse' => [
                'dashboard' => self::READ,
                'receiving' => self::WRITE, 'allocation' => self::WRITE, 'packing' => self::WRITE,
                'stock' => self::READ, 'items' => self::READ, 'delivery' => self::READ,
                'notifications' => ['view'],
            ],

            'delivery' => [
                'dashboard' => self::READ,
                'packing' => self::READ, 'delivery' => self::WRITE,
                'customers' => self::READ, 'notifications' => ['view'],
            ],

            'accounts' => [
                'dashboard' => self::READ,
                'invoices' => self::WRITE, 'payments' => self::WRITE,
                'outstanding' => self::READ, 'ledger' => self::READ,
                'customers' => self::READ, 'orders' => self::READ,
                'reports' => self::READ, 'analytics' => self::READ,
                'notifications' => ['view'],
            ],

            // Their own portal and nothing else. Every query is additionally
            // scoped to their customer by ScopeToCustomer.
            'customer' => [
                'portal' => ['view', 'create', 'edit', 'print'],
            ],

            'driver' => [
                'driver_app' => ['view', 'edit'],
            ],
        ];
    }
}
