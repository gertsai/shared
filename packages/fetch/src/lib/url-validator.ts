// SPDX-License-Identifier: Apache-2.0
/**
 * URL validation utilities to prevent SSRF attacks.
 *
 * @module lib/url-validator
 * @description Thin shim re-exporting the canonical SSRF validator from
 *   `@gertsai/utils/security`. Kept here for back-compat with the
 *   internal `undiciFetcher` consumer and any external code that
 *   imported `validateUrl` / `assertSafeUrl` / `createUrlValidator`
 *   from `@gertsai/fetch`.
 *
 * Wave 14.3 (PRD-045 / EVID-057): consolidated to break the drift
 * between this package's result-shape validator and
 * `@gertsai/utils`' throw-primary `validateWebhookUrl`. Both now share
 * one implementation owned by `@gertsai/utils/security` (Tier-1, zero
 * internal deps).
 *
 * @deprecated Use `validateUrl` / `assertSafeUrl` / `createUrlValidator`
 *   from `@gertsai/utils` (or its `security` subpath) directly. This
 *   shim will be removed in `@gertsai/fetch@0.3.0`.
 *
 * @see https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html
 */

export {
  validateUrl,
  assertSafeUrl,
  createUrlValidator,
  type UrlValidatorConfig,
  type UrlValidationResult,
} from '@gertsai/utils';
