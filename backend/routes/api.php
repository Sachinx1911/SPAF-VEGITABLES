<?php

use App\Http\Controllers\AdminController;
use App\Http\Controllers\AllocationController;
use App\Http\Controllers\AuthController;
use App\Http\Controllers\ChallanController;
use App\Http\Controllers\ConsolidationController;
use App\Http\Controllers\DriverController;
use App\Http\Controllers\InvoiceController;
use App\Http\Controllers\LedgerController;
use App\Http\Controllers\MasterController;
use App\Http\Controllers\OrderController;
use App\Http\Controllers\OutstandingController;
use App\Http\Controllers\PackingController;
use App\Http\Controllers\PaymentController;
use App\Http\Controllers\PortalController;
use App\Http\Controllers\PurchaseController;
use App\Http\Controllers\QualityCheckController;
use App\Http\Controllers\ReceivingController;
use App\Http\Controllers\ReportController;
use Illuminate\Support\Facades\Route;

/**
 * SPAF — Operations OS · API.
 *
 * Two rules the front end cannot enforce on its own, and which therefore live
 * here on every route:
 *
 *  - `can:<module>,<action>` checks the same role matrix the UI renders, so
 *    hiding a button and refusing the call stay in step.
 *  - `scope.customer` binds a portal token to its own customer, so a tampered
 *    request cannot widen what it sees.
 */

// ------------------------------------------------------------------ public
Route::post('/auth/login', [AuthController::class, 'login'])->middleware('throttle:10,1');

// --------------------------------------------------------------- protected
Route::middleware('auth:sanctum')->group(function () {
    Route::post('/auth/logout', [AuthController::class, 'logout']);
    Route::get('/auth/me', [AuthController::class, 'me']);
    Route::post('/auth/change-password', [AuthController::class, 'changePassword']);

    /* ---------------------------------------------------------- masters */
    Route::middleware('can:customers,view')->group(function () {
        Route::get('/customers', [MasterController::class, 'customers']);
        Route::get('/customers/{customer}', [MasterController::class, 'showCustomer']);
    });
    Route::post('/customers', [MasterController::class, 'storeCustomer'])->middleware('can:customers,create');
    Route::put('/customers/{customer}', [MasterController::class, 'updateCustomer'])->middleware('can:customers,edit');

    Route::get('/items', [MasterController::class, 'items'])->middleware('can:items,view');
    Route::post('/items', [MasterController::class, 'storeItem'])->middleware('can:items,create');
    Route::put('/items/{item}', [MasterController::class, 'updateItem'])->middleware('can:items,edit');
    Route::get('/stock', [MasterController::class, 'stock'])->middleware('can:stock,view');

    Route::get('/prices', [MasterController::class, 'prices'])->middleware('can:prices,view');
    Route::post('/prices', [MasterController::class, 'setPrice'])->middleware('can:prices,edit');

    Route::get('/routes', [MasterController::class, 'routes']);
    Route::get('/suppliers', [MasterController::class, 'suppliers'])->middleware('can:purchase,view');

    /* ----------------------------------------------------------- orders */
    Route::middleware('can:orders,view')->group(function () {
        Route::get('/orders', [OrderController::class, 'index']);
        Route::get('/orders/{order}', [OrderController::class, 'show']);
    });
    Route::post('/orders', [OrderController::class, 'store'])->middleware('can:orders,create');
    Route::put('/orders/{order}', [OrderController::class, 'update'])->middleware('can:orders,edit');
    // Fills qty_approved only; the server refuses to touch qty_ordered.
    Route::post('/orders/{order}/approve', [OrderController::class, 'approve'])->middleware('can:orders,approve');
    Route::post('/orders/{order}/reject', [OrderController::class, 'reject'])->middleware('can:orders,approve');

    /* ---------------------------------------------------- consolidation */
    Route::middleware('can:consolidation,view')->group(function () {
        Route::get('/consolidation', [ConsolidationController::class, 'matrix']);
        Route::get('/consolidation/item-quantity', [ConsolidationController::class, 'itemQuantity']);
    });
    // Freezing the day and writing the requirement is one transaction.
    Route::post('/consolidation/lock', [ConsolidationController::class, 'lock'])->middleware('can:consolidation,approve');

    /* --------------------------------------------------------- purchase */
    Route::middleware('can:purchase,view')->group(function () {
        Route::get('/purchase/requirements', [PurchaseController::class, 'requirements']);
        Route::get('/purchase/orders', [PurchaseController::class, 'index']);
        Route::get('/purchase/orders/{purchaseOrder}', [PurchaseController::class, 'show']);
    });
    Route::post('/purchase/orders', [PurchaseController::class, 'store'])->middleware('can:purchase,create');

    Route::middleware('can:receiving,view')->group(function () {
        Route::get('/receivings', [ReceivingController::class, 'index']);
        Route::get('/receivings/{receiving}', [ReceivingController::class, 'show']);
        Route::get('/quality-checks', [QualityCheckController::class, 'index']);
    });
    Route::post('/receivings', [ReceivingController::class, 'store'])->middleware('can:receiving,create');
    // The only thing that credits stock, and only with the accepted quantity.
    Route::post('/quality-checks', [QualityCheckController::class, 'store'])->middleware('can:receiving,edit');

    /* ------------------------------------------------------- fulfilment */
    Route::middleware('can:allocation,view')->group(function () {
        Route::get('/allocations', [AllocationController::class, 'index']);
        Route::get('/allocations/lines', [AllocationController::class, 'lines']);
    });
    Route::post('/allocations/auto', [AllocationController::class, 'auto'])->middleware('can:allocation,edit');
    Route::put('/allocations/{orderItem}', [AllocationController::class, 'setManual'])->middleware('can:allocation,edit');

    Route::middleware('can:packing,view')->group(function () {
        Route::get('/packings', [PackingController::class, 'index']);
        Route::get('/packings/{order}', [PackingController::class, 'show']);
    });
    Route::put('/packings/{packing}', [PackingController::class, 'update'])->middleware('can:packing,edit');
    // Copies quantities from the packed lines; never accepts them from the body.
    Route::post('/packings/{packing}/verify', [PackingController::class, 'verify'])->middleware('can:packing,edit');

    Route::middleware('can:delivery,view')->group(function () {
        Route::get('/challans', [ChallanController::class, 'index']);
        Route::get('/challans/{challan}', [ChallanController::class, 'show']);
    });
    Route::post('/challans/{challan}/dispatch', [ChallanController::class, 'dispatch'])->middleware('can:delivery,edit');

    /* ------------------------------------------------------- driver app */
    Route::middleware('can:driver_app,view')->prefix('driver')->group(function () {
        Route::get('/today', [DriverController::class, 'today']);
        Route::get('/deliveries', [DriverController::class, 'deliveries']);
        Route::get('/history', [DriverController::class, 'history']);
        Route::post('/challans/{challan}/confirm', [DriverController::class, 'confirmDelivery'])
            ->middleware('can:driver_app,edit');
    });

    /* ---------------------------------------------------------- finance */
    Route::middleware('can:invoices,view')->group(function () {
        Route::get('/invoices', [InvoiceController::class, 'index']);
        Route::get('/invoices/ready', [InvoiceController::class, 'readyToInvoice']);
        Route::get('/invoices/{invoice}', [InvoiceController::class, 'show']);
    });
    // Billed from delivered quantity, computed server-side.
    Route::post('/invoices', [InvoiceController::class, 'store'])->middleware('can:invoices,create');

    Route::get('/payments', [PaymentController::class, 'index'])->middleware('can:payments,view');
    // Refuses anything that would take an invoice past its total.
    Route::post('/payments', [PaymentController::class, 'store'])->middleware('can:payments,create');

    Route::middleware('can:outstanding,view')->group(function () {
        Route::get('/outstanding', [OutstandingController::class, 'index']);
        Route::get('/outstanding/{customer}', [OutstandingController::class, 'forCustomer']);
    });
    Route::get('/ledger/{customer}', [LedgerController::class, 'show'])->middleware('can:ledger,view');

    /* ---------------------------------------------------------- reports */
    Route::middleware('can:reports,view')->prefix('reports')->group(function () {
        Route::get('/sales', [ReportController::class, 'sales']);
        Route::get('/purchase', [ReportController::class, 'purchase']);
        Route::get('/operations', [ReportController::class, 'operations']);
    });
    Route::get('/analytics', [ReportController::class, 'analytics'])->middleware('can:analytics,view');
    Route::get('/audit-logs', [ReportController::class, 'auditLogs'])->middleware('can:audit,view');

    /* ----------------------------------------------------------- system */
    Route::middleware('can:users,view')->group(function () {
        Route::get('/users', [AdminController::class, 'users']);
        Route::get('/roles', [AdminController::class, 'roles']);
    });
    Route::middleware('can:users,edit')->group(function () {
        Route::post('/users', [AdminController::class, 'storeUser']);
        Route::put('/users/{user}', [AdminController::class, 'updateUser']);
        Route::post('/users/{user}/reset-password', [AdminController::class, 'resetPassword']);
        Route::put('/roles/{role}/permissions', [AdminController::class, 'updatePermissions']);
    });

    Route::get('/settings', [AdminController::class, 'settings'])->middleware('can:settings,view');
    Route::put('/settings', [AdminController::class, 'updateSettings'])->middleware('can:settings,edit');

    /* ---------------------------------------------------- customer portal */
    // Every route below is bound to the token's own customer.
    Route::middleware(['can:portal,view', 'scope.customer'])->prefix('portal')->group(function () {
        Route::get('/summary', [PortalController::class, 'summary']);
        Route::get('/catalogue', [PortalController::class, 'catalogue']);
        Route::get('/orders', [PortalController::class, 'orders']);
        Route::post('/orders', [PortalController::class, 'placeOrder'])->middleware('can:portal,create');
        Route::get('/templates', [PortalController::class, 'templates']);
        Route::post('/templates', [PortalController::class, 'saveTemplate']);
        Route::delete('/templates/{template}', [PortalController::class, 'deleteTemplate']);
        Route::get('/invoices', [PortalController::class, 'invoices']);
        Route::get('/ledger', [PortalController::class, 'ledger']);
    });
});
