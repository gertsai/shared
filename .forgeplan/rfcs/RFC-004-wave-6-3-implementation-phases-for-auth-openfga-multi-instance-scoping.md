---
depth: standard
id: RFC-004
kind: rfc
last_modified_at: 2026-05-07T22:07:07.894771+00:00
last_modified_by: claude-code/2.1.132
status: active
title: Wave 6.3 — Implementation phases for auth-openfga multi-instance scoping
---

# RFC-004 — Wave 6.3 implementation phases

## Summary

Concrete implementation plan for **PRD-006** + **ADR-012** (multi-instance
scoping in `@gertsai/auth-openfga`). Three sequential edges, single
owner, no parallel work — all changes localised to one package + the
m9s-example gate.

## Motivation

See PRD-006 + ADR-012. TL;DR: process-wide singletons silently return
the first config; we replace `let clientInstance: GertsFgaClient | null`
with `Map<string, GertsFgaClient>` keyed by SHA-256 hash of canonical
JSON of the distinguishing config fields. Add `createFgaClient` factory.
Same pattern for `getPermissionCache(scope?)`. m9s gate auto-derives
per-instance scope.

## Proposed Direction

The package gains:

1. `getFgaClient(config?)` — multi-instance, cache-keyed by fingerprint hash.
2. `createFgaClient(config?)` — NEW. Always returns a fresh instance.
3. `resetFgaClient(config?)` — selective by config; no-arg clears all.
4. `getPermissionCache(config?, scope?)` — `scope` becomes the cache key.
5. `resetPermissionCache(scope?)` — selective by scope.
6. `checkPermission(req, opts?: { clientScope?, cacheScope? })` —
   optional scope override; defaults preserve current behaviour.

The m9s-example gate computes a per-instance `cacheScope` from its
own `client.{apiUrl, storeId}` config (token NOT included — that's
fingerprint territory; scope is for cache partitioning across
instances of the same gate).

## Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│ packages/auth-openfga                                            │
│                                                                  │
│  src/util/fingerprint.ts (NEW)                                   │
│    fingerprint(config?: FgaClientConfig): string                 │
│    └─ canonical JSON → SHA-256 → hex digest                      │
│                                                                  │
│  src/client.ts                                                   │
│    Map<fingerprint, GertsFgaClient>                              │
│    getFgaClient(config?)   ──→ get-or-create by fingerprint      │
│    createFgaClient(config?) ──→ always fresh                     │
│    resetFgaClient(config?) ──→ delete one or clear all           │
│                                                                  │
│  src/cache/index.ts                                              │
│    Map<scope, PermissionCache>                                   │
│    getPermissionCache(config?, scope?='__default__')             │
│    resetPermissionCache(scope?)                                  │
│                                                                  │
│  src/queries/index.ts                                            │
│    checkPermission(req, opts?: {clientScope?, cacheScope?})      │
│                                                                  │
│  src/index.ts (exports)                                          │
│    + createFgaClient                                             │
│    (existing exports keep their signatures)                      │
└──────────────────────────────────────────────────────────────────┘
```

## Implementation Phases

### Edge 1 — `@gertsai/auth-openfga` core: client + cache + checkPermission

**Files**:
- `packages/auth-openfga/src/util/fingerprint.ts` (NEW)
- `packages/auth-openfga/src/client.ts` (MODIFY)
- `packages/auth-openfga/src/cache/index.ts` (MODIFY)
- `packages/auth-openfga/src/queries/index.ts` (MODIFY — `checkPermission` opts)
- `packages/auth-openfga/src/index.ts` (MODIFY — re-export `createFgaClient`)
- `packages/auth-openfga/src/__tests__/client.multi-instance.test.ts` (NEW)
- `packages/auth-openfga/src/__tests__/cache.multi-scope.test.ts` (NEW)

**Changes** (per ADR-012 conceptual shape):

1. `util/fingerprint.ts`: pure helper, exports `fingerprint(config?: FgaClientConfig): string`. Uses `crypto.createHash('sha256')`.

2. `client.ts`:
   - Replace `let clientInstance: GertsFgaClient | null` with
     `const clientInstances = new Map<string, GertsFgaClient>()`
   - Rewrite `getFgaClient(config?)` per ADR-012
   - Add `createFgaClient(config?)`
   - Rewrite `resetFgaClient(config?)` selective semantics
   - No changes to `GertsFgaClient` class internals (all logic
     preserved; only the storage shape changes).

3. `cache/index.ts`:
   - Replace `let permissionCacheInstance: PermissionCache | null`
     with `const permissionCaches = new Map<string, PermissionCache>()`
   - `getPermissionCache(config?, scope?: string = '__default__')`
   - `setPermissionCache(cache, scope?)` — mirror selective semantics
   - `resetPermissionCache(scope?)` — selective by scope; no-arg clears all
   - `createInvalidationHandler()` calls `getPermissionCache()` —
     keep using `__default__` scope (back-compat).

4. `queries/index.ts`:
   - Add second arg to `checkPermission(req, opts?: { clientScope?: string; cacheScope?: string })`.
     `clientScope` and `cacheScope` are optional; when omitted, falls
     back to `getFgaClient()` and `getPermissionCache()` defaults
     (current behaviour preserved).

5. `index.ts`:
   - Add `export { createFgaClient } from './client.js'`
   - Add `export { fingerprint } from './util/fingerprint.js'` (so
     consumers can compute the same scope key for `checkPermission`
     opts; useful for the m9s gate).

6. `client.multi-instance.test.ts` (≥6 cases):
   - same config → same instance
   - different `apiUrl` → different instance
   - different `storeId` → different instance
   - different `apiToken` → different instance
   - `createFgaClient` always returns NEW instance
   - `resetFgaClient(config)` deletes ONE; others remain
   - `resetFgaClient()` (no arg) clears ALL — back-compat
   - Token NEVER appears in `clientInstances.keys()` (privacy invariant)

7. `cache.multi-scope.test.ts` (≥4 cases):
   - same scope → same cache instance
   - different scope → different cache instance
   - `resetPermissionCache(scope)` deletes ONE
   - `resetPermissionCache()` clears ALL — back-compat

### Edge 2 — m9s-example gate auto-derives scope

**Files**:
- `examples/m9s-example/src/infrastructure/openfga-permission.gate.ts` (MODIFY)
- `examples/m9s-example/tests/openfga-permission.gate.multi-instance.test.ts` (NEW)

**Changes**:

1. `OpenFgaPermissionGate.can()`:
   - After `mod.getFgaClient({ apiUrl, storeId, apiToken })`, compute
     `const scope = mod.fingerprint({ apiUrl, storeId, authorizationModelId, apiToken })`
   - Call `mod.checkPermission(req, { clientScope: scope, cacheScope: scope })`
   - Update header docstring: "Wave 6.3: each gate instance with a
     distinct `apiUrl`/`storeId` automatically gets its own SDK
     client AND its own permission cache via fingerprint scope. The
     Sprint 3.11 §P1-2 multi-store JSDoc warning is no longer
     applicable for the gate's own configs."

2. New test file (≥3 cases):
   - Construct two gates with different `storeId` values, run `can()`
     on each, mock SDK to record which client received the call —
     assert different mock instances were used (so two clients
     actually exist).
   - Same config in both gates → same client (not duplicated).
   - `apiToken` differing → different clients (NFR-2 at gate level).

### Edge 3 — KNOWN-ISSUES + EVID-021 + activations

**Files**:
- `KNOWN-ISSUES.md` (MODIFY) — flip §FGA-singleton-multi-store + JSDoc
  multi-store warning entries to RESOLVED with Wave 6.3 detail
- `.forgeplan/evidence/EVID-021-...md` (NEW)
- `.forgeplan/state/EVID-021.yaml`
- Activate PRD-006, ADR-012, RFC-004, SPEC-018, EVID-021

## Cross-Edge Contracts

- Edge 1 introduces `fingerprint` export; Edge 2 imports it.
- Edges 1+2 must compile + pass typecheck before Edge 3 starts.
- Edge 3 only runs after Pre-Build audit on Edges 1+2 returns clean.

## Invariants (load-bearing on the implementation)

- **I-1 — Backwards compat absolute.** Every existing call shape
  unchanged: `getFgaClient()`, `getFgaClient(c)`, `resetFgaClient()`,
  `getPermissionCache()`, `resetPermissionCache()`,
  `checkPermission(req)`. Verified by retaining all 64 existing
  `auth-openfga` tests untouched (only adding new test files).
- **I-2 — Token never in Map keys.** SHA-256 hash of canonical JSON
  is the only thing that enters `clientInstances` keys. Verified
  by an explicit test that walks `clientInstances.keys()` and
  asserts none contain the literal token.
- **I-3 — Determinism.** Same config (any property order) →
  same fingerprint. Verified by a test constructing the same
  config object two ways (different key order in the literal).
- **I-4 — Async safety.** `getFgaClient(c)` two concurrent calls
  on the same event loop tick produce ONE instance. Verified by
  `Promise.all([getFgaClient(c), getFgaClient(c)])` returning
  `===` references.
- **I-5 — Selective reset is the new default for the
  config-arg form.** `resetFgaClient(c)` deletes ONE; the no-arg
  form is the legacy "clear all". Verified by both call shapes
  in tests.

## Rollout Plan

1. Open Wave 6.3 PR with Edges 1+2+3 in a single atomic commit.
2. CI green → merge to main (per user consent — autopilot does NOT
   merge, see /autorun red lines).
3. EVID-021 active, KNOWN-ISSUES flipped, Hindsight Group 47 retain.
4. Optional follow-up: profile Map size in long-running multi-tenant
   workloads to validate NFR-4 (no LRU in v1).

## Drawbacks

- One new export (`createFgaClient`) widens the public surface.
- One new file (`util/fingerprint.ts`) inside the package.
- Tests touch `crypto` Node API — minor coupling, but unavoidable.

## Unresolved Questions

(none — explicit)

## References

- PRD-006 — Wave 6.3 requirements (this RFC implements it)
- ADR-012 — multi-instance scoping decision
- KNOWN-ISSUES §FGA-singleton-multi-store, §FGA-API_TOKEN-plumbing
  (resolved Wave 6.2)
- Sprint 3.11 Post-Build Track 2 §P1-2
- Node.js `crypto.createHash`



