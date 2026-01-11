import { describe, expect, it } from 'vitest';

import { configValidator } from './ConfigValidator';
import type { Redis } from 'ioredis';

describe('ConfigValidator edge cases', () => {
  it('throws when limit is 0', () => {
    expect(() =>
      configValidator.validate({
        timeFrame: 1000,
        limit: 0,
        store: () => ({}) as unknown as Redis,
      }),
    ).toThrow();
  });

  it('throws when timeFrame is 0', () => {
    expect(() =>
      configValidator.validate({
        timeFrame: 0,
        limit: 1,
        store: () => ({}) as unknown as Redis,
      }),
    ).toThrow();
  });
});
