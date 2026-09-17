<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * Billed from delivered quantity, not ordered.
 *
 * Only Draft / Generated / Sent / Cancelled are stored. Paid, Partially Paid
 * and Overdue are worked out from the payments and the due date every time they
 * are asked for, so a status can never drift away from the money.
 */
class Invoice extends Model
{
    protected $fillable = [
        'invoice_no', 'customer_id', 'order_id', 'challan_id', 'invoice_date', 'due_date',
        'subtotal', 'tax_amount', 'total', 'status', 'created_by',
    ];

    protected function casts(): array
    {
        return [
            'invoice_date' => 'date:Y-m-d',
            'due_date' => 'date:Y-m-d',
            'subtotal' => 'decimal:2',
            'tax_amount' => 'decimal:2',
            'total' => 'decimal:2',
        ];
    }

    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class);
    }

    public function order(): BelongsTo
    {
        return $this->belongsTo(Order::class);
    }

    public function lines(): HasMany
    {
        return $this->hasMany(InvoiceItem::class);
    }

    public function payments(): HasMany
    {
        return $this->hasMany(Payment::class);
    }

    public function paidAmount(): float
    {
        return min((float) $this->payments()->sum('amount'), (float) $this->total);
    }

    public function balance(): float
    {
        return max((float) $this->total - $this->paidAmount(), 0);
    }

    public function daysOverdue(?string $asOf = null): int
    {
        if ($this->balance() <= 0) {
            return 0;
        }
        $asOf = $asOf ?? now()->toDateString();

        return max((int) floor((strtotime($asOf) - strtotime($this->due_date->toDateString())) / 86400), 0);
    }

    public function derivedStatus(?string $asOf = null): string
    {
        if ($this->status === 'Cancelled') {
            return 'Cancelled';
        }
        if ($this->balance() <= 0) {
            return 'Paid';
        }
        if ($this->daysOverdue($asOf) > 0) {
            return 'Overdue';
        }
        if ($this->paidAmount() > 0) {
            return 'Partially Paid';
        }

        return $this->status;
    }
}
