<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasOne;

class ReceivingItem extends Model
{
    protected $fillable = [
        'receiving_id', 'purchase_order_item_id', 'item_id', 'unit',
        'ordered_qty', 'received_qty', 'condition',
    ];

    protected function casts(): array
    {
        return ['ordered_qty' => 'decimal:3', 'received_qty' => 'decimal:3'];
    }

    public function item(): BelongsTo
    {
        return $this->belongsTo(Item::class);
    }

    public function qualityCheck(): HasOne
    {
        return $this->hasOne(QualityCheck::class);
    }

    /** Negative when short, positive when the supplier sent extra. */
    public function variance(): float
    {
        return round((float) $this->received_qty - (float) $this->ordered_qty, 3);
    }
}
