<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/** A customer's saved "fixed order", so daily ordering is one tap. */
class StandingOrderTemplate extends Model
{
    protected $fillable = ['customer_id', 'name'];

    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class);
    }

    public function lines(): HasMany
    {
        return $this->hasMany(StandingOrderTemplateLine::class);
    }
}
