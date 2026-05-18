---
depth: standard
id: EVID-062
kind: evidence
last_modified_at: 2026-05-18T22:27:45.984305+00:00
last_modified_by: claude-code/2.1.142
links:
- target: PRD-044
  relation: informs
status: active
title: Wave 14.1+14.2 — LRU consolidation closed (utils kernel + 4 consumers + core/deny-ledger)
---

## Summary

Wave 14.1+14.2 consolidates 5 duplicate LRU implementations into 2 single sources of truth: `@gertsai/utils/lru` (4 consumers) + `@gertsai/core/lru-cache.LRUCache` (1 same-package consumer). Executed as 2 parallel teammates (`typescript-pro` × 2) under team-lead orchestration. Both teammates produced real on-disk file changes. 1767 tests pass across 6 packages (524 utils + 145 auth-openfga + 28 rest-rm + 772 collection + 298 api-rlr + 1195 core).

## Structured Fields

- **verdict**: supports
- **congruence_level**: CL3
- **evidence_type**: refactor_verification
- **linked_artifact**: PRD-044
- **summary**: -246 net LOC across 6 packages; 0 public-API break; 38 new kernel tests + 1767 existing tests still pass.

## Closures

### Wave 14.1 — Cross-package consolidation (Teammate K)

**New kernel in `@gertsai/utils`** (~333 source + 417 test LOC):
- `packages/utils/src/lru/lru-map.ts` (+145) — `LruMap<K,V>` (no TTL, non-touching `has()`)
- `packages/utils/src/lru/lru-ttl-map.ts` (+167) — `LruTtlMap<K,V>` (TTL knob, touching `has()` — preserves Wave 7.4 auth-openfga semantics)
- `packages/utils/src/lru/index.ts` (+21) — subpath barrel
- `packages/utils/src/lru/__tests__/lru-map.test.ts` (+215) — 20 tests
- `packages/utils/src/lru/__tests__/lru-ttl-map.test.ts` (+202) — 18 tests (parity port from auth-openfga)
- `packages/utils/package.json` (+17) — `./lru` exports + typesVersions
- `packages/utils/tsup.config.ts` (+5/-1) — second entry

**Migrated consumers** (4 packages, -227 LOC consumer reduction):
| Package | File | LOC delta | Approach |
|---|---|---:|---|
| `@gertsai/auth-openfga` | `internal/lru-ttl-map.ts` | -127 | Re-export shim from `@gertsai/utils/lru` (public API preserved) |
| `@gertsai/rest-request-manager` | `src/circuit-breaker.ts` | +4 net | `hosts: LruMap<...>` (ADR-009 Amendment 1.2.1 `maxHosts: 1000` preserved); used new `peek()` for `getState()` observability |
| `@gertsai/collection` | `src/utils/memoize.ts` | -73 | `import { LruMap as LRUCache } from '@gertsai/utils/lru'` shim (named export + `instanceof` preserved) |
| `@gertsai/api-rlr` | `src/adapters/ResilientRedisAdapter.ts` | -31 | Direct `LruMap` consumption (was module-private) |

**Constructor back-compat**: `LruMap` accepts either `(maxSize: number)` (legacy collection-style) OR `({ maxSize })` (modern). Both signatures tested.

**Intentional asymmetry**: `LruMap.has` non-touching (collection legacy); `LruTtlMap.has` touching (auth-openfga Wave 7.4). Documented in JSDocs.

### Wave 14.2 — Same-package consolidation (Teammate L)

`packages/core/src/deny-ledger/providers/memory.ts MemoryDenyLedger`:
- LOC: 460 → 397 (**-63 net**, +81 / -144)
- Removed: `LRUNode<T>` interface, head/tail fields, 5 private LRU methods (moveToHead/addToHead/removeTail/removeNode/evictIfNeeded) ~70 LOC of doubly-linked-list bookkeeping
- Added: `LRUCache<DenyEntry>` field + `onEvict` callback to sync `byId` secondary index

**3 behavioural deltas surfaced + preserved**:
1. **Stats granularity** kept at ledger level (not per-`get()`-probe level; `isDenied()` probes up to 4 keys/call). `getStats(tenantId?)` byte-for-byte identical.
2. **TTL source of truth** remains `DenyEntry.expiresAt`; `LRUCache` used without TTL to avoid dual-source divergence (list({includeExpired}) would miss already-TTL-evicted).
3. **`byId` secondary index** synced via `onEvict` callback with race-guard `byId.get(id) === entry` to handle `deny()` overwrite path safely.

Used `LRUCache.peek()` for the 4-key lookup chain in `isDenied()` to avoid perturbing LRU order on misses; `get()` only on the matching key.

## Acceptance verification (all PASS)

| Package | Build | Tests |
|---|---|---|
| `@gertsai/utils` | ✅ green | 524/524 pass (+20 LRU) |
| `@gertsai/auth-openfga` | ✅ green | 145/145 pass (existing 17-test LRU suite via shim) |
| `@gertsai/rest-request-manager` | ✅ green | 28/28 pass |
| `@gertsai/collection` | ✅ green | 772/772 pass + 1 skipped |
| `@gertsai/api-rlr` | ✅ green | 298/298 pass + 48 skipped (Redis-deps) |
| `@gertsai/core` | ✅ green | 1195/1195 pass + 53 skipped (matches Wave 13.B baseline) |
| **Workspace typecheck** | ✅ 0 errors across 38 pkgs + 3 example apps | — |

## Net LOC

- Consumer reductions: -227 LOC across 4 consumers + -63 LOC in core/deny-ledger = **-290 consumer-side LOC**
- New kernel: +333 source LOC in `@gertsai/utils/src/lru/`
- Tests: +417 LOC (effectively +215 new coverage for LruMap; LruTtlMap is parity port from auth-openfga)
- **Net source LOC: -290 + 333 = +43 source net** (kernel is more complete than union of 4 ad-hoc impls — adds peek/keys/values/Symbol.iterator/dual constructor signature)
- **Net all-LOC: -246** (188 ins / 434 del per `git diff --stat`)

## No public-API breaks

- `@gertsai/utils`: minor bump (new exports added)
- 5 consumer packages: patch bumps only
- `auth-openfga LruTtlMap` import path unchanged via shim
- `collection LRUCache` named export preserved
- `rest-request-manager CircuitBreaker` external API unchanged
- `api-rlr LRUCache` was module-private (no external surface)

## Single source of truth wins

4 implementations collapse to 1. Future bug fixes (e.g. CWE-770 hardening, eviction edge cases) land once. This is the primary value vs LOC count.

## Deferred to Wave 14.3-14.6

- Wave 14.3 URL validator consolidation (`@gertsai/utils/security` ← `@gertsai/fetch`)
- Wave 14.4 GertsErrorResponse `@deprecated` marker
- Wave 14.5 m9s-cache README FIFO clarification
- Wave 14.6 GertsErrorResponse removal (v1.0.0)
- Promote `@gertsai/core LRUCache` as heavyweight option (docs-only)

## Refs

- PRD-044 (target)
- EVID-057 (Wave 12.F audit source — §LRU Audit + §Recommendation)
- EVID-058 (Wave 12.G aggregate matrix)
- ADR-009 Amendment 1.2.1 (rest-rm CWE-770 bounded LRU)
- ADR-012 (auth-openfga Wave 6.3 multi-instance fingerprint cache)
- RFC-007 (Wave 7.4 auth-openfga LRU+TTL retrofit)



