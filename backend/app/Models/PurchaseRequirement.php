<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * What the day needs, snapshotted at lock time. Deliberately frozen: recomputing
 * it later would quietly change what the buyer was told to buy.
 */
class PurchaseRequirement extends Model
{
    protected $fillable = ['delivery_date', 'item_id', 'unit', 'required_qty', 'stock_qty', 'generated_at'];

    protected function casts(): array
    {
        return [
            'delivery_date' => 'date:Y-m-d',
            'required_qty' => 'decimal:3',
            'stock_qty' => 'decimal:3',
            'generated_at' => 'datetime',
        ];
    }

    public function item(): BelongsTo
    {
        return $this->belongsTo(Item::class);
    }

    /** What actually has to be bought, after stock already on hand. */
    public function toBuy(): float
    {
        return max((float) $this->required_qty - (float) $this->stock_qty, 0);
    }
}
