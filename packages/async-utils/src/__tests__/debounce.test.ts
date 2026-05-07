// SPDX-License-Identifier: Apache-2.0
import { describe, it, expect, vi } from 'vitest';
import { debounce } from '../debounce.js';
import { sleep } from '../sleep.js';

describe('debounce', () => {
  it('invokes only after wait period of inactivity', async () => {
    const fn = vi.fn<(x: number) => void>();
    const d = debounce(fn, 30);

    d(1);
    d(2);
    d(3);
    expect(fn).not.toHaveBeenCalled();

    await sleep(60);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith(3);
  });

  it('cancel() prevents pending invocation', async () => {
    const fn = vi.fn();
    const d = debounce(fn, 20);
    d('x');
    d.cancel();
    await sleep(40);
    expect(fn).not.toHaveBeenCalled();
  });

  it('flush() invokes immediately if pending', async () => {
    const fn = vi.fn<(x: string) => void>();
    const d = debounce(fn, 100);
    d('hello');
    d.flush();
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith('hello');
    await sleep(120);
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
