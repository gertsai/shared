// SPDX-License-Identifier: Apache-2.0
/**
 * Amendment 1.2.6 — child PII isolation (CWE-200).
 * - parent.setLevel does not affect child level.
 * - child baseContext is a frozen shallow copy: parent context mutations
 *   do not propagate.
 */
import { describe, it, expect } from 'vitest';
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

describe('child isolation — Amendment 1.2.6', () => {
  it('parent.setLevel after child does not affect child level', () => {
    const backend = spyBackend();
    const parent = createLogger({ level: 'info', backend });
    const child = parent.child({ feature: 'x' });
    expect(child.getLevel()).toBe('info');

    parent.setLevel('error');
    expect(parent.getLevel()).toBe('error');
    // Child's independent state is unchanged.
    expect(child.getLevel()).toBe('info');

    backend.calls.length = 0;
    child.info('msg-from-child');
    expect(backend.calls).toHaveLength(1);
  });

  it('child baseContext is frozen shallow copy', () => {
    const parent = createLogger({
      level: 'trace',
      baseContext: { service: 'api' },
    });
    const child = parent.child({ requestId: 'abc' });
    // Calling info should not throw despite the frozen base context.
    expect(() => child.info('hi', { extra: 1 })).not.toThrow();
  });

  it('extra context passed at log time does not mutate baseContext', () => {
    const backend = spyBackend();
    const baseContext = { service: 'api' };
    const logger = createLogger({ level: 'trace', backend, baseContext });
    logger.info('one', { requestId: 'r1' });
    logger.info('two');
    expect(backend.calls[0]!.ctx).toEqual({
      service: 'api',
      requestId: 'r1',
    });
    expect(backend.calls[1]!.ctx).toEqual({ service: 'api' });
  });
});
