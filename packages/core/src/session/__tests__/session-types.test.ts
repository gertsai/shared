/**
 * Regression tests for EVID-059 H-3 — createRequestMeta spread-after-literal.
 *
 * Before the fix, `createRequestMeta(id, plat, { timeout: undefined })` would
 * silently overwrite the defaulted `timeout` with `undefined`, causing
 * downstream `if (timeout > 0)` schedulers to no-op invisibly.
 */
import { describe, expect, it } from 'vitest';

import { DEFAULT_TIMEOUT, createRequestMeta } from '../types';

describe('createRequestMeta — H-3 spread-after-literal regression', () => {
  it('applies DEFAULT_TIMEOUT when options is empty', () => {
    const meta = createRequestMeta('req-1', 'web');
    expect(meta.timeout).toBe(DEFAULT_TIMEOUT);
    expect(meta.requestId).toBe('req-1');
    expect(meta.clientPlatform).toBe('web');
    expect(meta.startedAt).toBeInstanceOf(Date);
  });

  it('does NOT overwrite default timeout when caller passes { timeout: undefined }', () => {
    // The bug pattern: `{ timeout: options.timeout ?? DEFAULT, ...options }`
    // expanded to `{ timeout: DEFAULT, ...{ timeout: undefined } }` which
    // resolves to `{ timeout: undefined }`. Verify this no longer happens.
    const meta = createRequestMeta('req-2', 'api', { timeout: undefined });
    expect(meta.timeout).toBe(DEFAULT_TIMEOUT);
    expect(meta.timeout).not.toBeUndefined();
  });

  it('does NOT overwrite default startedAt when caller passes { startedAt: undefined }', () => {
    const meta = createRequestMeta('req-3', 'web', { startedAt: undefined });
    expect(meta.startedAt).toBeInstanceOf(Date);
  });

  it('honours explicit non-undefined timeout', () => {
    const meta = createRequestMeta('req-4', 'web', { timeout: 5000 });
    expect(meta.timeout).toBe(5000);
  });

  it('honours explicit timeout = 0 (callers can disable the scheduler)', () => {
    const meta = createRequestMeta('req-5', 'web', { timeout: 0 });
    // Per RequestMeta semantics, downstream `if (timeout > 0)` then skips
    // the abort scheduler. We must not coerce explicit 0 into the default.
    expect(meta.timeout).toBe(0);
  });

  it('honours explicit startedAt', () => {
    const fixed = new Date('2024-01-01T00:00:00Z');
    const meta = createRequestMeta('req-6', 'web', { startedAt: fixed });
    expect(meta.startedAt).toBe(fixed);
  });

  it('preserves additional optional fields from options', () => {
    const meta = createRequestMeta('req-7', 'web', {
      traceId: 'trace-1',
      spanId: 'span-1',
      clientVersion: '1.0.0',
      timeout: undefined, // explicit undefined alongside other fields
    });
    expect(meta.timeout).toBe(DEFAULT_TIMEOUT);
    expect(meta.traceId).toBe('trace-1');
    expect(meta.spanId).toBe('span-1');
    expect(meta.clientVersion).toBe('1.0.0');
  });
});
