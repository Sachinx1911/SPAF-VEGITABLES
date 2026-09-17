<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Allocation extends Model
{
    protected $fillable = [
        'order_item_id', 'order_id', 'customer_id', 'item_id', 'unit', 'delivery_date',
        'required_qty', 'allocated_qty', 'override', 'allocated_by', 'allocated_at',
    ];

    protected function casts(): array
    {
        return [
            'delivery_date' => 'date:Y-m-d',
            'required_qty' => 'decimal:3',
            'allocated_qty' => 'decimal:3',
            'override' => 'boolean',
            'allocated_at' => 'datetime',
        ];
    }

    public function orderItem(): BelongsTo
    {
        return $this->belongsTo(OrderItem::class);
    }

    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class);
    }

    public function item(): BelongsTo
    {
        return $this->belongsTo(Item::class);
    }

    public function shortfall(): float
    {
        return max((float) $this->required_qty - (float) $this->allocated_qty, 0);
    }
}
