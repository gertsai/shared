// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';

import {
  checkAuthenticated,
  checkOperatorType,
  checkSessionInTenant,
} from '../check.js';
import {
  AuthenticationRequiredError,
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
