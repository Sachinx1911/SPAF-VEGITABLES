<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Payment extends Model
{
    protected $fillable = [
        'receipt_no', 'customer_id', 'invoice_id', 'payment_date', 'mode',
        'reference', 'amount', 'remarks', 'recorded_by', 'recorded_at',
    ];

    protected function casts(): array
    {
        return ['payment_date' => 'date:Y-m-d', 'amount' => 'decimal:2', 'recorded_at' => 'datetime'];
    }

    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class);
    }

    public function invoice(): BelongsTo
    {
        return $this->belongsTo(Invoice::class);
    }
}
