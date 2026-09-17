<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class PackingItem extends Model
{
    protected $fillable = [
        'packing_id', 'allocation_id', 'order_item_id', 'item_id', 'unit',
        'allocated_qty', 'packed_qty', 'package_type',
    ];

    protected function casts(): array
    {
        return ['allocated_qty' => 'decimal:3', 'packed_qty' => 'decimal:3'];
    }

    public function item(): BelongsTo
    {
        return $this->belongsTo(Item::class);
    }

    public function orderItem(): BelongsTo
    {
        return $this->belongsTo(OrderItem::class);
    }
}
