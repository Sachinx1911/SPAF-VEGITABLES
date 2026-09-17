<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Support\Facades\Cache;
use Laravel\Sanctum\HasApiTokens;

class User extends Authenticatable
{
    use HasApiTokens, HasFactory;

    /**
     * `password` is fillable and cast as `hashed`, so a plain value assigned
     * here is hashed on the way in and can never be stored as typed. Leaving it
     * out silently drops it and the insert fails on a NOT NULL column.
     */
    protected $fillable = ['name', 'email', 'mobile', 'password', 'role_key', 'status', 'customer_id'];

    /**
     * A freshly created model carries only what was inserted, so a column left
     * to its database default reads as null on that instance. Permission checks
     * look at `status`, so it has to be present from the start rather than only
     * after the row is read back.
     */
    protected $attributes = ['status' => 'Active'];

    /** Never serialised, and hashed on assignment. */
    protected $hidden = ['password', 'remember_token'];

    protected function casts(): array
    {
        return [
            'password' => 'hashed',
            'last_login_at' => 'datetime',
        ];
    }

    public function role(): BelongsTo
    {
        return $this->belongsTo(Role::class, 'role_key', 'key');
    }

    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class);
    }

    /** Login accepts an email or the last 10 digits of a mobile number. */
    public static function findByIdentifier(string $identifier): ?self
    {
        $identifier = trim($identifier);

        if (str_contains($identifier, '@')) {
            return static::where('email', strtolower($identifier))->first();
        }

        $digits = preg_replace('/\D/', '', $identifier);

        if (strlen($digits) < 10) {
            return null;
        }

        return static::whereRaw(
            "RIGHT(REPLACE(REPLACE(mobile, ' ', ''), '-', ''), 10) = ?",
            [substr($digits, -10)]
        )->first();
    }

    /**
     * The permission matrix for this user's role, cached because it is read on
     * every request and changes only when an admin edits it.
     */
    public function permissionMatrix(): array
    {
        return Cache::remember("role.permissions.{$this->role_key}", now()->addHour(), function () {
            return RolePermission::where('role_key', $this->role_key)
                ->get()
                ->groupBy('module')
                ->map(fn ($rows) => $rows->pluck('action')->values()->all())
                ->all();
        });
    }

    public function hasPermission(string $module, string $action = 'view'): bool
    {
        return in_array($action, $this->permissionMatrix()[$module] ?? [], strict: true);
    }

    /** The shape the front end already expects, so the store needs no reshaping. */
    public function toPortableArray(): array
    {
        return [
            'id' => (string) $this->id,
            'name' => $this->name,
            'email' => $this->email,
            'mobile' => $this->mobile,
            'role' => $this->role_key,
            'status' => $this->status,
            'lastLogin' => $this->last_login_at?->toIso8601String(),
            'customerId' => $this->customer_id ? (string) $this->customer_id : null,
        ];
    }
}
