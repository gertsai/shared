// SPDX-License-Identifier: Apache-2.0
/**
 * Wave 12.C-fix-2 (FR-008) — verify createWorker omits undefined connection
 * fields (password, db) and undefined concurrency from the constructed
 * BullMQ options, mirroring the createQueue conditional-spread pattern.
 *
 * Uses the `__setBullmqLoaderForTesting` seam to substitute a stub bullmq
 * module so we can inspect the constructor args without booting Redis.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createWorker, __setBullmqLoaderForTesting } from './index';

interface BullmqStub {
  readonly Queue: new (name: string, opts: Record<string, unknown>) => unknown;
  readonly Worker: new (
    name: string,
    processor: (job: unknown) => Promise<unknown>,
    opts: Record<string, unknown>,
  ) => unknown;
}

const captured: { opts?: Record<string, unknown> } = {};

function makeStub(): BullmqStub {
  return {
    Queue: class {
      public readonly name: string;
      constructor(name: string, _opts: Record<string, unknown>) {
        this.name = name;
      }
      async close(): Promise<void> {
        return undefined;
      }
    },
    Worker: class {
      public readonly name: string;
      constructor(
        name: string,
        _proc: (job: unknown) => Promise<unknown>,
        opts: Record<string, unknown>,
      ) {
        this.name = name;
        captured.opts = opts;
      }
      async close(): Promise<void> {
        return undefined;
      }
      on(): this {
        return this;
      }
    },
  };
}

describe('createWorker conditional-spread (FR-008)', () => {
  beforeEach(() => {
    captured.opts = undefined;
    const stub = makeStub();
    __setBullmqLoaderForTesting(() => stub);
  });

  afterEach(() => {
    __setBullmqLoaderForTesting(null);
  });

  it('omits password and db when undefined (mirrors createQueue pattern)', () => {
    createWorker('w', async () => undefined, {
      connection: { host: 'x', port: 6379 },
    });
    expect(captured.opts).toBeDefined();
    const conn = (captured.opts as { connection: Record<string, unknown> }).connection;
    expect(conn.host).toBe('x');
    expect(conn.port).toBe(6379);
    expect('password' in conn).toBe(false);
    expect('db' in conn).toBe(false);
    expect('concurrency' in (captured.opts as Record<string, unknown>)).toBe(false);
  });

  it('includes password, db and concurrency when provided', () => {
    createWorker('w', async () => undefined, {
      connection: { host: 'x', port: 6379, password: 'secret', db: 2 },
      concurrency: 4,
    });
    expect(captured.opts).toBeDefined();
    const conn = (captured.opts as { connection: Record<string, unknown> }).connection;
    expect(conn.password).toBe('secret');
    expect(conn.db).toBe(2);
    expect((captured.opts as { concurrency?: number }).concurrency).toBe(4);
  });
});
