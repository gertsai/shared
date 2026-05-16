# @gertsai/tenant-resolver

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
