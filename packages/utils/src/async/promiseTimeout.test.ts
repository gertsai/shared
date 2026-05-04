import { describe, expect, it, vi } from 'vitest';
import { promiseTimeout } from './promiseTimeout';

vi.useFakeTimers();

describe('promiseTimeout', () => {
  it('should resolve after the specified time', async () => {
    const ms = 1000;
    const promise = promiseTimeout(ms);

    vi.advanceTimersByTime(ms);

    await expect(promise).resolves.toBeUndefined();
  });
});
