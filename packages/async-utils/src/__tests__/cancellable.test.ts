// SPDX-License-Identifier: Apache-2.0
import { describe, it, expect } from 'vitest';
import { makeCancellable } from '../cancellable.js';

describe('makeCancellable', () => {
  it('returns AbortSignal that fires on cancel()', () => {
    const c = makeCancellable();
    expect(c.signal.aborted).toBe(false);
    c.cancel();
    expect(c.signal.aborted).toBe(true);
  });

  it('cancel() preserves reason on signal', () => {
    const c = makeCancellable();
    const reason = new Error('user canceled');
    c.cancel(reason);
    expect(c.signal.aborted).toBe(true);
    expect(c.signal.reason).toBe(reason);
  });
});
