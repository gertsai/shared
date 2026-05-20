// SPDX-License-Identifier: Apache-2.0
/**
 * Legacy OAuth module — REMOVED in Wave 16.A.
 *
 * The previous `OAuth` class (oauth2-server wrapper), `AuthProvider` registry,
 * and the `MX()` Moleculer mixin were deleted because:
 *
 *   - The module was self-flagged `@deprecated` since v0.1.x.
 *   - Zero active external consumers (Wave 16.A grep audit across
 *     `packages/*` and `examples/*` confirmed only `apiGateService.template.ts`
 *     internally mounted `MX()` — the example app already used
 *     `disableAuth: true`).
 *   - 494 LOC of deprecated-but-default code was the largest single chunk
 *     of dead surface in `@gertsai/api-core`.
 *
 * Migration path for any downstream consumer:
 *
 *   - Mount your own authentication middleware in `settings.use` (any
 *     Express-style handler will work — moleculer-web hands the request
 *     through the chain).
 *   - For Firebase / JWT verification, swap to the dedicated auth packages
 *     under your own scope.
 *   - The `OIDCError` class in `@gertsai/api-core` (under `./lib/error`) is
 *     unrelated to this removal — it is the **modern** RFC-6749 error
 *     surface and stays.
 *
 * This stub exists so that `import '@gertsai/api-core/oauth'` does not
 * silently link an empty module — it throws loudly at import time so the
 * migration is visible. If you only need the type names for back-compat,
 * pin to `@gertsai/api-core@0.3.x`.
 */

const message =
  "@gertsai/api-core: the legacy OAuth module (OAuth class, MX() mixin, " +
  'AuthProvider registry) was removed in Wave 16.A. Mount your own ' +
  'authentication middleware in `settings.use`, or pin to ' +
  '@gertsai/api-core@0.3.x if you still need the legacy surface. See ' +
  'CHANGELOG for the full migration note.';

throw new Error(message);
