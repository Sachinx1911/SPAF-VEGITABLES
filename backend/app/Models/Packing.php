<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;

class Packing extends Model
{
    protected $fillable = [
        'packing_no', 'order_id', 'customer_id', 'delivery_date', 'status',
        'packages', 'packed_by', 'started_at', 'packed_at', 'verified', 'issue',
    ];

    protected function casts(): array
    {
        return [
            'delivery_date' => 'date:Y-m-d',
            'verified' => 'boolean',
            'started_at' => 'datetime',
            'packed_at' => 'datetime',
        ];
    }

    public function order(): BelongsTo
    {
        return $this->belongsTo(Order::class);
    }

    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class);
    }

    public function lines(): HasMany
    {
        return $this->hasMany(PackingItem::class);
    }

    public function challan(): HasOne
    {
        return $this->hasOne(Challan::class);
    }
}
