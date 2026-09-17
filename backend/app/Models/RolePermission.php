<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class RolePermission extends Model
{
    public $timestamps = false;

    protected $fillable = ['role_key', 'module', 'action'];
}
