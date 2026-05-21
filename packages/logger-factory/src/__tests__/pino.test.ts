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

describe('createPinoBackend — pinoOptions passthrough (FR-15)', () => {
  it('passes pinoOptions to the pino factory when no instance is provided', async () => {
    vi.resetModules();
    const fakeLogger = {
      trace: vi.fn(),
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      fatal: vi.fn(),
    };
    const pinoFactory = vi.fn(() => fakeLogger);
    vi.doMock('node:module', () => ({
      createRequire: () => () => pinoFactory,
    }));
    const mod = await import('../pino/index.js');
    const backend = mod.createPinoBackend(undefined, { level: 'warn' });
    expect(pinoFactory).toHaveBeenCalledWith({ level: 'warn' });
    backend.log('warn', 'test', {});
    expect(fakeLogger.warn).toHaveBeenCalledTimes(1);
    vi.doUnmock('node:module');
    vi.resetModules();
  });

  it('factory() with no args still works (backward compat)', async () => {
    vi.resetModules();
    const fakeLogger = {
      trace: vi.fn(),
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      fatal: vi.fn(),
    };
    const pinoFactory = vi.fn(() => fakeLogger);
    vi.doMock('node:module', () => ({
      createRequire: () => () => pinoFactory,
    }));
    const mod = await import('../pino/index.js');
    const backend = mod.createPinoBackend();
    expect(pinoFactory).toHaveBeenCalledWith(undefined);
    expect(backend).toBeDefined();
    vi.doUnmock('node:module');
    vi.resetModules();
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
