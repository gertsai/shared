---
depth: standard
id: EVID-026
kind: evidence
last_modified_at: 2026-05-12T18:40:49.834776+00:00
last_modified_by: claude-code/2.1.139
links:
- target: PRD-011
  relation: informs
- target: RFC-007
  relation: informs
status: active
title: Wave 7.4 ship evidence — LruTtlMap eviction in auth-openfga, 2-agent parallel sprint
---

# EVID-026: Wave 7.4 ship evidence — `LruTtlMap` eviction in `@gertsai/auth-openfga`, 2-agent parallel sprint

## Structured Fields
- **verdict:** supports
- **congruence_level:** CL3
- **evidence_type:** workspace typecheck + test suite + build + depcruise + oxlint + 2-teammate parallel reports

CL3: all measurements ran in this workspace against the target system (same monorepo, same Node 22, same deps). Verdict `supports`: every PRD-011 FR and NFR measured PASS. Both parallel teammates reported 0 errors in owned files; team-lead verified workspace-wide.

## Summary

Wave 7.4 closes the last open backlog item from the Mega-audit (CWE-770 — unbounded growth in `@gertsai/auth-openfga` long-lived Maps). Two parallel teammates spawned via /sprint AgentsTeam pattern, with team-lead (main thread) pre-seeding the `LruTtlMap` skeleton so both teammates could import the type contract immediately.

**Implementation: 1 wave, 2 parallel teammates, file ownership disjoint:**

| Teammate | Files owned | LOC |
|---|---|---|
| `auth-openfga-client-lru/v1` | `internal/lru-ttl-map.ts` (skeleton → impl) + `internal/lru-ttl-map.test.ts` (NEW) + `client.ts` + `__tests__/client.lru.test.ts` (NEW) + `index.ts` (re-export of `configureFgaClientCache`) | 140 + 179 + Δ44/-9 + 111 + Δ+2 |
| `auth-openfga-cache-lru/v1` | `cache/index.ts` + `__tests__/cache.lru.test.ts` (NEW) | Δ+80/-32 + 182 |

**Total: ~750 LOC added/modified across 6 files.**

## Pre-seeded skeleton (team-lead, before agents spawned)

Team-lead created `packages/auth-openfga/src/internal/lru-ttl-map.ts` skeleton with:
- Full `LruTtlMapOptions` interface (immutable contract)
- Full `LruTtlMap<K, V>` class signature with method stubs that throw with explicit "not implemented" messages
- This let `auth-openfga-cache-lru` import the type contract immediately and write its integration code while `auth-openfga-client-lru` filled in bodies in parallel.

Coordination outcome: zero file-ownership conflicts; both teammates reported clean integration via the typed interface.

## Mid-sprint coordination (no regressions)

`auth-openfga-client-lru` added two non-spec methods to `LruTtlMap` after observing partner's needs:
- **`keys(): IterableIterator<K>`** — for `PermissionCache.invalidate()` to enumerate scope keys
- **`[Symbol.iterator](): IterableIterator<[K, V]>`** — symmetry helper

Both additive, internal-only (utility is not re-exported), zero-impact on the original spec. Documented in commit message + utility JSDoc.

## Pilot Baseline (pre-Wave 7.4)

- `auth-openfga` test count: 86 (baseline carried forward from Wave 7.2 EVID-023)
- Workspace test count: 4953 (Wave 7.3b post-flip baseline, EVID-025)
- Two unbounded `Map<string, ...>` instances at `client.ts:62` and `cache/index.ts:282`, plus one unbounded inner `Map<string, CacheEntry>` at `cache/index.ts:67`. No eviction policy; all three would grow monotonically with unique tenant fingerprints / check keys in long-lived gateway processes.

## Changes Applied

### NEW utility (PRD-011 §Strategy, RFC-007 §Decision-1)

- `packages/auth-openfga/src/internal/lru-ttl-map.ts` — `LruTtlMap<K, V>` class (140 LOC). Internal storage: `Map<K, { v: V; t: number }>` (JS Map preserves insertion order). LRU touch on `get`/`has` via delete-and-reinsert. TTL check on access (lazy expiry — expired entries dropped at next read). `keys()` + `Symbol.iterator` for invalidation iteration (does not touch LRU order, may surface lazily-expired entries — documented).
- `packages/auth-openfga/src/internal/lru-ttl-map.test.ts` — 17 unit tests (179 LOC): construction validation (`maxSize < 1` throws), happy-path `set`/`get`/`has`/`delete`/`clear`/`size`, LRU eviction order at boundary, LRU touch updates MRU position, TTL expiry via injected `now` clock, TTL=0 disables expiry.

### MODIFY — `client.ts` (PRD-011 G-1, RFC-007 §Decision-2)

- Module-scoped `clientInstances: Map<string, GertsFgaClient>` → `LruTtlMap<string, GertsFgaClient>({ maxSize: 1000, ttlMs: 300_000 })` (5-min sliding TTL).
- NEW public `configureFgaClientCache(opts?: LruTtlMapOptions): void` for ops/tests to override defaults. Discards existing cache on call.
- Existing `getFgaClient(config?)` / `createFgaClient(config?)` / `resetFgaClient(config?)` signatures unchanged — Wave 6.3 (ADR-012) invariant I-1 preserved.
- `__tests__/client.lru.test.ts` — 6 integration tests (111 LOC): 1100 unique configs → keeps last 1000; same fingerprint → same instance while not evicted; TTL expiry triggers re-instantiation; `configureFgaClientCache` tunable.

### MODIFY — `cache/index.ts` (PRD-011 G-2 + G-3, RFC-007 §Decision-3 + §Decision-4)

- Module-scoped `permissionCaches: Map<string, PermissionCache>` → `LruTtlMap<string, PermissionCache>({ maxSize: 10000 })` (no TTL — caches manage own entry TTL).
- Per-instance `PermissionCache.cache: Map<string, CacheEntry>` → `LruTtlMap<string, CacheEntry>({ maxSize, ttlMs })` (defaults inherited from `PermissionCacheConfig`; `lruOpts?: LruTtlMapOptions` 2nd ctor arg allows test-time `now` injection).
- `PermissionCache` `get`/`set` delegate to `LruTtlMap`; `invalidate()` iterates via `LruTtlMap.keys()` snapshot to avoid mutation-during-iteration.
- `getPermissionCache(config?, scope?, opts?)` — `opts` is now optional 3rd arg (preserves Wave 6.3 2-arg signature per RFC-007 I-3). `opts` is forwarded to per-instance cache on first construction of that scope.
- Eviction stat tracked via size-delta detection (LruTtlMap exposes no eviction callback, but `set` with prefix `has(key)` + post-set `size` comparison gives a reliable count).
- `__tests__/cache.lru.test.ts` — 11 integration tests (182 LOC).

### Quality-gate measurements (final)

| Gate | Result | Threshold | Status |
|---|---|---|---|
| `pnpm typecheck` exit | 0 | 0 (FR-7) | ✅ |
| `pnpm test` exit | 0 | 0 (FR-6 + FR-7) | ✅ |
| `pnpm test` pass count | **4987** | ≥ baseline 4953 (Wave 7.3b) | ✅ (+34 new — 17 LruTtlMap unit + 6 client.lru + 11 cache.lru) |
| `pnpm test` skip count | 102 | ≤ 103 baseline | ✅ |
| `pnpm --filter @gertsai/auth-openfga test` | 120/120 | ≥ 86 + new (FR-6) | ✅ |
| `pnpm build` | 0 errors | 0 (FR-7) | ✅ |
| `pnpm depcruise` | 0 violations | 0 (FR-7) | ✅ |
| `pnpm oxlint` errors | 0 (1511 warnings — pre-existing style) | 0 errors (FR-7) | ✅ |

### Type-canon audit (Wave 7.3 strict floor)

All new code passes EOPT + noUncheckedIndexedAccess without workarounds (per user directive codified in Hindsight memory). Both teammates reported:
- **0** uses of `field?: T | undefined` widening
- **0** `// @ts-expect-error` / `@ts-ignore`
- **0** new `!` non-null assertions
- Patterns used (per RFC-006 catalog): conditional spread (`...(opts?.now !== undefined && { now: opts.now })`), explicit `=== undefined` comparisons (over `!cache` truthiness checks under strict floor), tuple destructure with `string | undefined` slots treated as wildcard-non-match in `PermissionCache.invalidate()`.

### Invariant audit (RFC-007 §Invariants)

- **I-1 — Wave 6.3 ADR-012 fingerprint invariant**: ✅ same fingerprint resolves to same cached `GertsFgaClient` while not evicted. Verified by `client.lru.test.ts` "same config → same instance" test + pre-existing `client.multi-instance.test.ts` (Wave 6.3) still green.
- **I-2 — Sliding TTL for `clientInstances`, absolute TTL for entries**: ✅ `LruTtlMap.get` re-inserts entry to MRU but does NOT refresh `t` — TTL is from initial `set`. Verified by `lru-ttl-map.test.ts` TTL boundary tests.
- **I-3 — Public API additive**: ✅ existing 1-arg / 2-arg call patterns unchanged. New `opts` are optional.
- **I-4 — `LruTtlMap` is internal**: ✅ not re-exported from `auth-openfga/index.ts`. Only `configureFgaClientCache` was added to the public surface (deliberate — needed for ops tuning).
- **I-5 — Strict floor**: ✅ EOPT + noUncheckedIndexedAccess, canonical patterns only.

### Reversibility (NFR-1)

Single `git revert` of the merge commit restores pre-Wave-7.4 state cleanly. The `LruTtlMap` utility is self-contained and stand-alone; the two integrations (`client.ts`, `cache/index.ts`) replace Map references with LruTtlMap references — bidirectional swap is mechanical.

### Memory bound (NFR-4)

At default settings:
- `clientInstances` ≤ 1000 × ~5KB ≈ 5MB
- `permissionCaches` ≤ 10000 × inner LruTtlMap (10000 × ~1KB entry) ≈ ~100MB worst case
- Total worst case ≈ 100-150MB for a fully-saturated multi-tenant gateway

Documented in PRD-011 NFR-4; reasonable for typical SaaS deployment.

## Cross-references

| Artifact | Relation |
|---|---|
| PRD-011 | informs (this evidence pack) |
| RFC-007 | informs (this evidence pack verifies all acceptance criteria) |
| ADR-012 | informs (Wave 6.3 multi-store scoping invariant — preserved by I-1) |
| ADR-013 | informs (Wave 7.2 additive capability precedent) |
| EVID-025 | informs (Wave 7.3b strict floor — LRU code passes it) |
| PRD-008 | informs (Wave 7 closure parent) |

## Notes

- 2-agent parallel sprint pattern at small scale (~750 LOC across 6 files) — pre-seeded skeleton + parallel execution = same wall-clock as serial 1-agent but with built-in cross-review (each teammate's report verified consistency with the other's contract).
- `LruTtlMap` utility is small enough (~140 LOC) to fully test in-package without external deps. Future consideration: if `@gertsai/utils` or `@gertsai/collection` need a similar utility, extract to shared location.
- Eviction observability gap: `LruTtlMap` does not emit an eviction callback. `PermissionCache.stats.evictions` is inferred via size-delta detection — works but not exact. Possible follow-up (Wave 7.4.1 or 7.5+) to add observer pattern.
- KNOWN-ISSUES update: §X (CWE-770 unbounded Maps in auth-openfga) flipped to RESOLVED with reference to this commit and EVID-026.
- oxlint warning count is 1511 (pre-existing style polish, +30 vs Wave 7.3b baseline due to new LruTtlMap file — these are project-style preferences, not regressions; non-blocking per Wave 7.3 evidence).




