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
 *
 * Env:
 *   - `PUBLIC_API_BASE_URL` (default `http://localhost:3031`)
 *   - `PUBLIC_TENANT_ID`    (default `tenant-acme`)
 */
import createClient, { type Middleware } from 'openapi-fetch';
import type { PlaceholderPaths } from '@gertsai-examples/m9s-example-api-types';
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
}

const noopProvider: JwtTokenProvider = {
  getAccessToken: () => null,
  setAccessToken: () => undefined,
  getRefreshToken: () => null,
};

let tokenProvider: JwtTokenProvider = noopProvider;

/**
 * Wire a token provider for the lifetime of one server request — call
 * inside `+page.server.ts` `load` / `actions` BEFORE issuing API calls.
 * Pass `null` (or omit) to reset to the anonymous no-op.
 */
export function setJwtTokenProvider(provider: JwtTokenProvider | null): void {
  tokenProvider = provider ?? noopProvider;
}

const REFRESH_SKEW_SECONDS = 60;

async function refreshAccessTokenViaBackend(refreshToken: string): Promise<string | null> {
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
    return typeof inner.token === 'string' ? inner.token : null;
  } catch {
    return null;
  }
}

const jwtMiddleware: Middleware = {
  async onRequest({ request }) {
    // 1. Proactive refresh if expiry is near.
    let access = tokenProvider.getAccessToken();
    if (access !== null) {
      const exp = unsafeDecodeExp(access);
      const now = Math.floor(Date.now() / 1_000);
      if (exp !== null && exp - now < REFRESH_SKEW_SECONDS) {
        const refresh = tokenProvider.getRefreshToken();
        if (refresh !== null) {
          const fresh = await refreshAccessTokenViaBackend(refresh);
          if (fresh !== null) {
            tokenProvider.setAccessToken(fresh);
            access = fresh;
          }
        }
      }
      request.headers.set('authorization', `Bearer ${access}`);
    }
    return request;
  },

  async onResponse({ request, response }) {
    // 2. Reactive refresh on 401 — single retry.
    if (response.status !== 401) return response;
    const refresh = tokenProvider.getRefreshToken();
    if (refresh === null) return response;
    const fresh = await refreshAccessTokenViaBackend(refresh);
    if (fresh === null) return response;
    tokenProvider.setAccessToken(fresh);

    const retryHeaders = new Headers(request.headers);
    retryHeaders.set('authorization', `Bearer ${fresh}`);
    const retryReq = new Request(request.url, {
      method: request.method,
      headers: retryHeaders,
      body: request.body,
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
