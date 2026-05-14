// SPDX-License-Identifier: Apache-2.0
/**
 * Wave 10.A error hook (Teammate B).
 *
 * Runs in the SvelteKit server runtime whenever `load`, `action`, or `handle`
 * throws an unexpected error (HTTP errors thrown via `error(status, …)` flow
 * straight to the route's `+error.svelte` and do **not** invoke this hook).
 *
 * Responsibilities:
 *   1. Generate a stable `requestId` (UUID v4 via `crypto.randomUUID`) for
 *      cross-system correlation.
 *   2. Log the full error structure to the server (stderr in dev; a real app
 *      would wire `@gertsai/logger-factory`'s redacted backend here).
 *   3. Return the **user-safe** shape `{ message, code, requestId }`. The
 *      shape is reflected into `App.Error` (see app.d.ts) so route
 *      `+error.svelte` files get typed access via `$page.error`.
 *
 * No browser APIs (this is server-side only).
 */
import type { HandleServerError } from '@sveltejs/kit';

export const errorHandler: HandleServerError = ({ error, event, status, message }) => {
  const requestId =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `req-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

  const rawMessage = error instanceof Error ? error.message : String(message ?? 'Unknown error');
  const code = error instanceof Error && 'code' in error ? String((error as { code?: unknown }).code) : undefined;
  const userId = (event.locals as { user?: { id?: string } } | undefined)?.user?.id;

  // Structured log line — single console.error so log scrapers can pick it up.
  // Real deployments wire @gertsai/logger-factory (peer-optional) and feed
  // these fields into the redact-list so PII never lands in stdout.
  // eslint-disable-next-line no-console
  console.error('[handleError]', {
    requestId,
    status,
    url: event.url.pathname + event.url.search,
    userId,
    code,
    message: rawMessage,
    stack: error instanceof Error ? error.stack : undefined,
  });

  // User-safe shape. Never leak stack traces / internal SQL errors.
  return {
    message: status && status < 500 ? rawMessage : 'An unexpected error occurred',
    code,
    requestId,
  };
};
