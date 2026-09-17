<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;

class Order extends Model
{
    protected $fillable = [
        'order_no', 'customer_id', 'order_date', 'delivery_date', 'order_type', 'source',
        'status', 'is_late', 'received_at', 'repeat_of_order_id', 'remarks', 'created_by',
    ];

    protected function casts(): array
    {
        return [
            'order_date' => 'date:Y-m-d',
            'delivery_date' => 'date:Y-m-d',
            'received_at' => 'datetime',
            'approved_at' => 'datetime',
            'locked_at' => 'datetime',
            'is_late' => 'boolean',
        ];
    }

    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class);
    }

    public function lines(): HasMany
    {
        return $this->hasMany(OrderItem::class);
    }

    public function packing(): HasOne
    {
        return $this->hasOne(Packing::class);
    }

    public function challan(): HasOne
    {
        return $this->hasOne(Challan::class);
    }

    public function approver(): BelongsTo
    {
        return $this->belongsTo(User::class, 'approved_by');
    }

    /* ------------------------------------------------------------- scopes */

    public function scopeForDelivery(Builder $q, string $date): Builder
    {
        return $q->whereDate('delivery_date', $date);
    }

    /** What consolidation counts: approved work for a day, locked or not. */
    public function scopeConsolidatable(Builder $q): Builder
    {
        return $q->whereIn('status', ['Approved', 'Locked']);
    }

    public function scopeAwaitingApproval(Builder $q): Builder
    {
        return $q->whereIn('status', ['Submitted', 'Late']);
    }

    /**
     * An order is late when it arrives after the cutoff for a delivery that is
     * today or tomorrow — the kitchen has already been planned around it.
     */
    public static function isLateArrival(string $deliveryDate, \DateTimeInterface $receivedAt): bool
    {
        $cutoff = (string) setting('order_cutoff_time', '22:00');
        [$h, $m] = array_map('intval', explode(':', $cutoff));

        $past = ((int) $receivedAt->format('H') * 60 + (int) $receivedAt->format('i')) >= ($h * 60 + $m);
        $soon = $deliveryDate <= date('Y-m-d', strtotime($receivedAt->format('Y-m-d') . ' +1 day'));

        return $past && $soon;
    }

    /** Order value from whichever stage is furthest along — what the customer would be billed today. */
    public function value(): float
    {
        return (float) $this->lines->sum(function (OrderItem $l) {
            $qty = $l->qty_delivered ?? $l->qty_packed ?? $l->qty_approved ?? $l->qty_ordered;

            return (float) $qty * (float) $l->rate;
        });
    }

    public function toPortableArray(): array
    {
        return [
            'id' => (string) $this->id,
            'orderNo' => $this->order_no,
            'customerId' => (string) $this->customer_id,
            'orderDate' => $this->order_date?->format('Y-m-d'),
            'deliveryDate' => $this->delivery_date?->format('Y-m-d'),
            'orderType' => $this->order_type,
            'source' => $this->source,
            'status' => $this->status,
            'isLate' => (bool) $this->is_late,
            'receivedAt' => $this->received_at?->toIso8601String(),
            'approvedBy' => $this->approved_by ? (string) $this->approved_by : null,
            'approvedAt' => $this->approved_at?->toIso8601String(),
            'lockedAt' => $this->locked_at?->toIso8601String(),
            'packingStatus' => $this->packing_status,
            'deliveryStatus' => $this->delivery_status,
            'invoiceStatus' => $this->invoice_status,
            'repeatOfOrderId' => $this->repeat_of_order_id ? (string) $this->repeat_of_order_id : null,
            'remarks' => $this->remarks ?? '',
            'createdBy' => (string) $this->created_by,
        ];
    }
}
