<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * SPAF — Operations OS · full schema.
 *
 * Mirrors src/types/models.ts one table per interface. Two rules shape it:
 *
 *  1. Item + Unit is the SKU. `items` carries the unit, and every line that
 *     references an item carries the unit it was ordered in, so the same
 *     produce in another unit can never be silently merged.
 *
 *  2. The quantity chain is never overwritten. `order_items` holds one column
 *     per stage, each nullable, and a stage only ever fills its own column.
 *     Quantities live on the line, not on a status field.
 */
return new class extends Migration
{
    public function up(): void
    {
        // ------------------------------------------------------------ access
        Schema::create('roles', function (Blueprint $t) {
            $t->string('key', 40)->primary();       // admin, ops_manager, …
            $t->string('name');
            $t->string('description')->default('');
            $t->timestamps();
        });

        Schema::create('role_permissions', function (Blueprint $t) {
            $t->id();
            $t->string('role_key', 40);
            $t->string('module', 40);               // orders, consolidation, …
            $t->string('action', 20);               // view, create, edit, approve, delete, export, print
            $t->foreign('role_key')->references('key')->on('roles')->cascadeOnDelete();
            $t->unique(['role_key', 'module', 'action']);
        });

        Schema::create('routes', function (Blueprint $t) {
            $t->id();
            $t->string('code', 10)->unique();       // R1…R5
            $t->string('name');
            $t->string('area')->default('');
            $t->foreignId('driver_id')->nullable();  // users.id, linked after users exists
            $t->string('vehicle_no', 20)->default('');
            $t->time('departure_time');
            $t->timestamps();
        });

        Schema::create('customers', function (Blueprint $t) {
            $t->id();
            $t->string('code', 20)->unique();       // SPC-001
            $t->string('route_code', 10)->default('');   // legacy sheet code A…ZZN
            $t->string('short_label', 40)->default('');  // printed on consolidation sheets
            $t->unsignedInteger('route_order')->default(0); // print & delivery sequence
            $t->foreignId('route_id')->constrained('routes')->restrictOnDelete();
            $t->string('name');
            $t->string('legal_name')->default('');
            $t->string('type', 30);                 // Hotel, Restaurant, Cafe, Caterer, Corporate, Other
            $t->string('location')->default('');
            $t->string('contact_person')->default('');
            $t->string('mobile', 20)->default('');
            $t->string('alt_mobile', 20)->default('');
            $t->string('email')->default('');
            $t->text('billing_address')->nullable();
            $t->text('delivery_address')->nullable();
            $t->string('gstin', 20)->default('');
            $t->string('pan', 15)->default('');
            $t->unsignedSmallInteger('payment_terms_days')->default(15);
            $t->decimal('credit_limit', 12, 2)->default(0);
            $t->string('order_frequency', 20)->default('Daily');
            $t->string('preferred_order_time', 10)->default('');
            $t->string('preferred_delivery_time', 10)->default('');
            $t->text('special_instructions')->nullable();
            $t->boolean('active')->default(true);
            $t->timestamps();
            $t->index(['active', 'route_id']);
        });

        Schema::create('users', function (Blueprint $t) {
            $t->id();
            $t->string('name');
            $t->string('email')->unique();
            $t->string('mobile', 20)->default('');
            // Bcrypt/Argon hash. Never a plain or shared password — that was the
            // prototype's single biggest hole.
            $t->string('password');
            $t->string('role_key', 40);
            $t->string('status', 10)->default('Active');
            $t->timestamp('last_login_at')->nullable();
            // Set for customer-portal logins; scopes every query to one customer.
            $t->foreignId('customer_id')->nullable()->constrained('customers')->nullOnDelete();
            $t->rememberToken();
            $t->timestamps();
            $t->foreign('role_key')->references('key')->on('roles')->restrictOnDelete();
        });

        Schema::table('routes', function (Blueprint $t) {
            $t->foreign('driver_id')->references('id')->on('users')->nullOnDelete();
        });

        // --------------------------------------------------------- catalogue
        Schema::create('items', function (Blueprint $t) {
            $t->id();
            $t->string('code', 20)->unique();
            $t->string('name');
            $t->string('excel_name')->default('');  // name in the legacy sale-report export
            $t->string('category', 40);
            $t->string('unit', 10);                 // part of the SKU identity
            $t->string('purchase_unit', 10);
            $t->string('selling_unit', 10);
            $t->decimal('min_stock', 10, 2)->default(0);
            $t->decimal('reorder_level', 10, 2)->default(0);
            $t->decimal('default_purchase_price', 10, 2)->default(0);
            $t->decimal('default_selling_price', 10, 2)->default(0);
            $t->decimal('tax_rate', 5, 2)->default(0);   // % GST; fresh produce is 0
            $t->decimal('stock', 12, 2)->default(0);
            $t->unsignedInteger('sort_order')->default(0);
            $t->boolean('active')->default(true);
            $t->timestamps();
            // Item + Unit is the SKU: the same produce in another unit is a separate row.
            $t->unique(['name', 'unit']);
            $t->index(['active', 'category']);
        });

        Schema::create('customer_item_prices', function (Blueprint $t) {
            $t->id();
            $t->foreignId('customer_id')->constrained()->cascadeOnDelete();
            $t->foreignId('item_id')->constrained()->cascadeOnDelete();
            $t->string('unit', 10);
            $t->decimal('price', 10, 2);
            $t->date('effective_from');
            $t->date('effective_to')->nullable();   // null = currently in force
            $t->timestamps();
            $t->index(['customer_id', 'item_id', 'effective_from']);
        });

        Schema::create('suppliers', function (Blueprint $t) {
            $t->id();
            $t->string('code', 20)->unique();
            $t->string('name');
            $t->string('market')->default('');
            $t->string('contact_person')->default('');
            $t->string('mobile', 20)->default('');
            $t->json('categories');                 // Category[]
            $t->timestamps();
        });

        // ------------------------------------------------------------ orders
        Schema::create('orders', function (Blueprint $t) {
            $t->id();
            $t->string('order_no', 30)->unique();
            $t->foreignId('customer_id')->constrained()->restrictOnDelete();
            $t->date('order_date');
            $t->date('delivery_date');
            $t->string('order_type', 20)->default('Regular');
            $t->string('source', 20)->default('Staff'); // Staff, Customer Portal, WhatsApp, Phone
            $t->string('status', 25)->default('Submitted');
            $t->boolean('is_late')->default(false);
            $t->timestamp('received_at');
            $t->foreignId('approved_by')->nullable()->constrained('users')->nullOnDelete();
            $t->timestamp('approved_at')->nullable();
            $t->timestamp('locked_at')->nullable();
            $t->string('packing_status', 20)->default('Not Started');
            $t->string('delivery_status', 20)->default('Pending');
            $t->string('invoice_status', 20)->default('Not Ready');
            $t->foreignId('repeat_of_order_id')->nullable()->constrained('orders')->nullOnDelete();
            $t->text('remarks')->nullable();
            $t->foreignId('created_by')->constrained('users')->restrictOnDelete();
            $t->timestamps();
            $t->index(['delivery_date', 'status']);
            $t->index(['customer_id', 'delivery_date']);
        });

        Schema::create('order_items', function (Blueprint $t) {
            $t->id();
            $t->foreignId('order_id')->constrained()->cascadeOnDelete();
            $t->foreignId('item_id')->constrained()->restrictOnDelete();
            $t->string('unit', 10);                 // the SKU's unit, captured on the line
            $t->decimal('rate', 10, 2);             // customer price at the moment of ordering
            // ---- the quantity chain: one column per stage, each written once ----
            $t->decimal('qty_ordered', 12, 3);          // only this one is required
            $t->decimal('qty_approved', 12, 3)->nullable();
            $t->decimal('qty_purchased', 12, 3)->nullable();
            $t->decimal('qty_received', 12, 3)->nullable();
            $t->decimal('qty_accepted', 12, 3)->nullable();
            $t->decimal('qty_allocated', 12, 3)->nullable();
            $t->decimal('qty_packed', 12, 3)->nullable();
            $t->decimal('qty_dispatched', 12, 3)->nullable();
            $t->decimal('qty_delivered', 12, 3)->nullable();
            $t->decimal('qty_customer_accepted', 12, 3)->nullable();
            $t->decimal('qty_invoiced', 12, 3)->nullable();
            $t->decimal('qty_paid', 12, 3)->nullable();
            $t->text('remarks')->nullable();
            $t->timestamps();
            $t->index(['order_id', 'item_id']);
        });

        Schema::create('standing_order_templates', function (Blueprint $t) {
            $t->id();
            $t->foreignId('customer_id')->constrained()->cascadeOnDelete();
            $t->string('name');                     // "Daily Regular"
            $t->timestamps();
        });

        Schema::create('standing_order_template_lines', function (Blueprint $t) {
            $t->id();
            $t->foreignId('standing_order_template_id')->constrained()->cascadeOnDelete();
            $t->foreignId('item_id')->constrained()->cascadeOnDelete();
            $t->string('unit', 10);
            $t->decimal('qty', 12, 3);
        });

        // --------------------------------------------------- consolidation
        Schema::create('consolidation_locks', function (Blueprint $t) {
            $t->id();
            $t->date('delivery_date')->unique();    // a day can only be locked once
            $t->timestamp('locked_at');
            $t->foreignId('locked_by')->constrained('users')->restrictOnDelete();
            $t->timestamps();
        });

        Schema::create('consolidation_lock_orders', function (Blueprint $t) {
            $t->id();
            $t->foreignId('consolidation_lock_id')->constrained()->cascadeOnDelete();
            $t->foreignId('order_id')->constrained()->cascadeOnDelete();
            $t->unique(['consolidation_lock_id', 'order_id']);
        });

        // Snapshot taken at lock time — deliberately frozen, not recomputed later.
        Schema::create('purchase_requirements', function (Blueprint $t) {
            $t->id();
            $t->date('delivery_date');
            $t->foreignId('item_id')->constrained()->restrictOnDelete();
            $t->string('unit', 10);
            $t->decimal('required_qty', 12, 3);
            $t->decimal('stock_qty', 12, 3)->default(0);
            $t->timestamp('generated_at');
            $t->timestamps();
            $t->unique(['delivery_date', 'item_id', 'unit']);
        });

        // -------------------------------------------------------- purchase
        Schema::create('purchase_orders', function (Blueprint $t) {
            $t->id();
            $t->string('po_no', 30)->unique();
            $t->foreignId('supplier_id')->constrained()->restrictOnDelete();
            $t->date('purchase_date');
            $t->date('for_delivery_date');
            $t->string('supplier_invoice_no', 40)->default('');
            $t->string('status', 25)->default('Confirmed');
            $t->decimal('tax_amount', 12, 2)->default(0);
            $t->foreignId('created_by')->constrained('users')->restrictOnDelete();
            $t->timestamps();
            $t->index(['for_delivery_date', 'status']);
        });

        Schema::create('purchase_order_items', function (Blueprint $t) {
            $t->id();
            $t->foreignId('purchase_order_id')->constrained()->cascadeOnDelete();
            $t->foreignId('item_id')->constrained()->restrictOnDelete();
            $t->string('unit', 10);
            $t->decimal('qty', 12, 3);
            $t->decimal('rate', 10, 2);
            $t->timestamps();
        });

        // GRN — records what actually arrived, never edits the purchase order.
        Schema::create('receivings', function (Blueprint $t) {
            $t->id();
            $t->string('grn_no', 30)->unique();
            $t->foreignId('purchase_order_id')->constrained()->restrictOnDelete();
            $t->timestamp('received_at');
            $t->foreignId('received_by')->constrained('users')->restrictOnDelete();
            $t->string('status', 15);               // Received, Partial, Rejected
            $t->timestamps();
        });

        Schema::create('receiving_items', function (Blueprint $t) {
            $t->id();
            $t->foreignId('receiving_id')->constrained()->cascadeOnDelete();
            $t->foreignId('purchase_order_item_id')->constrained()->restrictOnDelete();
            $t->foreignId('item_id')->constrained()->restrictOnDelete();
            $t->string('unit', 10);
            $t->decimal('ordered_qty', 12, 3);      // copied for the record, not a live link
            $t->decimal('received_qty', 12, 3);
            $t->string('condition', 10)->default('Good'); // Good, Average, Damaged
            $t->timestamps();
        });

        // Only the accepted quantity is ever credited to stock.
        Schema::create('quality_checks', function (Blueprint $t) {
            $t->id();
            $t->foreignId('receiving_item_id')->constrained()->cascadeOnDelete();
            $t->foreignId('item_id')->constrained()->restrictOnDelete();
            $t->string('unit', 10);
            $t->decimal('accepted_qty', 12, 3);
            $t->decimal('rejected_qty', 12, 3)->default(0);
            $t->string('grade', 10);                // A, B, C, Rejected
            $t->string('reason', 30)->nullable();
            $t->text('remarks')->nullable();
            $t->foreignId('checked_by')->constrained('users')->restrictOnDelete();
            $t->timestamp('checked_at');
            $t->timestamps();
        });

        // ------------------------------------------------------ fulfilment
        Schema::create('allocations', function (Blueprint $t) {
            $t->id();
            $t->foreignId('order_item_id')->constrained()->cascadeOnDelete();
            $t->foreignId('order_id')->constrained()->cascadeOnDelete();
            $t->foreignId('customer_id')->constrained()->restrictOnDelete();
            $t->foreignId('item_id')->constrained()->restrictOnDelete();
            $t->string('unit', 10);
            $t->date('delivery_date');
            $t->decimal('required_qty', 12, 3);
            $t->decimal('allocated_qty', 12, 3);
            $t->boolean('override')->default(false); // true = allocated past available stock
            $t->foreignId('allocated_by')->constrained('users')->restrictOnDelete();
            $t->timestamp('allocated_at');
            $t->timestamps();
            $t->unique('order_item_id');            // one allocation per order line
            $t->index(['delivery_date', 'item_id']);
        });

        Schema::create('packings', function (Blueprint $t) {
            $t->id();
            $t->string('packing_no', 30)->unique();
            $t->foreignId('order_id')->constrained()->cascadeOnDelete();
            $t->foreignId('customer_id')->constrained()->restrictOnDelete();
            $t->date('delivery_date');
            $t->string('status', 20)->default('To Pack');
            $t->unsignedInteger('packages')->default(0);
            $t->foreignId('packed_by')->nullable()->constrained('users')->nullOnDelete();
            $t->timestamp('started_at')->nullable();
            $t->timestamp('packed_at')->nullable();
            $t->boolean('verified')->default(false);
            $t->text('issue')->nullable();
            $t->timestamps();
            $t->unique(['order_id']);
            $t->index(['delivery_date', 'status']);
        });

        Schema::create('packing_items', function (Blueprint $t) {
            $t->id();
            $t->foreignId('packing_id')->constrained()->cascadeOnDelete();
            $t->foreignId('allocation_id')->constrained()->restrictOnDelete();
            $t->foreignId('order_item_id')->constrained()->restrictOnDelete();
            $t->foreignId('item_id')->constrained()->restrictOnDelete();
            $t->string('unit', 10);
            $t->decimal('allocated_qty', 12, 3);
            $t->decimal('packed_qty', 12, 3)->nullable();
            $t->string('package_type', 10)->default('Crate');
            $t->timestamps();
        });

        // Generated from packing. Quantities are copied, never typed in again.
        Schema::create('challans', function (Blueprint $t) {
            $t->id();
            $t->string('challan_no', 30)->unique();
            $t->foreignId('packing_id')->constrained()->restrictOnDelete();
            $t->foreignId('order_id')->constrained()->restrictOnDelete();
            $t->foreignId('customer_id')->constrained()->restrictOnDelete();
            $t->foreignId('route_id')->constrained()->restrictOnDelete();
            $t->date('challan_date');
            $t->foreignId('driver_id')->nullable()->constrained('users')->nullOnDelete();
            $t->string('vehicle_no', 20)->default('');
            $t->string('status', 20)->default('Ready');
            $t->unsignedInteger('packages')->default(0);
            $t->foreignId('prepared_by')->constrained('users')->restrictOnDelete();
            $t->foreignId('packed_by')->nullable()->constrained('users')->nullOnDelete();
            $t->timestamp('dispatched_at')->nullable();
            $t->timestamp('delivered_at')->nullable();
            $t->string('received_by_name')->default('');
            // Signature and photo are files on disk; the column holds the path.
            $t->string('signature_path')->nullable();
            $t->string('photo_path')->nullable();
            $t->text('delivery_remarks')->nullable();
            $t->timestamps();
            $t->index(['challan_date', 'status']);
        });

        Schema::create('challan_items', function (Blueprint $t) {
            $t->id();
            $t->foreignId('challan_id')->constrained()->cascadeOnDelete();
            $t->foreignId('order_item_id')->constrained()->restrictOnDelete();
            $t->foreignId('item_id')->constrained()->restrictOnDelete();
            $t->string('unit', 10);
            $t->decimal('qty', 12, 3);
        });

        // --------------------------------------------------------- finance
        Schema::create('invoices', function (Blueprint $t) {
            $t->id();
            $t->string('invoice_no', 30)->unique();
            $t->foreignId('customer_id')->constrained()->restrictOnDelete();
            $t->foreignId('order_id')->constrained()->restrictOnDelete();
            $t->foreignId('challan_id')->nullable()->constrained()->nullOnDelete();
            $t->date('invoice_date');
            $t->date('due_date');
            $t->decimal('subtotal', 12, 2);
            $t->decimal('tax_amount', 12, 2)->default(0);
            $t->decimal('total', 12, 2);
            // Only Draft / Generated / Sent / Cancelled are stored.
            // Paid, Partially Paid and Overdue are derived from payments + due date.
            $t->string('status', 20)->default('Generated');
            $t->foreignId('created_by')->constrained('users')->restrictOnDelete();
            $t->timestamps();
            $t->index(['customer_id', 'invoice_date']);
            $t->index(['due_date', 'status']);
        });

        Schema::create('invoice_items', function (Blueprint $t) {
            $t->id();
            $t->foreignId('invoice_id')->constrained()->cascadeOnDelete();
            $t->foreignId('order_item_id')->constrained()->restrictOnDelete();
            $t->foreignId('item_id')->constrained()->restrictOnDelete();
            $t->string('unit', 10);
            $t->decimal('qty', 12, 3);              // billed from delivered, not ordered
            $t->decimal('rate', 10, 2);
            $t->decimal('tax_rate', 5, 2)->default(0);
            $t->decimal('amount', 12, 2);
        });

        Schema::create('payments', function (Blueprint $t) {
            $t->id();
            $t->string('receipt_no', 30)->unique();
            $t->foreignId('customer_id')->constrained()->restrictOnDelete();
            $t->foreignId('invoice_id')->constrained()->restrictOnDelete();
            $t->date('payment_date');
            $t->string('mode', 20);                 // Cash, Bank Transfer, UPI, Cheque, Other
            $t->string('reference', 60)->default('');
            $t->decimal('amount', 12, 2);
            $t->text('remarks')->nullable();
            $t->foreignId('recorded_by')->constrained('users')->restrictOnDelete();
            $t->timestamp('recorded_at');
            $t->timestamps();
            $t->index(['customer_id', 'payment_date']);
            $t->index('invoice_id');
        });

        Schema::create('customer_opening_balances', function (Blueprint $t) {
            $t->id();
            $t->foreignId('customer_id')->unique()->constrained()->cascadeOnDelete();
            $t->date('as_of');
            $t->decimal('amount', 12, 2)->default(0);
            $t->timestamps();
        });

        // ---------------------------------------------------------- system
        Schema::create('settings', function (Blueprint $t) {
            $t->string('key', 60)->primary();
            $t->text('value')->nullable();
            $t->timestamps();
        });

        Schema::create('audit_logs', function (Blueprint $t) {
            $t->id();
            $t->timestamp('at');
            // Nullable: a failed login has no authenticated user yet, and that
            // attempt is exactly the kind of thing the trail must record.
            $t->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $t->string('action');
            $t->string('module', 40);
            $t->string('record_ref', 60)->default('');
            $t->foreignId('customer_id')->nullable()->constrained()->nullOnDelete();
            $t->text('old_value')->nullable();
            $t->text('new_value')->nullable();
            $t->string('device')->default('');
            $t->string('ip', 45)->default('');
            $t->string('status', 10)->default('Success');
            $t->index(['module', 'at']);
            $t->index(['user_id', 'at']);
        });

        // Written once a day by a scheduled job (cron on cPanel). Lets the
        // dashboard show a real day-on-day delta instead of recomputing history.
        Schema::create('daily_snapshots', function (Blueprint $t) {
            $t->date('date')->primary();
            $t->unsignedInteger('orders_received')->default(0);
            $t->unsignedInteger('pending_approval')->default(0);
            $t->unsignedInteger('locked')->default(0);
            $t->unsignedInteger('purchase_required')->default(0);
            $t->unsignedInteger('received_lines')->default(0);
            $t->unsignedInteger('packing_pending')->default(0);
            $t->unsignedInteger('dispatch_pending')->default(0);
            $t->unsignedInteger('delivered')->default(0);
            $t->decimal('outstanding', 14, 2)->default(0);
            $t->decimal('sales_value', 14, 2)->default(0);
            $t->timestamps();
        });

        // Sanctum's token table ships with the package; run its own migration.
    }

    public function down(): void
    {
        foreach ([
            'daily_snapshots', 'audit_logs', 'settings', 'customer_opening_balances', 'payments', 'invoice_items', 'invoices',
            'challan_items', 'challans', 'packing_items', 'packings', 'allocations', 'quality_checks',
            'receiving_items', 'receivings', 'purchase_order_items', 'purchase_orders', 'purchase_requirements',
            'consolidation_lock_orders', 'consolidation_locks', 'standing_order_template_lines',
            'standing_order_templates', 'order_items', 'orders', 'suppliers', 'customer_item_prices', 'items',
            'users', 'customers', 'routes', 'role_permissions', 'roles',
        ] as $table) {
            Schema::dropIfExists($table);
        }
    }
};
