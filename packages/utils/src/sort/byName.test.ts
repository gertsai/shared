import { describe, expect, it } from 'vitest';
import { sortByName } from './byName';
import { SortDirection } from '../types';

describe('sortByName', () => {
  const a = { first_name: 'John', full_name: 'John Doe' };
  const b = { first_name: 'Jane', full_name: 'Jane Doe' };
  const c = { first_name: 'Alex' };
  const d = { full_name: 'Alex' };

  it('should sort by full_name in ascending order by default', () => {
    expect(sortByName(a, b)).toBeGreaterThan(0);
    expect(sortByName(b, a)).toBeLessThan(0);
  });

  it('should sort by first_name in ascending order if full_name is not available', () => {
    expect(sortByName(a, c)).toBeGreaterThan(0);
    expect(sortByName(c, a)).toBeLessThan(0);
  });

  it('should handle missing names gracefully', () => {
    expect(sortByName({}, {})).toBe(0);
    expect(sortByName(a, {})).toBeGreaterThan(0);
    expect(sortByName({}, a)).toBeLessThan(0);
  });

  it('should sort in descending order when specified', () => {
    expect(sortByName(a, b, SortDirection.DESC)).toBeLessThan(0);
    expect(sortByName(b, a, SortDirection.DESC)).toBeGreaterThan(0);
  });

  it('should handle equal names', () => {
    expect(sortByName(a, a)).toBe(0);
    expect(sortByName(c, d)).toBe(0);
  });
});
