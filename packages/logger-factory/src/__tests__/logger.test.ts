// SPDX-License-Identifier: Apache-2.0
import { describe, it, expect, vi } from 'vitest';
import { createLogger } from '../logger.js';
import type { LoggerBackend, LogLevel, LogContext } from '../logger.js';

function spyBackend(): LoggerBackend & {
  calls: { level: LogLevel; msg: string; ctx: LogContext }[];
} {
  const calls: { level: LogLevel; msg: string; ctx: LogContext }[] = [];
  return {
    calls,
    log(level, msg, ctx) {
      calls.push({ level, msg, ctx });
    },
  };
}

describe('createLogger — 6 levels', () => {
  it('emits at every level when level=trace', () => {
    const backend = spyBackend();
    const logger = createLogger({ level: 'trace', backend });
    logger.trace('t');
    logger.debug('d');
    logger.info('i');
    logger.warn('w');
    logger.error('e');
    logger.fatal('f');
    expect(backend.calls.map((c) => c.level)).toEqual([
      'trace',
      'debug',
      'info',
      'warn',
      'error',
      'fatal',
    ]);
  });

  it('filters out lower-priority levels', () => {
    const backend = spyBackend();
    const logger = createLogger({ level: 'warn', backend });
    logger.trace('t');
    logger.debug('d');
    logger.info('i');
    logger.warn('w');
    logger.error('e');
    logger.fatal('f');
    expect(backend.calls.map((c) => c.level)).toEqual([
      'warn',
      'error',
      'fatal',
    ]);
  });
});

describe('createLogger — child', () => {
  it('child returns a new Logger merging baseContext', () => {
    const backend = spyBackend();
    const parent = createLogger({
      level: 'trace',
      backend,
      baseContext: { service: 'api' },
    });
    const child = parent.child({ requestId: 'abc' });
    child.info('hello');
    expect(backend.calls).toHaveLength(1);
    expect(backend.calls[0]!.ctx).toEqual({ service: 'api', requestId: 'abc' });
  });
});

describe('createLogger — setLevel / getLevel', () => {
  it('changes the current filter', () => {
    const backend = spyBackend();
    const logger = createLogger({ level: 'info', backend });
    expect(logger.getLevel()).toBe('info');
    logger.debug('d');
    expect(backend.calls).toHaveLength(0);
    logger.setLevel('debug');
    expect(logger.getLevel()).toBe('debug');
    logger.debug('d2');
    expect(backend.calls).toHaveLength(1);
  });
});

describe('createLogger — redaction (default-on per ADR-009 I-17)', () => {
  it('redacts REDACTION_KEYS without consumer opt-in', () => {
    const backend = spyBackend();
    const logger = createLogger({ level: 'trace', backend });
    logger.info('msg', { password: 'secret', userId: 42 });
    expect(backend.calls[0]!.ctx).toEqual({
      password: '[REDACTED]',
      userId: 42,
    });
  });

  it('extends defaults — consumer redact union with REDACTION_KEYS', () => {
    const backend = spyBackend();
    const logger = createLogger({
      level: 'trace',
      backend,
      redact: ['custom_field'],
    });
    logger.info('msg', {
      token: 'aaa',
      custom_field: 'bbb',
      userId: 1,
    });
    expect(backend.calls[0]!.ctx).toEqual({
      token: '[REDACTED]',
      custom_field: '[REDACTED]',
      userId: 1,
    });
  });

  it('case-insensitive matching for redacted keys', () => {
    const backend = spyBackend();
    const logger = createLogger({ level: 'trace', backend });
    logger.info('msg', { Password: 'x', AUTHORIZATION: 'y', other: 'z' });
    expect(backend.calls[0]!.ctx).toEqual({
      Password: '[REDACTED]',
      AUTHORIZATION: '[REDACTED]',
      other: 'z',
    });
  });

  it('redacts in baseContext too', () => {
    const backend = spyBackend();
    const logger = createLogger({
      level: 'trace',
      backend,
      baseContext: { secret: 'base-secret', service: 'api' },
    });
    logger.info('msg');
    expect(backend.calls[0]!.ctx).toEqual({
      secret: '[REDACTED]',
      service: 'api',
    });
  });

  // Wave 12.D-fix (PRD-036 FR-006): logger-factory delegates to
  // `@gertsai/errors#redactDetails` so nested credential keys no longer
  // leak through the top-level shallow scan.
  it('redacts NESTED credential keys (deep scan via redactDetails)', () => {
    const backend = spyBackend();
    const logger = createLogger({ level: 'trace', backend });
    logger.info('msg', { user: { password: 'p', name: 'kept' }, requestId: 'r1' });
    const ctx = backend.calls[0]!.ctx as Record<string, unknown>;
    const user = ctx.user as Record<string, unknown>;
    expect(user.password).toBe('[REDACTED]');
    expect(user.name).toBe('kept');
    expect(ctx.requestId).toBe('r1');
  });

  // Wave 12.D-fix (PRD-036 FR-007): expansion auto-inherits from
  // `@gertsai/errors` REDACTION_KEYS — logger-factory does not need a
  // local update.
  it('redacts FR-007 expanded keys (apiToken / sessionId / x-api-key)', () => {
    const backend = spyBackend();
    const logger = createLogger({ level: 'trace', backend });
    logger.info('msg', {
      apiToken: 't1',
      sessionId: 's1',
      'x-api-key': 'k1',
      jwt: 'j1',
      keep: 'ok',
    });
    expect(backend.calls[0]!.ctx).toEqual({
      apiToken: '[REDACTED]',
      sessionId: '[REDACTED]',
      'x-api-key': '[REDACTED]',
      jwt: '[REDACTED]',
      keep: 'ok',
    });
  });
});

describe('createLogger — backend pluggable', () => {
  it('uses the supplied backend', () => {
    const backend = { log: vi.fn() };
    const logger = createLogger({ level: 'trace', backend });
    logger.warn('hi');
    expect(backend.log).toHaveBeenCalledWith('warn', 'hi', {});
  });
});
