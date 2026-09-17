<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Server-side permission check, reading the same role/permission matrix the
 * front end uses to build its navigation.
 *
 * The prototype only hid screens. Hiding is not protection: the data still
 * travelled to the browser. This refuses the request instead, so a role that
 * cannot view a module cannot read it by calling the endpoint directly.
 *
 * Registered as `can` — used in routes as `can:orders,approve`.
 */
class CheckPermission
{
    public function handle(Request $request, Closure $next, string $module, string $action = 'view'): Response
    {
        $user = $request->user();

        if (! $user) {
            return response()->json(['message' => 'Unauthenticated.'], 401);
        }

        if ($user->status !== 'Active') {
            return response()->json(['message' => 'This account is inactive.'], 403);
        }

        if (! $user->hasPermission($module, $action)) {
            // Logged so repeated refusals for one account are visible in the audit trail.
            activity_log($user, 'Permission denied', $module, $request->path(), status: 'Failed');

            return response()->json([
                'message' => 'Your role does not have access to this action.',
            ], 403);
        }

        return $next($request);
    }
}
