# @gertsai/async-utils

## 0.2.0

### Minor Changes

- c6896c4: Initial release. Tier 1 zero-peer-dep async utilities.

  - `sleep(ms)` / `withTimeout<T>(action, timeoutMs, message?)` (signal listener cleanup per ADR-009 I-16, no leak across 1000+ invocations).
  - `defer<T>()` / `debounce(fn, waitMs)` / `throttle(fn, limitMs)` with `cancel()`/`flush()` semantics.
  - `retry<T>(action, opts?)` exponential backoff. Default jitter `'full'` (CWE-409 thundering herd protection per ADR-009 Amendment 1.2.7). Honors `signal: AbortSignal`.
  - `makeCancellable()` AbortController helper.

  ZERO `@gertsai/*` peer-deps per ADR-009 I-1 (Tier 1 leaf). Throws standard `Error` (not `@gertsai/errors` AppError per I-2) — consumers wrap if needed.

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

## 0.1.0

### Minor Changes

- Initial release. Tier 1 zero-dep async utilities extracted from Orchestra (Sprint 3.9, Wave 5 Phase 4).
- API: `sleep`, `withTimeout`, `defer`, `debounce`, `throttle`, `retry`, `makeCancellable`.
- Per ADR-009 Decision A + invariants I-1 (zero `@gertsai/*` peer-deps), I-2 (standard `Error` for timeouts), I-16 (AbortSignal cleanup), I-17 (default `jitter: 'full'`).
