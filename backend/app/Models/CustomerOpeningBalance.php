<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class CustomerOpeningBalance extends Model
{
    protected $fillable = ['customer_id', 'as_of', 'amount'];

    protected function casts(): array
    {
        return ['as_of' => 'date:Y-m-d', 'amount' => 'decimal:2'];
    }

    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class);
    }
}
