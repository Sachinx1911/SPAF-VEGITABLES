<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;

class Order extends Model
{
    /**
     * The workflow columns are fillable because every step of the day writes
     * one: approval stamps who and when, packing and dispatch move the status
     * along, invoicing closes it. They are set by controllers from known values,
     * never from request input. Leaving them out makes those updates fail
     * silently — the row saves, the column does not change, and nothing errors.
     */
    protected $fillable = [
        'order_no', 'customer_id', 'order_date', 'delivery_date', 'order_type', 'source',
        'status', 'is_late', 'received_at', 'repeat_of_order_id', 'remarks', 'created_by',
        'approved_by', 'approved_at', 'locked_at',
        'packing_status', 'delivery_status', 'invoice_status',
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

    /** One invoice per order — the guard against billing the same day twice. */
    public function invoice(): HasOne
    {
        return $this->hasOne(Invoice::class);
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
    /**
     * The moment ordering closes for a delivery date.
     *
     * Noon separates the two readings of a cutoff time. An evening one — 22:00 —
     * closes the night *before* delivery. A small-hours one — 03:00 — closes in
     * the early morning *of* the delivery day, so the ordering window runs past
     * midnight. Comparing clock times alone cannot tell these apart: 21:00 is
     * "after" 03:00 by that measure, which would close a window still open.
     */
    public static function cutoffMoment(string $deliveryDate, ?string $cutoff = null): \DateTimeImmutable
    {
        $cutoff ??= (string) setting('order_cutoff_time', '22:00');
        $date = $cutoff < '12:00'
            ? $deliveryDate
            : date('Y-m-d', strtotime($deliveryDate . ' -1 day'));

        return new \DateTimeImmutable("{$date} {$cutoff}:00");
    }

    /** True when an order for this delivery date arrives after ordering closed. */
    public static function isLateArrival(string $deliveryDate, \DateTimeInterface $receivedAt): bool
    {
        return $receivedAt > self::cutoffMoment($deliveryDate);
    }

    /**
     * The soonest delivery date an order placed now can still make. Today is a
     * candidate: with a 03:00 cutoff, an order at 02:00 is in time for that day.
     */
    public static function nextDeliveryDate(\DateTimeInterface $now): string
    {
        $today = $now->format('Y-m-d');

        for ($d = 0; $d <= 3; $d++) {
            $date = date('Y-m-d', strtotime("{$today} +{$d} day"));
            if (! self::isLateArrival($date, $now)) {
                return $date;
            }
        }

        return date('Y-m-d', strtotime("{$today} +1 day"));
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
