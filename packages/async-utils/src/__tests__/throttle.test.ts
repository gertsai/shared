// SPDX-License-Identifier: Apache-2.0
import { describe, it, expect, vi } from 'vitest';
import { throttle } from '../throttle.js';
import { sleep } from '../sleep.js';

describe('throttle', () => {
  it('limits invocation to once per period (leading + trailing)', async () => {
    const fn = vi.fn<(x: number) => void>();
    const t = throttle(fn, 30);

    t(1); // leading-edge invoke
    t(2);
    t(3);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenLastCalledWith(1);

    await sleep(60);
    // trailing invocation with last args
    expect(fn).toHaveBeenCalledTimes(2);
    expect(fn).toHaveBeenLastCalledWith(3);
  });

  it('cancel() clears any pending trailing invocation', async () => {
    const fn = vi.fn<(x: string) => void>();
    const t = throttle(fn, 30);
    t('a');
    t('b');
    t.cancel();
    await sleep(50);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith('a');
  });
});
