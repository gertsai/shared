// SPDX-License-Identifier: Apache-2.0
import { describe, it, expect } from 'vitest';
import { sleep } from '../sleep.js';

describe('sleep', () => {
  it('resolves after the specified delay (≥ ms)', async () => {
    const start = Date.now();
    await sleep(30);
    const elapsed = Date.now() - start;
    expect(elapsed).toBeGreaterThanOrEqual(25);
  });
});
