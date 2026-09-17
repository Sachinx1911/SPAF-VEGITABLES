<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasOne;
use RuntimeException;

/**
 * One line of a customer order, and the home of the quantity chain.
 *
 * Twelve columns, one per stage. `qty_ordered` is set once when the order is
 * placed; every later stage fills only its own column and leaves the earlier
 * ones untouched. That is what makes "the customer asked for 10, we delivered
 * 8.5" answerable months later, and why disputes are settleable from the row
 * itself rather than from memory.
 *
 * Writes go through `recordStage()`, which refuses to overwrite a stage that is
 * already set. Nothing else should assign these columns directly.
 */
class OrderItem extends Model
{
    /** In order, upstream first. Each stage is fed by the one before it. */
    public const STAGES = [
        'ordered', 'approved', 'purchased', 'received', 'accepted', 'allocated',
        'packed', 'dispatched', 'delivered', 'customer_accepted', 'invoiced', 'paid',
    ];

    protected $fillable = ['order_id', 'item_id', 'unit', 'rate', 'qty_ordered', 'remarks'];

    protected function casts(): array
    {
        return array_merge(
            ['rate' => 'decimal:2'],
            array_combine(
                array_map(fn ($s) => "qty_{$s}", self::STAGES),
                array_fill(0, count(self::STAGES), 'decimal:3'),
            ),
        );
    }

    public function order(): BelongsTo
    {
        return $this->belongsTo(Order::class);
    }

    public function item(): BelongsTo
    {
        return $this->belongsTo(Item::class);
    }

    public function allocation(): HasOne
    {
        return $this->hasOne(Allocation::class);
    }

    /**
     * Fills one stage of the chain.
     *
     * Refuses to overwrite a stage that already carries a value — correcting a
     * recorded quantity is a deliberate act that belongs in its own audited
     * path, not a side effect of running a step twice.
     */
    public function recordStage(string $stage, float $qty): void
    {
        if (! in_array($stage, self::STAGES, true)) {
            throw new RuntimeException("Unknown quantity stage: {$stage}");
        }

        if ($stage === 'ordered') {
            throw new RuntimeException('qty_ordered is set when the order is created and never rewritten.');
        }

        $column = "qty_{$stage}";

        if ($this->{$column} !== null) {
            throw new RuntimeException(
                "Line {$this->id} already has {$stage} = {$this->{$column}}. A stage is written once."
            );
        }

        if ($qty < 0) {
            throw new RuntimeException("A quantity cannot be negative ({$stage} = {$qty}).");
        }

        $this->{$column} = $qty;
        $this->save();
    }

    /** Clears a stage so it can be recorded again — for corrections only, and audited by the caller. */
    public function resetStage(string $stage): void
    {
        if (! in_array($stage, self::STAGES, true) || $stage === 'ordered') {
            throw new RuntimeException("Stage {$stage} cannot be reset.");
        }

        $this->update(["qty_{$stage}" => null]);
    }

    /** The last stage that carries a value — how far down the chain this line has travelled. */
    public function currentStage(): string
    {
        $last = 'ordered';
        foreach (self::STAGES as $stage) {
            if ($this->{"qty_{$stage}"} !== null) $last = $stage;
        }

        return $last;
    }

    /** What the customer asked for minus what actually reached them. */
    public function shortfall(): ?float
    {
        if ($this->qty_delivered === null) return null;

        return round((float) $this->qty_ordered - (float) $this->qty_delivered, 3);
    }

    /** The chain as the front end consumes it, camelCased and null-preserving. */
    public function chain(): array
    {
        return [
            'ordered' => $this->asFloat('qty_ordered'),
            'approved' => $this->asFloat('qty_approved'),
            'purchased' => $this->asFloat('qty_purchased'),
            'received' => $this->asFloat('qty_received'),
            'accepted' => $this->asFloat('qty_accepted'),
            'allocated' => $this->asFloat('qty_allocated'),
            'packed' => $this->asFloat('qty_packed'),
            'dispatched' => $this->asFloat('qty_dispatched'),
            'delivered' => $this->asFloat('qty_delivered'),
            'customerAccepted' => $this->asFloat('qty_customer_accepted'),
            'invoiced' => $this->asFloat('qty_invoiced'),
            'paid' => $this->asFloat('qty_paid'),
        ];
    }

    private function asFloat(string $column): ?float
    {
        return $this->{$column} === null ? null : (float) $this->{$column};
    }
}
