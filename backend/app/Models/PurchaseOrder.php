<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class PurchaseOrder extends Model
{
    protected $fillable = [
        'po_no', 'supplier_id', 'purchase_date', 'for_delivery_date',
        'supplier_invoice_no', 'status', 'tax_amount', 'created_by',
    ];

    protected function casts(): array
    {
        return [
            'purchase_date' => 'date:Y-m-d',
            'for_delivery_date' => 'date:Y-m-d',
            'tax_amount' => 'decimal:2',
        ];
    }

    public function supplier(): BelongsTo
    {
        return $this->belongsTo(Supplier::class);
    }

    public function lines(): HasMany
    {
        return $this->hasMany(PurchaseOrderItem::class);
    }

    public function receivings(): HasMany
    {
        return $this->hasMany(Receiving::class);
    }

    public function subtotal(): float
    {
        return (float) $this->lines->sum(fn ($l) => (float) $l->qty * (float) $l->rate);
    }
}
