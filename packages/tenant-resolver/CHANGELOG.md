# @gertsai/tenant-resolver

## 2.0.1

### Patch Changes

- f219b2c: Wave 26 — close 5 HIGH + 3 MED EVID-080 findings across 4 packages (+ tenant-resolver test+doc).

  Solo teammate (typescript-pro). +14 tests, 0 workspace typecheck errors.

  **FR-1 (H1) session** — `Session.token` getter throws `SessionDestroyedError` (was bare `Error`). Test asserts `instanceof SessionDestroyedError` (was string-match).

  **FR-2 (H2) runtime-context** — `provider-context._lookup` refactored to `{ present, value }` discriminator. `provide(token, undefined)` now distinguishable from "not bound" — `get(token)` returns `undefined` instead of throwing `ProviderNotFoundError`. +4 tests.

  **FR-3 (H3) rpc-proxy-builder** — proxyCache nested `WeakMap<actions, WeakMap<transport, proxy>>`. Different transports sharing same actions now get distinct proxies (fixes multi-instance singleton bug per ADR-012 Wave 6.3). +2 tests.

  **FR-4 (H4) entity** — `Entity.$patch` + `EntityWithMetadata.$setMetadata` swap `for...in` → `Object.keys(input)` (skip prototype chain, prototype-pollution defense).

  **FR-5 (H5) entity** — `EntityJSON.data: Readonly<Data>` type widening (compile-time mutation rejection). `@ts-expect-error` test pins.

  **FR-6 (M1+M2) entity deep-equal** — `Object.is` for primitives (NaN equality + +0/-0 distinction) + symmetric `Object.keys` length guard. +6 tests for edge cases.

  **FR-7 (M6) tenant-resolver** — `path.strategy.ts` wildcard sentinel changed `___WILDCARD___` → `\x1FWILDCARD\x1F` (Unit-Separator control char). `split`/`join` replace instead of regex (avoids special-char interpretation). +1 test confirms literal `___WILDCARD___` segment doesn't collide.

  **FR-8 (M7) tenant-resolver** — NON_PRINTABLE JSDoc note about ASCII-only limitation (no Cyrillic/CJK/emoji/non-Latin-1).

  **Tests**: +14 new (4 runtime-context + 2 rpc-proxy-builder + 1 entity Entity + 6 entity deep-equal + 1 tenant-resolver path).

  **Behaviour clarification**:

  - FR-1: `SessionDestroyedError extends AppError extends Error` — `instanceof Error` still passes; substring matchers `'destroyed'` still pass.
  - FR-2: `get`/`getOptional` signatures unchanged. Behaviour change only for previously-broken bound-to-undefined case.
  - FR-3: Public surface unchanged. Cache identity for `(sameActions, sameTransport)` still holds.
  - FR-4/5/6/7/8: Pure correctness improvements; no API breaks.

  All bumps: patch.

  EVID-080 H closure: **5/5 HIGH closed**. 3/10 MED closed. Remaining 7 MED + 8 LOW deferred (cosmetic / out-of-scope per PRD-063).

  After Wave 25+26 all 41 packages deep-audited, 100% HIGH closure rate maintained.

  Refs: PRD-063, EVID-080 (Wave 25 audit), ADR-006/007/009/010 + ADR-012 Wave 6.3.

## 2.0.0

### Patch Changes

- Updated dependencies [05258e5]
  - @gertsai/errors@0.3.0

## 1.0.0

### Minor Changes

- 6debc97: Initial release. Composable multi-strategy tenant resolution with security-hardened built-in strategies.

  - `TenantResolverStrategy<Source>` interface + `TenantResolution` Value Object preserving strategy provenance.
  - `ChainTenantResolver<Source>` with **default `mode: 'strict'`** (fail-closed per security review — throws `UnauthorizedError` from `@gertsai/errors` on no-match across all strategies). Optional `mode: 'optional'` requires explicit opt-in for non-tenant-isolated routes (health checks, public docs).
  - Built-in strategies (security hardened):
    - `HeaderStrategy({ headerName, trustProxy: true })` — constructor throws if `trustProxy !== true` (forces consumer awareness of trusted-proxy contract; default-fail-secure per CWE-639/CWE-290).
    - `SubdomainStrategy({ baseDomain, allowedHosts? })` — strict labelled-suffix match; rejects IPv4/IPv6 literals; optional whitelist.
    - `PathStrategy({ pathPattern })` — URL-normalized match; rejects `..`, `.`, NUL, non-printable, `/`, `%` post-decode (covers double-encoded traversal).
  - `/moleculer` subpath: `MoleculerCtxStrategy` reading `ctx.meta.tenantId` + `tenantMiddleware(resolver)` factory. Peer-optional `moleculer` import via `import type` only.
  - `/http` subpath: `nodeHttpAdapter(req)` for Node `http.IncomingMessage` (type-only Node builtin import).
  - `resolveTenantStrict(resolver, source)` standalone helper for non-chain throws.
  - 62 tests including adversarial fixtures (header-spoof, path-traversal incl. double-encoded, subdomain-strict-suffix, chain-strict-mode).

### Patch Changes

- 782a3e0: Sprint 3.10 — Wave 5 P2 polish batch (additive non-breaking).

  `@gertsai/errors` (MINOR — observable behavior change for nested redaction):

  - `wrapUnknownError(x, kind?, correlationId?)` — `kind?` now applied via closed allow-list `'INTERNAL' | 'EXTERNAL'` (TS 2-arity union). `isAppError(x)` early-return preserved (no kind override on already-typed errors). Mitigates CWE-285 (error coercion for auth bypass).
  - `AppError` constructor JSDoc note re shallow `Object.freeze` (deep-freeze deferred).
  - `redactDetails()` now deep-scans recursively (max depth 5, breadth cap 1000, WeakSet anti-cycle, non-plain objects passthrough — Date/RegExp/Buffer left as-is). Mitigates CWE-209 nested info exposure + CWE-400/674 DoS via crafted payloads.
  - `errors/internal.ts` JSDoc clarification (catch-all `D` intentional; subclassing path documented).
  - README cross-references switched to absolute repo URLs (post-publish friendliness; scope expanded to all 13 Wave 5 package READMEs).

  Other Wave 5 packages (PATCH — JSDoc/comment polish, no behavior change):

  - `@gertsai/tenant-resolver`: `MOLECULER_*_HINT` message split (`NON_MOLECULER_CTX_ERROR` vs `MOLECULER_PEER_DEP_ERROR`), `PathStrategy` `...` wildcard JSDoc (trailing-only), `lookupHeader()` precedence note (exact-case-first short-circuit).
  - `@gertsai/runtime-context`: `requireAuthContextWithDataAccess` JSDoc clarified Session.dataAccessUuid getter fallback semantic.
  - `@gertsai/entity-storage`: `BaseEntityStorageService.upsert` 2-RTT cost JSDoc (cross-link KNOWN-ISSUES §10).
  - `@gertsai/entity-react`: `markRaw` `configurable: false` JSDoc (escape-hatch intentionally irreversible).
  - `@gertsai/rest-request-manager`: log `error.cause` chain on transport failure (5-level WeakSet bounded).
  - `@gertsai/async-utils`: `retry` JSDoc cross-ref to thundering herd Sprint 3.9 Amendment 1.2.7 default `'full'` jitter rationale.

  Refs ADR-010 §A + Amendment 1 §A1.2 (wrapUnknownError allow-list) + §A1.3 (redactDetails deep-scan).

- Updated dependencies [782a3e0]
- Updated dependencies [782a3e0]
- Updated dependencies [6debc97]
- Updated dependencies [121cb7b]
  - @gertsai/errors@0.2.0
