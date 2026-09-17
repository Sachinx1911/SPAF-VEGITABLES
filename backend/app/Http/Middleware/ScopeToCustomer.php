<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Binds a customer-portal request to the customer on the token.
 *
 * Without this, a portal user could pass someone else's customer_id and read
 * their orders, prices and ledger. Controllers must read the customer from
 * `$request->attributes->get('customer_id')` and never from user input.
 *
 * Registered as `scope.customer`.
 */
class ScopeToCustomer
{
    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();

        if ($user->role_key !== 'customer') {
            // Staff roles are already limited by CheckPermission; nothing to scope.
            return $next($request);
        }

        if (! $user->customer_id) {
            return response()->json([
                'message' => 'This portal login is not linked to a customer.',
            ], 403);
        }

        // Any customer_id supplied by the client is discarded, not merged.
        $request->attributes->set('customer_id', $user->customer_id);

        return $next($request);
    }
}
