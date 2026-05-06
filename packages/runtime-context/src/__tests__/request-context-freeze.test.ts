// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import { RequestContext } from '../request-context.js';
import { ContextFrozenError } from '../errors.js';
import { makeSession } from './_session-fixture.js';

describe('RequestContext — $freeze invariants (ADR-007 I-22, I-4)', () => {
  it('after $freeze, all $set* mutators throw ContextFrozenError', () => {
    const ctx = new RequestContext();
    ctx.$freeze();
    expect(() => ctx.$setSession(makeSession())).toThrow(ContextFrozenError);
    expect(() => ctx.$setTenantId('t-1')).toThrow(ContextFrozenError);
    expect(() => ctx.$setCorrelationId('c-1')).toThrow(ContextFrozenError);
  });

  it('eager-inits correlationId before freezing (no post-freeze mutation)', () => {
    const ctx = new RequestContext();
    ctx.$freeze();
    // After freeze, accessing correlationId is a pure read — value already
    // memoised in internal state during $freeze.
    const id = ctx.correlationId;
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    // Calling again must not re-mutate.
    expect(ctx.correlationId).toBe(id);
  });

  it('eager-inits FeatureContext + ProviderContext during $freeze', () => {
    const ctx = new RequestContext();
    ctx.$freeze();
    expect(ctx.features).toBeDefined();
    expect(ctx.providers).toBeDefined();
    // Subsequent identity stable (no rebuild on each access).
    expect(ctx.features).toBe(ctx.features);
    expect(ctx.providers).toBe(ctx.providers);
  });

  it('exposes frozen flag', () => {
    const ctx = new RequestContext();
    expect(ctx.frozen).toBe(false);
    ctx.$freeze();
    expect(ctx.frozen).toBe(true);
  });

  it('$freeze() is idempotent', () => {
    const ctx = new RequestContext();
    ctx.$freeze();
    expect(() => ctx.$freeze()).not.toThrow();
  });

  it('lazy getters still work after freeze (locale default, features, providers)', () => {
    const ctx = new RequestContext();
    ctx.$freeze();
    expect(ctx.locale).toBe('en');
    expect(ctx.features.enabledFlags()).toEqual([]);
    expect(ctx.features.isEnabled('x')).toBe(false);
  });
});
