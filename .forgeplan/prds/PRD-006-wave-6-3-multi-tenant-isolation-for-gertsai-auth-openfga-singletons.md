---
depth: standard
id: PRD-006
kind: prd
last_modified_at: 2026-05-07T22:05:07.563759+00:00
last_modified_by: claude-code/2.1.132
status: active
title: Wave 6.3 — Multi-tenant isolation for @gertsai/auth-openfga singletons
---

# PRD-006 — Multi-tenant isolation for `@gertsai/auth-openfga` singletons (Wave 6.3)

## Context

Closes Sprint 3.11 Post-Build Track 2 §P1-2 / KNOWN-ISSUES §FGA-singleton-multi-store. The current package exposes two process-wide singletons:

```ts
// client.ts
let clientInstance: GertsFgaClient | null = null;
export function getFgaClient(config?: FgaClientConfig): GertsFgaClient {
  if (!clientInstance) clientInstance = new GertsFgaClient(config);
  return clientInstance;  // ← ignores subsequent `config` args
}

// cache/index.ts (similar pattern)
let permissionCacheInstance: PermissionCache | null = null;
```

**The hazard**: once primed with the FIRST non-empty config, subsequent
calls with DIFFERENT `apiUrl` / `storeId` / `apiToken` return the cached
client unchanged. A multi-tenant deployment that needs separate OpenFGA
stores per tenant cannot use the package without explicit
`resetFgaClient()` between switches — and there is no per-call scoping.

The Sprint 3.11 §P1-2 documentation fix added a JSDoc warning telling
test code to call `resetFgaClient()`/`resetPermissionCache()` between
distinct configs. That works for tests but is a footgun in production
multi-tenant code.

## Target Audience

- **Multi-tenant SaaS authors** consuming `@gertsai/auth-openfga` who
  need to authorize requests against per-tenant OpenFGA stores in the
  SAME Node.js process.
- **m9s-example operators** who run the demo against multiple OpenFGA
  endpoints from a single process (today they cannot — they get the
  first config back regardless).
- **Library maintainers** of `@gertsai/auth-openfga` — get a clearer
  caching contract that survives multi-config workloads, plus a
  documented migration path for any future cache-key changes.
- **Security reviewers** — get a closed P1 finding (singleton silent
  return-of-cached) replaced with explicit per-config isolation.

## Problem

A real production deployment that wants to authorize across two
distinct OpenFGA stores in one process today either:

1. Manually toggles `resetFgaClient()` + `getFgaClient(newConfig)`
   on every per-tenant boundary, racing with other async calls
   that observe the wrong client mid-flight; OR
2. Forks a second process per tenant, paying the operational cost
   of N processes for N tenants; OR
3. Wraps the package in their own multi-instance shim, which
   defeats the abstraction.

None of these are acceptable for a library that claims to be
"production-grade" and is the recommended adapter in m9s-example.

## Goals

1. Allow N distinct configs in one process to each get their OWN
   `GertsFgaClient` and `PermissionCache` — no shared state.
2. Preserve EXISTING `getFgaClient()` (no args) and
   `getFgaClient(singleConfig)` semantics: same call → same instance.
3. Keep the public API additive — add a new `createFgaClient()`
   factory for callers who want explicit non-cached scoping.
4. Stable cache-key derivation: identical configs (same `apiUrl`,
   `storeId`, `authorizationModelId`, `apiToken`) MUST resolve to
   the same cached instance regardless of object identity.
5. Token confidentiality: the cache-key MUST NOT store raw `apiToken`
   in the Map keys (use SHA-256 hash of stable JSON).
6. Apply same scoping pattern to `getPermissionCache()` so that
   distinct fingerprints get distinct caches (no cross-tenant cache
   pollution).
7. Make `resetFgaClient(config?)` / `resetPermissionCache(scope?)`
   selective: clear ALL when no arg, clear ONE when arg given.
8. Mark KNOWN-ISSUES §FGA-singleton-multi-store RESOLVED.

## Non-Goals

- **Per-request client construction** — that's still expensive (each
  `new GertsFgaClient` does store + model discovery). The cache
  remains; it's just keyed by config.
- **Connection pooling at the SDK level** — out of scope; SDK manages
  its own keep-alives.
- **OAuth2 ClientCredentials credential flow** — separate Wave 6+ ADR
  if needed.
- **Tenant-affinity load balancing across processes** — that's an
  ops-level concern (k8s, sticky sessions), not a library concern.
- **Hot-rotation of tokens within a single GertsFgaClient instance**
  — to rotate, the caller calls `resetFgaClient(config)` (clears
  that one instance) and `getFgaClient(newConfig)`.

## Functional Requirements

- [ ] FR-1. `getFgaClient(config?: FgaClientConfig): GertsFgaClient` —
      cache keyed by SHA-256 hash of `{apiUrl, storeId,
      authorizationModelId, apiToken}` JSON. No-args path uses a
      stable `__default__` key that is identical to current behaviour.
- [ ] FR-2. `createFgaClient(config?: FgaClientConfig): GertsFgaClient`
      (NEW) — returns a fresh, NEVER-cached instance. Callers
      responsible for retaining the reference.
- [ ] FR-3. `resetFgaClient(config?: FgaClientConfig): void` —
      backwards-compat semantics: `resetFgaClient()` (no arg) clears
      ALL cached clients; `resetFgaClient(config)` clears the ONE
      instance keyed by that config's fingerprint. Old single-arg
      tests continue to work because clearing all is a strict
      superset of clearing one.
- [ ] FR-4. `getPermissionCache(config?: PermissionCacheConfig, scope?: string): PermissionCache`
      — when `scope` is provided, that scope is the cache key; else
      uses `__default__`. Multiple distinct scopes get distinct caches.
- [ ] FR-5. `resetPermissionCache(scope?: string): void` — same
      reset semantics as FR-3.
- [ ] FR-6. `checkPermission(req, opts?: { clientScope?: string,
      cacheScope?: string })` — optional opts to scope the underlying
      `getFgaClient` / `getPermissionCache` lookups. Backward-compat:
      omitting opts uses `__default__` (current behaviour preserved).
- [ ] FR-7. `OpenFgaPermissionGate.can()` in m9s-example
      automatically derives a per-gate scope from its own client
      config so two gates with different `storeId` see different
      caches AND different clients without operator action.

## Non-Functional Requirements

NFR-1. **Backwards compat absolute**. Every existing call shape:
       `getFgaClient()`, `getFgaClient({apiUrl})`,
       `resetFgaClient()`, `getPermissionCache()`,
       `resetPermissionCache()`, `checkPermission(req)` — MUST behave
       identically when only ONE config is in play across the
       process. Verified by retaining all existing tests and adding
       new ones for multi-config behaviour.
NFR-2. **Token never plaintext in Map keys**. Hash the fingerprint
       JSON with SHA-256 (Node `crypto.createHash`). Map keys are
       hex digests. Token never appears as a substring in any
       in-memory data structure outside the per-client config
       (which is unavoidable — the SDK needs the literal token).
NFR-3. **Determinism**. Same config object (same field values) MUST
       yield same fingerprint regardless of property iteration order
       — use canonical JSON (alphabetized keys).
NFR-4. **Memory safety**. Map size grows with distinct configs;
       document `resetFgaClient(config)` as the cleanup hook for
       long-running processes that churn through tenants.
       Out-of-scope for v1: automatic LRU eviction.
NFR-5. **Thread safety / async safety**. Node is single-threaded;
       Map ops are atomic. Concurrent `getFgaClient(sameConfig)`
       calls MUST not race-create two instances. Use a "compute
       once" pattern (check-then-set with no `await` between).

## Acceptance Criteria

AC-1. `pnpm --filter @gertsai/auth-openfga test` — existing 64/64
      pass + new tests for multi-config scoping (≥6 new tests
      covering FR-1..FR-6 each).
AC-2. `pnpm --filter @gertsai-examples/m9s-example test` — existing
      38/38 pass + a new test that constructs TWO
      `OpenFgaPermissionGate` instances with different `storeId`
      and verifies they use distinct underlying SDK clients.
AC-3. `pnpm --filter @gertsai-examples/m9s-example test:real-infra` —
      existing 16/16 pass against running docker-compose
      (no regression on Postgres / OpenFGA / BullMQ paths).
AC-4. `pnpm -r --workspace-concurrency=1 build` — clean.
      `pnpm typecheck` — 0 errors.
      `pnpm depcruise` — 0 violations.
      `pnpm exec oxlint --quiet` — 0 errors in the touched files.
AC-5. Pre-Build audit (≥3 parallel reviewers) — 0 P0, all P1
      addressed before commit.
AC-6. Post-Build audit (≥3 parallel reviewers) — 0 P0, all P1
      addressed or deferred to KNOWN-ISSUES with rationale.
AC-7. Hindsight retain entry covering the singleton redesign
      pattern (cache-key fingerprinting, factory escape hatch,
      reset semantics).
AC-8. KNOWN-ISSUES §FGA-singleton-multi-store flipped to RESOLVED.

## Risks

R-1. Cache-key drift across SDK minor versions — if SDK adds a
     new credentials field that should affect identity, our
     fingerprint omits it and two clients silently share a key.
     Mitigation: explicit list of fields in `fingerprint()`,
     comment pinning to current `FgaClientConfig` shape, audit
     review when SDK is bumped.
R-2. Memory leak under long-lived processes that churn tenants —
     Map grows without bound. Mitigation: NFR-4 documentation +
     follow-up ADR for LRU if real-world usage demands it.
R-3. Token in fingerprint JSON intermediate — even though the Map
     key is hashed, the JSON string passed into `createHash` is
     plaintext-token in stack memory briefly. Mitigation:
     hash-and-discard in a single expression; do not retain the
     intermediate. Acceptable risk for v1.

## Out-of-Scope

- LRU eviction policy for the client/cache Maps.
- OAuth2 client_credentials flow (separate ADR, additive future
  layer).
- SDK-level connection pool tuning.
- Per-request token refresh / rotation flows.

## Related Artifacts

- **EVID-019** — Sprint 3.11 production-grade m9s-example evidence
  (active, CL3 supports). §P1-2 in that audit drives this PRD.
- **EVID-020** — Wave 6.2 apiToken plumbing evidence (active,
  CL3 supports). Wave 6.2 added `apiToken` to `FgaClientConfig`;
  Wave 6.3 makes it part of the cache-key fingerprint so distinct
  tokens do not collide on the same cached instance.
- **PRD-005 + RFC-003** — Wave 6.2 apiToken plumbing — defines
  the field this PRD now keys by.
- **ADR-013** (this cycle) — singleton-vs-factory architectural
  decision and cache-key fingerprint strategy.
- **SPEC-018** (this cycle) — concrete edit list and test plan.
- **RFC-004** (this cycle) — implementation phases + rollout.
- **KNOWN-ISSUES.md §FGA-singleton-multi-store** — entry this
  PRD closes; will be flipped to RESOLVED on activation.

Refs: Sprint 3.11 Post-Build Track 2 §P1-2, KNOWN-ISSUES §FGA-singleton-multi-store, OpenFGA SDK `Credentials` types



