---
depth: standard
id: PRD-044
kind: prd
last_modified_at: 2026-05-18T22:11:11.634076+00:00
last_modified_by: claude-code/2.1.142
status: active
title: Wave 14.1+14.2 — LRU consolidation (utils LruMap/LruTtlMap + 4 shims + core/deny-ledger refactor)
---

## Problem Statement

EVID-057 surfaced 4 packages implementing the same insertion-order Map LRU pattern (auth-openfga LruTtlMap, rest-request-manager CircuitBreaker.hosts, collection LRUCache, api-rlr ResilientRedisAdapter private LRUCache). Each is ~50-80 LOC of identical eviction + touch logic. Net consolidation target: ~-220 LOC, 0 public-API break.

Additionally `@gertsai/core/deny-ledger/providers/memory.ts` re-implements doubly-linked-list LRU inline when `core/lru-cache.ts` is in the same package — same-package consolidation candidate (~-100 LOC).

## Goals

1. Add `LruMap<K,V>` + `LruTtlMap<K,V>` to `@gertsai/utils` (insertion-order Map flavour, ~140 LOC additive).
2. Migrate 4 consumer packages via re-export shims preserving public API:
   - `@gertsai/auth-openfga/src/internal/lru-ttl-map.ts` → shim re-exporting from `@gertsai/utils`
   - `@gertsai/rest-request-manager/src/circuit-breaker.ts` `hosts` Map → `LruMap`
   - `@gertsai/collection/src/utils/memoize.ts` `LRUCache` → shim
   - `@gertsai/api-rlr/src/adapters/ResilientRedisAdapter.ts` private `LRUCache` → `LruMap`
3. Refactor `@gertsai/core/deny-ledger/providers/memory.ts` `MemoryDenyLedger` to consume local `core/lru-cache.ts` instead of inlining doubly-linked-list logic.

## Functional Requirements

**FR-001** — `@gertsai/utils` exposes `LruMap<K,V>` + `LruTtlMap<K,V>` via `@gertsai/utils/lru` subpath. Constructor signatures preserve back-compat for existing `LruTtlMap` consumers (auth-openfga ports its current API as-is). Both classes implement: `get(k)`, `set(k,v)`, `has(k)`, `delete(k)`, `size`, `entries()`, `clear()`. `LruTtlMap` adds `ttlMs` constructor param + lazy TTL eviction on get.

**FR-002** — Migration preserves observable behaviour:
- `auth-openfga LruTtlMap` test suite continues passing post-migration
- `rest-request-manager CircuitBreaker.hosts` `maxHosts:1000` default per ADR-009 Amendment 1.2.1 preserved
- `collection LRUCache` `maxSize:100` default preserved
- `api-rlr ResilientRedisAdapter` cache behaviour observably identical

**FR-003** — `core/deny-ledger MemoryDenyLedger` consumes `core/lru-cache LRUCache<T>`. Behaviour observably identical; deny-ledger test suite continues passing.

## Non-Functional Requirements

**NFR-001** — Build green: all touched packages + dependent packages (~38 total) build + typecheck + test successfully.
**NFR-002** — Net LOC: ≥ -200 (target -320 per EVID-057 estimate).
**NFR-003** — Zero public-API break — only patch bump on `@gertsai/utils` (new exports added) + patch bumps on shim packages.

## Out of Scope

- Wave 14.3 URL validator consolidation (separate PR)
- Wave 14.4 GertsErrorResponse deprecation (separate PR)
- Wave 14.5 m9s-cache README FIFO rename
- Wave 14.6 GertsErrorResponse removal (v1.0.0)
- Promoting `@gertsai/core` LRUCache as heavyweight option (docs-only, Wave 14 follow-up)
- `api-rlr MemoryAdapter.evictIfNeeded` O(n) scan migration (different access-time pattern, separate analysis)

## Related Artifacts

- EVID-057 (Wave 12.F audit source)
- EVID-051 §cross-cutting (original candidate identification)
- ADR-009 Amendment 1.2.1 (rest-rm CWE-770 bounded LRU)
- ADR-012 (auth-openfga Wave 6.3 multi-instance fingerprint cache)
- RFC-007 (Wave 7.4 auth-openfga LRU+TTL retrofit)

## Target Audience

- Maintainers of `@gertsai/utils`, `@gertsai/auth-openfga`, `@gertsai/rest-request-manager`, `@gertsai/collection`, `@gertsai/api-rlr`, `@gertsai/core`
- Downstream consumers (~38 packages + 3 example apps) — patch bump propagates automatically via workspace deps



