<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class CustomerItemPrice extends Model
{
    protected $fillable = ['customer_id', 'item_id', 'unit', 'price', 'effective_from', 'effective_to'];

    protected function casts(): array
    {
        return ['price' => 'decimal:2', 'effective_from' => 'date:Y-m-d', 'effective_to' => 'date:Y-m-d'];
    }

    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class);
    }

    public function item(): BelongsTo
    {
        return $this->belongsTo(Item::class);
    }

    /**
     * The rate in force for a customer on a date, falling back to the item
     * default. Orders capture the result, so a later price change never
     * rewrites what was already agreed.
     */
    public static function rateFor(int $customerId, int $itemId, string $date): float
    {
        $price = static::where('customer_id', $customerId)
            ->where('item_id', $itemId)
            ->whereDate('effective_from', '<=', $date)
            ->where(fn ($q) => $q->whereNull('effective_to')->orWhereDate('effective_to', '>=', $date))
            ->orderByDesc('effective_from')
            ->value('price');

        return $price !== null
            ? (float) $price
            : (float) Item::whereKey($itemId)->value('default_selling_price');
    }
}
