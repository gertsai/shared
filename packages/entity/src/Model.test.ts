// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it, vi } from 'vitest';
import { Model } from './Model';
import type { Session } from './types';

class TestModel extends Model {}

// Structural stub — Model only reads `operatorUuid`. The real `Session` class
// from @gertsai/session has many internal fields, but cast-by-shape is fine
// for unit isolation here.
const makeSession = (operatorUuid = 'op-1'): Session =>
  ({
    operatorUuid,
    operatorType: 'test',
  }) as unknown as Session;

describe('Model', () => {
  it('exposes session via $session and operatorUuid via $operatorUuid', () => {
    const session = makeSession('alice');
    const m = new TestModel({ session });
    expect(m.$session).toBe(session);
    expect(m.$operatorUuid).toBe('alice');
  });

  it('returns null for $session and $operatorUuid when none provided', () => {
    const m = new TestModel();
    expect(m.$session).toBeNull();
    expect(m.$operatorUuid).toBeNull();
  });

  it('$destroy emits "destroyed", clears session, and is idempotent', () => {
    const m = new TestModel({ session: makeSession() });
    const handler = vi.fn();
    m.on('destroyed', handler);

    m.$destroy();
    expect(handler).toHaveBeenCalledTimes(1);
    expect(m.$destroyed).toBe(true);
    expect(m.$session).toBeNull();

    m.$destroy(); // second call is a no-op
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('$destroy removes all listeners (later emit does not fire stale handlers)', () => {
    const m = new TestModel({ session: makeSession() });
    const handler = vi.fn();
    m.on('after', handler);

    m.$destroy();
    m.emit('after');
    expect(handler).not.toHaveBeenCalled();
  });

  it('inherits EventEmitter so consumers can on/emit/off custom events', () => {
    const m = new TestModel();
    const handler = vi.fn();
    m.on('greet', handler);
    m.emit('greet', 'hello');
    expect(handler).toHaveBeenCalledWith('hello');
  });
});
