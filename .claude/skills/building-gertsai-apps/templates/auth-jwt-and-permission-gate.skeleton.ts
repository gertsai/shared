// @ts-nocheck — TEMPLATE skeleton: copy into your @gertsai/Moleculer app and adapt the TODOs.
// Imports (@gertsai/*, app-relative paths) resolve only inside a consuming app, not in this repo.
// Some skeletons concatenate several files under "// ===== FILE: <path> =====" banners — split on paste.
// Delete this header once pasted into a real, typed project.
// SPDX-License-Identifier: Apache-2.0
// ===========================================================================
// AUTH & AUTHORIZATION skeleton, derived from examples/m9s-example.
// Three pieces: (1) JWT helpers, (2) a login action, (3) an IPermissionGate
// adapter + its use-case enforcement call site.
// ===========================================================================

// ---------------------------------------------------------------------------
// 1) JWT sign/verify helpers  — src/services/auth/src/jwt.ts
// ---------------------------------------------------------------------------
import { randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';

const ISSUER = 'my-app';                 // TODO: your issuer
const ACCESS_TTL_SECONDS = 15 * 60;      // short-lived access token
const REFRESH_TTL_SECONDS = 24 * 60 * 60;

// TODO: define your claim shape; mirror it in a SHARED package so web + backend agree.
export interface JwtClaims {
  sub: string; email: string; tenantId: string;
  kind: 'access' | 'refresh';
  iat: number; exp: number; iss: string;
  jti?: string; // refresh tokens only
}

/** Hard-fail when the secret is unset — never ship a default secret (CWE-798). */
function getSecret(): string {
  const fromEnv = process.env.JWT_SECRET;
  if (!fromEnv || fromEnv.length === 0) throw new Error('JWT_SECRET must be set');
  return fromEnv;
}

export function signAccessToken(user: { id: string; email: string; tenantId: string }) {
  const token = jwt.sign(
    { email: user.email, tenantId: user.tenantId, kind: 'access' },
    getSecret(),
    { algorithm: 'HS256', issuer: ISSUER, subject: user.id, expiresIn: ACCESS_TTL_SECONDS },
  );
  return { token, expiresAt: new Date(Date.now() + ACCESS_TTL_SECONDS * 1000).toISOString() };
}

export function signRefreshToken(user: { id: string; email: string; tenantId: string }) {
  const jti = randomUUID(); // unique per refresh token — the rotation store keys on this
  const token = jwt.sign(
    { email: user.email, tenantId: user.tenantId, kind: 'refresh', jti },
    getSecret(),
    { algorithm: 'HS256', issuer: ISSUER, subject: user.id, expiresIn: REFRESH_TTL_SECONDS },
  );
  return { token, jti };
}

/** Return typed claims on success, null on ANY failure. Validate every field before trusting. */
export function verifyToken(token: string): JwtClaims | null {
  try {
    const decoded = jwt.verify(token, getSecret(), { algorithms: ['HS256'], issuer: ISSUER });
    if (typeof decoded === 'string') return null;
    const p = decoded as Record<string, unknown>;
    if (
      typeof p.sub !== 'string' || typeof p.email !== 'string' ||
      typeof p.tenantId !== 'string' ||
      (p.kind !== 'access' && p.kind !== 'refresh') ||
      typeof p.iat !== 'number' || typeof p.exp !== 'number' || typeof p.iss !== 'string'
    ) return null;
    if (p.kind === 'refresh' && typeof p.jti !== 'string') return null; // refresh MUST carry jti
    return {
      sub: p.sub, email: p.email, tenantId: p.tenantId, kind: p.kind,
      iat: p.iat, exp: p.exp, iss: p.iss,
      ...(typeof p.jti === 'string' && { jti: p.jti }),
    };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// 2) Login action  — src/services/<svc>/src/actions/login.action.ts
// ---------------------------------------------------------------------------
import { APIError, ResponseCode } from '@gertsai/api-core/contracts';
import { defineAction } from '@gertsai/api-core/moleculer';
import bcrypt from 'bcrypt';
import typia from 'typia';
// import { resolveExampleController } from '...';  // TODO: your controller resolver
// import { signAccessToken, signRefreshToken } from '../jwt';
// import type { AuthServiceContext, LoginRequest, LoginResponse } from '../../types';

// Fixed dummy bcrypt hash for the unknown-email branch (always fails to match).
const DUMMY_HASH = '$2a$10$CwTycUXWue0Thq9StjUM0uJ8b6f7T8c0jL9F1d.lQNJq3D7nO7m1u';
const REFRESH_TTL_SECONDS = 24 * 60 * 60;

const controller = resolveExampleController<'v1', 'auth', AuthServiceContext>('v1', 'auth'); // TODO

export const login = defineAction(controller.register('login', {
  auth: 'none',                       // login itself is unauthenticated
  rest: 'POST /auth/login',
  params: typia.createValidate<LoginRequest>(),
  response: typia.createValidate<LoginResponse>(),
  responseCode: ResponseCode.SUCCESS,
  responseMessage: 'Login successful',
  async handler({ params, service, logger, respond }) {
    const { email, password } = params;
    const record = await getUserRepo().findByEmail(email); // TODO: your IUserRepo (bcrypt hashes only)

    // Constant-time anti-enumeration: ALWAYS run a bcrypt compare.
    let passwordMatches: boolean;
    if (record) {
      passwordMatches = await bcrypt.compare(password, record.passwordHash);
    } else {
      await bcrypt.compare(password, DUMMY_HASH); // spend the same CPU; discard
      passwordMatches = false;
    }
    if (!record || !passwordMatches) {
      // SAME message for unknown-email and wrong-password (CWE-204).
      throw new APIError(ResponseCode.FORBIDDEN__INSUFFICIENT_RIGHTS, undefined, 'Invalid email or password');
    }

    const user = { id: record.id, email: record.email, tenantId: record.tenantId };
    const { token, expiresAt } = signAccessToken(user);
    const { token: refreshToken, jti } = signRefreshToken(user);
    // Register the refresh jti in the DI'd rotation store so refresh can detect reuse.
    await service.rotationStore.registerJti(
      jti, user.id, Math.floor(Date.now() / 1000) + REFRESH_TTL_SECONDS,
    );
    logger.info('[auth.login] issued token', { userId: user.id, tenantId: user.tenantId }); // no PII
    return respond({ token, refreshToken, user, expiresAt }, 'Login successful');
  },
}));

// ---------------------------------------------------------------------------
// 3a) Authorization port  — src/domain/ports/IPermissionGate.ts
// ---------------------------------------------------------------------------
export interface IPermissionGate {
  /** action = app verb ('ingest','search'); resource = id or '*'. Returns true if granted. */
  can(userId: string, action: string, resource: string): Promise<boolean>;
}

// ---------------------------------------------------------------------------
// 3b) OpenFGA adapter  — src/infrastructure/openfga-permission.gate.ts
// ---------------------------------------------------------------------------
import type { FgaResourceType, FgaCheckRequest, FgaClientConfig } from '@gertsai/auth-openfga';
// import type { IPermissionGate } from '../domain/ports/IPermissionGate';

const ACTION_TO_RELATION: Readonly<Record<string, string>> = {
  ingest: 'can_edit',   // TODO: map your app verbs to OpenFGA relations
  search: 'can_view',
};

export class OpenFgaPermissionGate implements IPermissionGate {
  constructor(
    private readonly opts: { client?: Pick<FgaClientConfig, 'apiUrl' | 'storeId' | 'apiToken'>;
      logger?: { warn: (...a: unknown[]) => void; error: (...a: unknown[]) => void } } = {},
  ) {}

  async can(userId: string, action: string, resource: string): Promise<boolean> {
    const relation = ACTION_TO_RELATION[action];
    if (!relation) { (this.opts.logger ?? console).warn(`no relation for '${action}'`); return false; }
    const [resourceType, resourceId] = resource.includes(':')
      ? (resource.split(':', 2) as [FgaResourceType, string])
      : (['tenant' as FgaResourceType, resource === '*' ? 'global' : resource]);
    try {
      // Lazy import so the app boots even when OpenFGA is unreachable / not used.
      const mod = await import('@gertsai/auth-openfga');
      const req: FgaCheckRequest = { userId, relation, resourceType, resourceId };
      const result = await mod.checkPermission(req); // pass a scoped client for multi-store deploys
      return result.allowed;
    } catch (err) {
      // FAIL-CLOSED: never rethrow, never grant on error. Log a MASKED id.
      (this.opts.logger ?? console).error('[gate] check failed — denying', {
        cause: err instanceof Error ? err.message : err, action,
      });
      return false;
    }
  }
}

// ---------------------------------------------------------------------------
// 3c) Enforcement inside a use case  — src/application/<X>UseCase.ts
// ---------------------------------------------------------------------------
import { assertAuthenticated, assertSessionInTenant } from '@gertsai/session-guard';
// const allowed = await gate.can(userId, 'ingest', docId);  // BEFORE any side effect
// if (!allowed) throw permissionDenied(userId, 'ingest', docId);  // fail closed
