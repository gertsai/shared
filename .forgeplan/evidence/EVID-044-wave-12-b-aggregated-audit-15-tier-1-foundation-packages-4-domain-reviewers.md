---
depth: standard
id: EVID-044
kind: evidence
last_modified_at: 2026-05-16T04:55:28.029494+00:00
last_modified_by: claude-code/2.1.142
links:
- target: PRD-028
  relation: informs
status: active
title: Wave 12.B aggregated audit — 15 Tier-1 foundation packages × 4 domain reviewers
---

# EVID-044 — Wave 12.B aggregated audit findings

Multi-expert audit of 15 Tier-1 foundation packages (`@gertsai/*`), 4 parallel domain reviewers (logic, architecture, type-system, security) per RFC-019.

## Structured Fields

- **verdict:** `weakens` — 2 CRITICAL findings surface in **published** `@gertsai/fetch@0.2.0` and `@gertsai/m9s-cache@0.2.0` (external-type leaks in emitted `.d.ts`, Wave-13-pattern). Both ship to GitHub Packages today. The audit does NOT contradict the api-core 0.3.0 contract; it surfaces analogous flaws elsewhere in the substrate.
- **congruence_level:** `CL3` — same target system, internal review by 4 specialised agents reading current source + emitted dist artefacts. Penalty 0.0.
- **evidence_type:** `internal_audit` (multi-expert parallel review).
- **R_eff per-finding:** `min(verdict_score) − CL_penalty = 0.5 − 0.0 = 0.5`. Adequate to activate PRD-028 per ADR-006 R_eff math (threshold ≥ 0.5).
- **Wallclock:** 4 parallel agents, ~5–9 min each, total wallclock ~9 min.

## Executive Summary

| Severity | Logic | Architecture | Type | Security | **Raw total** | **After collapse** |
|---|---:|---:|---:|---:|---:|---:|
| CRITICAL | 0 | 1 | 2 | 0 | 3 | **2** (m9s-cache merged) |
| HIGH | 6 | 6 | 7 | 3 | 22 | **~18** (2-3 cross-domain merges) |
| MEDIUM | 14 | 9 | 13 | 10 | 46 | ~40 |
| LOW | 9 | 7 | 8 | 8 | 32 | ~28 |

**Bottom line:** Tier-1 substrate is broadly clean of **api-core-class** security issues (no analog of Wave 12.A CWE-347 / CWE-942 / CWE-345 found). But the Wave-13 external-type-leak pattern recurs: `@gertsai/fetch` leaks undici types, `@gertsai/m9s-cache` leaks moleculer + ioredis types in published `.d.ts`. Both consumed by downstream services today.

## CRITICAL findings (full text)

### CRIT-1 — `@gertsai/m9s-cache` root barrel hard-imports `moleculer` + leaks types

**Domains:** Architecture + Type
**Files:** `packages/m9s-cache/src/index.ts` re-exports `M9sCacheCacher` → `packages/m9s-cache/src/moleculer-cacher.ts:6` `require('moleculer')` (top level); `packages/m9s-cache/dist/index.d.ts:2` imports `ServiceBroker, LoggerInstance, MetricRegistry, Service, Context, ServiceSchema` from `'moleculer'`.

**Issue:** `moleculer` is declared as **optional** peer-dep (`packages/m9s-cache/package.json:39-51`), but root `import { ... } from '@gertsai/m9s-cache'` triggers `require('moleculer')` at module-load. Consumers using only `MemoryCacheDriver`/`RedisCacheDriver` without moleculer crash at module-load with `MODULE_NOT_FOUND`, not at first integration point. The "optional" contract is broken.

**Wave-13 parity:** same pattern as `@gertsai/api-core/moleculer` upstream issue (Wave 11.B), but here it's the root export rather than a subpath.

**Verified:** `dist/index.js:1195: var Moleculer = require4("moleculer");` — leak confirmed in published artefact.

**Remediation (Wave 12.B-fix sub-wave):**
1. Move moleculer-coupled symbols (`M9sCacheCacher`, `moleculerDbCacheMixin`, `CacheEnabledService`, `CacheEnabledBroker`, `EntityChangedHandler`) into a `./moleculer` subpath with separate dist entry.
2. Move `RedisCacheDriverOptions` (which references `RedisOptions`/`ClusterNode` from ioredis) into a `./redis` subpath.
3. Root barrel exposes ONLY backend-agnostic primitives (`CacheStore`, `MemoryCacheDriver`, key/tag validation, lock interfaces).
4. Use `createRequire(import.meta.url)` lazily inside class constructors instead of module-top-level `require`.

### CRIT-2 — `@gertsai/fetch` leaks undici types in published `.d.ts`

**Domain:** Type
**File:** `packages/fetch/dist/index.d.ts:1` `import { RequestInit, Response, request } from 'undici';`. `UndiciRequestOptions = Parameters<typeof request>[1]`. `RequestOptions extends Omit<RequestInit, 'headers'>`.

**Issue:** Exact Wave-13 pattern. `undici` is declared as `dependencies` (not `peerDependencies`), so install proceeds, but every downstream consumer's `tsc` must resolve undici types. Version-pin mismatch (`@gertsai/fetch` pins `undici@^7.2.3`; consumer pins something else) causes structural type drift on `RequestInit`. Bundle bloat for non-undici consumers.

**Remediation:**
- Replicate minimum surface of `RequestInit` as a local `FetchRequestInit` interface (only fields you actually consume).
- Drop `extends Omit<RequestInit, 'headers'>` — re-derive structurally.
- Replace `Parameters<typeof request>[1]` with a structural shape.
- Optionally split undici-specific surface into `./undici` subpath if consumers want raw access.

## HIGH findings (consolidated)

### Logic

| # | Package | Title | File:line | Severity-mate |
|---|---|---|---|---|
| L-1 | `@gertsai/fetch` | Body-size limit bypass via Blob/ArrayBuffer/string paths (CWE-770 DoS) | `packages/fetch/src/fetchers/undiciFetcher.ts:71-86` | Security MEDIUM (#S-1) — same finding |
| L-2 | `@gertsai/collection` | `duplicates()` requires re-iterable input; generators silently return empty | `packages/collection/src/operations/set.ts:282-296` | — |
| L-3 | `@gertsai/utils` | `validateWebhookUrlAsync` DNS rebinding TOCTOU — resolved IP not pinned for subsequent fetch | `packages/utils/src/security/url-validator.ts:443-499` | Security MEDIUM (#S-3) related |
| L-4 | `@gertsai/utils` | `resolveHostname` AbortController never wired to `dns.resolve*` calls — timeout dead code | `packages/utils/src/security/url-validator.ts:388-422` | — |
| L-5 | `@gertsai/m9s-cache` | `RedlockLockProvider.tryAcquire` swallows ALL errors as "lock unavailable" — Redis-down becomes silent DoS amplifier | `packages/m9s-cache/src/lock-provider.ts:136-144` | — |
| L-6 | `@gertsai/ws-rpc` | `connect()` second-call concurrent-listener race — error-after-open rejects second caller's resolved promise | `packages/ws-rpc/src/client.ts:142-182` | — |
| L-7 | `@gertsai/pg-client` | `runBatch` does NOT wrap ops in transaction — partial commit on Nth-op failure; user-data-loss risk | `packages/pg-client/src/storage-provider.ts:438-443, 155-176` | — |

### Architecture

| # | Package | Title | File:line | Severity-mate |
|---|---|---|---|---|
| A-1 | `@gertsai/collection` | Subpath exports declared without `typesVersions` — breaks Node10 TS<5.0 consumers | `packages/collection/package.json:20-65` (no `typesVersions`) | — |
| A-2 | `@gertsai/m9s-cache` | (merged with CRIT-1) | | |
| A-3 | `@gertsai/m9s-cache` | (merged with CRIT-1) — no `/moleculer` subpath in exports | | |

### Type

| # | Package | Title | File:line | Severity-mate |
|---|---|---|---|---|
| T-1 | `@gertsai/collection` | Pervasive `: any` in exported generic constraints — 15+ public exports widen `T extends (...args: any[]) => any` | `packages/collection/src/utils/memoize.ts:32,39,169,229,...` + `mixins/prototype.ts:8,28,29` + `mixins/PositionalAccess.ts:141,204,...` | — |
| T-2 | `@gertsai/collection` | Brand-bypass factories — `createCacheKey/createCollectionId/...` cast without validation | `packages/collection/src/types/branded.ts:70-102` | — |
| T-3 | `@gertsai/utils` | `consola` types leak in dist/index.d.ts (Wave-13 pattern, smaller blast radius than fetch/m9s-cache) | `packages/utils/dist/index.d.ts:1-2`, `packages/utils/src/logger/createLogger.ts` | CRIT-class but smaller — kept HIGH |
| T-4 | `@gertsai/utils` | `Record<string, any>` in `getSyncFields` — exported helper erodes consumer narrowing | `packages/utils/src/object/getSyncFields.ts:62,74` | — |
| T-5 | `@gertsai/m9s-cache` | `ioredis` types leak through ROOT barrel (RedisOptions/ClusterNode) | `packages/m9s-cache/dist/index.d.ts:1` | Same root cause as CRIT-1 |
| T-6 | `@gertsai/ws-rpc` | Browser path silently discards `headers?` (Node-only); no type-level signal | `packages/ws-rpc/src/client.ts:200,203` | — |

### Security

| # | Package | Title (CWE) | File:line | Severity-mate |
|---|---|---|---|---|
| S-1 | `@gertsai/fetch` | (merged with L-1) — Body size limit applies only to iterable bodies (CWE-770) | | |
| S-2 | `@gertsai/utils` | `getRandomId` uses `Math.random()` + named generically; security-misuse trap (CWE-338) | `packages/utils/src/generators/getRandomId.ts:18-30` | — |
| S-3 | `@gertsai/m9s-cache` | `validateKeys` defaults to `false` in production via `NODE_ENV !== 'production'` — backwards! (CWE-20) | `packages/m9s-cache/src/cache-store.ts:49` | — |

## Per-package summary cards (15)

### @gertsai/fsm — 1049 LOC
- Logic: 2 MEDIUM + 1 LOW · Arch: 2 LOW · Type: 2 LOW · Security: 0
- **Top:** Silent handler-error swallow (`state-machine.ts:273-281`) — intentional but no diagnostic hook.
- Verdict: solid Tier-1 reference. Minor polish only.

### @gertsai/fetch — 793 LOC
- Logic: 1 HIGH + 1 MEDIUM + 1 LOW · Arch: 1 MEDIUM + 1 LOW · Type: **1 CRITICAL** + 1 MEDIUM + 1 LOW · Security: 2 MEDIUM + 1 LOW
- **Top:** CRIT-2 undici-type-leak in dist; L-1/S-1 DoS body-size bypass.
- Verdict: needs Wave-13-pattern fix. Production-safe but ships type-coupling debt.

### @gertsai/collection — 11683 LOC
- Logic: 1 HIGH + 2 MEDIUM + 1 LOW · Arch: 1 HIGH + 1 MEDIUM + 1 LOW · Type: 1 HIGH + 5 MEDIUM + 2 LOW · Security: 1 LOW
- **Top:** A-1 missing `typesVersions` (breaks Node10 TS<5.0); T-1 pervasive `any` in 15+ exported generics; T-2 unvalidated brand factories.
- Verdict: largest Tier-1 package, largest finding count. Wave 14 candidate for surface cleanup + brand-validation pattern.

### @gertsai/llm-costs — 1311 LOC
- Logic: 2 MEDIUM + 1 LOW · Arch: 2 LOW · Type: 2 MEDIUM + 1 LOW · Security: 0
- **Top:** `findModel` bidirectional prefix-match returns wrong model for short ids; bundled 1.05 MB models.json.
- Verdict: data-quality concerns; logic findings are concrete; type cleanup straightforward.

### @gertsai/utils — 3698 LOC
- Logic: 2 HIGH + 2 MEDIUM + 1 LOW · Arch: 2 MEDIUM + 1 LOW · Type: 1 HIGH + 4 MEDIUM + 1 LOW · Security: 1 HIGH + 3 MEDIUM + 2 LOW
- **Top:** L-3/L-4 SSRF DNS-rebinding TOCTOU + AbortController dead code; T-3 consola leak; S-2 weak random in publicly-exported `getRandomId`.
- Verdict: security-critical helpers. URL-validator needs consolidation with `@gertsai/fetch` (cross-package observation #1).

### @gertsai/m9s-cache — 3283 LOC
- Logic: 1 HIGH + 3 MEDIUM + 2 LOW · Arch: **1 CRITICAL** + 1 HIGH + 2 MEDIUM · Type: **1 CRITICAL** + 1 HIGH + 2 MEDIUM + 2 LOW · Security: 1 HIGH + 3 MEDIUM + 2 LOW
- **Top:** CRIT-1 root `require('moleculer')` + dist type leak (moleculer + ioredis). S-3 cache-key validation backwards in production. L-5 Redlock error masking.
- Verdict: highest-density-finding Tier-1 package. Needs the most fix-wave effort.

### @gertsai/ws-rpc — 1570 LOC
- Logic: 1 HIGH + 2 MEDIUM + 1 LOW · Arch: 1 LOW · Type: 1 HIGH + 1 MEDIUM + 2 LOW · Security: 2 MEDIUM + 1 LOW
- **Top:** L-6 concurrent-connect race; T-6 silent header-discard in browser; S security MEDIUM JSON.parse without schema on every inbound frame.
- Verdict: deliver-once protocol bugs need attention. Browser-path divergence under-typed.

### @gertsai/config — 21 LOC
- All domains: 0 findings except Architecture MEDIUM (S-shim Tier-1→Tier-4 inversion — documented exception per ADR-004).
- Verdict: shim package, no audit surface.

### @gertsai/tenant — 153 LOC
- All domains: 0 findings (+ 1 LOW type-redundancy note).
- **Architectural exemplar — recommended reference for new Tier-1 packages.**

### @gertsai/otel — 264 LOC
- Logic: 1 LOW · Arch: 1 MEDIUM + 1 LOW · Type: 1 MEDIUM + 1 LOW · Security: 2 LOW
- **Top:** `loadPeerDep` uses bare `require()` with tsup ESM polyfill — silently broken in pure-ESM Node 22 (caller doesn't get documented `OtelPeerDepMissingError`).
- Verdict: peer-dep loading pattern needs to match `createRequire(import.meta.url)` used in m9s-cache.

### @gertsai/pg-client — 601 LOC
- Logic: 1 HIGH + 2 MEDIUM + 1 LOW · Arch: 2 MEDIUM + 1 LOW · Type: 2 MEDIUM + 1 LOW · Security: 1 HIGH + 1 MEDIUM + 1 LOW
- **Top:** L-7 `runBatch` non-transactional — partial commit risk. SQL identifier injection mitigated by regex but `data` JSONB column trust-boundary documented loosely.
- Verdict: data-integrity finding (L-7) is the most actionable. SQL injection guards are defensible.

### @gertsai/session — 417 LOC
- Logic: 1 LOW · Arch: 1 MEDIUM + 1 LOW · Type: 1 MEDIUM + 2 LOW · Security: 2 MEDIUM + 2 LOW
- **Top:** Default `errorHandler` silently swallows; `Session.token` getter encourages credential-in-log misuse.
- Verdict: API-shape concerns; no exploitable bugs.

### @gertsai/entity-audit — 503 LOC
- All domains: 0 findings (+ Architecture MEDIUM: tier-table inversion via `@gertsai/audit-primitives` dep — likely the CLAUDE.md tier table itself misclassifies `audit-primitives` as Tier-2 when its package.json shows zero internal deps. Recommend re-tier `audit-primitives` to Tier-1.)
- Verdict: clean code; tier-table needs reconciliation.

### @gertsai/errors — 794 LOC
- Logic: 2 MEDIUM + 1 LOW · Arch: 2 LOW · Type: 2 MEDIUM + 2 LOW · Security: 2 MEDIUM + 2 LOW
- **Top:** `serializeAppError` truncates native-Error cause-chain too aggressively. Non-plain objects (Buffer/Date) pass redaction unchanged — could leak credentials in non-plain wrappers.
- Verdict: defense-in-depth gaps; no exploit chain identified.

### @gertsai/tenant-resolver — 596 LOC
- Logic: 1 MEDIUM + 2 LOW · Arch: 1 MEDIUM + 1 LOW · Type: 2 MEDIUM + 1 LOW · Security: 1 MEDIUM + 2 LOW
- **Top:** Subdomain strategy "left-most label wins" easy to misconfigure (documented). `lookupHeader` case-variant collision returns first-match non-deterministically (mitigated by Node http header lowercasing).
- Verdict: secure-by-default architecture; minor polish items.

## Cross-validation matrix

15-package density × 4 domains. CRIT = ●, HIGH = ◆, MEDIUM count, LOW count.

| Package | Logic | Arch | Type | Sec |
|---|---|---|---|---|
| fsm | 2M·1L | 2L | 2L | — |
| fetch | ◆+1M·1L | 1M·1L | **●**+1M·1L | 2M·1L |
| collection | ◆+2M·1L | ◆+1M·1L | ◆+5M·2L | 1L |
| llm-costs | 2M·1L | 2L | 2M·1L | — |
| utils | 2◆+2M·1L | 2M·1L | ◆+4M·1L | ◆+3M·2L |
| m9s-cache | ◆+3M·2L | **●**+◆+2M | **●**+◆+2M·2L | ◆+3M·2L |
| ws-rpc | ◆+2M·1L | 1L | ◆+1M·2L | 2M·1L |
| config | — | 1M·1L | — | — |
| tenant | — | — | 1L | — |
| otel | 1L | 1M·1L | 1M·1L | 2L |
| pg-client | ◆+2M·1L | 2M·1L | 2M·1L | ◆+1M·1L |
| session | 1L | 1M·1L | 1M·2L | 2M·2L |
| entity-audit | — | 1M | — | — |
| errors | 2M·1L | 2L | 2M·2L | 2M·2L |
| tenant-resolver | 1M·2L | 1M·1L | 2M·1L | 1M·2L |

## Cross-package observations

1. **Wave-13 pattern recurs in 3 packages** — `@gertsai/fetch` (undici, CRITICAL), `@gertsai/m9s-cache` (moleculer + ioredis, CRITICAL/HIGH), `@gertsai/utils` (consola, HIGH). External library types leak through emitted `.d.ts`. Fix pattern: replicate-minimum-surface-locally or split-into-subpath.
2. **Two SSRF URL validators co-exist in Tier-1** — `@gertsai/fetch/lib/url-validator.ts` (344 LOC) + `@gertsai/utils/security/url-validator.ts`. Code-clone with non-identical config shapes. Drift-risk: fix CWE-918 in one, miss it in other. Consolidate to single canonical owner.
3. **`Math.random()` is used in 5+ Tier-1 packages** for IDs, jitter, sampling. None currently feed security-critical outputs, but `@gertsai/utils#getRandomId` is named in a way that invites misuse. Add `getSecureRandomId` + deprecate.
4. **`process.env.NODE_ENV !== 'production'` defaults are backwards in 2+ places** — `@gertsai/m9s-cache` (validateKeys), collection mixins. Production should be strict path; opt-out explicit.
5. **Peer-dep loading pattern divergent** across `otel` (broken `require` polyfill), `m9s-cache` (correct `createRequire` in some files, wrong at module top in `moleculer-cacher.ts`), `tenant-resolver/moleculer` (no runtime guard at all). Codify single pattern: `createRequire(import.meta.url)` + lazy in-function call + `MissingPeerDepError` from `@gertsai/errors`.
6. **Branded-type factory validation discipline diverges** — `tenant.asTenantId` validates, `m9s-cache.validateCacheKey` validates, `collection.createCacheKey/createCollectionId/createHashCode` only casts. Standardise: factory MUST validate OR rename `unsafeCreate<Brand>`.
7. **Silent `catch {}` is a recurring pattern** in `fsm`, `m9s-cache`, `pg-client`, `utils/url-validator`, `ws-rpc`. Most documented as intentional, but combined impede incident diagnosis. Repo-wide convention: empty catch only with `// reason:` + emission to structured logger when not in test.
8. **No analog of Wave 12.A CRITICALs surfaced in Tier-1** — no BYPASS_AUTH env, no CORS wildcard default, no XFF rate-limit bypass. Auth-relevant primitives (`session`, `tenant-resolver`) fail-closed by default. `errors` redaction is real (depth/breadth-bounded).
9. **Strongest Tier-1 packages** (architectural references): `@gertsai/tenant`, `@gertsai/entity-audit`, `@gertsai/config`, `@gertsai/fsm`. **Weakest** by finding-density: `@gertsai/m9s-cache`, `@gertsai/collection`, `@gertsai/utils`.
10. **CLAUDE.md tier-table reconciliation needed** — `@gertsai/audit-primitives` is classified Tier-2 but has zero `@gertsai/*` deps in package.json; behaves as Tier-1. Either downgrade the dependency or downgrade the tier classification.

## Suggested follow-up wave structure

Recommended fix decomposition (separate PRD per Wave 12.B-fix decomposition):

**Sub-wave 12.B-fix-1 (CRITICAL):** External-type leak elimination
- `@gertsai/fetch` undici-type-leak → minor bump 0.2.0 → 0.3.0
- `@gertsai/m9s-cache` moleculer + ioredis leak → minor bump 0.2.0 → 0.3.0 (split into `/moleculer` + `/redis` subpaths)
- Estimated effort: 1 day, ~200 LOC across both packages.

**Sub-wave 12.B-fix-2 (HIGH security):**
- `@gertsai/utils` URL validator DNS-rebinding TOCTOU + AbortSignal wiring + `getRandomId` deprecation
- `@gertsai/m9s-cache` validateKeys default inversion + RedlockLockProvider error surfacing
- `@gertsai/pg-client` `runBatch` transaction wrapping (data-integrity)
- `@gertsai/fetch` body-size limit comprehensive enforcement
- Estimated effort: 1.5 days, ~150 LOC.

**Sub-wave 12.B-fix-3 (HIGH type-system):**
- `@gertsai/collection` pervasive `any` in exported generics → `unknown` + `readonly unknown[]`
- `@gertsai/collection` brand factory validation (or rename to `unsafe<Brand>`)
- `@gertsai/collection` `typesVersions` subpath wiring
- `@gertsai/ws-rpc` Node-only `headers?` split into typed branches
- Estimated effort: 1 day, ~100 LOC.

**Deferred:** all MEDIUM/LOW findings → Wave 12.B-polish (low-priority cleanup sprint) or rolled into Wave 14.

## Methodology

Per RFC-019:
- 4 parallel `code-analyzer` / `security-expert` / `typescript-type-auditor` agents
- Each got ONE prompt covering all 15 packages in its domain
- Read-only audit, no code or .forgeplan mutations
- Output schema per RFC-019 D-4 — per-package sections, severity-ranked, file:line citations required for CRITICAL/HIGH
- Cross-validation by orchestrator (main thread): same-file-line collapsed across domains, severity max-merge
- Total wallclock ~9 min, ~780k tokens combined across 4 reviewers, 350 tool calls

## Refs

- **PRD-028** — Wave 12.B audit plan (this evidence informs it)
- **RFC-019** — execution strategy
- **EVID-043** — Wave 12.A api-core reference output
- **PRD-027** — Wave 13 fix wave (model for Wave 12.B fix sub-waves above)
- **CLAUDE.md** — 38-package tier table (reconciliation item per Obs #10)
- **ADR-004** — Foundation libs naming
- **ADR-005** — storage-core / pg-client architecture
- **ADR-006** — `@gertsai/errors` Shared Kernel + R_eff math





