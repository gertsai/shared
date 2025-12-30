import { describe, expect, it } from 'vitest';
import { sortByCreatedAt } from './byCreatedAt';

describe('sortByCreatedAt', () => {
  it('should sort objects in ascending order based on the created_at field', () => {
    const a = { created_at: new Date('2023-01-01T00:00:00.000Z') };
    const b = { created_at: new Date('2023-01-02T00:00:00.000Z') };
    const c = { created_at: new Date('2023-01-03T00:00:00.000Z') };

    expect(sortByCreatedAt(a, b)).toBeLessThan(0);
    expect(sortByCreatedAt(b, a)).toBeGreaterThan(0);
    expect(sortByCreatedAt(a, a)).toBe(0);
    expect(sortByCreatedAt(b, c)).toBeLessThan(0);
  });

  it('should handle different types of created_at fields', () => {
    const a = { created_at: new Date('2023-01-01T00:00:00.000Z') };
    const b = { created_at: 1672617600000 }; // Equivalent to 2023-01-02
    const c = {
      created_at: { toDate: () => new Date('2023-01-03T00:00:00.000Z') },
    };

    expect(sortByCreatedAt(a, b as any)).toBeLessThan(0);
    expect(
      sortByCreatedAt(b as any, { created_at: c.created_at.toDate() }),
    ).toBeLessThan(0);
  });
});
