// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';

import {
  assertAuthenticated,
  assertHasDataAccessUuid,
  assertNotDestroyed,
  assertOperatorType,
  assertSessionInTenant,
} from '../assertions.js';
import {
  AuthenticationRequiredError,
  DataAccessUuidMissingError,
  OperatorTypeMismatchError,
  SessionDestroyedError,
  TenantScopeViolationError,
} from '../errors.js';
import { makeSession } from './test-helpers.js';

describe('assertAuthenticated', () => {
  it('passes for a fresh session', () => {
    const session = makeSession();
    expect(() => assertAuthenticated(session)).not.toThrow();
  });

  it('throws AuthenticationRequiredError on undefined (NOT DataAccessUuidMissingError per Amendment 1.1.2)', () => {
    expect(() => assertAuthenticated(undefined)).toThrow(
      AuthenticationRequiredError,
    );
    // Negative — must not be the scoping error.
    try {
      assertAuthenticated(undefined);
    } catch (err) {
      expect(err).not.toBeInstanceOf(DataAccessUuidMissingError);
    }
  });

  it('throws on null', () => {
    expect(() => assertAuthenticated(null)).toThrow(
      AuthenticationRequiredError,
    );
  });

  it('throws on a destroyed session', () => {
    const session = makeSession();
    session.$destroy();
    expect(() => assertAuthenticated(session)).toThrow(
      AuthenticationRequiredError,
    );
  });

  it('narrows the type after the assertion', () => {
    const session = makeSession();
    const maybe: typeof session | undefined = session;
    assertAuthenticated(maybe);
    // Should compile — narrowed to Session.
    expect(maybe.operatorUuid).toBe('op-1');
  });
});

describe('assertHasDataAccessUuid', () => {
  it('passes when dataAccessUuid is non-empty', () => {
    const session = makeSession({
      operatorUuid: 'op-1',
      dataAccessUuid: 'data-2',
    });
    expect(() => assertHasDataAccessUuid(session)).not.toThrow();
  });

  it('passes when dataAccessUuid falls back to operatorUuid (non-empty)', () => {
    const session = makeSession({ operatorUuid: 'op-1' });
    // getter returns operatorUuid since override unset → 'op-1'.
    expect(() => assertHasDataAccessUuid(session)).not.toThrow();
  });

  it('throws DataAccessUuidMissingError on empty-string scope', () => {
    const session = makeSession({ operatorUuid: 'op-1' });
    session.$setDataAccessUuid('');
    expect(() => assertHasDataAccessUuid(session)).toThrow(
      DataAccessUuidMissingError,
    );
  });
});

describe('assertOperatorType', () => {
  it('passes when actual is in the allowed varargs', () => {
    const session = makeSession({ operatorType: 'cli' });
    expect(() => assertOperatorType(session, 'web', 'cli', 'api')).not.toThrow();
  });

  it('throws OperatorTypeMismatchError on mismatch', () => {
    const session = makeSession({ operatorType: 'bot' });
    expect(() => assertOperatorType(session, 'web', 'api')).toThrow(
      OperatorTypeMismatchError,
    );
  });

  it('error carries expected list and actual type', () => {
    const session = makeSession({ operatorType: 'bot' });
    try {
      assertOperatorType(session, 'web', 'api');
      expect.fail('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(OperatorTypeMismatchError);
      const mismatch = err as OperatorTypeMismatchError;
      expect(mismatch.details.expected).toEqual(['web', 'api']);
      expect(mismatch.details.actual).toBe('bot');
    }
  });
});

describe('assertSessionInTenant', () => {
  it('passes on tenant match', () => {
    const session = makeSession({ tenantId: 't-1' });
    expect(() => assertSessionInTenant(session, 't-1')).not.toThrow();
  });

  it('throws TenantScopeViolationError on mismatch', () => {
    const session = makeSession({ tenantId: 't-1' });
    expect(() => assertSessionInTenant(session, 't-2')).toThrow(
      TenantScopeViolationError,
    );
  });

  it('throws when session.tenantId is undefined (ADR-007 I-18)', () => {
    const session = makeSession();
    expect(() => assertSessionInTenant(session, 't-1')).toThrow(
      TenantScopeViolationError,
    );
  });

  it('error details include sessionTenant=<undefined> sentinel when tenant unset', () => {
    const session = makeSession();
    try {
      assertSessionInTenant(session, 't-1');
      expect.fail('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(TenantScopeViolationError);
      const tenant = err as TenantScopeViolationError;
      expect(tenant.details.requested).toBe('t-1');
      expect(tenant.details.sessionTenant).toBe('<undefined>');
    }
  });
});

describe('assertNotDestroyed', () => {
  it('passes on a fresh session', () => {
    const session = makeSession();
    expect(() => assertNotDestroyed(session)).not.toThrow();
  });

  it('throws SessionDestroyedError after destroy', () => {
    const session = makeSession();
    session.$destroy();
    expect(() => assertNotDestroyed(session)).toThrow(SessionDestroyedError);
  });
});
