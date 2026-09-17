<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;

class Customer extends Model
{
    protected $fillable = [
        'code', 'route_code', 'short_label', 'route_order', 'route_id', 'name', 'legal_name',
        'type', 'location', 'contact_person', 'mobile', 'alt_mobile', 'email', 'billing_address',
        'delivery_address', 'gstin', 'pan', 'payment_terms_days', 'credit_limit', 'order_frequency',
        'preferred_order_time', 'preferred_delivery_time', 'special_instructions', 'active',
    ];

    protected function casts(): array
    {
        return ['active' => 'boolean', 'credit_limit' => 'decimal:2'];
    }

    public function route(): BelongsTo
    {
        return $this->belongsTo(Route::class);
    }

    public function orders(): HasMany
    {
        return $this->hasMany(Order::class);
    }

    public function invoices(): HasMany
    {
        return $this->hasMany(Invoice::class);
    }

    public function payments(): HasMany
    {
        return $this->hasMany(Payment::class);
    }

    public function prices(): HasMany
    {
        return $this->hasMany(CustomerItemPrice::class);
    }

    public function openingBalance(): HasOne
    {
        return $this->hasOne(CustomerOpeningBalance::class);
    }

    public function templates(): HasMany
    {
        return $this->hasMany(StandingOrderTemplate::class);
    }

    public function scopeActive(Builder $q): Builder
    {
        return $q->where('active', true);
    }

    public function toPortableArray(): array
    {
        return [
            'id' => (string) $this->id,
            'code' => $this->code,
            'routeCode' => $this->route_code,
            'shortLabel' => $this->short_label,
            'routeOrder' => (int) $this->route_order,
            'routeId' => (string) $this->route_id,
            'name' => $this->name,
            'legalName' => $this->legal_name,
            'type' => $this->type,
            'location' => $this->location,
            'contactPerson' => $this->contact_person,
            'mobile' => $this->mobile,
            'altMobile' => $this->alt_mobile,
            'email' => $this->email,
            'billingAddress' => $this->billing_address ?? '',
            'deliveryAddress' => $this->delivery_address ?? '',
            'gstin' => $this->gstin,
            'pan' => $this->pan,
            'paymentTermsDays' => (int) $this->payment_terms_days,
            'creditLimit' => (float) $this->credit_limit,
            'orderFrequency' => $this->order_frequency,
            'preferredOrderTime' => $this->preferred_order_time,
            'preferredDeliveryTime' => $this->preferred_delivery_time,
            'specialInstructions' => $this->special_instructions ?? '',
            'active' => (bool) $this->active,
            'createdAt' => $this->created_at?->toIso8601String(),
        ];
    }
}
