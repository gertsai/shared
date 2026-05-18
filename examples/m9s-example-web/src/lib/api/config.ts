// SPDX-License-Identifier: Apache-2.0
/**
 * Browser-safe API configuration constants for the m9s-example web app.
 *
 * Split out from `$lib/api/client` in Wave 12.E-fix-2 Phase 2 (EVID-053 H-5)
 * so client-side code (e.g. the ingest page XHR upload) can read the base
 * URL + tenant ID without dragging the server-only openapi-fetch client and
 * `node:async_hooks` into the browser bundle. SvelteKit's `PUBLIC_*` env
 * convention applies: only variables prefixed with `PUBLIC_` are baked into
 * the client bundle by Vite (see https://kit.svelte.dev/docs/modules#$env-static-public).
 *
 * Env:
 *   - `PUBLIC_API_BASE_URL` (default `http://localhost:3031`)
 *   - `PUBLIC_TENANT_ID`    (default `tenant-acme`)
 */

const DEFAULT_API_BASE_URL = 'http://localhost:3031';
const DEFAULT_TENANT_ID = 'tenant-acme';

/**
 * Read an env value with a fallback. Uses `process.env` only when defined
 * (SvelteKit server runtime) — in the browser bundle Vite statically inlines
 * `import.meta.env.PUBLIC_*`, but we want a single helper that works in both
 * universes, so we go through the runtime check.
 */
function readEnv(key: string, fallback: string): string {
  if (typeof process !== 'undefined' && process.env && typeof process.env[key] === 'string') {
    return process.env[key] as string;
  }
  // Vite replaces `import.meta.env.PUBLIC_*` references at build time inside
  // browser code. Guarded with a typeof check so the server bundle (which
  // uses Node's process.env path above) doesn't trip on it either.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const viteEnv: Record<string, unknown> | undefined =
    typeof import.meta !== 'undefined'
      ? ((import.meta as unknown) as { env?: Record<string, unknown> }).env
      : undefined;
  if (viteEnv !== undefined && typeof viteEnv[key] === 'string') {
    return viteEnv[key] as string;
  }
  return fallback;
}

export const API_BASE_URL = readEnv('PUBLIC_API_BASE_URL', DEFAULT_API_BASE_URL);
export const TENANT_ID = readEnv('PUBLIC_TENANT_ID', DEFAULT_TENANT_ID);

/**
 * Public, browser-safe view of the API configuration. Mirrors the shape
 * `$lib/api/client` exports (so server code can still import either —
 * `client` re-exports this for backwards compat).
 */
export const apiConfig = {
  baseUrl: API_BASE_URL,
  tenantId: TENANT_ID,
} as const;
