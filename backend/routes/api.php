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
 *  - `perm:<module>,<action>` checks the same role matrix the UI renders, so
 *    hiding a button and refusing the call stay in step. It is deliberately not
 *    called `can`: Laravel already ships that alias for gate authorisation, and
 *    the collision silently turns every route into a 403.
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
    Route::middleware('perm:customers,view')->group(function () {
        Route::get('/customers', [MasterController::class, 'customers']);
        Route::get('/customers/{customer}', [MasterController::class, 'showCustomer']);
    });
    Route::post('/customers', [MasterController::class, 'storeCustomer'])->middleware('perm:customers,create');
    Route::put('/customers/{customer}', [MasterController::class, 'updateCustomer'])->middleware('perm:customers,edit');

    Route::get('/items', [MasterController::class, 'items'])->middleware('perm:items,view');
    Route::post('/items', [MasterController::class, 'storeItem'])->middleware('perm:items,create');
    Route::put('/items/{item}', [MasterController::class, 'updateItem'])->middleware('perm:items,edit');
    Route::get('/stock', [MasterController::class, 'stock'])->middleware('perm:stock,view');

    Route::get('/prices', [MasterController::class, 'prices'])->middleware('perm:prices,view');
    Route::post('/prices', [MasterController::class, 'setPrice'])->middleware('perm:prices,edit');

    Route::get('/routes', [MasterController::class, 'routes']);
    Route::get('/suppliers', [MasterController::class, 'suppliers'])->middleware('perm:purchase,view');

    /* ----------------------------------------------------------- orders */
    Route::middleware('perm:orders,view')->group(function () {
        Route::get('/orders', [OrderController::class, 'index']);
        Route::get('/orders/{order}', [OrderController::class, 'show']);
    });
    Route::post('/orders', [OrderController::class, 'store'])->middleware('perm:orders,create');
    Route::put('/orders/{order}', [OrderController::class, 'update'])->middleware('perm:orders,edit');
    // Fills qty_approved only; the server refuses to touch qty_ordered.
    Route::post('/orders/{order}/approve', [OrderController::class, 'approve'])->middleware('perm:orders,approve');
    Route::post('/orders/{order}/reject', [OrderController::class, 'reject'])->middleware('perm:orders,approve');

    /* ---------------------------------------------------- consolidation */
    Route::middleware('perm:consolidation,view')->group(function () {
        Route::get('/consolidation', [ConsolidationController::class, 'matrix']);
        Route::get('/consolidation/item-quantity', [ConsolidationController::class, 'itemQuantity']);
    });
    // Freezing the day and writing the requirement is one transaction.
    Route::post('/consolidation/lock', [ConsolidationController::class, 'lock'])->middleware('perm:consolidation,approve');

    /* --------------------------------------------------------- purchase */
    Route::middleware('perm:purchase,view')->group(function () {
        Route::get('/purchase/requirements', [PurchaseController::class, 'requirements']);
        Route::get('/purchase/orders', [PurchaseController::class, 'index']);
        Route::get('/purchase/orders/{purchaseOrder}', [PurchaseController::class, 'show']);
    });
    Route::post('/purchase/orders', [PurchaseController::class, 'store'])->middleware('perm:purchase,create');

    Route::middleware('perm:receiving,view')->group(function () {
        Route::get('/receivings', [ReceivingController::class, 'index']);
        // Normalised procurement tables for the Receiving and QC screens' store.
        Route::get('/procurement/context', [ReceivingController::class, 'context']);
        Route::get('/receivings/{receiving}', [ReceivingController::class, 'show']);
        Route::get('/quality-checks', [QualityCheckController::class, 'index']);
    });
    Route::post('/receivings', [ReceivingController::class, 'store'])->middleware('perm:receiving,create');
    // The only thing that credits stock, and only with the accepted quantity.
    Route::post('/quality-checks', [QualityCheckController::class, 'store'])->middleware('perm:receiving,edit');

    /* ------------------------------------------------------- fulfilment */
    Route::middleware('perm:allocation,view')->group(function () {
        Route::get('/allocations', [AllocationController::class, 'index']);
        Route::get('/allocations/lines', [AllocationController::class, 'lines']);
    });
    Route::post('/allocations/auto', [AllocationController::class, 'auto'])->middleware('perm:allocation,edit');
    Route::put('/allocations/{orderItem}', [AllocationController::class, 'setManual'])->middleware('perm:allocation,edit');

    Route::middleware('perm:packing,view')->group(function () {
        Route::get('/packings', [PackingController::class, 'index']);
        Route::get('/packings/{order}', [PackingController::class, 'show']);
    });
    Route::put('/packings/{packing}', [PackingController::class, 'update'])->middleware('perm:packing,edit');
    // Copies quantities from the packed lines; never accepts them from the body.
    Route::post('/packings/{packing}/verify', [PackingController::class, 'verify'])->middleware('perm:packing,edit');

    Route::middleware('perm:delivery,view')->group(function () {
        Route::get('/challans', [ChallanController::class, 'index']);
        Route::get('/challans/{challan}', [ChallanController::class, 'show']);
    });
    Route::post('/challans/{challan}/dispatch', [ChallanController::class, 'dispatch'])->middleware('perm:delivery,edit');

    /* ------------------------------------------------------- driver app */
    Route::middleware('perm:driver_app,view')->prefix('driver')->group(function () {
        Route::get('/today', [DriverController::class, 'today']);
        Route::get('/deliveries', [DriverController::class, 'deliveries']);
        Route::get('/history', [DriverController::class, 'history']);
        Route::post('/challans/{challan}/confirm', [DriverController::class, 'confirmDelivery'])
            ->middleware('perm:driver_app,edit');
    });

    /* ---------------------------------------------------------- finance */
    Route::middleware('perm:invoices,view')->group(function () {
        Route::get('/invoices', [InvoiceController::class, 'index']);
        Route::get('/invoices/ready', [InvoiceController::class, 'readyToInvoice']);
        Route::get('/invoices/{invoice}', [InvoiceController::class, 'show']);
    });
    // Billed from delivered quantity, computed server-side.
    Route::post('/invoices', [InvoiceController::class, 'store'])->middleware('perm:invoices,create');

    Route::get('/payments', [PaymentController::class, 'index'])->middleware('perm:payments,view');
    // Refuses anything that would take an invoice past its total.
    Route::post('/payments', [PaymentController::class, 'store'])->middleware('perm:payments,create');

    Route::middleware('perm:outstanding,view')->group(function () {
        Route::get('/outstanding', [OutstandingController::class, 'index']);
        Route::get('/outstanding/{customer}', [OutstandingController::class, 'forCustomer']);
    });
    Route::get('/ledger/{customer}', [LedgerController::class, 'show'])->middleware('perm:ledger,view');

    /* ---------------------------------------------------------- reports */
    Route::middleware('perm:reports,view')->prefix('reports')->group(function () {
        Route::get('/sales', [ReportController::class, 'sales']);
        Route::get('/purchase', [ReportController::class, 'purchase']);
        Route::get('/operations', [ReportController::class, 'operations']);
    });
    Route::get('/analytics', [ReportController::class, 'analytics'])->middleware('perm:analytics,view');
    Route::get('/audit-logs', [ReportController::class, 'auditLogs'])->middleware('perm:audit,view');

    /* ----------------------------------------------------------- system */
    Route::middleware('perm:users,view')->group(function () {
        Route::get('/users', [AdminController::class, 'users']);
        Route::get('/roles', [AdminController::class, 'roles']);
    });
    Route::middleware('perm:users,edit')->group(function () {
        Route::post('/users', [AdminController::class, 'storeUser']);
        Route::put('/users/{user}', [AdminController::class, 'updateUser']);
        Route::post('/users/{user}/reset-password', [AdminController::class, 'resetPassword']);
        Route::put('/roles/{role}/permissions', [AdminController::class, 'updatePermissions']);
    });
    Route::delete('/users/{user}', [AdminController::class, 'destroyUser'])->middleware('perm:users,delete');

    Route::get('/settings', [AdminController::class, 'settings'])->middleware('perm:settings,view');
    Route::put('/settings', [AdminController::class, 'updateSettings'])->middleware('perm:settings,edit');

    /* ---------------------------------------------------- customer portal */
    // Every route below is bound to the token's own customer.
    Route::middleware(['perm:portal,view', 'scope.customer'])->prefix('portal')->group(function () {
        Route::get('/summary', [PortalController::class, 'summary']);
        Route::get('/catalogue', [PortalController::class, 'catalogue']);
        Route::get('/orders', [PortalController::class, 'orders']);
        Route::post('/orders', [PortalController::class, 'placeOrder'])->middleware('perm:portal,create');
        Route::put('/orders/{order}', [PortalController::class, 'amendOrder'])->middleware('perm:portal,edit');
        Route::get('/templates', [PortalController::class, 'templates']);
        Route::post('/templates', [PortalController::class, 'saveTemplate']);
        Route::delete('/templates/{template}', [PortalController::class, 'deleteTemplate']);
        Route::get('/invoices', [PortalController::class, 'invoices']);
        Route::get('/ledger', [PortalController::class, 'ledger']);
    });
});
