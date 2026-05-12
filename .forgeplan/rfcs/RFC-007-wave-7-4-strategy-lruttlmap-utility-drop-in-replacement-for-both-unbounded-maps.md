---
depth: standard
id: RFC-007
kind: rfc
last_modified_at: 2026-05-12T18:28:34.407563+00:00
last_modified_by: claude-code/2.1.139
links:
- target: PRD-011
  relation: refines
status: active
title: 'Wave 7.4 strategy: LruTtlMap utility + drop-in replacement for both unbounded Maps'
---

# RFC-007: Wave 7.4 strategy — `LruTtlMap` utility + drop-in replacement for both unbounded Maps

## Summary

Introduce a small internal `LruTtlMap<K, V>` utility class (~80 LOC, zero deps) and use it to replace three unbounded `Map<K, V>` instances in `@gertsai/auth-openfga`: the module-scoped `clientInstances` (per-config FGA clients), the module-scoped `permissionCaches` (per-scope cache instances), and the per-instance `PermissionCache.cache` (per-key cache entries). All replacements are drop-in (same get/set/delete/clear API) with sensible defaults and additive opt-in tuning knobs.

## Motivation

PRD-011 documents the CWE-770 risk. Three implementation candidates:

- **H1 — Self-rolled `LruTtlMap`**: small, zero-dep, fits the package's "minimal external surface" stance, requires ~80 LOC + ~150 LOC tests.
- **H2 — `lru-cache` npm package**: battle-tested, full-featured, adds a runtime dependency (already a transitive in some downstream consumers but not direct in auth-openfga).
- **H3 — Native `Map` with periodic cleanup**: simpler but breaks O(1) access (LRU touch on every get), or requires extra bookkeeping.

We choose **H1**. Reasoning:
- Scope is narrow (one package, two Map consumers); a tiny dedicated utility fits better than a dependency
- Zero new dependencies preserves the package's lean profile
- Implementation is small enough to fully test in-package
- Wave 7.3 strict-type floor means the utility benefits from being typia-aware / EOPT-canonical from day one

## Proposed Direction

### Decision

1. **Create** `packages/auth-openfga/src/internal/lru-ttl-map.ts` with a class:
   ```ts
   export interface LruTtlMapOptions {
     /** Max entries before LRU eviction. Default: 1000. */
     readonly maxSize?: number;
     /** Time-to-live in milliseconds; 0 disables TTL. Default: 0 (no TTL). */
     readonly ttlMs?: number;
     /** Clock fn for testability. Default: `Date.now`. */
     readonly now?: () => number;
   }

   export class LruTtlMap<K, V> {
     constructor(opts?: LruTtlMapOptions);
     get(key: K): V | undefined;
     set(key: K, value: V): void;
     has(key: K): boolean;
     delete(key: K): boolean;
     clear(): void;
     get size(): number;
   }
   ```

   Internally: `Map<K, { v: V; t: number }>` (Map already preserves insertion order in JS) + delete-and-reinsert on `get` to maintain LRU order. TTL check on `get` / `has`.

2. **Replace** `clientInstances` Map with `LruTtlMap<string, GertsFgaClient>` keyed by SHA-256 fingerprint (Wave 6.3 invariant). Default `maxSize=1000`, `ttlMs=300_000` (5 min sliding).

3. **Replace** `permissionCaches` Map with `LruTtlMap<string, PermissionCache>` keyed by scope. Default `maxSize=10000`, no TTL (caches are stateful and self-manage entry TTL).

4. **Replace** `PermissionCache.cache` (inner per-entry Map) with `LruTtlMap<string, CacheEntry>`. Default `maxSize=10000`, `ttlMs=300_000`.

5. **Add** optional `LruTtlMapOptions` to `getOrCreateClient(config, opts?)` and `getPermissionCache(scope, opts?)` — when omitted, defaults apply (additive — no breaking change to Wave 6.3 callers).

6. **Tests** in `lru-ttl-map.test.ts` cover: insertion order, get-touches-LRU, max-size eviction, TTL expiry (via `now` mock), `clear` resets size, `delete` returns boolean.

7. **Integration tests** in `client.test.ts` / `cache/index.test.ts` cover: 1100 unique configs → evict to 1000; expired entry re-created; existing call patterns unchanged.

### Implementation Order (single wave, two parallel teammates)

| Teammate | Files (OWN) | Approximate LOC |
|---|---|---|
| `auth-openfga-client-lru` | `src/internal/lru-ttl-map.ts` + `src/internal/lru-ttl-map.test.ts` (NEW) + `src/client.ts` + `src/client.test.ts` (MODIFY) | ~80 + ~150 + ~30 + ~80 = ~340 |
| `auth-openfga-cache-lru` | `src/cache/index.ts` + `src/cache/index.test.ts` (MODIFY) — depends on `lru-ttl-map.ts` from agent 1 | ~50 + ~120 = ~170 |

**File ownership conflict**: Both teammates need `lru-ttl-map.ts`. Resolution: Wave 1 produces the utility (agent 1 owns); Wave 2 consumes (agent 2 reads). To stay single-wave, we **assign `lru-ttl-map.ts` exclusively to teammate 1**; teammate 2 waits for teammate 1's report before starting cache/index.ts work.

Actually, simpler: **sequential 2-wave plan**:
- Wave 1 (1 agent): `lru-ttl-map.ts` + its standalone tests (~230 LOC)
- Wave 2 (2 parallel agents): client.ts + cache/index.ts integration

Or: **single parallel wave** with the utility built first by agent 1 (~30 LOC scaffolding can be created up front so agent 2 can import the type, then both refine). Given the small scope (~510 LOC total), pragmatic single-wave parallel is fine — team-lead seeds the empty utility file + interface stub before spawning, both agents proceed in parallel, agent 1 fills in implementation, agent 2 consumes via the typed interface.

**Chosen**: single wave, 2 parallel agents, with team-lead pre-seeding `lru-ttl-map.ts` skeleton (interface + class shell with TODO bodies) so agent 2 can import types immediately.

## Invariants

- **I-1**: Existing Wave 6.3 invariant preserved — same fingerprint always resolves to same cached `GertsFgaClient` while not evicted. LRU is overlay; eviction triggers re-instantiation with identical config → identical semantics from caller's view.
- **I-2**: TTL is sliding for `clientInstances` (touch on `get`) but absolute for `PermissionCache` entries (set time + ttlMs).
- **I-3**: Public API is additive — `getOrCreateClient(config)` and `getPermissionCache(scope)` (existing 1-arg signatures) remain valid; new opts are optional second arg.
- **I-4**: `LruTtlMap` is internal — no re-export from package index; consumers can't depend on it.
- **I-5**: All new code passes Wave 7.3 strict floor (EOPT + noUncheckedIndexedAccess) without workarounds (canonical patterns only).

## Acceptance Test (per PRD-011 FRs)

- FR-1 — load test: 1100 unique configs → `clientInstances.size === 1000`
- FR-2 — load test: 10001 unique scopes → `permissionCaches.size === 10000`
- FR-3 — unit test on `LruTtlMap`: insert 10001 entries with maxSize=10000 → size=10000, oldest evicted
- FR-4 — fake-timers test: insert entry, advance time past TTL, `get()` returns undefined
- FR-5 — call pattern test: `getOrCreateClient(config)` (1-arg) works identical to Wave 6.3
- FR-6 — `pnpm --filter @gertsai/auth-openfga test` exit 0; pass count ≥ 86 + ~20 new
- FR-7 — workspace gates green

## Alternatives Considered

| Alt | Rejection reason |
|---|---|
| `lru-cache` npm package | Adds runtime dep; auth-openfga prefers lean profile |
| Periodic `setInterval` cleanup | Breaks O(1); more complex (timer lifecycle); race conditions |
| WeakMap | Doesn't bound by count; keys are strings (fingerprints) not objects |
| No eviction (status quo) | Violates PRD-011 G-1, leaves CWE-770 open |

## Rollback Plan

- **Tactical revert**: single `git revert` restores Map<>, removes LruTtlMap, eviction tests removed → workspace returns to pre-Wave-7.4 state.
- **Partial revert**: keep LruTtlMap utility but bump default `maxSize` to large numbers (e.g. 1e6) to effectively disable eviction while diagnosing.

## Risks (delta vs PRD-011)

| ID | Risk | Mitigation |
|---|---|---|
| RFC-R-1 | LruTtlMap impl bug (e.g. LRU order wrong) | Standalone unit tests cover order + size + TTL exhaustively |
| RFC-R-2 | Type signature change breaks Wave 6.3 callers | Additive: new opt arg is optional, 1-arg signature preserved |
| RFC-R-3 | TTL fires mid-request causing FGA re-fetch on hot path | 5-min default + sliding TTL via touch-on-get keeps hot clients alive |

## Related Artifacts

| Artifact | Relation |
|---|---|
| PRD-011 | refines (RFC-007 is the strategy detail for PRD-011) |
| ADR-012 | informs (Wave 6.3 multi-store scoping invariant — preserved by I-1) |
| ADR-013 | informs (Wave 7.2 additive capability precedent) |
| RFC-006 | informs (Wave 7.3b canonical patterns — LRU code must follow them) |





