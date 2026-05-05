// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it, vi } from 'vitest';

import { Session } from './Session';
import type {
  AbstractDialog,
  OperatorRef,
  OperatorType,
  SessionOpts,
} from './types';
import { SESSION_EVENTS } from './types';

const makeDialog = (): AbstractDialog => ({
  confirm: vi.fn().mockResolvedValue(true),
  alert: vi.fn(),
  error: vi.fn(),
});

const makeOpts = (overrides: Partial<SessionOpts> = {}): SessionOpts => ({
  operatorUuid: 'op-1',
  operatorType: 'web',
  tokenGetter: vi.fn().mockResolvedValue('test-token'),
  dialog: makeDialog(),
  clientPlatform: 'web',
  clientVersion: '1.0.0',
  ...overrides,
});

describe('Session — construction', () => {
  it('builds with all fields populated', () => {
    const errorHandler = vi.fn();
    const session = new Session(
      makeOpts({
        operatorUuid: 'op-full',
        operatorType: 'ai',
        clientPlatform: 'api',
        clientVersion: '2.5.1',
        errorHandler,
        dataAccessUuid: 'user-42',
      }),
    );

    expect(session.operatorUuid).toBe('op-full');
    expect(session.operatorType).toBe('ai');
    expect(session.clientPlatform).toBe('api');
    expect(session.clientVersion).toBe('2.5.1');
    expect(session.errorHandler).toBe(errorHandler);
    expect(session.dataAccessUuid).toBe('user-42');
    expect(session.destroyed).toBe(false);
  });

  it('builds with minimal fields (no errorHandler, no dataAccessUuid)', () => {
    const session = new Session(makeOpts());

    expect(session.operatorUuid).toBe('op-1');
    expect(session.dataAccessUuid).toBe('op-1'); // fallback
    // Default errorHandler is a no-op function — must not throw.
    expect(() => session.errorHandler(new Error('boom'))).not.toThrow();
  });

  it('exposes the dialog instance unchanged', () => {
    const dialog = makeDialog();
    const session = new Session(makeOpts({ dialog }));
    expect(session.dialog).toBe(dialog);
  });
});

describe('Session — token', () => {
  it('resolves via the injected tokenGetter callback', async () => {
    const tokenGetter = vi.fn().mockResolvedValue('jwt-abc');
    const session = new Session(makeOpts({ tokenGetter }));

    await expect(session.token).resolves.toBe('jwt-abc');
    expect(tokenGetter).toHaveBeenCalledTimes(1);
  });

  it('rejects after destroy with "Session destroyed"', async () => {
    const session = new Session(makeOpts());
    session.$destroy();
    await expect(session.token).rejects.toThrow('Session destroyed');
  });
});

describe('Session — dataAccessUuid scoping', () => {
  it('falls back to operatorUuid when not set', () => {
    const session = new Session(makeOpts({ operatorUuid: 'fallback-op' }));
    expect(session.dataAccessUuid).toBe('fallback-op');
    expect(session.isOperatorScopeOverridden).toBe(false);
  });

  it('returns the explicit override when provided (AI agent on-behalf-of flow)', () => {
    const session = new Session(
      makeOpts({
        operatorUuid: 'bot-99',
        operatorType: 'ai',
        dataAccessUuid: 'human-user-7',
      }),
    );
    expect(session.dataAccessUuid).toBe('human-user-7');
    expect(session.isOperatorScopeOverridden).toBe(true);
  });

  it('isOperatorScopeOverridden is false when override matches operator', () => {
    const session = new Session(
      makeOpts({ operatorUuid: 'same', dataAccessUuid: 'same' }),
    );
    expect(session.isOperatorScopeOverridden).toBe(false);
  });

  it('$setDataAccessUuid mutates state without emitting an event', () => {
    const session = new Session(makeOpts({ operatorUuid: 'op-x' }));
    const listener = vi.fn();
    session.on(SESSION_EVENTS.OPERATOR_SWITCHED, listener);
    session.on(SESSION_EVENTS.DESTROYED, listener);

    session.$setDataAccessUuid('scope-y');
    expect(session.dataAccessUuid).toBe('scope-y');
    expect(session.isOperatorScopeOverridden).toBe(true);

    // Clearing rolls back to operator fallback.
    session.$setDataAccessUuid(undefined);
    expect(session.dataAccessUuid).toBe('op-x');
    expect(session.isOperatorScopeOverridden).toBe(false);

    expect(listener).not.toHaveBeenCalled();
  });

  it('$setDataAccessUuid throws on a destroyed session', () => {
    const session = new Session(makeOpts());
    session.$destroy();
    expect(() => session.$setDataAccessUuid('x')).toThrow(
      /destroyed session/,
    );
  });
});

describe('Session — $switchOperator', () => {
  it('emits operator-switched with prev + current and updates state', () => {
    const session = new Session(
      makeOpts({ operatorUuid: 'old', operatorType: 'web' }),
    );
    const next: OperatorRef = { _uid: 'new', type: 'ai' };

    const listener = vi.fn();
    session.on(SESSION_EVENTS.OPERATOR_SWITCHED, listener);

    session.$switchOperator(next);

    expect(session.operatorUuid).toBe('new');
    expect(session.operatorType).toBe('ai');
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith({
      prev: { _uid: 'old', type: 'web' },
      current: next,
    });
  });

  it('throws on a destroyed session', () => {
    const session = new Session(makeOpts());
    session.$destroy();
    expect(() =>
      session.$switchOperator({ _uid: 'x', type: 'web' }),
    ).toThrow(/destroyed session/);
  });
});

describe('Session — $destroy', () => {
  it('emits destroyed exactly once and removes listeners', () => {
    const session = new Session(makeOpts());
    const destroyedListener = vi.fn();
    const switchedListener = vi.fn();
    session.on(SESSION_EVENTS.DESTROYED, destroyedListener);
    session.on(SESSION_EVENTS.OPERATOR_SWITCHED, switchedListener);

    session.$destroy();
    session.$destroy(); // idempotent

    expect(session.destroyed).toBe(true);
    expect(destroyedListener).toHaveBeenCalledTimes(1);
    // Listeners are detached after destroy — re-emitting must not fire them.
    expect(session.listenerCount(SESSION_EVENTS.DESTROYED)).toBe(0);
    expect(session.listenerCount(SESSION_EVENTS.OPERATOR_SWITCHED)).toBe(0);
  });

  it('subsequent $switchOperator and $setDataAccessUuid throw after destroy', () => {
    const session = new Session(makeOpts());
    session.$destroy();
    expect(() =>
      session.$switchOperator({ _uid: 'x', type: 'web' }),
    ).toThrow();
    expect(() => session.$setDataAccessUuid('x')).toThrow();
  });
});

describe('Session — dialog stub', () => {
  it('confirm/alert/error are callable and reflect mock results', async () => {
    const dialog = makeDialog();
    const session = new Session(makeOpts({ dialog }));

    await expect(session.dialog.confirm('proceed?')).resolves.toBe(true);
    session.dialog.alert('hello');
    session.dialog.error(new Error('oops'));

    expect(dialog.confirm).toHaveBeenCalledWith('proceed?');
    expect(dialog.alert).toHaveBeenCalledWith('hello');
    expect(dialog.error).toHaveBeenCalledTimes(1);
  });
});

describe('Session — OperatorType union coverage', () => {
  it('accepts every member of the OperatorType union', () => {
    const all: OperatorType[] = [
      'web',
      'ios',
      'android',
      'electron',
      'api',
      'ai',
      'bot',
      'mcp',
      'system',
    ];
    for (const type of all) {
      const session = new Session(
        makeOpts({ operatorType: type, clientPlatform: type }),
      );
      expect(session.operatorType).toBe(type);
      expect(session.clientPlatform).toBe(type);
    }
  });
});
