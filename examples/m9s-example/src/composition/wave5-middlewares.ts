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
 *      see the same value. Wave 37.B (PRD-071 — tenant brand) — the
 *      resolved value is projected to the branded `TenantId` type at the
 *      `tryGetRequestContextFromCtx` boundary so action handlers receive
 *      a compile-time-checked identifier, and downstream infrastructure
 *      (PgDocumentRepository, PgVectorStore) requires the brand on its
 *      constructors.
 *
 *   2. `sessionMiddleware` (`@gertsai/runtime-context/moleculer`)
 *      Reads `ctx.meta.tenantId` (set by step 1), composes a
 *      `RequestContext`, attaches it to `ctx.locals.requestContext`, and
 *      auto-`$freeze()`s before invoking the downstream action handler
 *      (per ADR-007 I-16, TOCTOU protection). The runtime-context layer
 *      remains string-typed at its API surface; Wave 37.B applies
 *      `asTenantId` at the snapshot projection so action handlers see a
 *      `TenantId | undefined`, not a plain `string | undefined`.
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
// Wave 37.B (PRD-071 — tenant brand) — TenantId enforces tenant resolution at compile time
import { asTenantId, type TenantId } from '@gertsai/tenant';

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

// ---------------------------------------------------------------------------
// Wave 32.A — testSession seam fail-closed gating (EVID-083 CRIT-1, CWE-287/602).
//
// The `meta.testSession` seam is a TEST-ONLY affordance for e2e/integration
// tests that need a pre-built session without minting a real JWT. Without this
// gate, any Moleculer peer (NATS/Redis/TCP transit forwards meta verbatim)
// could inject a forged session and bypass establishAuthSession + session-guard.
//
// Fail-closed: BOTH `NODE_ENV !== 'production'` AND explicit opt-in env must
// be set. Production sanity check: throws at module-load time if both gates
// would admit a testSession in production — better dead than insecure.
// ---------------------------------------------------------------------------

/**
 * Whether the test-session seam is permitted in this process.
 *
 * Evaluated ONCE at module-load time. Both conditions must hold:
 *   1. `NODE_ENV` is not `'production'`
 *   2. `GERTSAI_TEST_SESSION_ALLOW` is explicitly set to `'1'`
 *
 * Production mis-configuration (GERTSAI_TEST_SESSION_ALLOW=1 in production)
 * is caught by the module-load-time sanity check below, which throws
 * immediately so the service dies on startup before accepting any traffic.
 */
const TEST_SESSION_ALLOWED = (() => {
  const isNonProd = process.env['NODE_ENV'] !== 'production';
  const explicitOptIn = process.env['GERTSAI_TEST_SESSION_ALLOW'] === '1';
  return isNonProd && explicitOptIn;
})();

// Module-load-time sanity: if GERTSAI_TEST_SESSION_ALLOW=1 was set in a
// production process, fail loudly on startup so it's visible in crash logs
// before the service accepts a single request. Intentional hard crash —
// better dead than insecure (CWE-287/602 defence-in-depth).
if (
  process.env['GERTSAI_TEST_SESSION_ALLOW'] === '1' &&
  process.env['NODE_ENV'] === 'production'
) {
  throw new Error(
    'wave5-middlewares: GERTSAI_TEST_SESSION_ALLOW=1 is FORBIDDEN in production. ' +
      'This flag enables the meta.testSession auth-bypass seam used by tests only. ' +
      'Unset it from the production environment.',
  );
}

/**
 * Snapshot of the per-request Wave 5 context as seen by an action handler.
 * Both fields are optional so that pre-Wave-5 callers (no sessionMiddleware
 * registered) and anonymous flows (no tenant resolved) keep the same shape:
 * undefined fields skip the corresponding session-guard branch in the use
 * case (per ADR-010 I-2 / I-3 additive-optional regression invariant).
 */
// Wave 37.B (PRD-071 — tenant brand) — TenantId enforces tenant resolution at compile time
export interface Wave5ContextSnapshot {
  readonly session: Session | undefined;
  readonly expectedTenantId: TenantId | undefined;
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
  // Wave 9.0.1 test seam — `broker.call(..., { meta: { testSession, headers } })`
  // bypasses the HTTP sessionMiddleware pipeline (direct broker call, no
  // Express path). e2e tests use this to drive action handlers with
  // pre-composed sessions. When `meta.testSession` is set, treat it as the
  // session-of-record and pull `expectedTenantId` from the same headers the
  // sessionMiddleware would have processed.
  //
  // Production code path (Wave 5 sessionMiddleware composed at HTTP entry)
  // never sets `meta.testSession`, so this branch is a no-op in real
  // deployments. Documented as test-only in the meta shape.
  //
  // Wave 32.A — CRIT-1 gate: only admit testSession when TEST_SESSION_ALLOWED
  // is true (non-production + explicit opt-in env var). Production-reachable
  // transit (NATS/Redis/TCP forwards meta verbatim) cannot inject a forged
  // session through this path. See module-level comment above (CWE-287/602).
  // Wave 35.B (EVID-087 logic-W1) — widen the `headers` value type to
  // `string | string[] | undefined`. Moleculer transit can forward
  // multi-value HTTP headers (e.g. proxies that set X-Tenant-ID twice) as
  // string arrays; narrowing them away at the type level hides a real
  // runtime shape. The Array.isArray() guard below catches the multi-value
  // case with a clear error before any string comparison.
  const meta = ctx.meta as
    | {
        testSession?: unknown;
        headers?: Record<string, string | string[] | undefined>;
      }
    | undefined;
  if (
    TEST_SESSION_ALLOWED &&
    meta !== undefined &&
    meta.testSession !== null &&
    typeof meta.testSession === 'object' &&
    meta.testSession !== undefined
  ) {
    // Wave 32.A — CRIT-3 fix: derive expectedTenantId from testSession.tenantId
    // (single source of truth). Pre-fix, the header was used as the source,
    // enabling tests to silently mix sources and bypass tenant scoping
    // (CWE-345 mixed-source tenant assertion).
    //
    // Now: expectedTenantId comes from session. If the header is ALSO present
    // and disagrees with the session, throw immediately — this is a test-
    // fixture bug that would produce a silent Tenant scope violation with the
    // old code and must be caught loudly at the seam.
    const session = meta.testSession as Wave5ContextSnapshot['session'];
    const sessionTenantId = (
      session as { tenantId?: string } | undefined
    )?.tenantId;
    // Wave 35.B (EVID-087 logic-W2) — treat empty-string tenantId as unset.
    // session-guard's isInTenant('') has ambiguous semantics; safer to
    // return expectedTenantId: undefined and let the strict-mode guard
    // fail-closed than to propagate an empty string as a "set" tenant.
    // Wave 37.B (PRD-071 — tenant brand) — TenantId enforces tenant resolution at compile time
    const normalizedSessionTenantId: TenantId | undefined =
      sessionTenantId !== undefined && sessionTenantId.length > 0
        ? asTenantId(sessionTenantId)
        : undefined;
    // Wave 35.B (EVID-087 logic-W1) — defensive guard against multi-value
    // HTTP headers. Moleculer's transit can forward `x-tenant-id: ['A','B']`
    // from a proxy that sets multiple values. Without this guard, the
    // array-vs-string inequality check throws a misleading "Tenant scope
    // violation". Treat multi-value as an explicit error with a clearer
    // message so the upstream proxy mis-configuration is obvious.
    const headerTenantIdRaw = meta.headers?.['x-tenant-id'];
    if (Array.isArray(headerTenantIdRaw)) {
      throw new Error(
        `wave5-middlewares: x-tenant-id header received multiple values ` +
          `(${JSON.stringify(headerTenantIdRaw)}). Multi-value tenant headers are ` +
          `ambiguous — fix the upstream proxy / load balancer to forward a single value, ` +
          `or use meta.testSession.tenantId as the single source of truth.`,
      );
    }
    const headerTenantId = headerTenantIdRaw; // narrowed to string | undefined

    if (
      headerTenantId !== undefined &&
      normalizedSessionTenantId !== undefined &&
      headerTenantId !== normalizedSessionTenantId
    ) {
      // Fail-loud: mixed-source tenant assertion is a CWE-345 footgun.
      // Include "Tenant scope violation" so existing tests that assert on
      // cross-tenant rejection still match the expected error pattern.
      throw new Error(
        `wave5-middlewares: Tenant scope violation — meta.testSession.tenantId ` +
          `('${normalizedSessionTenantId}') does not match meta.headers['x-tenant-id'] ` +
          `('${headerTenantId}'). Mixed-source tenant assertion is a CWE-345 ` +
          `footgun — fix the test fixture to use a single tenantId across the ` +
          `session and the header.`,
      );
    }

    return {
      session,
      expectedTenantId: normalizedSessionTenantId,
    };
  }

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
  // Wave 37.B (PRD-071 — tenant brand) — TenantId enforces tenant resolution at compile time.
  // RequestContext.tenantIdOptional returns plain `string | undefined`; project
  // through `asTenantId` so the snapshot field is the branded type. Empty string
  // collapses to undefined here so the strict-mode guard fails closed downstream
  // (mirrors Wave 35.B EVID-087 logic-W2 in the testSession branch).
  const rcTenantIdRaw = rc.tenantIdOptional;
  const expectedTenantId: TenantId | undefined =
    rcTenantIdRaw !== undefined && rcTenantIdRaw.length > 0
      ? asTenantId(rcTenantIdRaw)
      : undefined;
  return {
    session: rc.sessionOptional,
    expectedTenantId,
  };
}
