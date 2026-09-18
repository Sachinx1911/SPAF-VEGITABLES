<?php

namespace App\Http\Controllers;

use App\Models\Role;
use App\Models\RolePermission;
use App\Models\Setting;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

class AdminController extends Controller
{
    /* ------------------------------------------------------------ users */

    public function users(): JsonResponse
    {
        $users = User::with('role:key,name')->orderBy('name')->get()
            ->map(fn (User $u) => $u->toPortableArray() + ['roleName' => $u->role?->name]);

        return response()->json(['users' => $users]);
    }

    /**
     * Creates a user with a generated password.
     *
     * The password is returned once and never stored in readable form. An admin
     * passes it on out of band; the user changes it at first sign-in.
     */
    public function storeUser(Request $request): JsonResponse
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:120'],
            'email' => ['required', 'email', 'max:160', 'unique:users,email'],
            'mobile' => ['sometimes', 'nullable', 'string', 'max:20'],
            'role_key' => ['required', 'exists:roles,key'],
            'customer_id' => ['nullable', 'exists:customers,id'],
        ]);

        // A portal login is meaningless without the customer it belongs to —
        // ScopeToCustomer would refuse every request it makes.
        if ($data['role_key'] === 'customer' && empty($data['customer_id'])) {
            return response()->json(['message' => 'A customer login must be linked to a customer.'], 422);
        }

        $password = Str::password(14);

        $user = User::create($data + [
            'email' => strtolower($data['email']),
            'password' => Hash::make($password),
            'status' => 'Active',
        ]);

        activity_log($request->user(), 'User created', 'users', $user->email, null, '', $data['role_key']);

        return response()->json([
            'user' => $user->toPortableArray(),
            'password' => $password,
            'notice' => 'Share this password securely. It is not stored and cannot be shown again.',
        ], 201);
    }

    public function updateUser(Request $request, User $user): JsonResponse
    {
        $data = $request->validate([
            'name' => ['sometimes', 'nullable', 'string', 'max:120'],
            'mobile' => ['sometimes', 'nullable', 'string', 'max:20'],
            'role_key' => ['sometimes', 'exists:roles,key'],
            'status' => ['sometimes', Rule::in(['Active', 'Inactive'])],
        ]);

        // Locking out the last admin would leave nobody able to manage the system.
        if (($data['status'] ?? null) === 'Inactive' || ($data['role_key'] ?? $user->role_key) !== 'admin') {
            $remaining = User::where('role_key', 'admin')->where('status', 'Active')->where('id', '!=', $user->id)->count();
            if ($user->role_key === 'admin' && $remaining === 0) {
                return response()->json(['message' => 'This is the last active admin. Promote someone else first.'], 422);
            }
        }

        $before = "{$user->role_key}/{$user->status}";
        $user->update($data);

        activity_log($request->user(), 'User updated', 'users', $user->email, null, $before, "{$user->role_key}/{$user->status}");

        return response()->json(['user' => $user->fresh()->toPortableArray()]);
    }

    /** Resets someone else's password and returns the new one once. */
    public function resetPassword(Request $request, User $user): JsonResponse
    {
        $password = Str::password(14);
        $user->forceFill(['password' => Hash::make($password)])->save();

        // Every existing session for that account dies with the reset.
        $user->tokens()->delete();

        activity_log($request->user(), 'Password reset', 'users', $user->email, null, '', 'by admin', 'Warning');

        return response()->json([
            'password' => $password,
            'notice' => 'All of that user\'s sessions have been signed out.',
        ]);
    }

    /* ------------------------------------------------------------ roles */

    public function roles(): JsonResponse
    {
        $roles = Role::with('permissions')->get()->map(fn (Role $r) => [
            'key' => $r->key,
            'name' => $r->name,
            'description' => $r->description,
            'userCount' => User::where('role_key', $r->key)->count(),
            'permissions' => $r->permissions->groupBy('module')->map->pluck('action'),
        ]);

        return response()->json(['roles' => $roles]);
    }

    public function updatePermissions(Request $request, Role $role): JsonResponse
    {
        $data = $request->validate([
            'permissions' => ['required', 'array'],
            'permissions.*' => ['array'],
            'permissions.*.*' => [Rule::in(['view', 'create', 'edit', 'approve', 'delete', 'export', 'print'])],
        ]);

        // Admin is the backstop. If its matrix could be edited, one mistake
        // could leave the system with nobody able to fix it.
        if ($role->key === 'admin') {
            return response()->json(['message' => 'The admin role always has full access and cannot be narrowed.'], 422);
        }

        DB::transaction(function () use ($role, $data) {
            RolePermission::where('role_key', $role->key)->delete();

            foreach ($data['permissions'] as $module => $actions) {
                foreach (array_unique($actions) as $action) {
                    RolePermission::create(['role_key' => $role->key, 'module' => $module, 'action' => $action]);
                }
            }
        });

        Cache::forget("role.permissions.{$role->key}");

        activity_log($request->user(), 'Permissions changed', 'users', $role->name, null, '', count($data['permissions']) . ' modules', 'Warning');

        return response()->json(['message' => "Permissions updated for {$role->name}."]);
    }

    /* --------------------------------------------------------- settings */

    public function settings(): JsonResponse
    {
        return response()->json(['settings' => Setting::pluck('value', 'key')]);
    }

    public function updateSettings(Request $request): JsonResponse
    {
        $data = $request->validate([
            'settings' => ['required', 'array'],
            'settings.order_cutoff_time' => ['sometimes', 'date_format:H:i'],
            'settings.session_timeout_minutes' => ['sometimes', 'integer', 'min:0', 'max:1440'],
            'settings.default_payment_terms_days' => ['sometimes', 'integer', 'min:0', 'max:180'],
            'settings.max_sheet_columns' => ['sometimes', 'integer', 'min:1', 'max:40'],
        ]);

        foreach ($data['settings'] as $key => $value) {
            Setting::put($key, $value);
        }

        activity_log($request->user(), 'Settings updated', 'settings', implode(', ', array_keys($data['settings'])));

        return response()->json(['settings' => Setting::pluck('value', 'key')]);
    }
}
