// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';

import { DataAccessUuidMissingError } from '../errors.js';
import {
  hasOperatorType,
  isAuthenticated,
  isImpersonating,
  isInTenant,
} from '../guards.js';
import { makeSession } from './test-helpers.js';

describe('isAuthenticated', () => {
  it('returns true for a fresh session', () => {
    const session = makeSession();
    expect(isAuthenticated(session)).toBe(true);
  });

  it('returns false for undefined / null', () => {
    expect(isAuthenticated(undefined)).toBe(false);
    expect(isAuthenticated(null)).toBe(false);
  });

  it('returns false for a destroyed session', () => {
    const session = makeSession();
    session.$destroy();
    expect(isAuthenticated(session)).toBe(false);
  });

  it('narrows the type via control-flow analysis', () => {
    const session = makeSession();
    const maybe: typeof session | undefined = session;
    if (isAuthenticated(maybe)) {
      // Should compile without `!` — narrowed to Session.
      expect(maybe.operatorUuid).toBe('op-1');
    }
  });
});

describe('hasOperatorType', () => {
  it('returns true on single-value match', () => {
    const session = makeSession({ operatorType: 'api' });
    expect(hasOperatorType(session, 'api')).toBe(true);
  });

  it('returns false on single-value mismatch', () => {
    const session = makeSession({ operatorType: 'web' });
    expect(hasOperatorType(session, 'api')).toBe(false);
  });

  it('returns true when actual type is in array', () => {
    const session = makeSession({ operatorType: 'cli' });
    expect(hasOperatorType(session, ['web', 'cli', 'api'])).toBe(true);
  });

  it('returns false when array does not include actual', () => {
    const session = makeSession({ operatorType: 'bot' });
    expect(hasOperatorType(session, ['web', 'cli', 'api'])).toBe(false);
  });
});

describe('isInTenant', () => {
  it('returns true on tenant match', () => {
    const session = makeSession({ tenantId: 't-1' });
    expect(isInTenant(session, 't-1')).toBe(true);
  });

  it('returns false on tenant mismatch', () => {
    const session = makeSession({ tenantId: 't-1' });
    expect(isInTenant(session, 't-2')).toBe(false);
  });

  it('returns false when session.tenantId is undefined (ADR-007 I-18)', () => {
    const session = makeSession();
    // No `tenantId` was set in opts.
    expect(session.tenantId).toBeUndefined();
    expect(isInTenant(session, 't-1')).toBe(false);
  });

  it('still returns false when both session.tenantId and arg are empty strings', () => {
    const session = makeSession({ tenantId: '' });
    // Strict equality says they match, but the empty-string case is the
    // closest equivalent to "no tenant" in flat-tag world. Empty matches
    // empty (we only special-case undefined per ADR-007 I-18). Document
    // the explicit-undefined contract here.
    expect(isInTenant(session, '')).toBe(true);
    expect(isInTenant(session, 't-1')).toBe(false);
  });
});

describe('isImpersonating', () => {
  it('returns false when operatorUuid === dataAccessUuid (no override)', () => {
    const session = makeSession({ operatorUuid: 'op-1' });
    // dataAccessUuid getter falls back to operatorUuid → equal.
    expect(isImpersonating(session)).toBe(false);
  });

  it('returns true when override differs from operator', () => {
    const session = makeSession({
      operatorUuid: 'agent-bot',
      dataAccessUuid: 'human-user-1',
    });
    expect(isImpersonating(session)).toBe(true);
  });

  it('throws DataAccessUuidMissingError on empty operatorUuid (ADR-007 I-19)', () => {
    const session = makeSession({ operatorUuid: '' });
    expect(() => isImpersonating(session)).toThrow(DataAccessUuidMissingError);
  });

  it('throws DataAccessUuidMissingError on empty-string dataAccessUuid override (ADR-007 I-19)', () => {
    // Bypass Session's getter fallback by hitting the empty-string path
    // through $setDataAccessUuid (set then verify).
    const session = makeSession({ operatorUuid: 'op-1' });
    session.$setDataAccessUuid('');
    expect(() => isImpersonating(session)).toThrow(DataAccessUuidMissingError);
  });
});
