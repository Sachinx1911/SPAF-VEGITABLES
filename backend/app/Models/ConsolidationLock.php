<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;

/** Freezes a delivery date: once locked, its orders stop changing. */
class ConsolidationLock extends Model
{
    protected $fillable = ['delivery_date', 'locked_at', 'locked_by'];

    protected function casts(): array
    {
        return ['delivery_date' => 'date:Y-m-d', 'locked_at' => 'datetime'];
    }

    public function lockedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'locked_by');
    }

    public function orders(): BelongsToMany
    {
        return $this->belongsToMany(Order::class, 'consolidation_lock_orders');
    }
}
