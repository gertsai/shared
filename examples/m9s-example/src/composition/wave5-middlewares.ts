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
import { sessionMiddleware } from '@gertsai/runtime-context/moleculer';

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
