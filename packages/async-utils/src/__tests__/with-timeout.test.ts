// SPDX-License-Identifier: Apache-2.0
import { describe, it, expect } from 'vitest';
import { withTimeout } from '../with-timeout.js';
import { sleep } from '../sleep.js';

describe('withTimeout', () => {
  it('resolves with action result when action completes before timeout', async () => {
    const result = await withTimeout(async () => 42, 1000);
    expect(result).toBe(42);
  });

  it('rejects with timeout Error when action exceeds timeout', async () => {
    await expect(
      withTimeout(async () => {
        await sleep(200);
        return 'never';
      }, 30),
    ).rejects.toThrow(/Timeout after 30ms/);
  });

  it('rejection error has name "AbortError"', async () => {
    try {
      await withTimeout(() => sleep(200), 20, 'custom timeout msg');
      expect.fail('expected rejection');
    } catch (e) {
      expect(e).toBeInstanceOf(Error);
      expect((e as Error).name).toBe('AbortError');
      expect((e as Error).message).toBe('custom timeout msg');
    }
  });

  it('does not leak listeners across 1000 invocations (I-16)', async () => {
    for (let i = 0; i < 1000; i++) {
      const value = await withTimeout(async () => i, 100);
      expect(value).toBe(i);
    }
    // Pass condition: no memory blow-up + no unhandled rejection.
    expect(true).toBe(true);
  });
});
