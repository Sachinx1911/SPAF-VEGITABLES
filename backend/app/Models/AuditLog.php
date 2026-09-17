<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class AuditLog extends Model
{
    public $timestamps = false;

    protected $fillable = [
        'at', 'user_id', 'action', 'module', 'record_ref',
        'customer_id', 'old_value', 'new_value', 'device', 'ip', 'status',
    ];

    protected function casts(): array
    {
        return ['at' => 'datetime'];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
