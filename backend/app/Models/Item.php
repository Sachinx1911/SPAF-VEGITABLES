<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * A sellable SKU. Item + Unit is the identity: "Lemon (Pcs)" and "Lemon (Kg)"
 * are two rows, never one, and the database enforces it with a unique key on
 * (name, unit). Nothing anywhere converts between units.
 */
class Item extends Model
{
    protected $fillable = [
        'code', 'name', 'excel_name', 'category', 'unit', 'purchase_unit', 'selling_unit',
        'min_stock', 'reorder_level', 'default_purchase_price', 'default_selling_price',
        'tax_rate', 'sort_order', 'active',
    ];

    protected function casts(): array
    {
        return [
            'active' => 'boolean',
            'min_stock' => 'decimal:2',
            'reorder_level' => 'decimal:2',
            'stock' => 'decimal:2',
            'default_purchase_price' => 'decimal:2',
            'default_selling_price' => 'decimal:2',
            'tax_rate' => 'decimal:2',
        ];
    }

    public function prices(): HasMany
    {
        return $this->hasMany(CustomerItemPrice::class);
    }

    public function scopeActive(Builder $q): Builder
    {
        return $q->where('active', true);
    }

    /**
     * Produce bought fresh each morning carries no reorder level, so it is not
     * "out of stock" at zero — it simply is not stocked.
     */
    public function stockState(): string
    {
        if ((float) $this->min_stock <= 0) {
            return (float) $this->stock > 0 ? 'In Stock' : 'Fresh Daily';
        }
        if ((float) $this->stock <= 0) {
            return 'Out of Stock';
        }
        if ((float) $this->stock <= (float) $this->reorder_level) {
            return 'Low Stock';
        }

        return 'In Stock';
    }

    /** Only quality-accepted quantity ever reaches here. */
    public function creditStock(float $qty): void
    {
        $this->increment('stock', $qty);
    }

    public function consumeStock(float $qty): void
    {
        $this->decrement('stock', $qty);
    }

    public function toPortableArray(): array
    {
        return [
            'id' => (string) $this->id,
            'code' => $this->code,
            'name' => $this->name,
            'excelName' => $this->excel_name,
            'category' => $this->category,
            'unit' => $this->unit,
            'purchaseUnit' => $this->purchase_unit,
            'sellingUnit' => $this->selling_unit,
            'minStock' => (float) $this->min_stock,
            'reorderLevel' => (float) $this->reorder_level,
            'defaultPurchasePrice' => (float) $this->default_purchase_price,
            'defaultSellingPrice' => (float) $this->default_selling_price,
            'taxRate' => (float) $this->tax_rate,
            'stock' => (float) $this->stock,
            'sortOrder' => (int) $this->sort_order,
            'active' => (bool) $this->active,
        ];
    }
}
