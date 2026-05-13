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

export const api = createClient<ApiPaths>({
  baseUrl: API_BASE_URL,
  headers: {
    'X-Tenant-ID': TENANT_ID,
    'content-type': 'application/json',
  },
});

api.use(tenantHeaderMiddleware);

export const apiConfig = {
  baseUrl: API_BASE_URL,
  tenantId: TENANT_ID,
} as const;
