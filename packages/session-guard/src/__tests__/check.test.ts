// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';

import {
  checkAuthenticated,
  checkImpersonating,
  checkOperatorType,
  checkSessionInTenant,
} from '../check.js';
import {
  AuthenticationRequiredError,
  DataAccessUuidMissingError,
  OperatorTypeMismatchError,
  TenantScopeViolationError,
} from '../errors.js';
import { makeSession } from './test-helpers.js';

describe('checkAuthenticated', () => {
  it('returns ok=true with narrowed session on success', () => {
    const session = makeSession();
    const result = checkAuthenticated(session);
    expect(result.ok).toBe(true);
    if (result.ok) {
      // Discriminated union narrows .session into the success branch.
      expect(result.session.operatorUuid).toBe('op-1');
    }
  });

  it('returns ok=false with AuthenticationRequiredError on undefined', () => {
    const result = checkAuthenticated(undefined);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBeInstanceOf(AuthenticationRequiredError);
    }
  });

  it('returns ok=false on a destroyed session', () => {
    const session = makeSession();
    session.$destroy();
    const result = checkAuthenticated(session);
    expect(result.ok).toBe(false);
  });
});

describe('checkOperatorType', () => {
  it('returns ok=true on match', () => {
    const session = makeSession({ operatorType: 'web' });
    const result = checkOperatorType(session, 'web', 'cli');
    expect(result.ok).toBe(true);
  });

  it('returns ok=false with OperatorTypeMismatchError on miss', () => {
    const session = makeSession({ operatorType: 'bot' });
    const result = checkOperatorType(session, 'web', 'cli');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBeInstanceOf(OperatorTypeMismatchError);
    }
  });
});

describe('checkSessionInTenant', () => {
  it('returns ok=true on tenant match', () => {
    const session = makeSession({ tenantId: 't-1' });
    const result = checkSessionInTenant(session, 't-1');
    expect(result.ok).toBe(true);
  });

  it('returns ok=false on tenant mismatch', () => {
    const session = makeSession({ tenantId: 't-1' });
    const result = checkSessionInTenant(session, 't-2');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBeInstanceOf(TenantScopeViolationError);
    }
  });

  it('returns ok=false when session.tenantId is undefined (ADR-007 I-18)', () => {
    const session = makeSession();
    const result = checkSessionInTenant(session, 't-1');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBeInstanceOf(TenantScopeViolationError);
    }
  });
});

describe('checkImpersonating (Wave 12.D-fix FR-018)', () => {
  it('returns ok=true, impersonating=true when UUIDs differ', () => {
    const session = makeSession({
      operatorUuid: 'agent-bot',
      dataAccessUuid: 'human-user-1',
    });
    const result = checkImpersonating(session);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.impersonating).toBe(true);
  });

  it('returns ok=true, impersonating=false when UUIDs equal', () => {
    const session = makeSession({ operatorUuid: 'op-1' });
    // dataAccessUuid falls back to operatorUuid → equal.
    const result = checkImpersonating(session);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.impersonating).toBe(false);
  });

  it('returns AuthenticationRequiredError on undefined / null session', () => {
    const r1 = checkImpersonating(undefined);
    expect(r1.ok).toBe(false);
    if (!r1.ok) expect(r1.error).toBeInstanceOf(AuthenticationRequiredError);
    const r2 = checkImpersonating(null);
    expect(r2.ok).toBe(false);
    if (!r2.ok) expect(r2.error).toBeInstanceOf(AuthenticationRequiredError);
  });

  it('returns AuthenticationRequiredError on destroyed session', () => {
    const session = makeSession();
    session.$destroy();
    const result = checkImpersonating(session);
    expect(result.ok).toBe(false);
    if (!result.ok)
      expect(result.error).toBeInstanceOf(AuthenticationRequiredError);
  });

  it('returns DataAccessUuidMissingError when UUIDs empty', () => {
    const session = makeSession({ operatorUuid: 'op-1' });
    session.$setDataAccessUuid('');
    const result = checkImpersonating(session);
    expect(result.ok).toBe(false);
    if (!result.ok)
      expect(result.error).toBeInstanceOf(DataAccessUuidMissingError);
  });
});
