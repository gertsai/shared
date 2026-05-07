// SPDX-License-Identifier: Apache-2.0
import { describe, it, expect } from 'vitest';
import { startStandalone } from './standalone';

describe('@gertsai/queue/standalone', () => {
  it('exports startStandalone function', () => {
    expect(typeof startStandalone).toBe('function');
  });

  it('startStandalone returns a handle with shutdown function (empty queues)', async () => {
    // With an empty queues array, createWorker is never invoked, so we never
    // touch BullMQ — verifies the runner shape without requiring Redis.
    const handle = startStandalone({
      queues: [],
      connection: { host: 'localhost', port: 6379 },
    });
    expect(typeof handle.shutdown).toBe('function');
    await expect(handle.shutdown()).resolves.toBeUndefined();
  });
});
