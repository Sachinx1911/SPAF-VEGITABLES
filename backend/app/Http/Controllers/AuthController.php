<?php

namespace App\Http\Controllers;

use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Validation\ValidationException;

/**
 * Replaces the prototype's browser-side check against one shared constant.
 *
 * Three things change here and all three matter:
 *  - each user has their own bcrypt hash, verified on the server
 *  - the answer is deliberately vague, so the response cannot be used to
 *    discover which email addresses exist
 *  - attempts are rate limited per email+IP, so the login cannot be brute forced
 */
class AuthController extends Controller
{
    public function login(Request $request): JsonResponse
    {
        $data = $request->validate([
            'identifier' => ['required', 'string', 'max:120'],  // email or mobile
            'password' => ['required', 'string'],
            'remember' => ['sometimes', 'boolean'],
        ]);

        $key = 'login:' . strtolower($data['identifier']) . '|' . $request->ip();

        if (RateLimiter::tooManyAttempts($key, maxAttempts: 5)) {
            return response()->json([
                'message' => 'Too many attempts. Try again in ' . RateLimiter::availableIn($key) . ' seconds.',
            ], 429);
        }

        $user = User::findByIdentifier($data['identifier']);

        // Hash::check runs even when no user matched, so a missing account and a
        // wrong password take the same time and cannot be told apart.
        $hash = $user?->password ?? '$2y$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidinv';

        if (! Hash::check($data['password'], $hash) || ! $user) {
            RateLimiter::hit($key, decaySeconds: 60);
            activity_log($user, 'Login failed', 'users', $data['identifier'], status: 'Failed');

            throw ValidationException::withMessages([
                'identifier' => ['Email/mobile or password is incorrect.'],
            ]);
        }

        if ($user->status !== 'Active') {
            return response()->json([
                'message' => 'This account is inactive. Contact your administrator.',
            ], 403);
        }

        RateLimiter::clear($key);

        // Re-hash transparently if the cost factor has since been raised.
        if (Hash::needsRehash($user->password)) {
            $user->forceFill(['password' => Hash::make($data['password'])])->save();
        }

        $user->forceFill(['last_login_at' => now()])->save();

        // A "remember me" token lives longer, but still expires.
        $expiresAt = ($data['remember'] ?? false) ? now()->addDays(30) : now()->addHours(12);
        $token = $user->createToken('spaf', ['*'], $expiresAt);

        activity_log($user, 'User login', 'users', $user->name);

        return response()->json([
            'token' => $token->plainTextToken,
            'expires_at' => $expiresAt,
            'user' => $user->toPortableArray(),
        ]);
    }

    public function me(Request $request): JsonResponse
    {
        return response()->json([
            'user' => $request->user()->toPortableArray(),
            // The front end renders navigation from this, and the server enforces
            // the same matrix — the two can never drift apart.
            'permissions' => $request->user()->permissionMatrix(),
        ]);
    }

    public function logout(Request $request): JsonResponse
    {
        $request->user()->currentAccessToken()->delete();
        activity_log($request->user(), 'User logout', 'users', $request->user()->name);

        return response()->json(['message' => 'Signed out.']);
    }

    public function changePassword(Request $request): JsonResponse
    {
        $data = $request->validate([
            'current_password' => ['required', 'string'],
            // Length beats composition rules; 12 characters minimum.
            'password' => ['required', 'string', 'min:12', 'confirmed'],
        ]);

        $user = $request->user();

        if (! Hash::check($data['current_password'], $user->password)) {
            throw ValidationException::withMessages([
                'current_password' => ['Current password is incorrect.'],
            ]);
        }

        $user->forceFill(['password' => Hash::make($data['password'])])->save();

        // Every other session is invalidated, so a stolen token dies with the change.
        $user->tokens()->where('id', '!=', $user->currentAccessToken()->id)->delete();

        activity_log($user, 'Password changed', 'users', $user->name);

        return response()->json(['message' => 'Password updated.']);
    }
}
