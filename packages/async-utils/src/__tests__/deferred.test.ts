// SPDX-License-Identifier: Apache-2.0
import { describe, it, expect } from 'vitest';
import { defer } from '../deferred.js';

describe('defer', () => {
  it('resolves externally', async () => {
    const d = defer<number>();
    setTimeout(() => d.resolve(7), 10);
    await expect(d.promise).resolves.toBe(7);
  });

  it('rejects externally', async () => {
    const d = defer<number>();
    setTimeout(() => d.reject(new Error('boom')), 10);
    await expect(d.promise).rejects.toThrow('boom');
  });
});
