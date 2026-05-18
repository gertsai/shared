// SPDX-License-Identifier: Apache-2.0
/**
 * Auth API contract — Wave 12.E-fix-2 Phase 2 (PRD-039 / EVID-053 H-8).
 *
 * Canonical request/response types for the three auth endpoints:
 *
 *   - `POST /api/v1/auth/login`
 *   - `POST /api/v1/auth/refresh`
 *   - `POST /api/v1/auth/logout`
 *
 * Mirrors backend types in
 * `examples/m9s-example/src/services/auth/types.ts` field-for-field. Pre-fix,
 * the frontend (`m9s-example-web/src/routes/login/+page.server.ts`) redeclared
 * `LoginSuccessResponse` inline — auth contracts are the most security-
 * critical AND most likely to drift, so the inline duplicate was the easiest
 * thing to leave stale. Closes EVID-053 H-8.
 *
 * Single source of truth: this file. Backend optionally `import type` from
 * here for documentation; the canonical typia validators stay next to the
 * action handlers because typia constraints are compile-time-only.
 */

// =============================================================================
// User subject
// =============================================================================

/**
 * User subject carried inside the login response. Matches backend `DemoUser`
 * in `services/auth/types.ts:55-59` AND `App.Locals.user` on the web app.
 */
export interface AuthUser {
  readonly id: string;
  readonly email: string;
  readonly tenantId: string;
}

// =============================================================================
// Login
// =============================================================================

/** `POST /api/v1/auth/login` — request body. */
export interface LoginRequest {
  readonly email: string;
  readonly password: string;
}

/**
 * `POST /api/v1/auth/login` — successful response body.
 *
 * Note: at the wire layer api-core wraps this under `{ data: <response> }`
 * — see `unwrap()` helpers in the SvelteKit form actions.
 */
export interface LoginResponse {
  readonly token: string;
  readonly refreshToken: string;
  readonly user: AuthUser;
  /** ISO-8601 expiry of `token` (NOT `refreshToken`). */
  readonly expiresAt: string;
}

// =============================================================================
// Refresh
// =============================================================================

/** `POST /api/v1/auth/refresh` — request body. */
export interface RefreshRequest {
  readonly refreshToken: string;
}

/**
 * `POST /api/v1/auth/refresh` — successful response body.
 *
 * Wave 10.E (PRD-022) — refresh tokens rotate on every successful refresh.
 * Clients MUST overwrite their stored refresh token; presenting the previous
 * one again triggers reuse-detection and revokes the user's entire refresh
 * chain (every jti minted for that user is marked used).
 */
export interface RefreshResponse {
  readonly token: string;
  /** Rotated refresh token — replaces the one the caller presented. */
  readonly refreshToken: string;
  /** ISO-8601 expiry of `token`. */
  readonly expiresAt: string;
}

// =============================================================================
// Logout
// =============================================================================

/**
 * `POST /api/v1/auth/logout` — request body.
 *
 * No fields; JWTs are stateless and the demo backend logs the call as a
 * no-op. Defined as a closed empty object so the typia validator on the
 * backend rejects unexpected fields (defence-in-depth).
 */
export type LogoutRequest = Record<string, never>;

/**
 * `POST /api/v1/auth/logout` — response body. Always `{ ok: true }` (the
 * action is a no-op; failures, if any, surface as transport-level errors).
 */
export interface LogoutResponse {
  readonly ok: true;
}
