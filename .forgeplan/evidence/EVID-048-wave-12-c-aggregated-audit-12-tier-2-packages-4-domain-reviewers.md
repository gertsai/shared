---
depth: standard
id: EVID-048
kind: evidence
last_modified_at: 2026-05-16T19:32:21.894688+00:00
last_modified_by: claude-code/2.1.142
links:
- target: PRD-032
  relation: informs
status: active
title: Wave 12.C aggregated audit — 12 Tier-2 packages × 4 domain reviewers
---

# EVID-048 — Wave 12.C aggregated audit findings

Multi-expert audit of 12 Tier-2 packages (`@gertsai/*`), 4 parallel domain reviewers (logic, architecture, type-system, security) per RFC-023.

## Structured Fields

- **verdict:** `weakens` — 1 CRITICAL surface in **published** `@gertsai/entity` (peer-cycle with `@gertsai/entity-vue` via the `/vue` shim subpath, ADR-008 Decision B sunset). Plus 10 unique HIGH findings spanning data-integrity (flux pipe race, DI cleanup miss), security (entity `$patch` `__proto__` prototype pollution), type-leaks (queue bullmq, rest-request-manager Logger), and consistency (plainReactiveAdapter brand pattern divergence). Most consequential single item: **entity `$patch` CWE-1321 prototype pollution** (security HIGH) — entity is the canonical hydration target across `@gertsai/*`, so any consumer accepting untrusted JSON has an indirect attack vector.
- **congruence_level:** `CL3` — same target system, internal review by 4 specialised agents reading source + emitted artefacts. Penalty 0.0.
- **evidence_type:** `internal_audit`.
- **R_eff per-finding:** `0.5 − 0.0 = 0.5`. At threshold (verdict=weakens).
- **Wallclock:** 4 parallel agents, ~3-10 min each, total wallclock ~10 min.

## Executive Summary

| Severity | Logic | Arch | Type | Sec | **Raw** | **After collapse** |
|---|---:|---:|---:|---:|---:|---:|
| CRITICAL | 0 | 1 | 0 | 0 | 1 | **1** |
| HIGH | 5 | 4 | 1 | 1 | 11 | **~10** (2 collapsed) |
| MEDIUM | 14 | 5 | 4 | 4 | 27 | ~24 |
| LOW | 9 | 4 | 5 | 4 | 22 | ~20 |

**Bottom line:** Tier-2 substrate has 1 architectural CRITICAL (sunset-track peer cycle per ADR-008) + 10 unique HIGH findings. Type-system audit confirmed **no Wave-13-pattern external-type-leak recurrence** in any of the 12 packages — past Wave 12.B-fix-1 lessons applied. flux (8456 LOC) sampled 11-73% across reviewers; sampled subset adequate, no Wave 12.C2 recommended.

## CRITICAL findings (full text)

### CRIT-1 — `@gertsai/entity` ↔ `@gertsai/entity-vue` peer cycle

**Domain:** Architecture
**Files:** `packages/entity/src/vue.ts:14` re-exports `vueReactiveAdapter` from `@gertsai/entity-vue`; `packages/entity/package.json:62` declares `@gertsai/entity-vue` as peer-optional. **Reverse direction:** `packages/entity-vue/package.json` peer-depends on `@gertsai/entity`.

**Issue:** structural peer-cycle. Both ends declare peer-optional, so pnpm resolves it, but the dep graph contains a cycle AND `entity/dist/vue.d.ts` re-emits a name owned by the cyclic peer. ADR-008 Decision B + I-3 explicitly acknowledges this as a **temporary v1.0 removal-track shim**.

**Remediation (Wave 12.C-fix-1 sub-wave):**
- **Option A (recommended):** drop `@gertsai/entity/vue` subpath at v2.0 per ADR-008 Decision B sunset. Consumers migrate to `@gertsai/entity-vue` directly.
- **Option B (interim):** inline a thin local copy of `vueReactiveAdapter` in entity so the peer on `@gertsai/entity-vue` can be removed, breaking the cycle without an immediate API break.

## HIGH findings (consolidated, 10 unique)

### H-1 — `@gertsai/entity` `$patch` / `$setMetadata` `__proto__` prototype pollution (CWE-1321)

**Domain:** Security
**Files:** `packages/entity/src/Entity.ts:103,113`; `packages/entity/src/EntityWithMetadata.ts:115,125`.

JSON-derived partial with key `__proto__` mutates `_data`'s prototype chain. Entity is the canonical hydration target for backend payloads → indirect attack vector.

**Fix pattern:**
```ts
if (key === '__proto__' || key === 'constructor' || key === 'prototype') continue;
```
And replace `Object.assign(_data, partial)` with key-filtered loop.

### H-2 — `@gertsai/entity` plain adapter brand uses shared `Symbol.for` + writable `defineProperty`

**Domains:** Type + Security (collapsed)
**Files:** `packages/entity/src/adapters/plain.ts:11,19`.

`Symbol.for('@gertsai/entity:raw')` is in global registry — any code can forge/clear the brand. Plus the marker is set via `[]=` (writable/configurable) vs framework adapters' `Object.defineProperty(..., { configurable: false, writable: false })`. Default adapter is the most-used path → weakest brand is most exposed.

**Fix:** mirror entity-react/svelte/solid pattern — module-private `Symbol(...)` + locked `defineProperty`.

### H-3 — `@gertsai/queue` bullmq type leak in published `.d.ts`

**Domain:** Architecture
**File:** `packages/queue/dist/index.d.ts:1`.

`import { QueueOptions, Queue, Job, Worker } from 'bullmq'` + re-exports 4 bullmq types. Wave-13-pattern recurrence variant — bullmq is peer-OPTIONAL but consumers must install it for types to resolve regardless.

**Fix:** inline minimal local copies of `Queue<T>`/`Worker<T,R>`/`Job<T>`/`ConnectionOptions` shapes, OR drop the `optional: true` flag on the bullmq peer.

### H-4 — `@gertsai/rest-request-manager` Logger type leak from peer-optional `logger-factory`

**Domain:** Architecture
**Files:** `packages/rest-request-manager/dist/index.d.ts:1-4`; `package.json` peerDependenciesMeta.

`RestRequestManagerOpts.logger?: Logger` references `Logger` from `@gertsai/logger-factory` which is marked optional. Consumers who omit the optional peer cannot satisfy the type.

**Fix:** either (a) drop `optional: true` (pin as hard peer) or (b) inline minimal `Logger` shape locally.

### H-5 — `@gertsai/entity` Node `events` import in published `.d.ts`

**Domain:** Architecture
**File:** `packages/entity/dist/index.d.ts:1-3`.

`import EventEmitter from 'events'` in published types — consumers need `@types/node` to typecheck despite `entity` having no `engines.node` declaration.

**Fix:** declare `engines.node: ">=22"` OR mirror `IEventEmitter` pattern from `flux/types.ts:198` and remove Node EventEmitter from public surface.

### H-6 — `@gertsai/storage-core` capabilities shape mismatch vs CLAUDE.md doc

**Domain:** Architecture
**File:** `packages/storage-core/src/types.ts:226`.

`upsert: { supported: boolean; preservesCreatorAudit: boolean }` (boolean-pair shape) while CLAUDE.md Wave 7.2 entry claims tri-state `'native' | 'emulated' | false`. Documentation drift, not code bug.

**Fix:** update CLAUDE.md tier-table line for storage-core Wave 7.2 to reflect actual shape, OR align source to documented tri-state.

### H-7 — `@gertsai/flux` `pipe()` overwrites prior pipeline + leaks listeners

**Domain:** Logic
**Files:** `packages/flux/src/stream/DataStream.ts:378,406-414`.

Every `pipe()` reassigns single `_processItem` slot AND attaches two persistent `on('end')`/`on('error')` listeners. Calling `pipe()` twice silently discards first transformer; orphaned listeners persist.

**Fix:** store pipes as array (true fan-out) OR throw on second pipe; save listener refs for `destroy()` cleanup.

### H-8 — `@gertsai/flux` once-listener removal by function-only identity

**Domain:** Logic
**File:** `packages/flux/src/events/FluxilisEventEmitter.ts:444-446`.

After once-listener fires, removal uses `findIndex` by listener function only — duplicate registrations (mixing `on(x, fn)` and `once(x, fn)`) cause wrong subscription to be removed.

**Fix:** track once-listeners by `ListenerInfo` reference, splice by identity not function match.

### H-9 — `@gertsai/di` memory leak via event-name mismatch + premature `removeAllListeners`

**Domain:** Logic
**Files:** `packages/di/src/manager.ts:202-206,203` vs `packages/entity/src/Model.ts:46`.

DI subscribes to `'destroy'`; entity emits `'destroyed'` then `removeAllListeners()`. ServiceDirectory's `$destroy()` never fires for entity-derived consumers → services with timers/connections leak.

**Fix:** standardise event name across packages (recommend `'destroyed'`); fix DI side.

### H-10 — `@gertsai/rest-request-manager` rate-limiter token float drift

**Domain:** Logic
**File:** `packages/rest-request-manager/src/rate-limiter.ts:30-49`.

`refilled = elapsedSeconds * tokensPerSecond` produces float; over time `tokens` accumulates fractional bits like `0.9999999` → spurious `RateLimitedError` when caller expects 1.0 available. Inversely two near-simultaneous can both pass with fractional surplus → burst > capacity.

**Fix:** integer bucket model with `Math.floor` OR epsilon-aware comparison.

### H-11 — `@gertsai/queue` `createWorker` passes undefined password/db unconditionally

**Domain:** Logic
**File:** `packages/queue/src/index.ts:121-126`.

`createWorker` sets `password: undefined, db: undefined` always. `createQueue` correctly uses conditional spread. BullMQ + ioredis may interpret `password: undefined` differently from absent — Redis with AUTH enabled can throw.

**Fix:** mirror `createQueue`'s conditional-spread pattern.

## Per-package summary cards (12)

### @gertsai/flux — 8456 LOC (sampled)
- Logic: 2 HIGH + 5 MED + 2 LOW · Arch: 1 MED + 3 LOW · Type: 1 MED + 1 LOW · Sec: 2 LOW
- **Top:** H-7 pipe overwrite + leak; H-8 once-listener identity bug; ComponentFactory duck-typing.
- **flux sampling:** logic 33%, security 11%, type ~17%, arch ~17% — adequate, no Wave 12.C2 recommended.

### @gertsai/di — 1270 LOC
- Logic: 1 HIGH + 4 MED + 1 LOW · Arch: 1 MED + 1 LOW · Type: 2 MED + 1 LOW · Sec: 1 MED + 1 LOW
- **Top:** H-9 event-name mismatch + memory leak; pervasive `any` in factory signatures; silent service re-registration.

### @gertsai/query-dsl — 969 LOC
- Logic: 2 MED + 1 LOW · Arch: 1 MED · Type: 0 (cleanest in audit!) · Sec: 1 MED + 1 LOW
- **Top:** unbounded array-op size (CWE-770) — SQL builder lacks `MAX_ARRAY_OP_LENGTH` cap.

### @gertsai/storage-core — 821 LOC
- Logic: 2 LOW · Arch: 1 HIGH + 1 LOW · Type: 2 LOW · Sec: 0
- **Top:** H-6 capabilities shape doc drift.

### @gertsai/rest-request-manager — 721 LOC
- Logic: 1 HIGH + 4 MED + 1 LOW · Arch: 1 HIGH + 1 MED · Type: 1 MED · Sec: 2 MED + 1 LOW
- **Top:** H-4 Logger optional-peer leak; H-10 rate-limiter float drift; parseBody silent swallow; circuit-breaker LRU eviction attack.

### @gertsai/entity — 581 LOC
- Logic: 2 MED + 1 LOW · Arch: **1 CRITICAL** + 1 HIGH + 1 MED · Type: 1 HIGH · Sec: 1 HIGH + 1 MED
- **Top:** CRIT-1 entity↔entity-vue peer cycle; H-1 `__proto__` pollution; H-2 plain adapter brand; H-5 Node events leak.
- **Highest density Tier-2 package.**

### @gertsai/entity-svelte — 254 LOC
- Logic: 1 HIGH (collapsed with H-2) + 2 MED · Arch: 1 LOW · Type: 2 LOW · Sec: 0
- **Top:** Cross-framework markRaw divergence with plain adapter (shared symbol vs module-private); proxy-not-cached.

### @gertsai/entity-react — 226 LOC
- Logic: 1 MED + 1 LOW · Arch: 1 MED · Type: 1 LOW · Sec: 0
- **Top:** subscribers Set never cleaned when empty; cross-adapter parity asymmetry documented per ADR-008.

### @gertsai/entity-solid — 211 LOC
- Logic: 2 MED + 1 LOW · Arch: 0 · Type: 0 · Sec: 0
- **Top:** Proxy not cached per target (each `reactive(t)` makes new proxy).

### @gertsai/queue — 191 LOC
- Logic: 1 HIGH + 1 LOW · Arch: 1 HIGH + 1 LOW · Type: 1 LOW · Sec: 1 MED + 1 LOW
- **Top:** H-3 bullmq type leak; H-11 createWorker undefined password; `require` instead of `createRequire`; tenant `name` validation.

### @gertsai/audit-primitives — 100 LOC
- Logic: 1 MED + 1 LOW · Arch: 1 MED · Type: 1 LOW · Sec: 0
- **Top:** Negative-epoch nanoseconds normalisation; tier-table reclassification needed (Tier-2 → Tier-1, EVID-044 obs #10).

### @gertsai/entity-vue — 65 LOC
- Logic: 0 · Arch: 1 MED · Type: 0 · Sec: 0
- **Top:** Cross-adapter parity comment missing (intentional divergence per ADR-008 Decision B but not documented in-source).

## Cross-validation matrix

| Package | Logic | Arch | Type | Sec |
|---|---|---|---|---|
| flux | ◆+◆+5M·2L | 1M·3L | 1M·1L | 2L |
| di | ◆+4M·1L | 1M·1L | 2M·1L | 1M·1L |
| query-dsl | 2M·1L | 1M | — | 1M·1L |
| storage-core | 2L | ◆+1L | 2L | — |
| rest-request-manager | ◆+4M·1L | ◆+1M | 1M | 2M·1L |
| entity | 2M·1L | **●**+◆+1M | ◆ | ◆+1M |
| entity-svelte | (◆)+2M | 1L | 2L | — |
| entity-react | 1M·1L | 1M | 1L | — |
| entity-solid | 2M·1L | — | — | — |
| queue | ◆+1L | ◆+1L | 1L | 1M·1L |
| audit-primitives | 1M·1L | 1M | 1L | — |
| entity-vue | — | 1M | — | — |

## Cross-package observations

1. **plainReactiveAdapter is the brand-pattern outlier** — `entity-{react,solid,svelte}` use module-private `Symbol(...)` + locked `defineProperty(configurable:false, writable:false)` per ADR-008 I-11. plain adapter uses `Symbol.for(...)` (shared registry) + plain bracket-assign (writable). The default adapter is the most-used; the weakest brand is most exposed. Fix should bring `plainReactiveAdapter` in line with framework adapters.
2. **`removeAllListeners()` after emit + event-name mismatch** = recurring DI cleanup gap. Recommend project-wide convention: emit final destruction event, defer `removeAllListeners()` via `setImmediate` so cleanup observers can run synchronously.
3. **External type-leak parity check** — only 2 packages still leak: `@gertsai/queue` (bullmq) and `@gertsai/rest-request-manager` (Logger from peer-optional). Other 10 packages clean — Wave 12.B-fix-1 lessons applied broadly.
4. **`engines.node`** declared only on `rest-request-manager`. `di` + `entity` expose Node built-in `events` types — should declare engines or strip Node-specifics from public surface.
5. **`createRequire(import.meta.url)` ESM-CJS bridge** consistent in entity-{vue,react,solid,svelte}; **queue** still uses bare `require()` — audit P1 item.
6. **CLAUDE.md tier-table reconciliation** — `audit-primitives` (zero internal deps) and `storage-core` (Wave 7.2 capabilities shape doc) need updating. Same drift as EVID-044 obs #10.
7. **No Wave-13-pattern external-type-leak recurrence** in 12 packages — Type-system audit explicitly confirmed.
8. **Strongest Tier-2 packages**: `@gertsai/query-dsl` (cleanest type-system in audit), `@gertsai/storage-core`, `@gertsai/audit-primitives`. **Weakest**: `@gertsai/entity` (highest finding density across all domains).
9. **flux sampling adequate** — 11-73% coverage across reviewers found 2 HIGH + lots of MEDIUM. Sampled subset covered all classes with non-trivial logic. Wave 12.C2 sub-audit **NOT recommended**.

## Suggested follow-up wave structure

Per Wave 12.B precedent:

**Sub-wave 12.C-fix-1 (CRITICAL + entity HIGHs):**
- CRIT-1 entity↔entity-vue peer cycle (ADR-008 Decision B sunset path, may defer to v2.0)
- H-1 entity `$patch` `__proto__` filter
- H-2 plain adapter brand harmonisation
- H-5 entity Node events leak
- Estimated: 1 day, ~150 LOC.

**Sub-wave 12.C-fix-2 (HIGH external-type-leaks):**
- H-3 queue bullmq leak
- H-4 rest-request-manager Logger leak
- H-6 storage-core capabilities doc drift (CLAUDE.md update)
- Estimated: 0.5 day, ~80 LOC.

**Sub-wave 12.C-fix-3 (HIGH logic/correctness):**
- H-7 flux pipe overwrite + leak
- H-8 flux once-listener identity bug
- H-9 DI event-name mismatch + cleanup gap
- H-10 rest-request-manager rate-limiter float drift
- H-11 queue createWorker undefined password
- Estimated: 1 day, ~150 LOC.

**Deferred:** ~24 MEDIUM + ~20 LOW → Wave 12.C-polish or Wave 14.

## Methodology

Per RFC-023:
- 4 parallel `code-analyzer` ×3 + `security-expert` agents
- Each got ONE prompt covering all 12 packages in its domain
- flux sampled explicitly per reviewer (11-73% coverage, adequate)
- Read-only audit
- Cross-validation by orchestrator (same-file-line collapse, severity max-merge across domains)
- Wallclock ~10 min total, ~620k tokens combined across 4 reviewers

## Refs

- **PRD-032** — Wave 12.C audit plan
- **RFC-023** — execution strategy
- **EVID-044** — Wave 12.B Tier-1 audit (reference output)
- **PRD-029/030/031 + EVID-045/046/047** — Wave 12.B-fix-1/2/3 precedents
- **RFC-018** — Wave 12 super-strategy
- **ADR-008** — entity reactive adapter ISP split + I-11 module-private symbols
- **CLAUDE.md** — 12 Tier-2 packages + tier table (reconciliation needed per Obs #6)





