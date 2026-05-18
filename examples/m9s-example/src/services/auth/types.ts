/**
 * Auth Service Types — Wave 10.A m9s-auth-ui-jwt, hardened Wave 11.A.
 *
 * Wave 11.A (PRD-023, FR-001 / FR-002) replaced the "accept any
 * credentials" demo path with real bcrypt verification through
 * `IUserRepo` and removed the JWT default-secret fallback. `JWT_SECRET`
 * is now a hard boot requirement. The transport contract below is
 * unchanged — only the implementation behind it changed.
 *
 * Wave 12.E-fix-2 (PRD-039 FR-001 / EVID-053 CRIT-1 / CWE-613):
 * `rotationStore` is now part of the service-context surface so action
 * handlers can reach the composition-root–selected `IRotationStore`
 * (in-memory or Redis) via `service.rotationStore` instead of the legacy
 * module-level singleton. Pre-fix, login/refresh static-imported a Map
 * facade so multi-instance deploys silently dropped reuse-detection state
 * across nodes; the DI'd handle restores both Redis and in-memory paths.
 *
 * Mirrors the shape of `services/ingest/types.ts`:
 * `ServiceContextBase` extension + plain transport request/response types
 * shaped for typia validation.
 */
import type { ServiceContextBase } from '@gertsai/api-core/moleculer';

import type { IRotationStore } from '../../domain/ports/IRotationStore';

// =============================================================================
// Service Context
// =============================================================================

/**
 * Auth service context.
 *
 * Wave 12.E-fix-2 (EVID-053 CRIT-1): the only property the auth service
 * keeps on `ctx.service` is the `rotationStore` selected by the
 * composition root (in-memory by default, Redis when `REDIS_URL` is set).
 * JWT sign/verify remain pure functions imported directly by each action;
 * `userRepo` continues to live in a module-level lazy cache for now —
 * follow-up Wave 12.E-fix-2 Phase 2+ will move it through DI too.
 */
export interface AuthServiceContext extends ServiceContextBase {
  /**
   * Refresh-token rotation + reuse-detection store. Wired by the lifecycle
   * `addStartedHandler` from `composition/infrastructure.ts` so production
   * (Redis) and dev (in-memory) deploys share the same code path —
   * closes EVID-053 CRIT-1 (FR-003 wired but never consumed, CWE-613).
   */
  rotationStore: IRotationStore;
}

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
