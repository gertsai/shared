import { describe, expect, it } from 'vitest';
import { sortByUpdatedAt } from './byUpdatedAt';

describe('sortByUpdatedAt', () => {
  it('should sort objects in ascending order based on the updated_at field', () => {
    const a = { updated_at: new Date('2023-01-01T00:00:00.000Z') };
    const b = { updated_at: new Date('2023-01-02T00:00:00.000Z') };
    const c = {
      updated_at: { toDate: () => new Date('2023-01-03T00:00:00.000Z') },
    };

    expect(sortByUpdatedAt(a, b)).toBeLessThan(0);
    expect(sortByUpdatedAt(b, a)).toBeGreaterThan(0);
    expect(sortByUpdatedAt(a, a)).toBe(0);
    expect(
      sortByUpdatedAt(b, { updated_at: c.updated_at.toDate() }),
    ).toBeLessThan(0);
  });

  it('should handle different types of updated_at fields', () => {
    const a = { updated_at: new Date('2023-01-01T00:00:00.000Z') };
    const b = { updated_at: 1672617600000 }; // Equivalent to 2023-01-02
    const c = {
      updated_at: { toDate: () => new Date('2023-01-03T00:00:00.000Z') },
    };

    expect(sortByUpdatedAt(a, b as any)).toBeLessThan(0);
    expect(
      sortByUpdatedAt(b as any, { updated_at: c.updated_at.toDate() }),
    ).toBeLessThan(0);
  });
});
