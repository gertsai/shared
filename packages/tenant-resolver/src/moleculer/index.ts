// SPDX-License-Identifier: Apache-2.0
import type { Context, ServiceBroker } from 'moleculer';
import type { TenantResolution, TenantResolverStrategy } from '../strategy.js';

/**
 * Thrown when `MoleculerCtxStrategy.resolve` receives a value that does
 * not conform to the Moleculer `Context` shape (lacks a `meta` field).
 * Distinct from `MOLECULER_PEER_DEP_ERROR` — this is a *call-site* bug
 * (wrong source argument) rather than a peer-dependency installation
 * issue. Sprint 3.10 W-3-10-6 (ADR-010 §A).
 */
const NON_MOLECULER_CTX_ERROR =
  '@gertsai/tenant-resolver/moleculer: argument is not a Moleculer Context (missing `meta`). ' +
  'This usually means a non-Moleculer source was passed to MoleculerCtxStrategy.resolve.';

/**
 * Reserved for runtime peer-dep guards. Currently unused — the
 * `moleculer` import in this subpath is type-only, so the package
 * stays peer-optional and bundlers do not require `moleculer` to
 * resolve. If a future change introduces a runtime require/import,
 * surface this hint to differentiate "missing install" from the
 * call-site shape error above. Sprint 3.10 W-3-10-6.
 */
export const MOLECULER_PEER_DEP_ERROR =
  '@gertsai/tenant-resolver/moleculer requires `moleculer` to be installed as a peer dependency.';

function assertMoleculerCtx(ctx: unknown): asserts ctx is Context {
  if (
    ctx === null ||
    typeof ctx !== 'object' ||
    !('meta' in (ctx as Record<string, unknown>))
  ) {
    throw new Error(NON_MOLECULER_CTX_ERROR);
  }
}

/**
 * Resolves the tenant from a Moleculer Context's `ctx.meta.tenantId`.
 *
 * Place this strategy first in a chain when an upstream Moleculer
 * middleware (e.g. an auth gateway) has already resolved the tenant —
 * downstream strategies serve as fallbacks for routes lacking such
 * middleware.
 */
export class MoleculerCtxStrategy implements TenantResolverStrategy<Context> {
  readonly name = 'moleculer-ctx';

  async resolve(ctx: Context): Promise<TenantResolution | null> {
    assertMoleculerCtx(ctx);
    const meta = (ctx as Context).meta as
      | Record<string, unknown>
      | null
      | undefined;
    if (!meta || typeof meta !== 'object') return null;
    const raw = (meta as Record<string, unknown>)['tenantId'];
    if (typeof raw !== 'string' || raw.trim() === '') return null;
    return { tenantId: raw.trim(), strategyName: this.name };
  }
}

export interface TenantMiddlewareOptions {
  /**
   * Where to write the resolved `TenantResolution` on the Moleculer
   * context. Defaults to `ctx.meta.tenantResolution`. Independent from
   * the `ctx.meta.tenantId` field that `MoleculerCtxStrategy` reads —
   * the middleware pipeline can use this slot to surface provenance to
   * downstream services / loggers.
   */
  readonly metaKey?: string;
}

interface MoleculerMiddlewareDescriptor {
  readonly localAction: (
    next: (ctx: Context) => Promise<unknown>,
    action: unknown,
  ) => (ctx: Context) => Promise<unknown>;
}

/**
 * Build a Moleculer middleware that wraps every action with a tenant
 * resolution step. The middleware delegates to the supplied resolver
 * (typically a `ChainTenantResolver`); failures bubble through Moleculer's
 * action dispatch path so callers can rely on Moleculer's own error
 * propagation semantics.
 *
 * Runtime check: throws a descriptive error when invoked without
 * `moleculer` installed — the import is type-only so the package itself
 * stays peer-optional.
 *
 * Note: the `Source` parameter is `Context` here because Moleculer's
 * middleware receives Context-shaped invocations. Adapt other resolvers
 * via a `MoleculerCtxStrategy` or a custom adapter if your chain takes
 * a different `Source`.
 */
export function tenantMiddleware(
  resolver: TenantResolverStrategy<Context>,
  options: TenantMiddlewareOptions = {},
): MoleculerMiddlewareDescriptor {
  const metaKey = options.metaKey ?? 'tenantResolution';
  return {
    localAction(next: (ctx: Context) => Promise<unknown>) {
      return async function tenantAware(ctx: Context): Promise<unknown> {
        const resolution = await resolver.resolve(ctx);
        if (resolution !== null) {
          const meta = (ctx.meta ??= {} as Record<string, unknown>) as Record<string, unknown>;
          meta[metaKey] = resolution;
          if (typeof meta['tenantId'] !== 'string' || meta['tenantId'] === '') {
            meta['tenantId'] = resolution.tenantId;
          }
        }
        return next(ctx);
      };
    },
  };
}

// Helper for consumers wanting explicit broker-typed integration
export type MoleculerBroker = ServiceBroker;
