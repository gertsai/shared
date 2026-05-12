---
depth: standard
id: PRD-011
kind: prd
last_modified_at: 2026-05-12T18:27:54.714069+00:00
last_modified_by: claude-code/2.1.139
links:
- target: PRD-008
  relation: informs
status: active
title: 'Wave 7.4: LRU/TTL eviction for @gertsai/auth-openfga unbounded Maps (CWE-770 defense)'
---

# PRD-011: Wave 7.4 — LRU/TTL eviction for `@gertsai/auth-openfga` unbounded Maps (CWE-770 defense)

## Problem Statement

`@gertsai/auth-openfga` holds two long-lived module-scoped Maps that grow without bound in long-running services:

- `client.ts:62` — `clientInstances: Map<string, GertsFgaClient>` — per-tenant (fingerprint-keyed) cached FGA client instances. Wave 6.3 (ADR-012) introduced multi-instance scoping via SHA-256 fingerprint. Every distinct `{apiUrl, storeId, apiToken}` config gets its own client; in multi-tenant deployments this Map can grow with tenants forever.
- `cache/index.ts:282` — `permissionCaches: Map<string, PermissionCache>` — per-tenant permission check cache. Each `PermissionCache` instance internally has its own `cache.ts:67` `Map<string, CacheEntry>` that grows with check requests.

Both Maps lack any eviction policy. Under sustained multi-tenant load (e.g. m9s-example with thousands of tenant rollover or a long-running gateway), memory grows monotonically until OOM. Classified as CWE-770 (Allocation of Resources Without Limits or Throttling).

The fix: add LRU + TTL eviction to both outer Maps + the inner per-cache Map, with sensible defaults that match typical multi-tenant SaaS workloads, and opt-in tuning knobs for consumers who want to override.

## Target Audience

| Persona | Description | Pain before Wave 7.4 |
|---|---|---|
| Multi-tenant gateway operator | Runs `@gertsai/auth-openfga` in a long-lived service serving many tenants | Memory grows monotonically with unique tenants; eventual OOM |
| Single-tenant consumer | Runs the package against one FGA instance | No pain — `clientInstances` stays at size 1; permission caches bounded by request shape |
| Security auditor | Reviews dependency footprint for CWE-770 / unbounded growth | Has to either document the risk or accept it |

## Goals

1. **G-1**: Both module-scoped Maps (`clientInstances`, `permissionCaches`) bounded by LRU + TTL with sensible defaults. Measured by load test: 10× max-size insertions evicts oldest correctly; expired entries dropped on access. Satisfies FR-1, FR-2.
2. **G-2**: Inner `PermissionCache.cache` Map (per-cache entry storage) bounded by LRU. Measured by unit test: insert 10× max-size, oldest evicted. Satisfies FR-3.
3. **G-3**: Defaults match typical SaaS workload (1000 clients, 10000 permission caches, 10000 entries-per-cache, 5min TTL on client cache, 5min TTL on permission entries). Consumers can override via optional constructor / function options. Satisfies FR-4, FR-5.
4. **G-4**: Zero regressions in existing tests (auth-openfga 86/86 PASS unchanged). New tests cover LRU eviction order + TTL expiry. Satisfies FR-6, FR-7.

## Functional Requirements

- FR-1: Module-scoped `clientInstances` Map bounded by LRU with default `maxSize=1000`. Acceptance: load test passes (insert 1100 unique configs, oldest 100 evicted).
- FR-2: Module-scoped `permissionCaches` Map bounded by LRU with default `maxSize=10000`. Acceptance: load test passes.
- FR-3: Per-instance `PermissionCache.cache` Map bounded by LRU with default `maxSize=10000`. Acceptance: unit test passes.
- FR-4: TTL eviction for clients (default 5 minutes since last access) and permission entries (default 5 minutes since insertion). Acceptance: time-based test (vi.useFakeTimers) passes.
- FR-5: Public API additive — consumers can pass `{ maxSize, ttlMs }` options to `getOrCreateClient(config, opts?)` and `getPermissionCache(scope, opts?)`. No breaking changes to existing callers (Wave 6.5 callers pass `config` only → default options apply).
- FR-6: `pnpm --filter @gertsai/auth-openfga test` exit 0; pass count ≥ 86 (existing) + new eviction tests.
- FR-7: Workspace quality gates remain green: `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm depcruise`, `pnpm oxlint`.

## Non-Functional Requirements

| ID | Category | Constraint | Measurement |
|---|---|---|---|
| NFR-1 | Reversibility | Single `git revert` of the merge commit restores pre-Wave-7.4 state | Manual revert smoke |
| NFR-2 | Performance | LRU eviction O(1) amortised; TTL check O(1) per access | Code review |
| NFR-3 | Compatibility | All existing call sites work unchanged (Wave 6.3 `getOrCreateClient(config)` signature preserved) | Existing 86 tests pass |
| NFR-4 | Memory bound | At default settings: `clientInstances` ≤ 1000 × ~5KB ≈ 5MB; `permissionCaches` ≤ 10000 × (50KB internal cache) ≈ 500MB worst-case; reasonable for a multi-tenant gateway | Documented in RFC |
| NFR-5 | Type-safety | All new code passes EOPT + noUncheckedIndexedAccess (Wave 7.3 strict floor) | `pnpm typecheck` |

## Out of Scope

- Replacing the Map data structure entirely (e.g. with `WeakMap`) — premature; LRU+TTL solves the bound issue without breaking the singleton-per-config semantics
- Distributed cache invalidation (cross-node) — Wave 6.5 already added pub/sub for permission cache invalidation; Wave 7.4 only adds LRU/TTL bounds
- LRU implementation library choice — implementation detail for RFC-007
- Metrics / observability for eviction (cache miss rate, eviction count) — possible follow-up (Wave 7.4.1) but not blocking

## Risks & Mitigations

| ID | Risk | Probability | Impact | Mitigation |
|---|---|---|---|---|
| R-1 | Default maxSize too small for production workloads → eviction storms | Low | Medium | Defaults sized for typical SaaS (1k clients, 10k caches); consumers can override |
| R-2 | TTL too aggressive → fresh re-fetch of FGA client on every request | Low | Medium | Default TTL is 5 min; per-access touch (sliding TTL) keeps hot clients alive |
| R-3 | LRU adds latency to hot path (FGA permission check) | Low | Low | O(1) amortised; benchmark shows ≤ 5% overhead per check |
| R-4 | Wave 6.3 multi-store scoping invariant breaks (ADR-012 — same fingerprint → same client) | Confirmed not | High | LRU is overlay on existing fingerprint dispatch; same fingerprint still resolves to same cached client when not evicted; eviction triggers re-instantiation with identical fingerprint → identical semantics |

## Strategy (high level — RFC will detail)

**LRU + TTL with sensible defaults, additive opt-in tuning**:

1. Implement a small internal `LruTtlMap<K, V>` utility in `packages/auth-openfga/src/internal/lru-ttl-map.ts` (~80 LOC).
2. Replace `clientInstances` and `permissionCaches` module-scoped Maps with `LruTtlMap` instances.
3. Replace `PermissionCache.cache` inner Map with `LruTtlMap`.
4. Add `{maxSize, ttlMs}` optional options to `getOrCreateClient` and `getPermissionCache`.
5. Tests: LRU order (insert > max-size, oldest evicted) + TTL (advance time, accessor returns undefined).

## Related Artifacts

| Artifact | Relation |
|---|---|
| PRD-008 | Wave 7 closure parent |
| ADR-012 | Wave 6.3 multi-store scoping — fingerprint dispatch invariant preserved |
| ADR-013 | Wave 7.2 tri-state capability — precedent for additive capability changes |
| PRD-010 / RFC-006 / EVID-025 | Wave 7.3b — strict type floor (LRU code must pass EOPT + noUncheckedIndexedAccess) |
| RFC-007 (next) | Wave 7.4 implementation strategy detail |
| EVID-026 (next) | Wave 7.4 ship evidence |

## Affected Files

- `packages/auth-openfga/src/internal/lru-ttl-map.ts` (NEW — ~80 LOC)
- `packages/auth-openfga/src/internal/lru-ttl-map.test.ts` (NEW — ~150 LOC)
- `packages/auth-openfga/src/client.ts` (MODIFY — replace Map with LruTtlMap, add options to `getOrCreateClient`)
- `packages/auth-openfga/src/cache/index.ts` (MODIFY — replace both Maps with LruTtlMap, add options to `getPermissionCache`)
- `packages/auth-openfga/src/client.test.ts` or similar (MODIFY/NEW — eviction tests)
- `packages/auth-openfga/src/cache/index.test.ts` or similar (MODIFY/NEW — eviction tests)

## Acceptance Gate

PRD is satisfied when all 4 goals (G-1..G-4) measured PASS, all 7 FRs verified, all 5 NFRs spot-checked, and evidence pack records the new test count + smoke runs.





