<?php

use App\Models\AuditLog;
use App\Models\User;

if (! function_exists('activity_log')) {
    /**
     * Writes one row to the audit trail.
     *
     * Every state change in the system goes through here, so "who changed this,
     * when, and from what to what" is answerable for any record without having
     * to reconstruct it from timestamps.
     */
    function activity_log(
        ?User $user,
        string $action,
        string $module,
        string $recordRef = '',
        ?int $customerId = null,
        string $oldValue = '',
        string $newValue = '',
        string $status = 'Success',
    ): void {
        // A failed login has no user yet, but is still worth recording.
        if (! $user) {
            AuditLog::create([
                'at' => now(),
                'user_id' => null,
                'action' => $action,
                'module' => $module,
                'record_ref' => $recordRef,
                'customer_id' => $customerId,
                'old_value' => $oldValue,
                'new_value' => $newValue,
                'device' => request()->userAgent() ?? '',
                'ip' => request()->ip() ?? '',
                'status' => $status,
            ]);

            return;
        }

        AuditLog::create([
            'at' => now(),
            'user_id' => $user->id,
            'action' => $action,
            'module' => $module,
            'record_ref' => $recordRef,
            'customer_id' => $customerId,
            'old_value' => $oldValue,
            'new_value' => $newValue,
            'device' => request()->userAgent() ?? '',
            'ip' => request()->ip() ?? '',
            'status' => $status,
        ]);
    }
}

if (! function_exists('setting')) {
    /** Reads a settings row, falling back to the given default. */
    function setting(string $key, mixed $default = null): mixed
    {
        return \App\Models\Setting::get($key, $default);
    }
}
