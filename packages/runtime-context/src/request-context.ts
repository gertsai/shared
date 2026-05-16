// SPDX-License-Identifier: Apache-2.0
import { randomUUID } from 'node:crypto';
import type { Session } from '@gertsai/session';

import {
  ContextFrozenError,
  SessionMissingError,
  TenantContextMissingError,
} from './errors.js';
import {
  DefaultFeatureContext,
  type FeatureContext,
  type FeatureContextInit,
} from './feature-context.js';
import {
  DefaultProviderContext,
  type ProviderContext,
  type ProviderContextInit,
} from './provider-context.js';
import type { RequestContextInit } from './types.js';

/**
 * Per-request composition root combining session identity, tenant scope,
 * correlation tracking, locale, feature flags and DI-aware provider
 * lookup. Lazy private getters compute defaults / throw on first access;
 * mutators throw {@link ContextFrozenError} once {@link $freeze} has been
 * called.
 *
 * See ADR-007 §A for the full design rationale, including the freeze
 * invariant (I-4, I-22), correlation-id source (I-20) and ProviderContext
 * symbol-only token rule (I-17).
 */
export class RequestContext {
  private _session?: Session;
  private _tenantId?: string;
  private _correlationId?: string;
  private _locale?: string;
  private _features?: FeatureContext;
  private _providers?: ProviderContext;
  private readonly _featuresInit?: FeatureContextInit;
  private readonly _providersInit?: ProviderContextInit;
  private _frozen = false;

  constructor(init: RequestContextInit = {}) {
    if (init.session !== undefined) this._session = init.session;
    if (init.tenantId !== undefined) this._tenantId = init.tenantId;
    if (init.correlationId !== undefined) {
      this._correlationId = init.correlationId;
    }
    if (init.locale !== undefined) this._locale = init.locale;
    if (init.features !== undefined) this._featuresInit = init.features;
    if (init.providers !== undefined) this._providersInit = init.providers;
  }

  /**
   * Strict session accessor. Throws {@link SessionMissingError} when no
   * session was attached at construction nor via {@link $setSession}.
   */
  get session(): Session {
    if (this._session === undefined) {
      throw new SessionMissingError({
        message:
          'RequestContext.session accessed before $setSession; attach via constructor init or sessionMiddleware',
        details: { contextField: 'session' },
      });
    }
    return this._session;
  }

  /** Optional session accessor — returns `undefined` when not attached. */
  get sessionOptional(): Session | undefined {
    return this._session;
  }

  /**
   * Strict tenant accessor. Throws {@link TenantContextMissingError} when
   * no tenant has been resolved.
   */
  get tenantId(): string {
    if (this._tenantId === undefined) {
      throw new TenantContextMissingError({
        message:
          'RequestContext.tenantId accessed before resolution; configure tenantMiddleware or $setTenantId',
        details: { reason: 'tenant-context-not-resolved' },
      });
    }
    return this._tenantId;
  }

  /** Optional tenant accessor — returns `undefined` when not resolved. */
  get tenantIdOptional(): string | undefined {
    return this._tenantId;
  }

  /**
   * Correlation id getter. Lazily generates via `crypto.randomUUID()` on
   * first access (per ADR-007 I-20) and memoises the result. After
   * {@link $freeze} the value is eager-initialised so post-freeze access
   * remains a pure read (per ADR-007 I-22).
   */
  get correlationId(): string {
    if (this._correlationId === undefined) {
      this._correlationId = randomUUID();
    }
    return this._correlationId;
  }

  /** Locale getter — defaults to `'en'` when not set at construction. */
  get locale(): string {
    return this._locale ?? 'en';
  }

  /** Feature-flag context. Lazily constructs from init or empty defaults. */
  get features(): FeatureContext {
    if (this._features === undefined) {
      this._features = new DefaultFeatureContext(this._featuresInit ?? {});
    }
    return this._features;
  }

  /** Provider/DI lookup context. Lazily constructs from init or empties. */
  get providers(): ProviderContext {
    if (this._providers === undefined) {
      this._providers = new DefaultProviderContext(this._providersInit ?? {});
    }
    return this._providers;
  }

  /** `true` once {@link $freeze} has been called. */
  get frozen(): boolean {
    return this._frozen;
  }

  /**
   * Attach (or replace) the session associated with this request. Throws
   * {@link ContextFrozenError} once {@link $freeze} has been invoked.
   *
   * Wave 12.D-fix per PRD-036 FR-019 / EVID-051 L-3: the frozen-check is
   * the canonical enforcement point of the single-middleware invariant —
   * if a downstream handler still has a reference to a frozen
   * {@link RequestContext} and tries to swap its session, the throw
   * surfaces the bug immediately rather than letting the mutation race
   * an already-completed authorisation check.
   */
  $setSession(session: Session): void {
    this._assertNotFrozen('session');
    this._session = session;
  }

  /**
   * Set the resolved tenant id. Throws {@link ContextFrozenError} once the
   * context has been frozen.
   */
  $setTenantId(tenantId: string): void {
    this._assertNotFrozen('tenantId');
    this._tenantId = tenantId;
  }

  /**
   * Override the correlation id. Throws {@link ContextFrozenError} once
   * the context has been frozen.
   */
  $setCorrelationId(correlationId: string): void {
    this._assertNotFrozen('correlationId');
    this._correlationId = correlationId;
  }

  /**
   * Finalise the context. Eager-initialises every lazy field
   * (`correlationId`, `features`, `providers`) so that subsequent access
   * is a pure read (no hidden state mutation). After this call all
   * `$set*` mutators throw {@link ContextFrozenError}.
   *
   * Calling `$freeze()` more than once is a no-op.
   *
   * **Single-middleware invariant (PRD-036 FR-019 / EVID-051 L-3):**
   * `$freeze()` MUST be invoked exactly once, at the end of the
   * request-context-establishing middleware chain (typically the
   * Moleculer middleware exposed via `./moleculer`). After this call
   * any `$setSession` / `$setTenantId` / `$setCorrelationId` invocation
   * throws {@link ContextFrozenError}, surfacing accidental
   * "middleware ran twice" races as a hard error rather than a silent
   * authorisation downgrade. Per ADR-007 I-22 + I-16.
   */
  $freeze(): void {
    if (this._frozen) return;
    if (this._correlationId === undefined) {
      this._correlationId = randomUUID();
    }
    if (this._features === undefined) {
      this._features = new DefaultFeatureContext(this._featuresInit ?? {});
    }
    if (this._providers === undefined) {
      this._providers = new DefaultProviderContext(this._providersInit ?? {});
    }
    this._frozen = true;
  }

  private _assertNotFrozen(field: string): void {
    if (this._frozen) {
      // Wave 12.D-fix FR-019 — explicit message includes the
      // single-middleware invariant so the failure is self-explanatory
      // when it surfaces in logs (EVID-051 L-3).
      throw new ContextFrozenError({
        message:
          `RequestContext.$set${field.charAt(0).toUpperCase()}${field.slice(1)}: ` +
          'cannot mutate after $freeze() — single-middleware invariant. ' +
          `Field: ${field}`,
        details: { frozen: true },
      });
    }
  }
}
