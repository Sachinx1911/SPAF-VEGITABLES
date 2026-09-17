import { describe, expect, it } from 'vitest';
import { generateSeed } from '../../data/seed/generate';
import { QTY_STAGES } from '../../types/models';

/**
 * The quantity chain is the system's central promise: each stage records its own
 * number and never overwrites the one before it. These tests guard that promise
 * against the whole generated dataset, not a handful of hand-picked rows.
 */
describe('quantity chain', () => {
  const db = generateSeed();

  it('gives every order line an ordered quantity', () => {
    expect(db.orderItems.length).toBeGreaterThan(0);
    for (const line of db.orderItems) {
      expect(line.qty.ordered, `line ${line.id}`).not.toBeNull();
    }
  });

  it('carries every stage of the chain on every line', () => {
    for (const line of db.orderItems) {
      for (const stage of QTY_STAGES) {
        expect(line.qty, `line ${line.id} missing ${stage}`).toHaveProperty(stage);
      }
    }
  });

  it('never lets a downstream stage exceed the stage that feeds it', () => {
    const flows: [keyof (typeof db.orderItems)[number]['qty'], keyof (typeof db.orderItems)[number]['qty']][] = [
      ['approved', 'ordered'],
      ['allocated', 'approved'],
      ['packed', 'allocated'],
      ['dispatched', 'packed'],
      ['delivered', 'dispatched'],
      ['customerAccepted', 'delivered'],
    ];
    const broken: string[] = [];
    for (const line of db.orderItems) {
      for (const [downstream, upstream] of flows) {
        const d = line.qty[downstream];
        const u = line.qty[upstream];
        if (d != null && u != null && d > u + 0.0001) {
          broken.push(`${line.id}: ${downstream}=${d} > ${upstream}=${u}`);
        }
      }
    }
    expect(broken).toEqual([]);
  });

  it('never records a negative quantity at any stage', () => {
    const negatives: string[] = [];
    for (const line of db.orderItems) {
      for (const stage of QTY_STAGES) {
        const v = line.qty[stage];
        if (v != null && v < 0) negatives.push(`${line.id}.${stage}=${v}`);
      }
    }
    expect(negatives).toEqual([]);
  });

  it('funnels down the chain — later stages cover no more lines than earlier ones', () => {
    const counted = QTY_STAGES.map((s) => db.orderItems.filter((l) => l.qty[s] != null).length);
    expect(counted[0]).toBe(db.orderItems.length);
    for (let i = 1; i < counted.length; i++) {
      expect(counted[i], `${QTY_STAGES[i]} exceeds ${QTY_STAGES[i - 1]}`).toBeLessThanOrEqual(counted[i - 1]);
    }
  });
});
