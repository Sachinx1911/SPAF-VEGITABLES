<?php

use Illuminate\Support\Facades\Route;

/**
 * SPAF — Operations OS · API surface.
 *
 * Every route here is the server-side counterpart of a screen that today reads
 * the browser store directly. Two rules the front end cannot enforce on its own
 * and which therefore belong here:
 *
 *  - Permission is checked on the server for every request, not just in the UI.
 *    `can:<module>,<action>` maps to the same role/permission matrix the front
 *    end renders, so hiding a button and refusing the call stay in step.
 *
 *  - A customer-role token may only ever see its own rows. `scope.customer`
 *    applies that filter in the query, so a tampered request cannot widen it.
 */

// ------------------------------------------------------------------ public
Route::post('/auth/login', 'AuthController@login')->middleware('throttle:5,1');
Route::post('/auth/forgot-password', 'AuthController@forgot')->middleware('throttle:3,10');
Route::post('/auth/reset-password', 'AuthController@reset')->middleware('throttle:5,10');

// --------------------------------------------------------------- protected
Route::middleware('auth:sanctum')->group(function () {
    Route::post('/auth/logout', 'AuthController@logout');
    Route::get('/auth/me', 'AuthController@me');
    Route::post('/auth/change-password', 'AuthController@changePassword');

    // ---------------------------------------------------------- masters
    Route::middleware('can:customers,view')->group(function () {
        Route::get('/customers', 'CustomerController@index');
        Route::get('/customers/{customer}', 'CustomerController@show');
    });
    Route::post('/customers', 'CustomerController@store')->middleware('can:customers,create');
    Route::put('/customers/{customer}', 'CustomerController@update')->middleware('can:customers,edit');

    Route::middleware('can:items,view')->group(function () {
        Route::get('/items', 'ItemController@index');
        Route::get('/items/{item}', 'ItemController@show');
    });
    Route::post('/items', 'ItemController@store')->middleware('can:items,create');
    Route::put('/items/{item}', 'ItemController@update')->middleware('can:items,edit');

    Route::get('/prices', 'PriceController@index')->middleware('can:prices,view');
    Route::post('/prices', 'PriceController@store')->middleware('can:prices,edit');
    Route::get('/stock', 'StockController@index')->middleware('can:stock,view');

    // ----------------------------------------------------------- orders
    Route::middleware('can:orders,view')->group(function () {
        Route::get('/orders', 'OrderController@index');          // ?delivery_date=&status=&customer_id=
        Route::get('/orders/{order}', 'OrderController@show');   // includes the full quantity chain
    });
    Route::post('/orders', 'OrderController@store')->middleware('can:orders,create');
    Route::put('/orders/{order}', 'OrderController@update')->middleware('can:orders,edit');
    // Approval fills qty_approved only. The server rejects any attempt to write
    // qty_ordered on this route — that is what keeps the chain intact.
    Route::post('/orders/{order}/approve', 'OrderController@approve')->middleware('can:orders,approve');
    Route::post('/orders/{order}/reject', 'OrderController@reject')->middleware('can:orders,approve');

    // ---------------------------------------------------- consolidation
    Route::middleware('can:consolidation,view')->group(function () {
        Route::get('/consolidation', 'ConsolidationController@matrix');       // ?delivery_date=
        Route::get('/consolidation/item-quantity', 'ConsolidationController@itemQuantity');
    });
    // Locking the day is one transaction: freeze the orders and write the
    // purchase requirement snapshot together, or neither.
    Route::post('/consolidation/lock', 'ConsolidationController@lock')->middleware('can:consolidation,approve');

    // --------------------------------------------------------- purchase
    Route::get('/purchase/requirements', 'PurchaseController@requirements')->middleware('can:purchase,view');
    Route::get('/purchase/orders', 'PurchaseController@index')->middleware('can:purchase,view');
    Route::post('/purchase/orders', 'PurchaseController@store')->middleware('can:purchase,create');

    Route::get('/receivings', 'ReceivingController@index')->middleware('can:receiving,view');
    Route::post('/receivings', 'ReceivingController@store')->middleware('can:receiving,create');
    Route::get('/quality-checks', 'QualityCheckController@index')->middleware('can:receiving,view');
    // Recording QC is the only thing that credits stock, and only the accepted qty.
    Route::post('/quality-checks', 'QualityCheckController@store')->middleware('can:receiving,edit');

    // ------------------------------------------------------- fulfilment
    Route::get('/allocations', 'AllocationController@index')->middleware('can:allocation,view');
    Route::post('/allocations/auto', 'AllocationController@auto')->middleware('can:allocation,edit');
    Route::put('/allocations/{orderItem}', 'AllocationController@setManual')->middleware('can:allocation,edit');

    Route::get('/packings', 'PackingController@index')->middleware('can:packing,view');
    Route::get('/packings/{order}', 'PackingController@show')->middleware('can:packing,view');
    Route::put('/packings/{packing}', 'PackingController@update')->middleware('can:packing,edit');
    // Verifying packing generates the challan server-side; quantities are copied
    // from the packing rows, never accepted from the request body.
    Route::post('/packings/{packing}/verify', 'PackingController@verify')->middleware('can:packing,edit');

    Route::get('/challans', 'ChallanController@index')->middleware('can:delivery,view');
    Route::get('/challans/{challan}', 'ChallanController@show')->middleware('can:delivery,view');
    Route::post('/challans/{challan}/dispatch', 'ChallanController@dispatch')->middleware('can:delivery,edit');

    // -------------------------------------------------------- driver app
    Route::middleware('can:driver_app,view')->prefix('driver')->group(function () {
        Route::get('/today', 'DriverController@today');
        Route::get('/deliveries', 'DriverController@deliveries');
        Route::get('/history', 'DriverController@history');
        // Signature and photo arrive as uploads; the server stores files and
        // keeps only the path, so the JSON payload stays small.
        Route::post('/challans/{challan}/confirm', 'DriverController@confirmDelivery')
            ->middleware('can:driver_app,edit');
    });

    // ---------------------------------------------------------- finance
    Route::middleware('can:invoices,view')->group(function () {
        Route::get('/invoices', 'InvoiceController@index');   // status is derived, never stored
        Route::get('/invoices/{invoice}', 'InvoiceController@show');
    });
    // Billed from delivered quantity, computed server-side from the challan.
    Route::post('/invoices', 'InvoiceController@store')->middleware('can:invoices,create');

    Route::get('/payments', 'PaymentController@index')->middleware('can:payments,view');
    // Rejects an amount that would take the invoice past its total.
    Route::post('/payments', 'PaymentController@store')->middleware('can:payments,create');

    Route::get('/outstanding', 'OutstandingController@index')->middleware('can:outstanding,view');
    Route::get('/outstanding/aging', 'OutstandingController@aging')->middleware('can:outstanding,view');
    Route::get('/ledger/{customer}', 'LedgerController@show')->middleware('can:ledger,view');

    // ---------------------------------------------------------- reports
    Route::middleware('can:reports,view')->prefix('reports')->group(function () {
        Route::get('/sales', 'ReportController@sales');
        Route::get('/purchase', 'ReportController@purchase');
        Route::get('/operations', 'ReportController@operations');
    });
    Route::get('/analytics', 'AnalyticsController@index')->middleware('can:analytics,view');

    // ----------------------------------------------------------- system
    Route::get('/notifications', 'NotificationController@index');
    Route::get('/audit-logs', 'AuditLogController@index')->middleware('can:audit,view');

    Route::middleware('can:users,view')->group(function () {
        Route::get('/users', 'UserController@index');
        Route::get('/roles', 'RoleController@index');
    });
    Route::post('/users', 'UserController@store')->middleware('can:users,create');
    Route::put('/users/{user}', 'UserController@update')->middleware('can:users,edit');
    // Changing the permission matrix is admin-only and always audited.
    Route::put('/roles/{role}/permissions', 'RoleController@updatePermissions')->middleware('can:users,edit');

    Route::get('/settings', 'SettingController@index')->middleware('can:settings,view');
    Route::put('/settings', 'SettingController@update')->middleware('can:settings,edit');

    // ---------------------------------------------------- customer portal
    // Every route below is scoped to the token's own customer_id.
    Route::middleware(['can:portal,view', 'scope.customer'])->prefix('portal')->group(function () {
        Route::get('/summary', 'PortalController@summary');
        Route::get('/orders', 'PortalController@orders');
        Route::post('/orders', 'PortalController@placeOrder')->middleware('can:portal,create');
        Route::get('/templates', 'PortalController@templates');       // saved fixed orders
        Route::post('/templates', 'PortalController@saveTemplate');
        Route::delete('/templates/{template}', 'PortalController@deleteTemplate');
        Route::get('/invoices', 'PortalController@invoices');
        Route::get('/ledger', 'PortalController@ledger');
    });
});
