// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import { ValidationError } from '../errors/validation.js';

describe('AppError.toJSON — cycle guard (ADR-006 I-13)', () => {
  it('does not infinite-loop on direct a → b → a cycle', () => {
    const a = new ValidationError({
      message: 'a',
      details: { field: 'fa', constraint: 'c' },
    });
    const b = new ValidationError({
      message: 'b',
      details: { field: 'fb', constraint: 'c' },
      cause: a,
    });
    Object.defineProperty(a, 'cause', { value: b, configurable: true });

    const j = a.toJSON();
    expect(j.kind).toBe('VALIDATION');
    expect(j.message).toBe('a');
    expect(j.cause).toBeDefined();
    const causeB = j.cause as { message?: string; cause?: unknown };
    expect(causeB.message).toBe('b');
    const inner = causeB.cause as { __truncated?: true; reason?: string };
    expect(inner.__truncated).toBe(true);
    expect(inner.reason).toBe('cycle');
  });

  it('handles self-cycle a.cause = a', () => {
    const a = new ValidationError({
      message: 'a',
      details: { field: 'fa', constraint: 'c' },
    });
    Object.defineProperty(a, 'cause', { value: a, configurable: true });

    const j = a.toJSON();
    const truncated = j.cause as { __truncated?: true; reason?: string };
    expect(truncated.__truncated).toBe(true);
    expect(truncated.reason).toBe('cycle');
  });
});
