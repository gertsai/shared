// SPDX-License-Identifier: Apache-2.0
/**
 * Wave 9 — typed openapi-fetch client for `@gertsai-examples/m9s-example-web`.
 *
 * Uses `paths` from `@gertsai-examples/m9s-example-api-types`. During the
 * Wave 9 build, that package exports a `PlaceholderPaths` (empty record);
 * Teammate B's snapshot commit replaces it with the real generated `paths`.
 * Until then `openapi-fetch` falls back to its generic dynamic-call shape —
 * code still compiles and runs at the cost of weaker type inference on
 * request/response bodies. Once `paths` lands, every endpoint becomes
 * IDE-autocomplete-driven without any consumer touch-ups.
 *
 * Middleware:
 *   - Every outbound request gets `X-Tenant-ID: <PUBLIC_TENANT_ID>` injected.
 *   - `content-type: application/json` is set as a default header.
 *   - Wave 10.A JWT refresh — proactive (60s skew) + reactive (401 retry).
 *
 * Env:
 *   - `PUBLIC_API_BASE_URL` (default `http://localhost:3031`)
 *   - `PUBLIC_TENANT_ID`    (default `tenant-acme`)
 *
 * EVID-036 audit remediation:
 *   - Per-request `JwtTokenProvider` via `AsyncLocalStorage` instead of a
 *     module-singleton (CI-2: prevents request A's tokens from leaking into
 *     request B's middleware in a concurrent SvelteKit server).
 *   - Single-flight refresh promise (U-2: two parallel calls observing the
 *     same near-expiry token now dedupe instead of double-refreshing).
 *   - Pre-consumption request clone (U-1.a) + middleware-aware retry path
 *     (U-1.b) + `/auth/refresh` self-recursion guard (U-1.c).
 */
import { AsyncLocalStorage } from 'node:async_hooks';

import type { PlaceholderPaths } from '@gertsai-examples/m9s-example-api-types';
import createClient, { type Middleware } from 'openapi-fetch';

import { unsafeDecodeExp } from '$lib/server/jwt';

/**
 * Resolve the consumed `paths` type at build time. Until Teammate B's
 * snapshot commit lands, the api-types package only exports
 * `PlaceholderPaths`; we alias to it so the bundle still builds. When
 * `paths` is published, swap this single import line — no other code
 * needs to change.
 *
 * TODO(Wave 9 Teammate B): replace with
 *   `import type { paths } from '@gertsai-examples/m9s-example-api-types';`
 *   `export type ApiPaths = paths;`
 */
export type ApiPaths = PlaceholderPaths;

const DEFAULT_API_BASE_URL = 'http://localhost:3031';
const DEFAULT_TENANT_ID = 'tenant-acme';

/**
 * Resolve env at module load. We read `process.env` (set by SvelteKit /
 * Node) and fall back to the Wave 9 demo defaults so a freshly cloned
 * repo builds without `.env`.
 */
function readEnv(key: string, fallback: string): string {
  if (typeof process !== 'undefined' && process.env && typeof process.env[key] === 'string') {
    return process.env[key] as string;
  }
  return fallback;
}

const API_BASE_URL = readEnv('PUBLIC_API_BASE_URL', DEFAULT_API_BASE_URL);
const TENANT_ID = readEnv('PUBLIC_TENANT_ID', DEFAULT_TENANT_ID);

/** Inject the demo tenant header on every outbound request. */
const tenantHeaderMiddleware: Middleware = {
  onRequest({ request }) {
    request.headers.set('X-Tenant-ID', TENANT_ID);
    if (!request.headers.has('content-type')) {
      request.headers.set('content-type', 'application/json');
    }
    return request;
  },
};

// ---------------------------------------------------------------------------
// Wave 10.A — JWT refresh middleware.
//
// Pluggable token provider so callers (server load + form actions) can hand
// us the current cookie value without making `client.ts` know about
// SvelteKit's RequestEvent. Default is a no-op pair — anonymous requests
// proceed without an Authorization header.
//
// Skew: refresh proactively when the access token has < 60s remaining,
// avoiding the round trip where the backend issues a 401 → we refresh →
// retry. Reactive 401-refresh-retry is still available below for the case
// the proactive path misses (clock skew, secret rotation).
// ---------------------------------------------------------------------------

export interface JwtTokenProvider {
  /** Return the currently cached access token, or null when anonymous. */
  getAccessToken: () => string | null;
  /** Persist a freshly-refreshed access token. */
  setAccessToken: (token: string) => void;
  /** Return the refresh token, or null when not available. */
  getRefreshToken: () => string | null;
  /**
   * Persist a rotated refresh token. Wave 10.E (PRD-022): the backend now
   * rotates the refresh token on every successful `/auth/refresh` call —
   * callers MUST persist the new value so the next refresh presents the
   * fresh jti (presenting the old one again triggers reuse-detection and
   * revokes the whole session chain). Optional in the interface so
   * older callers compile; impls that don't store refresh tokens (the
   * default noop) discard rotated values.
   */
  setRefreshToken?: (token: string) => void;
}

const noopProvider: JwtTokenProvider = {
  getAccessToken: () => null,
  setAccessToken: () => undefined,
  getRefreshToken: () => null,
  setRefreshToken: () => undefined,
};

// EVID-036 P1 / CI-2 fix: per-request provider via AsyncLocalStorage.
//
// Previously a module-level `let tokenProvider` was mutated by
// `setJwtTokenProvider` once per request. SvelteKit handles requests
// interleaved on a single Node process — request A's `setAccessToken` could
// leak its token into request B's middleware between awaits. ALS gives every
// async call frame a scoped provider that doesn't bleed across requests.
const tokenProviderAls = new AsyncLocalStorage<JwtTokenProvider>();

function currentProvider(): JwtTokenProvider {
  return tokenProviderAls.getStore() ?? noopProvider;
}

/**
 * Wire a token provider for the duration of `callback`. Server-side
 * `load` / `actions` should wrap their API calls in this helper so the JWT
 * middleware reads the right cookies — and only the right cookies — for the
 * request being handled.
 *
 * Replaces the deprecated `setJwtTokenProvider` (kept exported for legacy
 * callers; logs a warning in dev).
 */
export function withJwtTokenProvider<T>(provider: JwtTokenProvider, callback: () => Promise<T>): Promise<T> {
  return tokenProviderAls.run(provider, callback);
}

/**
 * @deprecated Use `withJwtTokenProvider(provider, async () => …)` instead —
 * the module-singleton path leaks tokens across concurrent server requests
 * (EVID-036 CI-2). Retained as a no-op shim so external imports keep
 * compiling; the new ALS-scoped path is the only one wired into middleware.
 */
export function setJwtTokenProvider(_provider: JwtTokenProvider | null): void {
  // intentional no-op — see deprecation note.
}

const REFRESH_SKEW_SECONDS = 60;

/**
 * Result of a successful backend refresh. Wave 10.E (PRD-022): both the
 * access token AND the refresh token are rotated.
 */
interface RefreshResult {
  access: string;
  refresh: string;
}

// EVID-036 P1 / U-2 fix: single-flight refresh. Two parallel API calls that
// both observe `exp - now < 60s` will both enter the proactive branch; we
// dedupe via a module-scoped promise keyed on the refresh token so the
// second caller awaits the first's response.
const inflightRefresh = new Map<string, Promise<RefreshResult | null>>();

async function refreshAccessTokenViaBackend(refreshToken: string): Promise<RefreshResult | null> {
  const existing = inflightRefresh.get(refreshToken);
  if (existing !== undefined) return existing;

  const promise = (async (): Promise<RefreshResult | null> => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/v1/auth/refresh`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'X-Tenant-ID': TENANT_ID,
        },
        body: JSON.stringify({ refreshToken }),
      });
      if (!res.ok) return null;
      const body = (await res.json()) as Record<string, unknown>;
      const inner = (body.data ?? body) as Record<string, unknown>;
      if (typeof inner.token !== 'string' || typeof inner.refreshToken !== 'string') {
        return null;
      }
      return { access: inner.token, refresh: inner.refreshToken };
    } catch {
      return null;
    } finally {
      inflightRefresh.delete(refreshToken);
    }
  })();

  inflightRefresh.set(refreshToken, promise);
  return promise;
}

// EVID-036 P1 / U-1.a fix: pre-consumption request clone.
//
// `Request.body` is a ReadableStream that's consumed by the first `fetch`.
// Building a new Request from `request.body` inside `onResponse` therefore
// sends an empty payload on retry (POST/PUT silently break). We clone in
// `onRequest` BEFORE openapi-fetch consumes the body, and pull the clone
// when retrying. WeakMap so a request that completes without retry doesn't
// leak.
const preConsumeClones = new WeakMap<Request, Request>();

/**
 * `/auth/refresh` itself never participates in the reactive-401 retry —
 * a 401 from this endpoint means the refresh token is dead and the user
 * needs to log in again. Without this guard the middleware would recurse
 * on its own refresh call.
 */
function isAuthRefreshUrl(url: string): boolean {
  try {
    const parsed = new URL(url, API_BASE_URL);
    return parsed.pathname.endsWith('/auth/refresh');
  } catch {
    return false;
  }
}

const jwtMiddleware: Middleware = {
  async onRequest({ request }) {
    // Stash a clone before the body is consumed — see preConsumeClones.
    if (request.body !== null && !isAuthRefreshUrl(request.url)) {
      try {
        preConsumeClones.set(request, request.clone());
      } catch {
        // A request with a non-cloneable stream (e.g. a worker-piped FormData)
        // gives up retry-friendliness in exchange for not crashing the
        // outbound call. Acceptable for the demo.
      }
    }

    const provider = currentProvider();
    let access = provider.getAccessToken();
    if (access !== null) {
      const exp = unsafeDecodeExp(access);
      const now = Math.floor(Date.now() / 1_000);
      if (exp !== null && exp - now < REFRESH_SKEW_SECONDS) {
        const refresh = provider.getRefreshToken();
        if (refresh !== null) {
          const fresh = await refreshAccessTokenViaBackend(refresh);
          if (fresh !== null) {
            provider.setAccessToken(fresh.access);
            // Wave 10.E (PRD-022): persist rotated refresh token so the
            // next proactive refresh presents a fresh jti.
            provider.setRefreshToken?.(fresh.refresh);
            access = fresh.access;
          }
        }
      }
      request.headers.set('authorization', `Bearer ${access}`);
    }
    return request;
  },

  async onResponse({ request, response }) {
    if (response.status !== 401) return response;
    // U-1.c: never recurse on the refresh endpoint itself.
    if (isAuthRefreshUrl(request.url)) return response;

    const provider = currentProvider();
    const refresh = provider.getRefreshToken();
    if (refresh === null) return response;
    const fresh = await refreshAccessTokenViaBackend(refresh);
    if (fresh === null) return response;
    provider.setAccessToken(fresh.access);
    // Wave 10.E (PRD-022): persist rotated refresh token (reactive branch).
    provider.setRefreshToken?.(fresh.refresh);

    // U-1.b: rebuild the request from the pre-consumption clone so POST/PUT
    // bodies survive the retry, and reuse the same header set that the
    // middleware chain (tenant header, content-type, anything user code
    // injected) already populated. Authorization is the only thing we need
    // to overwrite.
    const original = preConsumeClones.get(request) ?? request;
    const retryHeaders = new Headers(original.headers);
    retryHeaders.set('authorization', `Bearer ${fresh.access}`);
    let retryBody: BodyInit | null = null;
    if (original.body !== null) {
      try {
        retryBody = (await original.clone().arrayBuffer()) as ArrayBuffer;
      } catch {
        // If body cloning fails on retry, send headers-only — better than
        // crashing the request.
        retryBody = null;
      }
    }
    const retryReq = new Request(original.url, {
      method: original.method,
      headers: retryHeaders,
      body: retryBody,
    });
    return fetch(retryReq);
  },
};

export const api = createClient<ApiPaths>({
  baseUrl: API_BASE_URL,
  headers: {
    'X-Tenant-ID': TENANT_ID,
    'content-type': 'application/json',
  },
});

api.use(tenantHeaderMiddleware);
api.use(jwtMiddleware);

export const apiConfig = {
  baseUrl: API_BASE_URL,
  tenantId: TENANT_ID,
} as const;
