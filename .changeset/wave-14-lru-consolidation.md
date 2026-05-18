---
'@gertsai/utils': minor
'@gertsai/auth-openfga': patch
'@gertsai/rest-request-manager': patch
'@gertsai/collection': patch
'@gertsai/api-rlr': patch
'@gertsai/core': patch
---

Wave 14.1+14.2 — LRU primitive consolidation per EVID-057.

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
