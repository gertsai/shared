// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it, vi, beforeEach } from 'vitest';

import { createQueueServiceMethods } from './methods';
import type { BullMQConnectionOptions } from './types';

// Mock BullMQ Queue at module level. The factory builds methods that call
// `new Queue(...)`; we replace the Queue constructor so the smoke tests
// don't need a real Redis.
vi.mock('bullmq', () => {
  return {
    Queue: vi.fn().mockImplementation((name: string, opts: unknown) => ({
      name,
      __opts: opts,
      add: vi.fn().mockImplementation((jobName: string, payload: unknown, options: unknown) =>
        Promise.resolve({ id: 'job-1', name: jobName, data: payload, opts: options }),
      ),
      close: vi.fn().mockResolvedValue(undefined),
    })),
  };
});

const fakeConnection: BullMQConnectionOptions = {
  connection: { host: 'localhost', port: 6379 },
};

describe('createQueueServiceMethods', () => {
  let methods: ReturnType<typeof createQueueServiceMethods>;
  let mockService: { $queues: Record<string, unknown> };

  beforeEach(() => {
    methods = createQueueServiceMethods(fakeConnection);
    mockService = { $queues: {} };
  });

  it('returns an empty record when queueConfig is undefined', () => {
    const empty = createQueueServiceMethods(undefined);
    expect(Object.keys(empty)).toHaveLength(0);
  });

  it('returns getQueue + addJob when queueConfig is provided', () => {
    expect(typeof methods.getQueue).toBe('function');
    expect(typeof methods.addJob).toBe('function');
  });

  it('getQueue memoizes a Queue per name on service.$queues', () => {
    // oxlint-disable-next-line @typescript-eslint/no-explicit-any
    const getQueue = methods.getQueue as (this: any, name: string) => any;
    const q1 = getQueue.call(mockService, 'orders');
    const q2 = getQueue.call(mockService, 'orders');
    const q3 = getQueue.call(mockService, 'emails');

    expect(q1).toBe(q2); // cached
    expect(q1).not.toBe(q3); // different queue
    expect(Object.keys(mockService.$queues).sort()).toEqual(['emails', 'orders']);
  });

  it('addJob delegates to the queue.add() with sensible defaults', async () => {
    // oxlint-disable-next-line @typescript-eslint/no-explicit-any
    const getQueue = methods.getQueue as (this: any, name: string) => any;
    // oxlint-disable-next-line @typescript-eslint/no-explicit-any
    const addJob = methods.addJob as (
      // oxlint-disable-next-line @typescript-eslint/no-explicit-any
      this: any,
      name: string,
      jobName: string,
      // oxlint-disable-next-line @typescript-eslint/no-explicit-any
      payload: any,
      // oxlint-disable-next-line @typescript-eslint/no-explicit-any
      opts: any,
    ) => Promise<unknown>;

    // Bind so this.getQueue resolves to the cached factory
    const ctx = { ...mockService, getQueue: getQueue.bind(mockService) };
    const job = (await addJob.call(ctx, 'orders', '', null, null)) as {
      name: string;
      data: unknown;
      opts: unknown;
    };

    expect(job.name).toBe('*'); // empty jobName falls back to '*'
    expect(job.data).toEqual({}); // null payload coerces to {}
    expect(job.opts).toEqual({}); // null opts coerces to {}
  });
});
