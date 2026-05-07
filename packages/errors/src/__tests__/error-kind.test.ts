// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import { ErrorKind } from '../error-kind.js';

describe('ErrorKind', () => {
  it('exposes exactly 10 closed values', () => {
    const keys = Object.keys(ErrorKind).toSorted();
    expect(keys).toEqual([
      'BAD_GATEWAY',
      'CONFLICT',
      'FORBIDDEN',
      'INTERNAL',
      'NOT_FOUND',
      'RATE_LIMITED',
      'TIMEOUT',
      'UNAUTHORIZED',
      'UPSTREAM_FAILURE',
      'VALIDATION',
    ]);
    expect(keys.length).toBe(10);
  });

  it('every value matches its key (string-only union)', () => {
    for (const [key, value] of Object.entries(ErrorKind)) {
      expect(value).toBe(key);
      expect(typeof value).toBe('string');
    }
  });

  it('is a frozen object literal (compile-time `as const`)', () => {
    expect(ErrorKind.VALIDATION).toBe('VALIDATION');
    expect(ErrorKind.NOT_FOUND).toBe('NOT_FOUND');
  });
});
