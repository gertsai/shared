// SPDX-License-Identifier: Apache-2.0
import { SessionDestroyedError, ValidationError } from '@gertsai/errors';
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
    // Default errorHandler logs to console.error — must not throw.
    expect(() => session.errorHandler(new Error('boom'))).not.toThrow();
  });

  it('default errorHandler invokes console.error (FR-2)', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const session = new Session(makeOpts());
      const err = new Error('test-error');
      session.errorHandler(err);
      expect(spy).toHaveBeenCalledTimes(1);
      expect(spy).toHaveBeenCalledWith('[gertsai/session] uncaught error:', err);
    } finally {
      spy.mockRestore();
    }
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

  it('rejects after destroy with SessionDestroyedError (EVID-080 H1)', async () => {
    const session = new Session(makeOpts());
    session.$destroy();
    let caught: unknown;
    try {
      await session.token;
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(SessionDestroyedError);
    expect(caught).toBeInstanceOf(Error);
    const err = caught as SessionDestroyedError;
    expect(err.message).toBe('Cannot read token on destroyed session');
    expect(err.details).toEqual({ contextField: 'session' });
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

  it('$setDataAccessUuid throws SessionDestroyedError on a destroyed session', () => {
    const session = new Session(makeOpts());
    session.$destroy();
    let caught: unknown;
    try {
      session.$setDataAccessUuid('x');
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(SessionDestroyedError);
    expect(caught).toBeInstanceOf(Error);
    const err = caught as SessionDestroyedError;
    expect(err.message).toBe('Cannot $setDataAccessUuid on destroyed session');
    expect(err.details).toEqual({ contextField: 'session' });
  });
});

describe('Session — $switchOperator', () => {
  it('emits operator-switched with prev + current and updates state', () => {
    const session = new Session(
      makeOpts({ operatorUuid: 'old', operatorType: 'web' }),
    );
    const next: OperatorRef = { uuid: 'new', type: 'ai' };

    const listener = vi.fn();
    session.on(SESSION_EVENTS.OPERATOR_SWITCHED, listener);

    session.$switchOperator(next);

    expect(session.operatorUuid).toBe('new');
    expect(session.operatorType).toBe('ai');
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith({
      prev: { uuid: 'old', type: 'web' },
      current: next,
    });
  });

  it('throws SessionDestroyedError on a destroyed session', () => {
    const session = new Session(makeOpts());
    session.$destroy();
    let caught: unknown;
    try {
      session.$switchOperator({ uuid: 'x', type: 'web' });
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(SessionDestroyedError);
    expect(caught).toBeInstanceOf(Error);
    const err = caught as SessionDestroyedError;
    expect(err.message).toBe('Cannot $switchOperator on destroyed session');
    expect(err.details).toEqual({ contextField: 'session' });
  });

  // Wave 33.C (EVID-083 W10): input validation prevents silent identity loss.
  it('throws ValidationError when operator.uuid is empty (Wave 33.C / EVID-083 W10)', () => {
    const session = new Session(makeOpts({ operatorUuid: 'before' }));
    let caught: unknown;
    try {
      session.$switchOperator({ uuid: '', type: 'web' });
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(ValidationError);
    const err = caught as ValidationError;
    expect(err.message).toContain('operator.uuid must be a non-empty string');
    // Defensive: rejection MUST be pre-mutation — the operator state is unchanged.
    expect(session.operatorUuid).toBe('before');
  });

  // Wave 33.C (EVID-083 W10): non-empty-string check on operator.type
  // protects downstream OperatorType consumers (audit/telemetry pipelines).
  it('throws ValidationError when operator.type is an empty string (Wave 33.C / EVID-083 W10)', () => {
    const session = new Session(
      makeOpts({ operatorUuid: 'before', operatorType: 'web' }),
    );
    let caught: unknown;
    try {
      session.$switchOperator({
        uuid: 'valid-uuid',
        // Force the runtime check; ts-expect-error narrows the union violation.
        // @ts-expect-error — '' is not a valid OperatorType union member.
        type: '',
      });
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(ValidationError);
    const err = caught as ValidationError;
    expect(err.message).toContain('operator.type must be a non-empty string');
    // State unchanged after rejection.
    expect(session.operatorUuid).toBe('before');
    expect(session.operatorType).toBe('web');
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

  it('subsequent $switchOperator and $setDataAccessUuid throw SessionDestroyedError after destroy', () => {
    const session = new Session(makeOpts());
    session.$destroy();
    expect(() =>
      session.$switchOperator({ uuid: 'x', type: 'web' }),
    ).toThrow(SessionDestroyedError);
    expect(() => session.$setDataAccessUuid('x')).toThrow(
      SessionDestroyedError,
    );
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
