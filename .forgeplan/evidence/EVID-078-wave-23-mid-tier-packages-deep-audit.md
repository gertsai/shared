---
depth: tactical
id: EVID-078
kind: evidence
links:
- target: PRD-060
  relation: informs
status: active
title: Wave 23 — mid-tier packages deep audit
---

## Summary

Wave 23 deep audit of 4 mid-tier packages (~4.2k LOC, 242 passing tests) covers `@gertsai/auth-openfga`, `@gertsai/rest-request-manager`, `@gertsai/queue`, and `@gertsai/session-guard`. Test suites pass cleanly across all four packages and Wave 14.1 LRU consolidation (PRD-044 / EVID-057) is consistently applied — `auth-openfga` re-exports `LruTtlMap` from `@gertsai/utils/lru` (`internal/lru-ttl-map.ts:14`); `rest-request-manager`'s `CircuitBreaker` uses `LruMap` directly (`circuit-breaker.ts:11,46,54`). ADR-009 invariants I-8 (HTTP→AppError), I-9 (REDACTION_KEYS), Amendment 1.2.1 (`maxHosts: 1000`), Amendment 1.2.8 (AbortError→TimeoutError) all verified live in code + tests.

Three classes of findings surface: (1) **multi-tenant scoping holes in auth-openfga** — only `checkPermission` exposes a `CheckPermissionOptions.client` escape hatch (`queries/index.ts:81-84`); seven sibling functions (`batchCheckPermissions`, `listAccessibleResources`, `listUsersWithAccess`, `expandPermission`, `explainAccess`, and all mutation entry points in `mutations/index.ts`) hard-call `getFgaClient()` with no scope/client argument, silently falling through to the `__default__` singleton — breaks the ADR-012 isolation guarantee for any consumer that owns more than one OpenFGA store. (2) **doc-vs-code contract drift in session-guard** — the published README + CHANGELOG advertise that `isImpersonating` throws `DataAccessUuidMissingError` on empty UUIDs per ADR-007 I-19, but `guards.ts:64-79` returns `false` (Wave 12.D-fix per PRD-036 FR-018 changed the impl to fail-closed predicate but did NOT update the README/CHANGELOG). This is the worst kind of audit-trail miss — consumers who follow the documentation will branch on `try/catch` that never fires and silently log "not impersonating" for the corrupt-UUID case the doc explicitly flags as "the worst possible defaulting behaviour". (3) **circuit-breaker single-probe semantic missing** — `CircuitBreaker.preflight` transitions open→half-open in-place (`circuit-breaker.ts:62-77`); two concurrent calls arriving after `resetTimeoutMs` will both flip state and both pass, defeating the textbook half-open "single probe" hysteresis ADR-009 references but does not codify.

Verdict: **weakens** at the per-package level (no CRIT auth bypasses found; HIGHs concentrated in operational ergonomics + doc drift). Wave 24 fix sequence prioritises (a) session-guard README/CHANGELOG sync (1 file, no code change, prevents production audit miss), (b) auth-openfga mutation+list scoping (mechanical addition of `opts?: CheckPermissionOptions` parameter to the seven affected functions), (c) circuit-breaker probe-singleton via in-flight Set, (d) queue standalone graceful-shutdown / timeout.

## Structured Fields

- verdict: weakens
- congruence_level: CL3
- evidence_type: internal_audit
- linked_artifact: PRD-060
- summary: 4 mid-tier packages audit — 0 CRIT, 4 HIGH, 6 MED, 5 LOW; multi-tenant scoping holes + doc-vs-code drift surface as the dominant pattern.

## Coverage Stats

| Package | LOC | Tests | Findings (C/H/M/L) |
|---|---|---|---|
| `@gertsai/auth-openfga` | ~7,097 | 145 | 0 / 2 / 2 / 1 |
| `@gertsai/rest-request-manager` | ~1,224 | 28 | 0 / 1 / 2 / 2 |
| `@gertsai/queue` | ~473 | 7 | 0 / 0 / 1 / 1 |
| `@gertsai/session-guard` | ~1,065 | 62 | 0 / 1 / 1 / 1 |
| **Totals** | **~9,859** | **242** | **0 / 4 / 6 / 5** |

(Note: PRD-060 stated ~4.2k LOC; actual `find … -name '*.ts' | wc -l` totals ~9.9k including tests. Production source-only LOC is ~5.0k after deducting `__tests__/*` files. The discrepancy does not change the audit conclusions.)

## CRITICAL findings

None. Test suites pass, ReBAC contract translation (`client.ts:382-538`) correctly handles all four expand-tree node types (`leaf`/`union`/`intersection`/`difference` per `client.ts:574-639`), the SHA-256 fingerprint (`util/fingerprint.ts:59-87`) hashes `apiToken` and `oauth2.clientSecret` rather than storing plaintext, and all four HTTP-status translations preserve typed AppError taxonomy (`translation.ts:33-65`).

## HIGH findings

### auth-openfga

#### H-1 — Multi-tenant scoping bypassed in 7 of 8 query/mutation entry points
**Files:**
- `packages/auth-openfga/src/queries/index.ts:255` (`batchCheckPermissions`)
- `packages/auth-openfga/src/queries/index.ts:277` (`listAccessibleResources`)
- `packages/auth-openfga/src/queries/index.ts:337` (`listUsersWithAccess`)
- `packages/auth-openfga/src/queries/index.ts:428` (`expandPermission`)
- `packages/auth-openfga/src/queries/index.ts:453` (`explainAccess`)
- `packages/auth-openfga/src/mutations/index.ts:31` (`writeTuples`)
- `packages/auth-openfga/src/mutations/index.ts:39` (`deleteTuples`)
- `packages/auth-openfga/src/mutations/index.ts:50` (`writeTransaction`)
- All 13 downstream mutation helpers (`onUserCreated`, `onMembershipAdded`, etc.) inherit the same bypass via the three low-level functions above.

**Symptom.** `checkPermission` accepts `opts?: CheckPermissionOptions { client?, cacheScope? }` (queries/index.ts:81-84) — the documented escape hatch per ADR-012 + RFC-004 Edge 1.4 for multi-tenant consumers. Its seven siblings do not: `const client = getFgaClient()` is unconditional. In a multi-store SaaS deployment (the exact use case ADR-012 was designed for), a tenant A that calls `listAccessibleResources('alice', 'viewer', 'project')` will hit tenant B's store if B's fingerprint was the most recently used in the default slot. The cache is sized 1,000 entries with 5-minute sliding TTL — fingerprint collisions are mathematically negligible, but the missing scoping means there is no isolation at all on the call path: every call resolves to the *cached* client for the empty-config fingerprint (`DEFAULT_FINGERPRINT = '__default__'`), which may belong to any tenant that last invoked `getFgaClient()` with no args.

**Why HIGH, not CRIT.** The bypass only triggers when consumers (a) operate in genuinely multi-tenant deployments and (b) call any function other than `checkPermission`. Single-store deployments behave correctly. The README of the package does not document `checkPermission` as the only scoped entry — readers will naturally assume the rest of the API surface follows the same contract.

**Fix.** Add `opts?: CheckPermissionOptions` parameter to all 7 query/mutation functions; thread `opts?.client ?? getFgaClient()` (mirror queries/index.ts:120). Mechanical change, ~30 lines diff, no test changes required (existing tests pass the no-arg form which becomes the new fall-through). PRD-060 fix sequence #2.

#### H-2 — `InMemoryDenyLedger.entries` is unbounded `Map` (CWE-770 escaped Wave 14.1 sweep)
**Files:**
- `packages/auth-openfga/src/deny/index.ts:83` — `private entries: Map<string, DenyEntry> = new Map();`
- `packages/auth-openfga/src/deny/index.ts:412` — `denyLedger = new InMemoryDenyLedger();` (default registered via `getDenyLedger()`).

**Symptom.** Class is marked `@deprecated` (line 80) but `getDenyLedger()` instantiates it on first access if no provider has been registered. In long-lived processes that exercise the deny ledger before switching to Redis (or test setups that never switch), the map grows unbounded. Wave 14.1 (PRD-044) migrated `auth-openfga.cache` and `auth-openfga.client` to `LruTtlMap`; the deny ledger was not part of that sweep.

**Fix.** (a) Replace `Map<string, DenyEntry>` with `LruTtlMap<string, DenyEntry>` via `@gertsai/utils/lru` (the kernel auth-openfga already uses); (b) make `getDenyLedger()` throw `Error('deny ledger not configured')` rather than silently install the deprecated in-memory backing — the `@deprecated` tag is invisible at runtime, callers find out the hard way. PRD-060 fix sequence #5.

### rest-request-manager

#### H-3 — `CircuitBreaker.preflight` half-open is not single-probe; concurrent callers all pass through
**File:** `packages/rest-request-manager/src/circuit-breaker.ts:62-77`

**Symptom.** When the breaker is `open` and `Date.now() - openedAtMs >= resetTimeoutMs`, `preflight` mutates `state.state = 'half-open'` and returns. Nothing tracks "a probe is in flight". Two requests racing across the timeout boundary both call `preflight` on the same tick, both observe `'open'` with elapsed exceeding the threshold, both transition to `half-open`, both pass. The textbook half-open semantic — admit exactly one probe, hold the rest — is not implemented. The companion test (`circuit-breaker.test.ts:23-33`) is sequential and does not exercise the concurrency.

**Why HIGH.** Under traffic, when an upstream recovers but is not yet ready for full load, the breaker leaks N probes (where N = concurrency at the moment of timeout expiry). N can be the manager's full retry-bound concurrency in the worst case. The breaker is then either (a) hammered into a re-open if the upstream stalls again or (b) reports false confidence by closing on the first success. ADR-009 references hysteresis but does not codify probe-singleton.

**Fix.** Track an in-flight probe set per host: `state.probeInFlight: boolean`. `preflight` sets it on open→half-open transition; subsequent half-open callers throw `UpstreamFailureError` until `recordSuccess`/`recordFailure` clears the flag. The flag must be reset on the success+close transition so the next round can probe again. ~15 lines, fully covered by a new concurrency test. PRD-060 fix sequence #3.

### session-guard

#### H-4 — `isImpersonating` documented to throw but actually returns `false` (audit-trail miss)
**Files:**
- `packages/session-guard/src/guards.ts:64-79` — returns `false` on empty UUIDs.
- `packages/session-guard/README.md:87` — table claims `Throws: DataAccessUuidMissingError (per ADR-007 I-19)`.
- `packages/session-guard/README.md:152-157` — Security section explicitly warns "Audit logs that gate on a `false` return from a naive equality check would otherwise miss the case where both UUIDs are blank — the worst possible defaulting behaviour for an audit trail."
- `packages/session-guard/CHANGELOG.md:59,62,98` — three published entries claim throwing behaviour.
- `packages/session-guard/dist/index.d.ts:22` — generated typedoc still references "Per ADR-007 I-19 + Amendment 1.1.2".

**Symptom.** Wave 12.D-fix per PRD-036 FR-018 (EVID-051 L-2) changed the implementation to fail-closed predicate ("returns false on empty UUIDs (PRD-036 FR-018 — fail-closed predicate)" — verified by `guards.test.ts:105-108`). The README + CHANGELOG were NOT updated. Consumers reading the published documentation will write `try { isImpersonating(s) } catch (e) { audit.log(...) }` — the catch never fires, the audit log misses the corrupt-UUID case the README explicitly warns about.

**Why HIGH (could argue CRIT).** This is a documented audit-trail violation. Mitigation: callers who pass a defined session with both UUIDs set behave correctly, and the throwing companion `assertImpersonating` (assertions.ts:129-149) does exist and does throw. The HIGH classification reflects that the fix is a doc update (no code change), not a discovered exploit, while the bug surface is exactly the "audit miss" scenario the README warns against.

**Fix.** Either (a) update README/CHANGELOG/dist typedoc to match impl (fail-closed predicate, point readers at `assertImpersonating` for throwing variant), or (b) restore throwing behaviour and revert PRD-036 FR-018. Decision belongs to the architect — both are defensible; doc-update is the lower-cost path and matches Wave 12.D's intent. PRD-060 fix sequence #1 (highest priority — pure doc change, zero risk).

## MEDIUM findings

### MED-1 (auth-openfga) — `withRetry` recycles `delay` cursor across calls is N/A; but each new call starts at `initialDelay`, so distributed-system thundering herd risk on cold start
**File:** `packages/auth-openfga/src/client.ts:778-806`

`withRetry` starts every call at `initialDelay` and doubles up to `maxDelay`. No jitter is applied — ADR-009 Amendment 1.2.7 specifies "full" jitter for `@gertsai/async-utils.retry` (CWE-409 thundering-herd protection); the OpenFGA client retry is bespoke and does not borrow that pattern. After a network blip recovers, every in-flight retry across a fleet of N service replicas fires at near-identical wall-clock offsets. MEDIUM because the OpenFGA SDK's own retry layer may absorb some of this, and the failure mode is operational not security.

**Fix.** Migrate `client.withRetry` to call `@gertsai/async-utils.retry` directly (the package is now Tier 1 and available without a peer-dep gate). PRD-060 fix sequence #6.

### MED-2 (auth-openfga) — `checkPermission` cache bypass for ABAC contexts is correct but cache miss is permanent
**File:** `packages/auth-openfga/src/queries/index.ts:109-114, 124-126`

The `if (!request.context)` guards skip cache read AND skip cache write for ABAC requests (correct — ABAC outcomes are time/context-dependent). However, ABAC requests still walk through the deny-ledger check (lines 86-98) and the full FGA roundtrip. For high-volume ABAC paths, this is the bottleneck. MEDIUM because correctness > performance here.

**Fix.** Document the design; consider a separate short-TTL ABAC cache keyed by `(userId, relation, resourceType, resourceId, contextHash)` in a future PRD. PRD-060 fix sequence #9 (optional).

### MED-3 (rest-request-manager) — `RestRequestManager.resetStats()` accidentally clears circuit-breaker host state
**File:** `packages/rest-request-manager/src/manager.ts:208-213`

`resetStats()` calls `this.breaker.reset()` which clears the entire host LRU + `opensCount` + `evictionsCount` (`circuit-breaker.ts:124-128`). The method is named `resetStats` not `resetBreakerState`; the docstring is missing. A consumer calling `mgr.resetStats()` from a metrics-snapshot path will silently drop all per-host failure history, re-arming hosts that should still be in `open`. Surprising semantic — the breaker is observable state, not a counter.

**Fix.** Either split `resetStats()` into `resetCounters()` (no breaker side-effect) and `resetBreakerState()`, or document the current behaviour as intentional. PRD-060 fix sequence #7.

### MED-4 (rest-request-manager) — Rate-limit token consumed before circuit short-circuit check
**File:** `packages/rest-request-manager/src/manager.ts:65-76`

Order is: (a) `rateLimiter.acquire()` consumes a token, (b) `breaker.preflight()` short-circuits if open. A request that will trip the circuit breaker still pays a rate-limit token. Under sustained upstream failure, this throttles the consumer's ability to recover even though no actual upstream call is made. MEDIUM because the token cost is non-fatal but counterintuitive.

**Fix.** Swap the order: preflight first, then acquire. Refund pattern is harder (token-bucket has no refund primitive). PRD-060 fix sequence #4.

### MED-5 (queue) — Standalone runner has no signal handler, no shutdown timeout, no per-worker error capture
**File:** `packages/queue/src/standalone.ts:44-57`

`startStandalone` returns `{ shutdown }` only. There is no SIGINT/SIGTERM handler — operators must wire one themselves; the README does not show the pattern. `shutdown()` calls `Promise.all(workers.map(w => w.close()))` with no timeout — a hung BullMQ Worker (lock held, processor frozen) holds the process forever. No `worker.on('error', ...)` registration — unhandled emit('error') with no listener crashes the process under Node ≥15. MEDIUM because consumers in production typically wire their own runner; the primitive doesn't enforce safety.

**Fix.** (a) Optional `signal: AbortSignal` field on `StartStandaloneOpts` that triggers `shutdown()` when aborted; (b) optional `shutdownTimeoutMs` (default 30s) with `w.close(true)` force-close fallback; (c) register a default `worker.on('error', logger.error)` listener; (d) expose `worker.on('failed', ...)` and `worker.on('completed', ...)` proxy in the `StandaloneHandle`. PRD-060 fix sequence #8.

### MED-6 (session-guard) — `assertImpersonating` throws bare `Error` on UUIDs-equal case, not an AppError subclass
**File:** `packages/session-guard/src/assertions.ts:144-147`

```ts
if (operatorUuid === dataAccessUuid) {
  throw new Error(
    'Session is not impersonating: operatorUuid === dataAccessUuid',
  );
}
```

Every other error in this file is an `AppError` subclass. The bare `Error` here breaks `errorToHttpResponse` / `errorToGrpcStatus` mappers (they fall through to generic 500). The condition is also semantically odd — "not impersonating" is a valid state for most sessions, not an error condition. Two callers checking this assertion would get conflicting error taxonomies.

**Fix.** Either (a) introduce `NotImpersonatingError extends ConflictError<{...}>`, or (b) split `assertImpersonating` into `assertImpersonationAvailable` (asserts UUIDs are present) + a separate `assertActiveImpersonation` (asserts they differ). Option (b) is the cleaner refactor. PRD-060 fix sequence #10.

## LOW findings

### LOW-1 (auth-openfga) — `cache/index.ts:171` eviction-count race
`stats.evictions` increment uses `sizeBefore >= maxSize && !wasPresent` heuristic. If two concurrent `set` calls both observe `sizeBefore === maxSize` and both insert non-existing keys, they BOTH increment `evictions`, but `LruTtlMap` only evicted one entry. Stat over-counts under microscopic write contention. Single-threaded JS means this is effectively impossible inside one event-loop tick, but worker-thread scenarios could surface it.

### LOW-2 (auth-openfga) — `convertExpandTree` returns empty `leaf` for unknown node shapes (`client.ts:638`)
Defensive default suppresses upstream OpenFGA protocol additions; a new node kind (e.g. `tuple_to_userset` is not handled — see line 575-639 which only handles 5 of the 6 OpenFGA expand kinds). The `explainAccess` path silently misses inherited-from-tuple-to-userset relations. LOW because the path's `reason: 'inherited'` fallback partially compensates, but a debug surface for "unknown tree node" would help.

### LOW-3 (rest-request-manager) — `walkCauseChain` depth=5 silent truncation
`manager.ts:286-303` walks `Error.cause` chain up to 5 levels then stops. For deeply-nested errors (some HTTP libraries wrap 3-4 deep), the root may be truncated. Bumping to 10 would be cheap; or emit `[depth-truncated]` marker rather than silent stop.

### LOW-4 (rest-request-manager) — `parseBody` swallows JSON parse error to `undefined` (`manager.ts:236-249`)
A malformed JSON response returns `body: undefined` rather than throwing — this masks upstream protocol bugs. ADR-009 I-8 says non-ok status → typed AppError but does not specify "malformed-but-ok JSON" handling. LOW because the parse failure is logged via the success-path debug line.

### LOW-5 (queue) — `Job` and `Worker` interface fields `__dataType` / `__returnType` are exposed as `readonly` `optional` typeparams (`index.ts:120-121`)
Phantom-type carriers leak into the public `.d.ts`. Pattern is correct (no other way to keep generic in structural mirrors) but the underscore-prefix doesn't ergonomically signal "do not access". Cosmetic.

## Cross-package observations

### Error taxonomy
**All four packages consistently extend `@gertsai/errors`** for typed taxonomy:
- `auth-openfga` — throws generic `Error` from `withRetry` and SDK pass-through. Inconsistent — most other gertsai packages translate at the boundary. (Cross-package MED.)
- `rest-request-manager` — clean translation layer (`translation.ts`); HTTP→AppError verified by `manager.test.ts:133-148, 151-164`. **Reference implementation.**
- `queue` — `QueuePeerDepMissingError extends Error` (`index.ts:140-147`) rather than `AppError`. Pragmatic (this package is consumed BY api-core, lives below the error taxonomy in the dep graph). Acceptable.
- `session-guard` — clean AppError subclass hierarchy (`errors.ts`). Single exception: `assertImpersonating` bare-`Error` (MED-6).

### LRU consolidation post Wave 14.1
**Consistent.** Both `auth-openfga.cache` + `auth-openfga.client` and `rest-request-manager.CircuitBreaker` use `@gertsai/utils/lru`. The bespoke kernel is gone from production code. Sole exception is `auth-openfga.deny.InMemoryDenyLedger` (H-2) — slated for follow-up Wave 14.X.

### ADR-009 lazy peer-loading
**Consistent.** All four packages avoid eager-loading optional peers:
- `auth-openfga` — `@openfga/sdk` is a hard dep (single-purpose package; not optional).
- `rest-request-manager` — `@gertsai/logger-factory.Logger` shape is inlined in `types.ts:17-21` rather than imported, preserving truly-optional peer (Wave 12.C-fix-2 + Wave 13 pattern fix per EVID-048 H-4). 
- `queue` — `bullmq` + `ioredis` lazy via `require()` in `defaultLoadBullmq()` (`index.ts:167-174`) with structural interface mirrors.
- `session-guard` — type-only imports from `@gertsai/session` + `@gertsai/errors`; both are hard runtime deps but use type-only `import type`.

### Tenant-isolation discipline
Mixed. `rest-request-manager` and `session-guard` are tenant-agnostic by design. `queue` doesn't surface tenancy (BullMQ wrapper). `auth-openfga` is the only package with multi-tenant scope, and that surface has uneven coverage (H-1). Recommend a cross-package check: any package with a singleton/global must document its scoping contract and expose an escape hatch on every public function, not just one.

## Suggested Wave 24 fix sequence

| # | Finding | Effort | Priority | Risk |
|---|---|---|---|---|
| 1 | H-4 — session-guard README/CHANGELOG sync (or revert PRD-036 FR-018) | 30 min doc / 1 h code | **CRITICAL** to ship first — audit-miss in production | Zero (doc) / Low (code revert) |
| 2 | H-1 — auth-openfga add `opts?: CheckPermissionOptions` to 7 functions | 2 h | HIGH | Low (additive parameter) |
| 3 | H-3 — circuit-breaker single-probe enforcement | 1 h + 1 h tests | HIGH | Medium (state machine change) |
| 4 | MED-4 — manager.ts swap rate-limit + preflight order | 15 min | MED | Low |
| 5 | H-2 — replace `InMemoryDenyLedger.entries` with `LruTtlMap`; throw from `getDenyLedger()` default | 2 h | MED (breaks back-compat for the deprecated path) | Medium |
| 6 | MED-1 — migrate `auth-openfga.client.withRetry` to `@gertsai/async-utils.retry` | 2 h | MED | Low (well-tested helper) |
| 7 | MED-3 — split `resetStats` / `resetBreakerState` in manager.ts | 30 min | MED | Low (additive method) |
| 8 | MED-5 — queue standalone graceful-shutdown timeout + signal + worker error wiring | 2 h | MED | Low |
| 9 | LOW + MED-2 + MED-6 — opportunistic polish | 1 day | LOW | Low |

Total Wave 24 budget estimate: **2 working days** (8 fixes + tests). Suggest a single PR per fix to keep blast radius bounded; H-4 ships first as it requires only a doc change and prevents a documented audit miss.

## Methodology

- **Branch verification.** `git branch --show-current` confirms `audit/wave-23-mid-tier-pkgs`. Working tree clean apart from `.forgeplan/{prds,state}/PRD-060.yaml` (PRD-060 created upstream).
- **Source-only audit.** No modifications to any `packages/*` file. All findings cite `file:line` from the working tree.
- **Test verification.** Ran `pnpm --filter <pkg> test` for each of the four packages in parallel: 145 + 28 + 7 + 62 = 242 tests pass, 0 fail.
- **Doc-vs-impl cross-check.** Each public API in each package's `index.ts` walked through README + CHANGELOG cross-reference; H-4 surfaced this way.
- **Cross-package LRU consolidation check.** Verified Wave 14.1 (PRD-044) post-migration state by reading `@gertsai/utils/lru` import sites in each package; H-2 surfaced as the one remaining `Map<>` instance.
- **ADR-009 invariant matrix.** Hand-walked I-8 (HTTP→AppError), I-9 (REDACTION_KEYS), Amendment 1.2.1 (`maxHosts`), Amendment 1.2.7 (jitter — MED-1), Amendment 1.2.8 (AbortError→TimeoutError) against `rest-request-manager` impl + tests.
- **ADR-012 multi-instance fingerprint check.** Read `fingerprint.ts:59-87` for SHA-256 canonical-JSON correctness; verified `apiToken` + `oauth2.clientSecret` participate. Cross-checked against `client.multi-instance.test.ts` + `client.oauth2.test.ts` + `fingerprint.fitness.test.ts`.

## Refs

- **PRD-060** — Wave 23 deep audit dispatch (this evidence informs).
- **EVID-051** — Wave-12 audit precedent + PRD-036 FR-018 reference (referenced from session-guard `isImpersonating` comment).
- **EVID-057** — PRD-044 Wave 14.1 LRU consolidation (verified post-migration state).
- **EVID-059** — audit precedent pattern (referenced by PRD-060).
- **EVID-074, EVID-076** — earlier-Wave audit precedents (PRD-060 context).
- **ADR-009** — async-utils + rest-request-manager invariants (I-8, I-9, Amendment 1.2.1, 1.2.7, 1.2.8).
- **ADR-012** — auth-openfga multi-instance fingerprint scoping.
- **ADR-007** — session-guard invariants I-13, I-18, I-19; Amendment 1.1.2 (identity-vs-scoping split).
- **PRD-036** — Wave 12.D fix (changed `isImpersonating` semantic; doc sync deferred).
- **CWE-770** — unbounded resource consumption (H-2).
- **CWE-1188** — insecure default initialisation (referenced by `isImpersonating` fail-closed comment).


