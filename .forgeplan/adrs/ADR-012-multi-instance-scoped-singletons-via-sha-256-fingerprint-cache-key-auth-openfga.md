---
depth: standard
id: ADR-012
kind: adr
last_modified_at: 2026-05-07T22:06:03.510353+00:00
last_modified_by: claude-code/2.1.132
status: active
title: Multi-instance scoped singletons via SHA-256 fingerprint cache-key (auth-openfga)
---

# ADR-012 — Multi-instance scoped singletons via SHA-256 fingerprint cache-key (`@gertsai/auth-openfga`)

## Status

PROPOSED — to be activated alongside PRD-006, RFC-004, SPEC-018,
EVID-021 in Wave 6.3.

## Context

The package's process-wide singletons (`getFgaClient`,
`getPermissionCache`) cannot serve multi-tenant deployments that need
distinct OpenFGA stores in one Node.js process — once the first
config wins, subsequent calls with different `apiUrl`/`storeId`/
`apiToken` silently return the cached client. Sprint 3.11 §P1-2
documented the hazard; this ADR fixes the design.

## Decision

Replace the `let clientInstance: GertsFgaClient | null` global with
a `Map<string, GertsFgaClient>` keyed by **SHA-256 hex digest** of a
canonical-JSON fingerprint of `{apiUrl, storeId, authorizationModelId,
apiToken}`. Apply the same pattern to `getPermissionCache(scope?)`.

Add a separate `createFgaClient(config)` factory for callers who want
explicit non-cached scoping (per-request creation).

```ts
// Conceptual shape:
const clientInstances = new Map<string, GertsFgaClient>();

function fingerprint(config?: FgaClientConfig): string {
  if (!config) return '__default__';
  const canonical = JSON.stringify({
    apiUrl: config.apiUrl ?? '',
    storeId: config.storeId ?? '',
    authorizationModelId: config.authorizationModelId ?? '',
    apiToken: config.apiToken ?? '',
  });
  return createHash('sha256').update(canonical).digest('hex');
}

export function getFgaClient(config?: FgaClientConfig): GertsFgaClient {
  const key = fingerprint(config);
  let inst = clientInstances.get(key);
  if (!inst) {
    inst = new GertsFgaClient(config);
    clientInstances.set(key, inst);
  }
  return inst;
}

export function createFgaClient(config?: FgaClientConfig): GertsFgaClient {
  return new GertsFgaClient(config);
}

export function resetFgaClient(config?: FgaClientConfig): void {
  if (config === undefined) clientInstances.clear();
  else clientInstances.delete(fingerprint(config));
}
```

`getPermissionCache(config?, scope?: string)` mirrors the pattern
with `scope` (a free-form string) as the cache key. `scope` defaults
to `__default__` so existing callers see identical behaviour.

## Considered Alternatives

### A. Pure factory (no cache at all)

Drop the singleton; every call site builds its own
`new GertsFgaClient(config)`. Each builds-its-own pays the
discovery cost (`listStores`, `readAuthorizationModels`) repeatedly
— easily 100ms+ per request. **Rejected**: too expensive, breaks
performance contracts.

### B. Hybrid: keep singleton, add factory

Keep `getFgaClient()` as a strict singleton (legacy behaviour: first
config wins, ignores subsequent), add `createFgaClient(config)` as
the multi-tenant escape hatch. **Rejected**: the singleton silently
returning stale config remains a footgun even if a factory exists.
Operators forget to use the factory.

### C. Hash-keyed multi-instance Map (THIS DECISION)

`getFgaClient(config)` returns the cached instance for the same
config OR a new one for a distinct config. `createFgaClient` is the
explicit non-cached escape hatch. Backward-compat preserved because
the no-args path uses a stable `__default__` key.

### D. Object-identity-keyed `WeakMap<FgaClientConfig, ...>`

Use the config object itself as the WeakMap key. **Rejected**:
constructing a fresh config object on each call (which most idiomatic
TypeScript code does — `getFgaClient({apiUrl, storeId})` literal)
returns a different instance every time, defeating the cache. Value
equality is what we want, not reference equality.

### E. Plaintext fingerprint key (no SHA-256)

Use the canonical JSON string as the Map key directly. **Rejected**:
`apiToken` would live as plaintext in `Map.keys()`, exposed by any
heap dump or memory introspection. SHA-256 hashing of the JSON before
keying isolates token confidentiality from cache structure.

## Consequences

### Positive

- Multi-tenant SaaS authors can run N tenants per process safely.
- Same config fingerprint = same cached instance = no duplicate
  discovery cost.
- Token never present in Map keys (NFR-2 from PRD-006).
- `createFgaClient` provides explicit per-request escape hatch.
- Backwards-compat absolute: existing single-config workloads see
  zero behaviour change.

### Negative

- Map size grows with distinct configs in long-running processes;
  caller must call `resetFgaClient(config)` to evict (PRD-006 NFR-4).
  No automatic LRU in v1 — deferred ADR if real-world usage demands.
- Cache key drift risk if SDK adds a new identity-affecting field
  not in our fingerprint (R-1 in PRD-006). Mitigation: explicit
  field list, audit on SDK bump.
- Hashing JSON briefly retains plaintext token in stack memory for
  the canonical JSON intermediate (R-3 in PRD-006). Acceptable for
  v1; explicit comment warns future readers.

### Neutral

- One new public symbol exported (`createFgaClient`).
- `resetFgaClient`/`resetPermissionCache` gain optional config/scope
  arg — backward-compat: no-args path still clears all.

## Invariants (load-bearing across this ADR)

- **I-1 — Backward-compat absolute.** A single-config workload
  observes zero behaviour change. Verified by retaining ALL existing
  unit tests + adding multi-config tests.
- **I-2 — Token confidentiality.** `apiToken` MUST NOT appear in
  any data structure key (Maps, Sets, dictionaries). Plaintext is
  isolated to (a) the per-instance `GertsFgaClient.config.apiToken`
  field and (b) the SDK request headers. SHA-256 hashing of the
  fingerprint JSON moves token out of the Map keys.
- **I-3 — Determinism.** `fingerprint(a)` === `fingerprint(b)` iff
  `a.{apiUrl, storeId, authModelId, apiToken}` === `b.<same>`.
  Object property order MUST not matter — use canonical JSON.
- **I-4 — Async safety.** `getFgaClient(c)` MUST not race-create
  two instances when called concurrently with the same config in
  a single event loop tick. Node single-threaded + sync Map ops
  + check-then-set with no `await` between — implicit but verified.
- **I-5 — Cleanup is selective by default.** `resetFgaClient(c)`
  clears one entry; `resetFgaClient()` clears all. Same for
  `resetPermissionCache`. The all-clear path is the legacy contract.

## Rollback Plan

If adopted code surfaces a regression in production:

1. `git revert <sha>` — restore `let clientInstance: GertsFgaClient | null = null`
2. Restore `resetFgaClient()` no-arg semantics (it was already that way).
3. m9s-example gate already has the `apiToken` plumbing from Wave 6.2;
   that doesn't depend on this ADR — no rollback needed there.
4. Reopen KNOWN-ISSUES §FGA-singleton-multi-store with the
   regression detail.

The revert is mechanical: changes are localised to `client.ts`,
`cache/index.ts`, `index.ts` (exports), `queries/index.ts`
(`checkPermission` opts), and the test files. ~150 lines of diff.

## References

- PRD-006 — Wave 6.3 multi-tenant isolation requirements
- RFC-004 — implementation phases + rollout
- SPEC-018 — concrete edit list + test plan
- KNOWN-ISSUES §FGA-singleton-multi-store
- Sprint 3.11 Post-Build Track 2 §P1-2
- OpenFGA SDK `Credentials` types
- Node.js `crypto.createHash('sha256')`



