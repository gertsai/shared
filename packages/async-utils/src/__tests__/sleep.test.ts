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

  it('Wave 12.D-fix FR-017 — rejects immediately when signal already aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(sleep(1000, controller.signal)).rejects.toBeDefined();
  });

  it('Wave 12.D-fix FR-017 — rejects when signal aborts mid-sleep (no full wait)', async () => {
    const controller = new AbortController();
    const start = Date.now();
    const p = sleep(2000, controller.signal);
    setTimeout(() => controller.abort(), 20);
    await expect(p).rejects.toBeDefined();
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(500);
  });

  it('Wave 12.D-fix FR-017 — propagates signal.reason on abort', async () => {
    const controller = new AbortController();
    const reason = new Error('cancelled');
    const p = sleep(1000, controller.signal);
    setTimeout(() => controller.abort(reason), 10);
    await expect(p).rejects.toBe(reason);
  });

  it('Wave 12.D-fix FR-017 — back-compat: works without signal', async () => {
    const start = Date.now();
    await sleep(20);
    expect(Date.now() - start).toBeGreaterThanOrEqual(15);
  });
});
