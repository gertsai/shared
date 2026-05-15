---
'@gertsai/api-core': minor
---

Wave 13 — close CRITICAL audit findings from EVID-043 (api-core Wave 12.A
deep-audit). 6 surgical fixes shipped together as a minor version bump
(some are behavior-changing, justified under 0.x SemVer).

**Security (4 fixes):**

- **CWE-347 (BYPASS_AUTH)**: `OAuth.authenticate` now hard-throws when
  `BYPASS_AUTH=true` AND `NODE_ENV === 'production'`. The env flag
  previously decoded Firebase JWT payload via `atob()` without
  verifying the signature — production deploys with this env set were
  trivially impersonatable.

- **CWE-942 (CORS)**: `ALLOWED_ORIGINS` is now parsed as a comma-
  separated allowlist by a new `parseCorsOrigins()` helper.
  Production + unset/empty/`'*'` → throw at boot (combined with
  `credentials: true` this would be the textbook CSRF-amplifier).
  Non-prod + unset → wildcard `'*'` with a console.warn so local-dev
  works out of the box. Default of `ALLOWED_ORIGINS` env changed from
  legacy string sentinel `'none'` to empty string `''`.

- **CWE-345 / CWE-770 (XFF rate-limit)**: API gateway rate limiter
  switched from raw `req.headers['x-forwarded-for']` to the hardened
  `extractClientIp()` helper (validates octet ranges, rejects CR/LF/NUL
  injection, selects last IP from XFF chain = trusted proxy hop).
  Previous code accepted any XFF value as-is — attackers rotating the
  header bypassed the limit trivially.

- **CWE-532 (debug logging)**: `apiGateService.template` default
  `logRequestParams` + `logResponseData` changed from `'debug'` to
  `null`. At debug level the gateway dumped OAuth password-grant
  credentials, `client_secret`, freshly-minted access tokens into logs.
  Consumers can still opt in via `settings: { logRequestParams: 'debug' }`.

**Logic (2 fixes):**

- **OAuth stub methods** (`getUser`, `revokeToken`, `saveToken`,
  `getRefreshToken`, `validateScope`) now `throw new Error('Not
  implemented')` instead of silently returning `undefined` via
  `console.log` no-op. Previous behavior caused `oauth2-server` to
  surface opaque 500s on any grant flow. Throw makes misuse loud.

- **OAuth `authenticate` null-check** on `token.user` before
  dereferencing `token.user._uuid`. oauth2-server may return a token
  without an associated user object (e.g. client-credentials grant);
  previous code threw `TypeError: Cannot read properties of undefined`
  at runtime via `@ts-ignore`. Now throws a clear `InvalidTokenError`.

**Type safety (2 improvements):**

- **`defineAction()` generic** tightened from `(registration: unknown)
  => RegisteredAction` to `<T extends Record<string, unknown>>
  (registration: T) => T & RegisteredAction`. Rejects
  `defineAction(undefined)`, `null`, primitives at compile time AND
  preserves the inferred shape of the input. Backward-compatible for
  consumers using `defineAction(controller.register(...))` —
  `controller.register` return satisfies the new constraint.

- **`OAuthContextMeta` interface** + `setAuthenticatedMeta(ctx, user)`
  helper added. Eliminates four `@ts-ignore` lines on `ctx.meta` writes
  in `OAuth.authenticate` + firebase-auth path. Single typed cast at
  the helper boundary.

**Tests:** new `define-action.test.ts` with 9 cases covers runtime
identity, side-effect preservation, type contract, generic constraint
rejection, and brand semantics. Closes EVID-043 Test C1 (defineAction
was untested since Wave 11.B shipped).

**Deferred (Wave 14):** god-class `ApiController` decomposition (1500
LOC SRP/OCP/DIP violations per arch-reviewer), `/contracts` typia
extraction (ADR-003 leak), `ActionOptions = any` defaults conversion
to `unknown`, `OAuth` class proper typing, comprehensive test coverage
for BullMQ workers + Pub/Sub + Diagnostics. See PRD-027 → Wave 14 PRD.

Refs: PRD-027, EVID-043.
