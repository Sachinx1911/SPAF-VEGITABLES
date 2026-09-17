<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Route extends Model
{
    protected $fillable = ['code', 'name', 'area', 'driver_id', 'vehicle_no', 'departure_time'];

    public function driver(): BelongsTo
    {
        return $this->belongsTo(User::class, 'driver_id');
    }

    /** Customers in delivery sequence — the order the van actually stops in. */
    public function customers(): HasMany
    {
        return $this->hasMany(Customer::class)->orderBy('route_order');
    }
}
