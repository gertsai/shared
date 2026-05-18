# @gertsai/rest-request-manager

## 5.0.0

### Patch Changes

- 739b3de: Wave 14.1+14.2 — LRU primitive consolidation per EVID-057.

  **Wave 14.1 — Cross-package consolidation (Teammate K).**

  EVID-057 surfaced 4 packages implementing the same insertion-order Map LRU pattern with identical eviction logic. Consolidated into `@gertsai/utils/lru` subpath:

  - **NEW**: `@gertsai/utils/lru` exports `LruMap<K,V>` (no TTL, `has()` non-touching) + `LruTtlMap<K,V>` (with TTL, `has()` touching — preserves Wave 7.4 auth-openfga semantics). Both classes support back-compat dual constructor signature: positional (`new LruMap(100)` legacy collection-style) OR options object (`new LruMap({ maxSize })`).
  - **NEW**: `LruMap.peek(key)` non-touching get for observability without perturbing eviction order.

  Migrated 4 consumers:

  - `@gertsai/auth-openfga/src/internal/lru-ttl-map.ts` → thin re-export shim from `@gertsai/utils/lru` (-127 LOC, public API preserved)
  - `@gertsai/rest-request-manager/src/circuit-breaker.ts` `hosts: Map<...>` → `LruMap<string, HostState>` (ADR-009 Amendment 1.2.1 `maxHosts: 1000` preserved). Used new `peek()` for `getState()` to avoid perturbing LRU order during observability.
  - `@gertsai/collection/src/utils/memoize.ts` `LRUCache<K,V>` → re-export shim `import { LruMap as LRUCache } from '@gertsai/utils/lru'` (-73 LOC, named export + `instanceof` semantics preserved)
  - `@gertsai/api-rlr/src/adapters/ResilientRedisAdapter.ts` private `LRUCache<K,V>` → consumes `LruMap` directly (-31 LOC, was module-private)

  **Wave 14.2 — Same-package consolidation (Teammate L).**

  - `@gertsai/core/src/deny-ledger/providers/memory.ts MemoryDenyLedger` previously inlined doubly-linked-list LRU logic that exactly duplicated `core/lru-cache.ts`. Refactored to consume the local `LRUCache<DenyEntry>` primitive (-63 LOC).
  - 3 behavioural deltas surfaced + preserved:
    1. Stats granularity kept at ledger level (not per-`get()`-probe level — `isDenied()` probes up to 4 lookup keys/call)
    2. TTL source of truth remains `DenyEntry.expiresAt`; `LRUCache` used without TTL
    3. `byId` secondary index synced via `onEvict` callback with race-guarded `byId.get(id) === entry` check

  **Net LOC**: 188 insertions / 434 deletions = **-246 net** across 6 packages (consumer reductions dominate). Source-only (excluding tests): -227 LOC consumers + ~+333 LOC kernel = +106 net source, but single source of truth means future bug fixes (CWE-770 hardening, etc.) land once.

  **Tests**: +38 new tests for kernel (20 LruMap + 18 LruTtlMap parity port). 1767 tests pass across the 5 packages (no regressions in 1195 core / 524 utils / 145 auth-openfga / 28 rest-rm / 772 collection / 298 api-rlr).

  **No public-API breaks**: utils minor bump (new exports added); 5 consumer packages patch bumps only. `auth-openfga LruTtlMap` import path unchanged via shim; `collection LRUCache` named export preserved; `rest-request-manager CircuitBreaker` external API unchanged; `api-rlr LRUCache` was module-private.

  Refs: PRD-044, EVID-057 (Wave 12.F audit source), ADR-009 Amendment 1.2.1, RFC-007.

- Updated dependencies [8de6205]
- Updated dependencies [739b3de]
  - @gertsai/utils@0.5.0
  - @gertsai/fetch@0.4.1

## 4.0.0

### Patch Changes

- Updated dependencies [05258e5]
- Updated dependencies [05258e5]
  - @gertsai/errors@0.3.0
  - @gertsai/logger-factory@2.0.0
  - @gertsai/async-utils@0.3.0

## 3.1.0

### Minor Changes

- f662fa5: Wave 12.C-fix-2+3 — close 2 HIGH findings (EVID-048 H-4 + H-10).

  **H-4 — Inlined Logger from peer-optional @gertsai/logger-factory**

  Previously `RestRequestManagerOpts.logger?: Logger` imported `Logger` from `@gertsai/logger-factory` which was marked `optional: true` in peer-deps. Consumers omitting the optional peer couldn't satisfy the type. Wave-13-pattern.

  **Fix:** inlined minimal `RestRequestLogger` interface (only `debug`/`warn`/`error`/`info` — methods the package actually consumes). Renamed `Logger` reference in `types.ts` → `RestRequestLogger`; re-exported from `index.ts`. Structural-typing-compatible with `@gertsai/logger-factory.Logger` — existing callers continue to work.

  **H-10 — Rate-limiter integer-bucket model**

  Previously `refilled = elapsedSeconds * tokensPerSecond` produced float; over time `tokens` accumulated fractional drift like `0.9999999` → spurious `RateLimitedError` when caller expects exactly 1 token. Conversely two near-simultaneous calls could both pass with surplus `1.0000001` → burst > capacity.

  **Fix:** integer-bucket model with `tokenCarry` fractional accumulator:

  - `elapsedMs` computed via BigInt-floor (integer ms)
  - Whole tokens via `Math.floor(elapsedMs * tokensPerMs + tokenCarry)`
  - Residual fractional held in `tokenCarry` so sub-millisecond rates don't lose precision
  - `lastRefillNs` advances only by integer-ms window — residual nanoseconds retained for next refill

  **Tests:** +3 new rate-limiter tests (exact-1-token-after-1s, no fractional surplus rapid-fire, 100-request steady-state at 100rps); +2 logger structural-fit tests. 28/28 total pass.

  Refs: PRD-034, EVID-048 (H-4, H-10).

## 3.0.0

### Patch Changes

- Updated dependencies [4415a5f]
  - @gertsai/fetch@0.4.0

## 2.0.0

### Patch Changes

- Updated dependencies [cb29bb0]
  - @gertsai/fetch@0.3.0

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
