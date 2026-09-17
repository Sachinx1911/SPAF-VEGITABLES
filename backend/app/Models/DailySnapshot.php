<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/** Written once a day by a scheduled job so the dashboard can show a real delta. */
class DailySnapshot extends Model
{
    protected $primaryKey = 'date';
    protected $keyType = 'string';
    public $incrementing = false;

    protected $fillable = [
        'date', 'orders_received', 'pending_approval', 'locked', 'purchase_required',
        'received_lines', 'packing_pending', 'dispatch_pending', 'delivered',
        'outstanding', 'sales_value',
    ];

    protected function casts(): array
    {
        return ['date' => 'date:Y-m-d', 'outstanding' => 'decimal:2', 'sales_value' => 'decimal:2'];
    }
}
