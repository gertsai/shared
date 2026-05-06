// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import type { SerializedAppError } from '../serialize.js';
import { ValidationError } from '../errors/validation.js';

describe('AppError.toJSON — depth guard (ADR-006 I-13)', () => {
  it('truncates at depth 5 on a chain of 7 errors', () => {
    let prev: ValidationError | undefined;
    const chain: ValidationError[] = [];
    for (let i = 0; i < 7; i++) {
      const err = new ValidationError({
        message: `lvl${i}`,
        details: { field: `f${i}`, constraint: 'c' },
        cause: prev,
      });
      chain.push(err);
      prev = err;
    }
    const top = chain[chain.length - 1]!;
    const j = top.toJSON();

    let cursor: SerializedAppError['cause'] | SerializedAppError = j;
    let depth = 0;
    while (cursor !== undefined && !(cursor as { __truncated?: true }).__truncated) {
      depth++;
      const next = (cursor as SerializedAppError).cause;
      if (next === undefined) break;
      cursor = next;
    }

    const truncated = cursor as { __truncated?: true; reason?: string } | undefined;
    expect(truncated?.__truncated).toBe(true);
    expect(truncated?.reason).toBe('depth-exceeded');
    expect(depth).toBeLessThanOrEqual(7);
  });
});
