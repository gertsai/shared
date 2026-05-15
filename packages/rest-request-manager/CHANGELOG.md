# @gertsai/rest-request-manager

## 1.0.0

### Minor Changes

- c6896c4: Initial release. Tier 2 HTTP request manager.

  - `RestRequestManager` class composing:
    - retry (from `@gertsai/async-utils`, default `'full'` jitter for thundering-herd protection).
    - Token-bucket rate-limiter using `process.hrtime.bigint()` for monotonic timing.
    - **LRU circuit-breaker** per host (default `maxHosts: 1000`, configurable) per ADR-009 Amendment 1.2.1 (CWE-770 protection). State machine closed → open → half-open → closed.
  - HTTP status → AppError translation per ADR-009 I-8: 4xx → ValidationError/NotFoundError/UnauthorizedError/ForbiddenError/ConflictError/RateLimitedError; 5xx → InternalError/UpstreamFailureError/BadGatewayError; **AbortError → TimeoutError** per Amendment 1.2.8.
  - Optional logger via `@gertsai/logger-factory` peer-optional. REDACTION_KEYS applied to logged request/response bodies per I-9.
  - Convenience methods: `get/post/put/delete/patch`. Diagnostics: `getStats()` / `resetStats()`.
  - **Node-only** (`engines.node: '>=22'`) per Amendment 1.2.10 — relies on `process.hrtime.bigint()` + undici.
  - TLS verification ON (RestRequestManagerOpts MUST NOT expose `rejectUnauthorized: false`) per Amendment 1.2.11.

  Peer-deps: `@gertsai/fetch`, `@gertsai/errors`, `@gertsai/async-utils`, `@gertsai/logger-factory` (optional).

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

- Updated dependencies [0755c6d]
- Updated dependencies [782a3e0]
- Updated dependencies [782a3e0]
- Updated dependencies [6debc97]
- Updated dependencies [121cb7b]
- Updated dependencies [c6896c4]
- Updated dependencies [c6896c4]
  - @gertsai/fetch@0.2.0
  - @gertsai/errors@0.2.0
  - @gertsai/async-utils@0.2.0
  - @gertsai/logger-factory@1.0.0

## 0.1.0

### Minor Changes

- Initial release. Tier 2 HTTP request manager extracted from Orchestra (Sprint 3.9, Wave 5 Phase 4).
- API: `RestRequestManager` class with `request()`, `get/post/put/delete/patch`, `getStats()`, `resetStats()`.
- Composes `@gertsai/async-utils` (retry + withTimeout) over `@gertsai/fetch.httpCaller` with internal token-bucket rate limiter and per-host LRU circuit breaker.
- HTTP status → `@gertsai/errors` AppError translation (4xx → ValidationError/NotFoundError/UnauthorizedError/ForbiddenError/ConflictError/RateLimitedError; 5xx → InternalError/UpstreamFailureError/BadGatewayError; AbortError → TimeoutError).
- Per ADR-009 Decision D + invariants I-8 (typed errors), I-9 (REDACTION_KEYS applied to logs), I-13 (per-package strategy marker F), Amendment 1.2.1 (LRU `maxHosts: 1000`), 1.2.8 (AbortError → TimeoutError), 1.2.10 (Node ≥22), 1.2.11 (no `rejectUnauthorized: false`).
