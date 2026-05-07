// SPDX-License-Identifier: Apache-2.0
import { describe, it, expect, vi } from 'vitest';
import { createPinoBackend } from '../pino/index.js';

describe('createPinoBackend — adapter', () => {
  it('passes through to the supplied pino instance for each level', () => {
    const calls: { level: string; ctx: unknown; msg: string | undefined }[] = [];
    const fakePino = {
      trace: vi.fn((ctx: unknown, msg?: string) => {
        calls.push({ level: 'trace', ctx, msg });
      }),
      debug: vi.fn((ctx: unknown, msg?: string) => {
        calls.push({ level: 'debug', ctx, msg });
      }),
      info: vi.fn((ctx: unknown, msg?: string) => {
        calls.push({ level: 'info', ctx, msg });
      }),
      warn: vi.fn((ctx: unknown, msg?: string) => {
        calls.push({ level: 'warn', ctx, msg });
      }),
      error: vi.fn((ctx: unknown, msg?: string) => {
        calls.push({ level: 'error', ctx, msg });
      }),
      fatal: vi.fn((ctx: unknown, msg?: string) => {
        calls.push({ level: 'fatal', ctx, msg });
      }),
    };
    const backend = createPinoBackend(fakePino);
    backend.log('info', 'hello', { a: 1 });
    backend.log('error', 'oops', { e: 'x' });
    expect(calls).toEqual([
      { level: 'info', ctx: { a: 1 }, msg: 'hello' },
      { level: 'error', ctx: { e: 'x' }, msg: 'oops' },
    ]);
  });
});

describe('createPinoBackend — peer-dep gate', () => {
  it('throws a clear install error when pino is not resolvable and no instance passed', async () => {
    // Re-import with mocked createRequire so the dynamic require throws.
    vi.resetModules();
    vi.doMock('node:module', () => ({
      createRequire: () => () => {
        throw new Error('Cannot find module pino');
      },
    }));
    const mod = await import('../pino/index.js');
    expect(() => mod.createPinoBackend()).toThrow(
      /@gertsai\/logger-factory\/pino requires "pino" >=8\.0\.0/,
    );
    vi.doUnmock('node:module');
    vi.resetModules();
  });
});
