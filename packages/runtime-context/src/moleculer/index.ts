// SPDX-License-Identifier: Apache-2.0
import type { Context } from 'moleculer';
import type { Session } from '@gertsai/session';
import type { TenantResolverStrategy } from '@gertsai/tenant-resolver';

import { RequestContext } from '../request-context.js';
import type { RequestContextInit } from '../types.js';

const MOLECULER_INSTALL_HINT =
  '@gertsai/runtime-context/moleculer requires `moleculer` to be installed as a peer dependency.';

/**
 * Slot under which `sessionMiddleware` attaches the {@link RequestContext}
 * on the Moleculer context. Stored on `ctx.locals` (per-request scope) per
 * ADR-007 I-15 — `ctx.meta` is reserved for cross-broker serialisation.
 */
export const REQUEST_CONTEXT_LOCALS_KEY = 'requestContext';

/**
 * Configuration accepted by {@link sessionMiddleware}.
 *
 * - `resolver` (optional): a tenant resolver strategy whose `resolve(ctx)`
 *   produces a {@link TenantResolution} the middleware mirrors onto
 *   `RequestContext.tenantId` when no tenantId is already present in
 *   `ctx.meta`. Pass either a `ChainTenantResolver` or a single strategy.
 * - `sessionFactory` (optional): function that produces a `Session` for a
 *   given Moleculer Context. The session is set via `$setSession` before
 *   freeze.
 */
export interface SessionMiddlewareOptions {
  readonly resolver?: TenantResolverStrategy<Context>;
  readonly sessionFactory?: (ctx: Context) => Session | undefined;
}

interface MoleculerMiddlewareDescriptor {
  readonly localAction: (
    next: (ctx: Context) => Promise<unknown>,
    action: unknown,
  ) => (ctx: Context) => Promise<unknown>;
}

function assertMoleculerCtx(ctx: unknown): asserts ctx is Context {
  if (
    ctx === null ||
    typeof ctx !== 'object' ||
    !('meta' in (ctx as Record<string, unknown>))
  ) {
    throw new Error(MOLECULER_INSTALL_HINT);
  }
}

function localsOf(ctx: Context): Record<string, unknown> {
  const holder = ctx as unknown as { locals?: Record<string, unknown> };
  if (holder.locals === undefined) {
    holder.locals = {};
  }
  return holder.locals;
}

function readMetaString(
  meta: Record<string, unknown> | null | undefined,
  key: string,
): string | undefined {
  if (!meta || typeof meta !== 'object') return undefined;
  const raw = meta[key];
  return typeof raw === 'string' && raw.length > 0 ? raw : undefined;
}

/**
 * Build a Moleculer middleware that composes a {@link RequestContext} per
 * action call, attaches it to `ctx.locals.requestContext`, and freezes the
 * context BEFORE invoking the downstream handler (per ADR-007 I-16 — TOCTOU
 * protection between init mutators and request handler).
 *
 * Inputs read from `ctx.meta`:
 * - `tenantId`: copied directly when present.
 * - `correlationId`: copied directly when present (otherwise the context
 *   lazily generates a `crypto.randomUUID()` per ADR-007 I-20).
 * - `locale`: copied directly when present.
 *
 * The peer-optional `moleculer` import is type-only at module load — the
 * runtime check above produces a descriptive error if invoked with a
 * non-Moleculer context.
 */
export function sessionMiddleware(
  options: SessionMiddlewareOptions = {},
): MoleculerMiddlewareDescriptor {
  return {
    localAction(next: (ctx: Context) => Promise<unknown>) {
      return async function requestContextAware(ctx: Context): Promise<unknown> {
        assertMoleculerCtx(ctx);
        const meta = (ctx.meta ?? {}) as Record<string, unknown>;

        const init: Mutable<RequestContextInit> = {};
        const tenantFromMeta = readMetaString(meta, 'tenantId');
        if (tenantFromMeta !== undefined) init.tenantId = tenantFromMeta;
        const correlationFromMeta = readMetaString(meta, 'correlationId');
        if (correlationFromMeta !== undefined) init.correlationId = correlationFromMeta;
        const localeFromMeta = readMetaString(meta, 'locale');
        if (localeFromMeta !== undefined) init.locale = localeFromMeta;

        if (options.sessionFactory !== undefined) {
          const session = options.sessionFactory(ctx);
          if (session !== undefined) init.session = session;
        }

        const requestContext = new RequestContext(init);

        if (options.resolver !== undefined && init.tenantId === undefined) {
          const resolved = await options.resolver.resolve(ctx);
          if (resolved !== null) {
            requestContext.$setTenantId(resolved.tenantId);
          }
        }

        const locals = localsOf(ctx);
        locals[REQUEST_CONTEXT_LOCALS_KEY] = requestContext;

        // Auto-freeze BEFORE downstream handler — ADR-007 I-16.
        requestContext.$freeze();

        return next(ctx);
      };
    },
  };
}

/**
 * Read the {@link RequestContext} placed by {@link sessionMiddleware} on
 * `ctx.locals.requestContext`. Throws a descriptive error when the
 * middleware is missing from the broker pipeline.
 */
export function getRequestContext(ctx: Context): RequestContext {
  assertMoleculerCtx(ctx);
  const locals = (ctx as unknown as { locals?: Record<string, unknown> }).locals;
  const value = locals?.[REQUEST_CONTEXT_LOCALS_KEY];
  if (!(value instanceof RequestContext)) {
    throw new Error(
      `getRequestContext: ctx.locals.${REQUEST_CONTEXT_LOCALS_KEY} not found; ` +
        'ensure sessionMiddleware is registered on the broker',
    );
  }
  return value;
}

// Re-export tenantMiddleware for composition convenience — consumers can
// register `tenantMiddleware(resolver)` upstream of `sessionMiddleware()` to
// resolve tenancy onto `ctx.meta.tenantId` before context composition.
export { tenantMiddleware } from '@gertsai/tenant-resolver/moleculer';

type Mutable<T> = { -readonly [K in keyof T]: T[K] };
