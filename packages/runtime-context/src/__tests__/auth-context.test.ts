// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import {
  requireAuthContext,
  requireAuthContextWithDataAccess,
} from '../auth-context.js';
import { RequestContext } from '../request-context.js';
import {
  SessionMissingError,
  TenantContextMissingError,
} from '../errors.js';
import { makeSession } from './_session-fixture.js';

describe('requireAuthContext', () => {
  it('throws SessionMissingError when session absent', () => {
    const ctx = new RequestContext({ tenantId: 't-1' });
    expect(() => requireAuthContext(ctx)).toThrow(SessionMissingError);
  });

  it('throws TenantContextMissingError when tenant absent', () => {
    const ctx = new RequestContext({ session: makeSession() });
    expect(() => requireAuthContext(ctx)).toThrow(TenantContextMissingError);
  });

  it('returns AuthContext exposing session, tenantId, getOperatorStrict()', () => {
    const session = makeSession({ operatorUuid: 'op-A' });
    const ctx = new RequestContext({ session, tenantId: 't-7' });
    const auth = requireAuthContext(ctx);
    expect(auth.session).toBe(session);
    expect(auth.tenantId).toBe('t-7');
    expect(auth.getOperatorStrict()).toBe('op-A');
  });
});

describe('requireAuthContextWithDataAccess', () => {
  it('returns dataAccessUuid when set explicitly', () => {
    const session = makeSession({
      operatorUuid: 'agent-1',
      dataAccessUuid: 'user-42',
    });
    const ctx = new RequestContext({ session, tenantId: 't-1' });
    const auth = requireAuthContextWithDataAccess(ctx);
    expect(auth.dataAccessUuid).toBe('user-42');
    expect(auth.getOperatorStrict()).toBe('agent-1');
  });

  it('falls back to operatorUuid when dataAccessUuid not set (Session getter behaviour)', () => {
    const session = makeSession({ operatorUuid: 'op-self' });
    const ctx = new RequestContext({ session, tenantId: 't-1' });
    const auth = requireAuthContextWithDataAccess(ctx);
    // Session.dataAccessUuid getter returns operatorUuid when not set —
    // the helper accepts a non-empty string source.
    expect(auth.dataAccessUuid).toBe('op-self');
  });

  it('throws DataAccessUuidMissingError when explicitly set to empty string', async () => {
    // Per ADR-007 Amendment 1.2.9 (post-Build P1-1 fix): the seam now uses
    // session-guard's DataAccessUuidMissingError instead of SessionMissingError.
    const { DataAccessUuidMissingError } = await import('@gertsai/session-guard');
    const session = makeSession({
      operatorUuid: 'agent-1',
      dataAccessUuid: 'user-42',
    });
    session.$setDataAccessUuid('');
    const ctx = new RequestContext({ session, tenantId: 't-1' });
    expect(() => requireAuthContextWithDataAccess(ctx)).toThrow(
      DataAccessUuidMissingError,
    );
  });
});
