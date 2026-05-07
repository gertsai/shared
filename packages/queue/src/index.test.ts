// SPDX-License-Identifier: Apache-2.0
import { describe, it, expect } from 'vitest';

describe('@gertsai/queue lazy require', () => {
  it('exports createQueue and createWorker', async () => {
    const mod = await import('./index');
    expect(typeof mod.createQueue).toBe('function');
    expect(typeof mod.createWorker).toBe('function');
  });

  it('exports QueuePeerDepMissingError class', async () => {
    const mod = await import('./index');
    expect(mod.QueuePeerDepMissingError).toBeDefined();
    const err = new mod.QueuePeerDepMissingError();
    expect(err.name).toBe('QueuePeerDepMissingError');
    expect(err.message).toMatch(/bullmq/);
    expect(err).toBeInstanceOf(Error);
  });

  it('createQueue produces an object (or throws peer-dep / connection error)', async () => {
    // Either bullmq is installed (devDep present in workspace) and we get a Queue
    // instance — or it is not installed and we hit QueuePeerDepMissingError.
    // Both outcomes are acceptable: the test asserts the lazy mechanism, not Redis.
    const { createQueue, QueuePeerDepMissingError } = await import('./index');
    let queue: unknown;
    let caught: unknown;
    try {
      queue = createQueue('gertsai-queue-test', {
        connection: {
          host: 'invalid-host-that-should-not-exist.example',
          port: 6379,
        },
      });
    } catch (e) {
      caught = e;
    }
    if (caught) {
      const isPeerErr = caught instanceof QueuePeerDepMissingError;
      const isConnErr =
        caught instanceof Error &&
        /connect|ECONNREFUSED|host|getaddrinfo|ENOTFOUND/.test(caught.message);
      expect(isPeerErr || isConnErr).toBe(true);
    } else {
      expect(queue).toBeDefined();
      // Best-effort cleanup so no Redis connection lingers in the test process.
      // Errors here are expected when no Redis is reachable; ignore them.
      void (queue as { close?: () => Promise<void> }).close?.().catch(() => {});
    }
  });
});
