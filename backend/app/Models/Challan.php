<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * Generated from packing. Its quantities are copied from the packed lines and
 * are never typed in again, so the paper that travels with the van and the
 * record in the system cannot disagree.
 */
class Challan extends Model
{
    protected $fillable = [
        'challan_no', 'packing_id', 'order_id', 'customer_id', 'route_id', 'challan_date',
        'driver_id', 'vehicle_no', 'status', 'packages', 'prepared_by', 'packed_by',
        'dispatched_at', 'delivered_at', 'received_by_name', 'signature_path', 'photo_path',
        'delivery_remarks',
    ];

    protected function casts(): array
    {
        return [
            'challan_date' => 'date:Y-m-d',
            'dispatched_at' => 'datetime',
            'delivered_at' => 'datetime',
        ];
    }

    public function order(): BelongsTo
    {
        return $this->belongsTo(Order::class);
    }

    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class);
    }

    public function route(): BelongsTo
    {
        return $this->belongsTo(Route::class);
    }

    public function driver(): BelongsTo
    {
        return $this->belongsTo(User::class, 'driver_id');
    }

    public function lines(): HasMany
    {
        return $this->hasMany(ChallanItem::class);
    }
}
