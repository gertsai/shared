# Auth & authorization (JWT + OpenFGA)

## What & why

`m9s-example` splits **authentication** (who you are) from **authorization**
(what you may do) cleanly — the two never mix in one module.

**Authentication** is JWT-based. HS256 **access** tokens (15 min) and **refresh**
tokens (24 h) are signed and verified by pure helpers in
`services/auth/src/jwt.ts`. Refresh tokens carry a unique `jti` and use
**rotation + reuse-detection** backed by a DI'd `IRotationStore` (in-memory or
Redis). Login verifies bcrypt-hashed credentials with a **constant-time
anti-enumeration** compare.

**Authorization** is a hexagonal port — `IPermissionGate.can(userId, action,
resource)` — with two adapters: `AllowAllPermissionGate` (dev) and
`OpenFgaPermissionGate` (delegates to `@gertsai/auth-openfga` ReBAC,
fail-closed). The adapter is selected by env at the composition root and the
gate is enforced **inside use cases, before any side effect**.

The payoff of the split: you can change auth engines independently. A use case
asks `gate.can(userId, action, resource)` without knowing whether enforcement is
OpenFGA, Cedar, or always-allow; the JWT layer never decides permissions, only
establishes who the caller is.

## How it works in m9s-example

### Pattern: Authentication vs authorization split

- **What** — JWT proves identity (`sub` / `email` / `tenantId` / `kind`
  claims); a separate `IPermissionGate` decides if that identity may perform an
  action on a resource. The two concerns live in separate modules.
- **Why** — lets you swap auth engines independently. The use case asks
  `gate.can(userId, action, resource)` without knowing the enforcement engine;
  the JWT layer never decides permissions, only who the caller is.
- **How** — `verifyToken()` (`jwt.ts`) returns typed `JwtClaims`; the
  `userId` / `tenantId` flow into the use case, which then calls `gate.can(...)`.
  See `SearchDocumentsUseCase.ts:95` and `IngestDocumentUseCase.ts:110`.

### Pattern: Refresh-token rotation with reuse detection

- **What** — each refresh token carries a unique `jti` registered in a rotation
  store. On refresh the `jti` is **atomically consumed** (usable → used) and a
  **new** refresh token is minted. Presenting an already-used `jti` is treated
  as theft and revokes the user's entire chain.
- **Why** — stateless JWTs cannot be revoked individually; rotation plus a small
  server-side `jti` ledger gives stolen-token detection without a full session
  store. `revokeUser` kills every live refresh token for the user on replay.
- **How** — `signRefreshToken` returns `{token, jti}`; `login` / `refresh` call
  `service.rotationStore.registerJti(jti, userId, exp)`. `refresh.action.ts:77`
  calls `consumeJti` and, on `reason === 'reuse'`, `revokeUser(claims.sub)`. All
  consume failures (`reuse` | `expired` | `unknown`) return one identical 401 so
  attackers can't fingerprint the outcome (EVID-039).

### Pattern: IRotationStore DI via service context (not a module singleton)

- **What** — the rotation store is selected once at the composition root (Redis
  vs in-memory by `REDIS_URL`) and attached to `ctx.service.rotationStore` in the
  service lifecycle's `addStartedHandler`. Actions read `service.rotationStore`.
- **Why** — Wave 12.E-fix-2 (CWE-613) fixed a real bug: a module-level `Map`
  facade bypassed the composition-root selection, so the env-driven
  `RedisRotationStore` was wired but **never consumed** — multi-instance prod
  deploys silently lost reuse-detection across nodes, and restarts wiped
  in-memory state.
- **How** — `composition/infrastructure.ts:126` `pickRotationStore()`;
  `lifecycle.ts:61` sets `ctx.service.rotationStore = infrastructure.rotationStore`;
  actions call `service.rotationStore.consumeJti(...)`. The pruner is started
  exactly once in `buildInfrastructure()`.

### Pattern: IPermissionGate port + env-selected adapter, fail-closed

- **What** — a one-method port `can(userId, action, resource): Promise<boolean>`.
  `AllowAllPermissionGate` (dev) returns `true`; `OpenFgaPermissionGate` delegates
  to `@gertsai/auth-openfga` and returns `false` on ANY error.
- **Why** — hexagonal: use cases depend only on the interface, so the enforcement
  engine swaps with zero application changes. Fail-closed means a misconfigured or
  unreachable OpenFGA **denies** rather than grants (ADR-011 I-4). `allow-all` is
  refused under `NODE_ENV=production` to prevent accidental open deploys.
- **How** — `composition/infrastructure.ts:144` `pickGate()` switches on
  `AUTH_GATE`; `openfga-permission.gate.ts:155` `can()` maps action → relation,
  decodes the resource, lazy-imports the SDK, and wraps in a `try/catch` returning
  `false` and logging a **masked** resource id.

### Pattern: Constant-time anti-enumeration login

- **What** — login ALWAYS runs a bcrypt compare — against the real hash if the
  email is known, against a fixed `DUMMY_HASH` if not — then returns the SAME
  generic 401 for both unknown-email and wrong-password.
- **Why** — prevents user-enumeration via response content (CWE-204) and via a
  timing side-channel (CWE-208 / timing oracle). Without the dummy compare, an
  unknown email returns faster, leaking which emails are registered.
- **How** — `login.action.ts:114-130`: if `record` →
  `compare(password, record.passwordHash)`, else
  `compare(password, DUMMY_HASH)` and discard; both paths throw
  `ResponseCode.FORBIDDEN__INSUFFICIENT_RIGHTS` with `'Invalid email or password'`.

### Pattern: Defense-in-depth on raw HTTP endpoints (SSE)

- **What** — endpoints outside the Moleculer action pipeline (the SSE stream
  handler) re-do JWT auth manually: read the `auth_token` cookie, `verifyToken`,
  require `kind === 'access'`, and cross-check `claims.tenantId` against the
  requested `tenantId`.
- **Why** — the SvelteKit `sessionMiddleware` → `RequestContext` path only covers
  action handlers. A raw HTTP handler that trusted a client-supplied `tenantId`
  query param was an IDOR (CWE-639): tenant A could subscribe to tenant B's
  stream. The claim is the source of truth, not the query param.
- **How** — `sse-ingest.handler.ts:298-322`: `readCookie(req,'auth_token')` → 401
  if missing; `verifyToken` → 401 if null or `kind !== 'access'`;
  `claims.tenantId !== tenantId` → 403 `tenant_scope_violation`.

## Template

```ts
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
```

> The full standalone skeleton lives in
> [`templates/auth-jwt-and-permission-gate.skeleton.ts`](../templates/auth-jwt-and-permission-gate.skeleton.ts).

## Best practices

- Make `JWT_SECRET` a hard boot requirement: throw if unset, in BOTH the
  sign/verify helper (`getSecret`) and the service lifecycle `addStartedHandler`
  so it fails synchronously at boot, not on first request. No default-secret
  fallback, no opt-in escape hatch (`jwt.ts:46`, `lifecycle.ts:49`).
- `verifyToken` returns `null` on ANY failure and validates every claim field's
  type before returning; callers MUST then check `claims.kind` (`access` vs
  `refresh`) — never trust a refresh token where an access token is expected
  (`jwt.ts:115`, `sse-ingest.handler.ts:307`).
- Give every refresh token a unique `jti` via `randomUUID` and track it in
  `IRotationStore`; rotate the refresh token on every successful refresh and
  `revokeUser` the whole chain on reuse (theft signal) — `refresh.action.ts:77`.
- Store only bcrypt hashes (cost 10 baseline), never plaintext; even env-supplied
  seed passwords are hashed at boot (`user-repo.ts:99`). Use `bcrypt.compare`, not
  string equality.
- On login, return ONE generic message for both unknown-email and wrong-password,
  and ALWAYS run a bcrypt compare (against a dummy hash when the email is unknown)
  to neutralize timing oracles (`login.action.ts:114`, CWE-204/208).
- Keep authorization behind the `IPermissionGate` port; use cases call
  `gate.can(userId, action, resource)` and throw `permissionDenied` on `false` —
  authZ runs BEFORE any side effect (`IngestDocumentUseCase.ts:110`).
- Make the production gate FAIL-CLOSED: any throw (OpenFGA unreachable, missing
  tuple, bad model) is caught, logged with a MASKED resource id, and returns
  `false` — never rethrow, never grant (`openfga-permission.gate.ts:222`).
- Select gate + rotation-store impls by env at the SINGLE composition root and
  refuse unsafe combos: `AUTH_GATE='allow-all'` throws under
  `NODE_ENV=production`; `AUTH_GATE='openfga'` throws without `FGA_STORE_ID`
  (`infrastructure.ts:144`).
- Inject the rotation store through `ctx.service` (DI seam) rather than a
  module-level singleton, so the env-driven Redis-vs-memory choice is actually
  honored across all call sites (`lifecycle.ts:61`).
- Lazy-import `@gertsai/auth-openfga` inside `can()`, not at module top, so
  services using the dev gate still boot when OpenFGA is down
  (`openfga-permission.gate.ts:173`).
- Re-authenticate on any raw HTTP endpoint outside the Moleculer action pipeline
  (e.g. SSE): verify the JWT cookie and cross-check `claims.tenantId` against the
  requested tenant — never trust a client-supplied tenant param
  (`sse-ingest.handler.ts:298`, CWE-639).
- Log `userId` + `tenantId`, never email or token contents — email is PII and
  tokens are credentials (`login.action.ts:151`, CWE-532).

## Pitfalls

- **Module-level singleton bypassing DI**: the historic rotation-store `Map`
  facade was static-imported by the actions, so the composition-root's Redis
  selection was wired but never consumed — multi-instance prod silently lost
  reuse-detection across nodes and restarts wiped state (`rotation-store.ts` is
  now an empty `@deprecated` tombstone explaining this; CWE-613). Always reach the
  DI'd `service.rotationStore`.
- **Distinguishing `consumeJti` failure reasons to the client**: surfacing
  `reuse` vs `expired` vs `unknown` in the HTTP response lets an attacker
  fingerprint whether their replay triggered reuse-detection. All three must
  return the SAME 401; keep the distinguishing `logger.error` server-side only
  (`refresh.action.ts`, EVID-039).
- **Trusting a JWT without checking `kind`**: an access-only endpoint that accepts
  a refresh token (or vice versa) is a privilege confusion. `verifyToken` returns
  claims for either kind — the caller must assert `claims.kind`.
- **Forgetting the dummy bcrypt compare on the unknown-email branch** reintroduces
  a timing oracle: the unknown path returns measurably faster, leaking which
  emails exist (CWE-208).
- **Shipping `AllowAllPermissionGate` to production**: it grants everything. The
  composition root must refuse it under `NODE_ENV=production` (it throws), and the
  gate warns loudly on construction — do not silence that warning.
- **Catch-and-grant in the gate**: returning `true` (or rethrowing into a handler
  that defaults to allow) on an OpenFGA error is fail-OPEN. The contract is
  fail-closed — errors deny.
- **`@gertsai/auth-openfga`'s `getFgaClient()` / `getPermissionCache()` are
  process-wide singletons**: once primed with the first config, a second gate with
  a different `apiUrl` / `storeId` may reuse the cached client. Use the per-config
  fingerprint scope (`mod.fingerprint` + scoped client) for multi-store deploys,
  and `resetFgaClient()` / `resetPermissionCache()` between test scenarios.
  Note: `apiToken` IS plumbed end-to-end to `@openfga/sdk` (Wave 6.2 / EVID-020) —
  disregard the stale "NOT plumbed" comment still lingering in the reference app's
  `project.config.ts`.
- **Leaking full resource ids into logs**: log lines are an exfiltration channel
  when an attacker probes with crafted resources. Mask ids (keep a short prefix)
  before logging (`maskResourceId`, `openfga-permission.gate.ts:117`).
- **Logout is a no-op for stateless JWT** — do not assume calling `/auth/logout`
  invalidates an outstanding access token. Real revocation needs a deny-list or
  short access TTL + refresh rotation (`logout.action.ts`).
- **Accepting a client-supplied `tenantId` on raw endpoints**: the SSE handler
  originally streamed whatever tenant the query param named, an IDOR. The JWT
  claim is the source of truth (`sse-ingest.handler.ts`, CWE-639).

## Canonical files

- [`examples/m9s-example/src/services/auth/src/jwt.ts:46`](../../../../examples/m9s-example/src/services/auth/src/jwt.ts#L46)
  — JWT secret resolution (hard-fails if `JWT_SECRET` unset, CWE-798) +
  `signAccessToken` / `signRefreshToken` (`jti`) / `verifyToken` HS256 helpers;
  claims validated field-by-field before trust.
- [`examples/m9s-example/src/services/auth/src/actions/login.action.ts:84`](../../../../examples/m9s-example/src/services/auth/src/actions/login.action.ts#L84)
  — login action via `defineAction`: `IUserRepo.findByEmail` + `bcrypt.compare`,
  constant-time dummy-hash compare for anti-enumeration (CWE-204/208), generic 401
  on both unknown-email and wrong-password, registers refresh `jti` in
  `service.rotationStore`.
- [`examples/m9s-example/src/services/auth/src/actions/refresh.action.ts:42`](../../../../examples/m9s-example/src/services/auth/src/actions/refresh.action.ts#L42)
  — refresh action: `verifyToken(refresh)` → atomic `consumeJti` → on `'reuse'`
  `revokeUser` (whole chain); mints + rotates a new refresh token; all failure
  modes return identical 401 to prevent fingerprinting.
- [`examples/m9s-example/src/services/auth/src/actions/logout.action.ts:26`](../../../../examples/m9s-example/src/services/auth/src/actions/logout.action.ts#L26)
  — logout action: intentional no-op (stateless JWT); documents what production
  would add (deny-list, audit-log).
- [`examples/m9s-example/src/services/auth/src/user-repo.ts:52`](../../../../examples/m9s-example/src/services/auth/src/user-repo.ts#L52)
  — `IUserRepo` port + `InMemoryUserRepo`: read-only bcrypt-hashed credential
  store (cost 10), returns `null` for unknown email, `seedDemoUsers()` hashes
  env-supplied passwords at boot.
- [`examples/m9s-example/src/services/auth/types.ts:40`](../../../../examples/m9s-example/src/services/auth/types.ts#L40)
  — `AuthServiceContext extends ServiceContextBase` with
  `rotationStore: IRotationStore`; `LoginRequest/Response`,
  `RefreshRequest/Response`, `LogoutRequest/Response` transport contracts
  (typia-validated).
- [`examples/m9s-example/src/services/auth/lifecycle.ts:38`](../../../../examples/m9s-example/src/services/auth/lifecycle.ts#L38)
  — auth lifecycle: `addStartedHandler` hard-fails on missing `JWT_SECRET` at
  boot, wires composition-root `rotationStore` onto `ctx.service.rotationStore`
  (DI seam).
- [`examples/m9s-example/src/domain/ports/IRotationStore.ts:56`](../../../../examples/m9s-example/src/domain/ports/IRotationStore.ts#L56)
  — outbound port for refresh-`jti` tracking: `registerJti` /
  `consumeJti(ConsumeResult discriminated reuse|expired|unknown)` / `revokeUser` /
  `pruneJtiStore` / `startPruner`.
- [`examples/m9s-example/src/domain/ports/IPermissionGate.ts:11`](../../../../examples/m9s-example/src/domain/ports/IPermissionGate.ts#L11)
  — authorization port: `can(userId, action, resource): Promise<boolean>`; use
  cases depend only on this so engines (OpenFGA/Cedar/OPA) swap with zero domain
  changes.
- [`examples/m9s-example/src/infrastructure/openfga-permission.gate.ts:122`](../../../../examples/m9s-example/src/infrastructure/openfga-permission.gate.ts#L122)
  — production gate: lazy-imports `@gertsai/auth-openfga`, maps app
  action → relation (`ingest→can_edit`, `search→can_view`), decodes `'type:id'` /
  `'*'` resources, per-config fingerprint client + cache, fail-closed (logs masked
  id, returns `false` on any throw).
- [`examples/m9s-example/src/infrastructure/allow-all-permission.gate.ts:12`](../../../../examples/m9s-example/src/infrastructure/allow-all-permission.gate.ts#L12)
  — dev-only gate: always returns `true`, warns once; refused under
  `NODE_ENV=production` by composition root.
- [`examples/m9s-example/src/composition/infrastructure.ts:144`](../../../../examples/m9s-example/src/composition/infrastructure.ts#L144)
  — composition root: `pickGate()` (`AUTH_GATE` env, `openfga` requires
  `FGA_STORE_ID`, `allow-all` refused in prod) + `pickRotationStore()`
  (`REDIS_URL` → Redis else in-memory) + `startPruner()` once.
- [`examples/m9s-example/src/application/SearchDocumentsUseCase.ts:95`](../../../../examples/m9s-example/src/application/SearchDocumentsUseCase.ts#L95)
  — enforcement call site: `assertAuthenticated` / `assertSessionInTenant`
  (session-guard) then `gate.can(userId,'search','*')` → `permissionDenied`; authZ
  before any side effect.
- [`examples/m9s-example/src/application/IngestDocumentUseCase.ts:110`](../../../../examples/m9s-example/src/application/IngestDocumentUseCase.ts#L110)
  — enforcement call site: `gate.can(userId,'ingest',docId)` fail-closed before
  building / persisting the document.
- [`examples/m9s-example/src/mol-services/sse-ingest.handler.ts:298`](../../../../examples/m9s-example/src/mol-services/sse-ingest.handler.ts#L298)
  — manual JWT auth on a raw HTTP/SSE endpoint: `readCookie(auth_token)` →
  `verifyToken` → `kind==='access'` check → `claims.tenantId === requested
  tenantId` (IDOR/CWE-639 guard) → 401/403.
- [`packages/auth-openfga/README.md:39`](../../../../packages/auth-openfga/README.md#L39)
  — `@gertsai/auth-openfga` surface: `getFgaClient` / `checkPermission` / `canView`
  / `canEdit`, `FGA_TYPES` / `FGA_RELATIONS` / `ACTION_TO_RELATION`, ABAC,
  deny-ledger, `/queries` + `/mutations` subpaths.

## @gertsai packages used

- `@gertsai/auth-openfga` — `FgaResourceType`, `FgaCheckRequest`,
  `FgaClientConfig`, `checkPermission`, `getFgaClient`, `fingerprint`.
- `@gertsai/api-core/contracts` — `APIError`, `ResponseCode`.
- `@gertsai/api-core/moleculer` — `defineAction`, `ServiceContextBase`.
- `@gertsai/session-guard` — `assertAuthenticated`, `assertSessionInTenant`.
- `@gertsai/session` — `Session`.
- `@gertsai/tenant` — `asTenantId`, `TenantId`.
