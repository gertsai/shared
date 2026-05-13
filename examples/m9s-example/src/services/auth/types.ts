/**
 * Auth Service Types — Wave 10.A m9s-auth-ui-jwt.
 *
 * DEMO-ONLY contract. NOT a real authentication system:
 *   - accepts ANY email + password combination
 *   - returns a fixed-shape demo user derived from the email
 *   - HS256 secret defaults to a placeholder (`demo-secret-do-not-use-in-prod`)
 *
 * Production wiring (out of scope for Wave 10.A) would replace
 * `loginAction` with a real password verifier + user repo, and require
 * `JWT_SECRET` to be set to a high-entropy value at boot.
 *
 * Mirrors the shape of `services/ingest/types.ts`:
 * `ServiceContextBase` extension + plain transport request/response types
 * shaped for typia validation.
 */
import type { ServiceContextBase } from '@gertsai/api-core/moleculer';

// =============================================================================
// Service Context
// =============================================================================

/**
 * Stateless service — no use case or adapters; JWT sign/verify are pure
 * functions imported directly by each action. The empty extension keeps
 * the type symbol parity with ingest/search for future expansion.
 */
export type AuthServiceContext = ServiceContextBase;

// =============================================================================
// Demo user shape
// =============================================================================

/** Subject of every issued token. Matches `App.Locals.user` on the web app. */
export interface DemoUser {
  id: string;
  email: string;
  tenantId: string;
}

// =============================================================================
// REST contracts
// =============================================================================

/** `POST /api/v1/auth/login` — request body. */
export interface LoginRequest {
  email: string;
  password: string;
}

/** `POST /api/v1/auth/login` — response body. */
export interface LoginResponse {
  token: string;
  refreshToken: string;
  user: DemoUser;
  /** ISO-8601 expiry of `token` (NOT `refreshToken`). */
  expiresAt: string;
}

/** `POST /api/v1/auth/refresh` — request body. */
export interface RefreshRequest {
  refreshToken: string;
}

/** `POST /api/v1/auth/refresh` — response body. New access token only. */
export interface RefreshResponse {
  token: string;
  expiresAt: string;
}

/** `POST /api/v1/auth/logout` — request body (no fields; JWT is stateless). */
export type LogoutRequest = Record<string, never>;

/** `POST /api/v1/auth/logout` — response body. */
export interface LogoutResponse {
  ok: true;
}
