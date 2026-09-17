<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Role extends Model
{
    protected $primaryKey = 'key';
    protected $keyType = 'string';
    public $incrementing = false;

    protected $fillable = ['key', 'name', 'description'];

    public function permissions(): HasMany
    {
        return $this->hasMany(RolePermission::class, 'role_key', 'key');
    }

    public function users(): HasMany
    {
        return $this->hasMany(User::class, 'role_key', 'key');
    }
}
