<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/** A GRN: what actually arrived. It never edits the purchase order. */
class Receiving extends Model
{
    protected $fillable = ['grn_no', 'purchase_order_id', 'received_at', 'received_by', 'status'];

    protected function casts(): array
    {
        return ['received_at' => 'datetime'];
    }

    public function purchaseOrder(): BelongsTo
    {
        return $this->belongsTo(PurchaseOrder::class);
    }

    public function lines(): HasMany
    {
        return $this->hasMany(ReceivingItem::class);
    }

    public function receivedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'received_by');
    }
}
