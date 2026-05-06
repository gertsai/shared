// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import { RequestContext } from '../request-context.js';
import {
  SessionMissingError,
  TenantContextMissingError,
} from '../errors.js';
import { makeSession } from './_session-fixture.js';

describe('RequestContext — lazy getters', () => {
  it('throws SessionMissingError when session not set', () => {
    const ctx = new RequestContext();
    expect(() => ctx.session).toThrow(SessionMissingError);
    expect(ctx.sessionOptional).toBeUndefined();
  });

  it('returns the attached session and exposes via sessionOptional', () => {
    const session = makeSession();
    const ctx = new RequestContext({ session });
    expect(ctx.session).toBe(session);
    expect(ctx.sessionOptional).toBe(session);
  });

  it('throws TenantContextMissingError when tenantId not set', () => {
    const ctx = new RequestContext();
    expect(() => ctx.tenantId).toThrow(TenantContextMissingError);
    expect(ctx.tenantIdOptional).toBeUndefined();
  });

  it('returns tenantId from init', () => {
    const ctx = new RequestContext({ tenantId: 't-1' });
    expect(ctx.tenantId).toBe('t-1');
    expect(ctx.tenantIdOptional).toBe('t-1');
  });

  it('lazily generates a crypto.randomUUID-shaped correlationId when none set', () => {
    const ctx = new RequestContext();
    const id = ctx.correlationId;
    expect(id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
    expect(ctx.correlationId).toBe(id); // memoised
  });

  it('respects correlationId from init', () => {
    const ctx = new RequestContext({ correlationId: 'corr-7' });
    expect(ctx.correlationId).toBe('corr-7');
  });

  it("locale defaults to 'en' when not set", () => {
    const ctx = new RequestContext();
    expect(ctx.locale).toBe('en');
  });

  it('locale honoured from init', () => {
    expect(new RequestContext({ locale: 'ru' }).locale).toBe('ru');
  });

  it('lazily constructs DefaultFeatureContext from init', () => {
    const ctx = new RequestContext({
      features: { enabled: new Set(['flag-a']) },
    });
    expect(ctx.features.isEnabled('flag-a')).toBe(true);
    expect(ctx.features.isEnabled('flag-b')).toBe(false);
  });

  it('lazily constructs DefaultProviderContext from init', () => {
    const tok = Symbol.for('test:provider');
    const ctx = new RequestContext({
      providers: { bindings: new Map([[tok, 42]]) },
    });
    expect(ctx.providers.get<number>(tok)).toBe(42);
  });
});

describe('RequestContext — mutators', () => {
  it('$setSession + $setTenantId + $setCorrelationId update private state', () => {
    const ctx = new RequestContext();
    const session = makeSession();
    ctx.$setSession(session);
    ctx.$setTenantId('t-2');
    ctx.$setCorrelationId('corr-9');
    expect(ctx.session).toBe(session);
    expect(ctx.tenantId).toBe('t-2');
    expect(ctx.correlationId).toBe('corr-9');
  });
});
