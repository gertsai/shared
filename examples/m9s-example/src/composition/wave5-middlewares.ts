// SPDX-License-Identifier: Apache-2.0
/**
 * Wave 5 broker middlewares — m9s-example.
 *
 * Composes the canonical Wave 5 stack into Moleculer broker middlewares:
 *
 *   1. `tenantMiddleware` (`@gertsai/tenant-resolver/moleculer`)
 *      Resolves a tenant from the inbound HTTP request via a chain of
 *      strategies and writes the resolution onto `ctx.meta.tenantId` /
 *      `ctx.meta.tenantResolution` so downstream middlewares + handlers
 *      see the same value.
 *
 *   2. `sessionMiddleware` (`@gertsai/runtime-context/moleculer`)
 *      Reads `ctx.meta.tenantId` (set by step 1), composes a
 *      `RequestContext`, attaches it to `ctx.locals.requestContext`, and
 *      auto-`$freeze()`s before invoking the downstream action handler
 *      (per ADR-007 I-16, TOCTOU protection).
 *
 * Composition order (canonical per ADR-010 §B): tenantMiddleware MUST
 * precede sessionMiddleware so that tenantId is resolved BEFORE the
 * RequestContext is composed and frozen.
 *
 * Extracted into its own file so `moleculer.config.ts` keeps its existing
 * focus (cacher / transporter / channels / workflows wiring) and the
 * Wave 5 reference becomes one self-contained import for documentation.
 */
import type { Context } from 'moleculer';
import {
  ChainTenantResolver,
  HeaderStrategy,
  type TenantResolverStrategy,
} from '@gertsai/tenant-resolver';
import { tenantMiddleware } from '@gertsai/tenant-resolver/moleculer';
import {
  REQUEST_CONTEXT_LOCALS_KEY,
  sessionMiddleware,
} from '@gertsai/runtime-context/moleculer';
import type { RequestContext } from '@gertsai/runtime-context';
import type { Session } from '@gertsai/session';

/**
 * Build the tenant-resolution chain for the example.
 *
 * SECURITY (CWE-639 — see `@gertsai/tenant-resolver` README §Security):
 * `HeaderStrategy({ trustProxy: true })` reads `X-Tenant-ID` from the
 * inbound HTTP request. The header is ONLY trustworthy if a reverse
 * proxy (nginx, Envoy, ALB, Cloud Run ingress, ...) strips any
 * client-supplied `X-Tenant-ID` and re-sets it from authenticated
 * context. WITHOUT this guarantee any client can spoof the header and
 * cross tenant boundaries. The example assumes such a proxy exists in
 * front of the broker — see `examples/m9s-example/README.md §Wave 5
 * stack reference` for the deployment contract.
 */
export function buildTenantResolver(): TenantResolverStrategy<Context> {
  // SECURITY: trustProxy: true requires a reverse proxy stripping inbound
  // X-Tenant-ID. See README §Wave 5 stack reference (CWE-639 mitigation).
  const headerStrategy = new HeaderStrategy({
    headerName: 'X-Tenant-ID',
    trustProxy: true, // SECURITY: see comment above
  });

  // The header strategy operates on `HttpRequestLike`; Moleculer hands the
  // tenantMiddleware a `Context` whose `meta` contains the inbound HTTP
  // headers under `meta.headers` (api-core's REST adapter normalises this).
  // We adapt the `Context` to `HttpRequestLike` via a thin wrapper so the
  // chain stays composable with future Context-shaped strategies (e.g.
  // `MoleculerCtxStrategy`) without an additional adapter layer.
  const adaptedHeaderStrategy: TenantResolverStrategy<Context> = {
    name: headerStrategy.name,
    async resolve(ctx) {
      const meta = (ctx.meta ?? {}) as Record<string, unknown>;
      const headersRaw = meta['headers'];
      if (
        headersRaw === null ||
        typeof headersRaw !== 'object' ||
        Array.isArray(headersRaw)
      ) {
        return null;
      }
      const headers = headersRaw as Record<
        string,
        string | string[] | undefined
      >;
      return headerStrategy.resolve({ headers });
    },
  };

  // `mode: 'optional'` — the example serves both tenant-aware and anonymous
  // routes (the curl onboarding flow in README has no proxy in front of it).
  // Production deployments SHOULD set `mode: 'strict'` (the library default
  // per ADR-006 I-18) so missing-tenant requests fail closed.
  return new ChainTenantResolver<Context>([adaptedHeaderStrategy], {
    mode: 'optional',
  });
}

/**
 * Build the ordered Wave 5 middleware stack.
 *
 * Returns Moleculer middleware descriptors in canonical order
 * (tenantMiddleware → sessionMiddleware). Spread into
 * `BrokerOptions.middlewares` upstream of any custom middlewares so the
 * `RequestContext` is available to all downstream layers.
 */
export function buildWave5Middlewares(): readonly unknown[] {
  const resolver = buildTenantResolver();
  return [
    tenantMiddleware(resolver),
    // sessionMiddleware also calls the resolver internally when
    // `ctx.meta.tenantId` is missing — passing the same instance keeps the
    // resolution path uniform regardless of whether tenantMiddleware ran
    // first (it always does in the canonical order, but defensive).
    sessionMiddleware({ resolver }),
  ];
}

// ---------------------------------------------------------------------------
// Action-handler helpers — Sprint 3.10 Addendum 2 wiring
// ---------------------------------------------------------------------------

/**
 * Snapshot of the per-request Wave 5 context as seen by an action handler.
 * Both fields are optional so that pre-Wave-5 callers (no sessionMiddleware
 * registered) and anonymous flows (no tenant resolved) keep the same shape:
 * undefined fields skip the corresponding session-guard branch in the use
 * case (per ADR-010 I-2 / I-3 additive-optional regression invariant).
 */
export interface Wave5ContextSnapshot {
  readonly session: Session | undefined;
  readonly expectedTenantId: string | undefined;
}

/**
 * Read the {@link RequestContext} composed by sessionMiddleware off
 * `ctx.locals.requestContext` and project it to the additive-optional shape
 * the use cases consume. Designed to be safe in three states:
 *
 *   1. Wave 5 middleware not registered → returns `{ session: undefined,
 *      expectedTenantId: undefined }` (pre-Wave-5 path; use case skips
 *      assertions, behaves identically to existing 16 regression tests).
 *   2. Wave 5 registered but anonymous (mode='optional', no header) →
 *      returns `{ session: <maybe>, expectedTenantId: undefined }`.
 *   3. Wave 5 registered + tenant resolved + sessionFactory injected
 *      session → returns both populated; use case fires
 *      `assertAuthenticated` + `assertSessionInTenant` branch.
 *
 * Uses `RequestContext.{sessionOptional,tenantIdOptional}` (added Sprint
 * 3.7) which return `undefined` instead of throwing — strict accessors
 * `session` / `tenantId` would crash the action for anonymous requests
 * even though those are valid under mode='optional'.
 */
export function tryGetRequestContextFromCtx(
  ctx: Context,
): Wave5ContextSnapshot {
  const locals = (ctx as unknown as { locals?: Record<string, unknown> })
    .locals;
  const value = locals?.[REQUEST_CONTEXT_LOCALS_KEY];
  // Structural duck-typing instead of `instanceof RequestContext`: tsup
  // bundles a separate copy of the RequestContext class into each subpath
  // (`@gertsai/runtime-context` root vs `@gertsai/runtime-context/moleculer`)
  // — so an instance composed by `sessionMiddleware` (from the /moleculer
  // subpath) is NOT `instanceof` the RequestContext re-exported by the root
  // surface. The two classes are structurally identical; we check shape
  // (`sessionOptional` and `tenantIdOptional` getters present) to recognise
  // a valid RequestContext from either subpath.
  //
  // Sprint 3.10 Addendum 2 — surfaced via e2e session-guard rejection tests.
  // P2 follow-up for Wave 6+: investigate runtime-context tsup config so
  // both subpaths share a single `RequestContext` class identity. Until
  // then, this duck-typing keeps consumers working across both import
  // paths.
  if (
    value === null ||
    typeof value !== 'object' ||
    !('sessionOptional' in value) ||
    !('tenantIdOptional' in value)
  ) {
    return { session: undefined, expectedTenantId: undefined };
  }
  const rc = value as RequestContext;
  return {
    session: rc.sessionOptional,
    expectedTenantId: rc.tenantIdOptional,
  };
}
