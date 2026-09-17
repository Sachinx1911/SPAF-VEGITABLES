<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** The only thing that credits stock, and only with the accepted quantity. */
class QualityCheck extends Model
{
    protected $fillable = [
        'receiving_item_id', 'item_id', 'unit', 'accepted_qty', 'rejected_qty',
        'grade', 'reason', 'remarks', 'checked_by', 'checked_at',
    ];

    protected function casts(): array
    {
        return ['accepted_qty' => 'decimal:3', 'rejected_qty' => 'decimal:3', 'checked_at' => 'datetime'];
    }

    public function receivingItem(): BelongsTo
    {
        return $this->belongsTo(ReceivingItem::class);
    }

    public function item(): BelongsTo
    {
        return $this->belongsTo(Item::class);
    }
}
