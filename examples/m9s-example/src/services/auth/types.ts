/**
 * Auth Service Types — Wave 10.A m9s-auth-ui-jwt, hardened Wave 11.A.
 *
 * Wave 11.A (PRD-023, FR-001 / FR-002) replaced the "accept any
 * credentials" demo path with real bcrypt verification through
 * `IUserRepo` and removed the JWT default-secret fallback. `JWT_SECRET`
 * is now a hard boot requirement. The transport contract below is
 * unchanged — only the implementation behind it changed.
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

/**
 * `POST /api/v1/auth/refresh` — response body.
 *
 * Wave 10.E (PRD-022): the refresh token is now rotated on every successful
 * refresh — the response carries BOTH a new access token and a new refresh
 * token. Clients MUST overwrite their stored refresh token; presenting the
 * previous one again triggers reuse-detection and revokes the user's
 * entire refresh chain (every jti minted for that user is marked used).
 */
export interface RefreshResponse {
  token: string;
  /** Rotated refresh token — replaces the one the caller presented. */
  refreshToken: string;
  /** ISO-8601 expiry of `token`. */
  expiresAt: string;
}

/** `POST /api/v1/auth/logout` — request body (no fields; JWT is stateless). */
export type LogoutRequest = Record<string, never>;

/** `POST /api/v1/auth/logout` — response body. */
export interface LogoutResponse {
  ok: true;
}
