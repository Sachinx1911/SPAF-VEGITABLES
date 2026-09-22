import { describe, expect, it } from 'vitest';
import { generateSeed } from '../../data/seed/generate';
import { buildConsolidation, isLateFor, nextDeliveryDate, rateFor, splitEven } from '../orders';

const EVENING = '22:00';
const SMALL_HOURS = '03:00';

describe('order cutoff — evening (22:00, closes the night before)', () => {
  it('accepts an order placed before the cutoff for next-day delivery', () => {
    expect(isLateFor('2026-09-14', '2026-09-13T21:59:00', EVENING)).toBe(false);
  });

  it('treats the cutoff minute itself as still in time', () => {
    expect(isLateFor('2026-09-14', '2026-09-13T22:00:00', EVENING)).toBe(false);
  });

  it('marks an order placed after the cutoff as late for next-day delivery', () => {
    expect(isLateFor('2026-09-14', '2026-09-13T23:30:00', EVENING)).toBe(true);
  });

  it('delivers next day when the order arrives before the cutoff', () => {
    expect(nextDeliveryDate('2026-09-13', '2026-09-13T10:00:00', EVENING)).toBe('2026-09-14');
  });

  it('pushes delivery a further day when the order arrives after the cutoff', () => {
    expect(nextDeliveryDate('2026-09-13', '2026-09-13T23:00:00', EVENING)).toBe('2026-09-15');
  });
});

describe('order cutoff — small hours (03:00, closes on the delivery day)', () => {
  it('accepts an evening order for next-day delivery', () => {
    expect(isLateFor('2026-09-14', '2026-09-13T21:00:00', SMALL_HOURS)).toBe(false);
  });

  it('still accepts an order placed after midnight, for that same day', () => {
    expect(isLateFor('2026-09-14', '2026-09-14T02:30:00', SMALL_HOURS)).toBe(false);
  });

  it('marks an order placed after 03:00 as late for that day', () => {
    expect(isLateFor('2026-09-14', '2026-09-14T04:00:00', SMALL_HOURS)).toBe(true);
  });

  it('offers same-day delivery to an order placed in the small hours', () => {
    expect(nextDeliveryDate('2026-09-14', '2026-09-14T02:30:00', SMALL_HOURS)).toBe('2026-09-14');
  });

  it('offers next-day delivery once the window has closed', () => {
    expect(nextDeliveryDate('2026-09-14', '2026-09-14T04:00:00', SMALL_HOURS)).toBe('2026-09-15');
  });

  it('offers next-day delivery during the working day', () => {
    expect(nextDeliveryDate('2026-09-13', '2026-09-13T15:00:00', SMALL_HOURS)).toBe('2026-09-14');
  });
});

describe('consolidation', () => {
  const db = generateSeed();
  const date = db.locks.at(-1)?.deliveryDate ?? '2026-09-13';
  const matrix = buildConsolidation(db, date);

  it('produces rows for the day being consolidated', () => {
    expect(matrix.rows.length).toBeGreaterThan(0);
    expect(matrix.customers.length).toBeGreaterThan(0);
  });

  it('makes each row total equal the sum of its customer columns', () => {
    for (const row of matrix.rows) {
      const summed = [...row.byCustomer.values()].reduce((s, v) => s + v, 0);
      expect(row.total, `item ${row.item.name}`).toBeCloseTo(summed, 4);
    }
  });

  it('keeps Item + Unit as the unit of consolidation, never merging units', () => {
    const keys = matrix.rows.map((r) => `${r.item.name}|${r.item.unit}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('only counts orders for the requested delivery date', () => {
    expect(matrix.orders.every((o) => o.deliveryDate === date)).toBe(true);
  });

  it('never emits a row with no demand', () => {
    expect(matrix.rows.every((r) => r.total > 0)).toBe(true);
  });
});

describe('sheet splitting for printed consolidation', () => {
  it('never exceeds the column limit', () => {
    const cols = splitEven(Array.from({ length: 40 }, (_, i) => i), 14);
    expect(cols.every((c) => c.length <= 14)).toBe(true);
  });

  it('keeps every column exactly once', () => {
    const list = Array.from({ length: 40 }, (_, i) => i);
    expect(splitEven(list, 14).flat().sort((a, b) => a - b)).toEqual(list);
  });

  it('returns a single sheet when everything fits', () => {
    expect(splitEven([1, 2, 3], 14)).toHaveLength(1);
  });
});

describe('pricing', () => {
  const db = generateSeed();

  it('falls back to the item default when a customer has no special price', () => {
    const item = db.items[0];
    const rate = rateFor(db, 'no-such-customer', item.id, '2026-09-13');
    expect(rate).toBe(item.defaultSellingPrice);
  });

  it('returns a positive rate for every seeded customer-item pair it knows', () => {
    const price = db.prices.find((p) => !p.effectiveTo)!;
    expect(rateFor(db, price.customerId, price.itemId, '2026-09-13')).toBeGreaterThan(0);
  });
});
