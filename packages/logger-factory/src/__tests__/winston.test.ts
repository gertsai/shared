// SPDX-License-Identifier: Apache-2.0
import { describe, it, expect, vi } from 'vitest';
import { createWinstonBackend } from '../winston/index.js';

describe('createWinstonBackend — adapter', () => {
  it('routes log calls through the winston-style logger with mapped levels', () => {
    const calls: { level: string; msg: string; meta: unknown }[] = [];
    const fakeWinston = {
      log(level: string, msg: string, meta?: unknown) {
        calls.push({ level, msg, meta });
      },
    };
    const backend = createWinstonBackend(fakeWinston);
    backend.log('info', 'hi', { a: 1 });
    backend.log('warn', 'w', { b: 2 });
    backend.log('error', 'e', {});
    backend.log('fatal', 'f', {});
    backend.log('trace', 't', {});
    backend.log('debug', 'd', {});
    expect(calls.map((c) => c.level)).toEqual([
      'info',
      'warn',
      'error',
      'error',
      'silly',
      'debug',
    ]);
    expect(calls[0]).toEqual({ level: 'info', msg: 'hi', meta: { a: 1 } });
  });
});

describe('createWinstonBackend — peer-dep gate', () => {
  it('throws a clear install error when winston is not resolvable and no instance passed', async () => {
    vi.resetModules();
    vi.doMock('node:module', () => ({
      createRequire: () => () => {
        throw new Error('Cannot find module winston');
      },
    }));
    const mod = await import('../winston/index.js');
    expect(() => mod.createWinstonBackend()).toThrow(
      /@gertsai\/logger-factory\/winston requires "winston" >=3\.0\.0/,
    );
    vi.doUnmock('node:module');
    vi.resetModules();
  });
});
