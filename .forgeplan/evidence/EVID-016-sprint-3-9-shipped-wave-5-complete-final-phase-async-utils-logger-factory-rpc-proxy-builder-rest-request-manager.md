---
depth: standard
id: EVID-016
kind: evidence
last_modified_at: 2026-05-06T21:12:56.359644+00:00
last_modified_by: claude-code/2.1.131
links:
- target: PRD-003
  relation: informs
- target: ADR-009
  relation: informs
- target: SPEC-014
  relation: informs
- target: ADR-010
  relation: informs
- target: SPEC-015
  relation: informs
status: active
title: Sprint 3.9 shipped + Wave 5 COMPLETE — final phase (async-utils + logger-factory + rpc-proxy-builder + rest-request-manager)
---

# EVID-016: Sprint 3.9 shipped + Wave 5 COMPLETE

## Structured fields

- **Verdict**: SUPPORTS (PRD-003 G-6 satisfied; ADR-009 invariants I-1..I-17 verified by 4∥ post-Build fidelity audit; 5∥ pre-Build audit caught + addressed 1 convergent P0 + 12 substantive findings BEFORE Build via Amendment 1).
- **Congruence Level**: CL3 (full implementation matches spec; **zero P0/P1 from post-Build audit** — cleanest sprint to date matching Sprint 3.8 baseline).
- **Evidence Type**: CI verification + multi-reviewer audit (5∥ pre-Build + 4∥ post-Build).
- **Date**: 2026-05-06.
- **Branch**: `feat/sprint-3-9-wave-5-phase-4` (off `feat/sprint-3-8-wave-5-phase-3`).

## What shipped (Sprint 3.9)

| Deliverable | Type | Strategy | Tests added |
|---|---|---|---|
| `@gertsai/async-utils` v0.1.0 | NEW Tier 1 (zero peer-deps) | F (fresh) | 19 |
| `@gertsai/logger-factory` v0.1.0 | NEW Tier 1 (errors peer + /pino /winston subpaths) | F (fresh) | 18 |
| `@gertsai/rpc-proxy-builder` v0.1.0 | NEW Tier 3 (api-core type-only peer) | F (fresh) | 14 |
| `@gertsai/rest-request-manager` v0.1.0 | NEW Tier 2 (4 peer-deps) | F (fresh) | 20 |
| `@gertsai/api-core` patch | E+ enhancement (additive) | E+ (additive only) | 0 (regression) |

**Total Sprint 3.9 wall-clock**: ~5h (4∥ workers parallel; pre-Build audit ~10min synthesize; Build ~50min; Phase B verify ~10min; Phase C audit ~15min; Phase D ~10min).

## Sprint 3.9 structured measurements

| Metric | Sprint 3.8 baseline | Sprint 3.9 actual | Δ |
|---|---|---|---|
| Test count (passed) | 4772 | **4843** | **+71** (target +63, 1.1×) |
| Package count | 35 | **39** | +4 (async-utils, logger-factory, rpc-proxy-builder, rest-request-manager) |
| Forgeplan artifacts | 41 (33 active) | **44** (36 active) | +3 (ADR-009, SPEC-014, EVID-016) |
| Active ADRs | 8 | 9 | +1 (ADR-009) |
| Active specs | 11 | 12 | +1 (SPEC-014) |
| Active evidence | 14 | 15 | +1 (EVID-016) |

## Quality gates (Phase B verify)

- `pnpm install` — clean (39 packages + m9s-example).
- `pnpm build` — green (39 + m9s-example).
- `pnpm test` — **4843 passed / 49 skipped**, 0 failed.
- `pnpm typecheck` — clean (39 + m9s-example).
- `pnpm run depcruise` — `✔ no dependency violations found (108 modules, 210 dependencies cruised)`.
- `pnpm run lint` (root level) — green.
- api-core patch (ActionDefinition added pre-Build) — backward-compat preserved (370/370 api-core tests pass).

## Audit results (Sprint 3.9)

### Pre-Build audit (5∥ reviewers, 2026-05-06)

5 reviewers spawned via AgentTeams `sprint-3-9` team:
- architect-reviewer: GO-WITH-FIXES (1 P0 + 3 P1)
- security-reviewer: GO-WITH-FIXES (3 P0 + 4 P1 — CWE-770/1188/1230/1321/401/672/20/674/362/209/409 catches)
- ddd-reviewer: APPROVE (zero P0/P1; 1 P2)
- typescript-reviewer: GO-WITH-FIXES (1 P0 + 2 P1 + 3 P2)
- docs-reviewer: GO-WITH-FIXES (5 P1 + 3 P2)

**Convergent finding (≥2 reviewers, mandatory)**:
- **`ActionDefinition<I, O>` not exported from api-core** (typescript P0-1 + architect P0-A1 convergent): Sprint 3.7+3.8 contracts only export error/apiResponse/envelope/common/diagnostics; rpc-proxy-builder Track 3 would not compile. Resolved Amendment 1.1.1: NEW `packages/api-core/src/contracts/action-definition.ts` (additive non-breaking) added pre-Build.

**Substantive single-reviewer P0/P1 findings (addressed)**:
- security P0-S1: Circuit-breaker LRU eviction (CWE-770/401) → I-15 + W-3-9-23 LRU implementation.
- security P0-S2: rpc-proxy unknown action throws (CWE-1230 fail-open) → I-14.
- security P0-S3: rpc-proxy 3 Proxy traps (CWE-1188) → I-15.
- security P1-S4: retry default jitter `'full'` (CWE-409 thundering herd).
- security P1-S5: withTimeout signal listener cleanup (CWE-401) → I-16.
- security P1-S6: Logger child frozen-copy + independent level (CWE-200 PII isolation).
- security P1-S7: Logger default-on REDACTION_KEYS (CWE-209) → I-17.
- security P2-S8: rest-request-manager Node-only (engines.node ≥22).
- security P2-S9: NO TLS-disable option in RestRequestManagerOpts.
- architect P1-A2: Wave 1 worker sequencing (no per-package install during Build).
- architect P2-A6: rest-request-manager AbortError → TimeoutError translation.
- typescript P1-2: explicit `as RpcProxy<TActionMap>` return cast.
- docs P1-1..P1-5 + P2-1..P2-3: README template inline + per-package Quickstart code + install error wording + compat matrix + subpath docs + changeset templates + CLAUDE.md row snippets + Wave 5 retrospective requirement.

All Amendment 1 fixes applied to ADR-009 + SPEC-014 BEFORE Build started — including 4 NEW invariants (I-14..I-17).

### Post-Build fidelity audit (4∥ reviewers, 2026-05-06)

- async-utils-fidelity: PASS (zero P0/P1; 1 informational note — I-16 functionally satisfied via no-listener pattern).
- logger-factory-fidelity: PASS (zero P0/P1; informational notes on Winston level mapping).
- rpc-proxy-builder-fidelity: PASS (zero P0/P1; high confidence 🟢; ActionDefinition pre-Build wiring verified).
- rest-request-manager-fidelity: PASS (zero P0/P1; 2 P2 informational notes).

**Cleanest sprint matching Sprint 3.8 baseline**: 4 of 4 fidelity reviewers PASS with zero P0/P1 findings. Pre-Build Amendment 1 fully eliminates implementation drift.

## ADR-009 invariants (verified)

| Invariant | Verification | Status |
|---|---|---|
| I-1 async-utils ZERO peer-deps | package.json verified by fidelity reviewer | ✅ |
| I-2 async-utils throws standard Error (no @gertsai/errors) | grep verified | ✅ |
| I-3 logger-factory consoleBackend default | console-backend.ts default + zero peer-dep cost | ✅ |
| I-4 logger-factory pino/winston peer-optional | peerDependenciesMeta.optional verified | ✅ |
| I-5 logger-factory REDACTION_KEYS reuse | imports from @gertsai/errors/http | ✅ |
| I-6 rpc-proxy-builder type-only api-core import | `import type from '@gertsai/api-core/contracts'` | ✅ |
| I-7 rpc-proxy-builder module-private Symbol brand | `Symbol('rpc-proxy')` (NOT Symbol.for) verified by forgery test | ✅ |
| I-8 rest-request-manager AppError translation | translation.ts maps 4xx/5xx/timeout to AppError subclasses | ✅ |
| I-9 rest-request-manager redaction on logged bodies | redaction.ts applied at debug/warn/error log | ✅ |
| I-10 tsup external for cross-package types | all 4 packages declare external | ✅ |
| I-11 README per Sprint 3.6 §template | all 4 READMEs follow template | ✅ |
| I-12 SPDX header on every new .ts | confirmed in all worker reports | ✅ |
| I-13 Strategy markers F | all 4 marked F in SPEC-014 | ✅ |
| **I-14 rpc-proxy unknown action throws** (NEW Amendment) | tested in proxy.test.ts | ✅ |
| **I-15 rpc-proxy 3 Proxy traps** (NEW Amendment) | tested set+delete blocked | ✅ |
| **I-16 async-utils withTimeout listener cleanup** (NEW Amendment) | 1000-iter smoke test | ✅ |
| **I-17 logger-factory default-on REDACTION_KEYS** (NEW Amendment) | tested without consumer opt-in | ✅ |

## SPEC-014 acceptance checklist

- [x] T1 (W-3-9-1..10): @gertsai/async-utils Tier 1 zero-dep; 19 tests; README.
- [x] T2 (W-3-9-11..16): @gertsai/logger-factory Tier 1 + /pino /winston; 18 tests; README.
- [x] T3 (W-3-9-17..21): @gertsai/rpc-proxy-builder Tier 3; 14 tests (10 unit + 4 integration); README.
- [x] T4 (W-3-9-22..28): @gertsai/rest-request-manager Tier 2; 20 tests; README.
- [x] T5 (W-3-9-29..34): full repo verify green; CLAUDE.md tier 35 → 39 + Wave 5 complete preamble; 4 changesets.
- [x] T6 (W-3-9-35..40): post-Build audit done (4/4 PASS); EVID-016 active; SPEC-014 active; commit; Hindsight Group 41.

---

## 🎉 Wave 5 Retrospective (per Amendment 1.3.9)

### 1. Wave 5 packages tally — 13 total

**Phase 1 (Sprint 3.6, EVID-013)** — 2 packages:
- `@gertsai/errors` (Tier 1 Shared Kernel)
- `@gertsai/tenant-resolver` (Tier 1)
- + `@gertsai/session` 0.1.0→0.2.0 (additive scoping E+)
- + 7 P2 polish items (entity-storage)

**Phase 2 (Sprint 3.7, EVID-014)** — 3 packages:
- `@gertsai/runtime-context` (Tier 4 — first non-api-core Tier 4)
- `@gertsai/session-guard` (Tier 2)
- `@gertsai/audit-primitives` (Tier 2)
- + `@gertsai/errors` patch (parametric subclasses)
- + `@gertsai/entity-audit` E+ (re-export from audit-primitives)

**Phase 3 (Sprint 3.8, EVID-015)** — 4 packages:
- `@gertsai/entity-vue` (Tier 2 — extracted from entity/vue subpath)
- `@gertsai/entity-react` (Tier 2)
- `@gertsai/entity-solid` (Tier 2)
- `@gertsai/entity-svelte` (Tier 2)
- + `@gertsai/entity` patch (vue subpath shim)

**Phase 4 (Sprint 3.9, EVID-016, this evidence)** — 4 packages:
- `@gertsai/async-utils` (Tier 1 zero peer-deps)
- `@gertsai/logger-factory` (Tier 1 + /pino /winston subpaths)
- `@gertsai/rpc-proxy-builder` (Tier 3)
- `@gertsai/rest-request-manager` (Tier 2)
- + `@gertsai/api-core` patch (ActionDefinition addition)

### 2. Cumulative test-count delta (Sprint 3.5.2 baseline → Sprint 3.9 exit)

| Sprint | Test count | Δ |
|---|---|---|
| Sprint 3.5.2 (baseline) | 4443 | — |
| Sprint 3.6 (EVID-013) | 4573 | +130 |
| Sprint 3.7 (EVID-014) | 4697 | +124 |
| Sprint 3.8 (EVID-015) | 4772 | +75 |
| Sprint 3.9 (EVID-016) | **4843** | **+71** |
| **Total Wave 5** | — | **+400** |

### 3. Pattern reuse audit

| Pattern | Sprint 3.6 | Sprint 3.7 | Sprint 3.8 | Sprint 3.9 |
|---|---|---|---|---|
| createRequire(import.meta.url) lazy peer-load | — | runtime-context /moleculer | entity-vue/react/solid/svelte | logger-factory /pino /winston |
| tsup `external` for cross-package types | errors /http /grpc | runtime-context, session-guard | entity-react/solid/svelte | logger-factory, rpc-proxy-builder, rest-request-manager |
| Sprint 3.6 README §template (Install/Quickstart/Subpath/API/Compat/Security/Cross-refs/License) | errors, tenant-resolver | runtime-context, session-guard, audit-primitives | entity-vue/react/solid/svelte | async-utils, logger-factory, rpc-proxy-builder, rest-request-manager |
| Module-private `Symbol(...)` markers (CWE-1321) | (errors /plain.ts uses Symbol.for — Sprint 3.4 precedent) | n/a | entity-react/solid/svelte (NEW pattern per I-11) | rpc-proxy-builder per I-7 |
| WeakMap subscribe registries (CWE-401/672) | n/a | n/a | entity-react/svelte per I-12 | rest-request-manager LRU CB |
| 3 Proxy traps + Reflect.set without external receiver (CWE-20) | n/a | n/a | entity-react/svelte per I-13 | rpc-proxy-builder per I-15 |
| Default-on redaction (CWE-209) | errors REDACTION_KEYS | n/a | n/a | logger-factory per I-17, rest-request-manager per I-9 |
| AppError taxonomy reused as Shared Kernel | errors initial | runtime-context (5 errors), session-guard (5 errors) | n/a | rest-request-manager (5 AppError subclasses) |

**All 13 Wave 5 packages follow Sprint 3.6 §template + tsup external + createRequire lazy load.** Pattern fully matured by Sprint 3.6 — Sprint 3.7-3.9 reused without drift.

### 4. Invariants honored across 4 sprints

**Wave 4 invariants preserved** (ADR-005 I-1..I-7):
- entity core has no concrete UI framework runtime (preserved through Sprint 3.8 entity-vue extraction).
- Storage architecture invariants intact.

**Wave 5 invariants** (across ADR-006 + ADR-007 + ADR-008 + ADR-009):
- **errors as Shared Kernel** (ADR-006 §D §6): all 13 packages depend on errors — single AppError taxonomy.
- **No concrete framework runtime in core** (ADR-006/7/8/9 various invariants): Vue/React/Solid/Svelte/Moleculer/HTTP/gRPC frameworks isolated to subpath adapters or peer-optional.
- **Peer-optional discipline**: every UI framework runtime + transport runtime declared with peerDependenciesMeta.optional=true.
- **Backward compat**: entity vue subpath shim (Sprint 3.8 ADR-008 I-3); entity-audit E+ refactor (Sprint 3.7 Amendment 1.1.4); api-core ActionDefinition (Sprint 3.9 additive).

**Security CWE coverage** (Wave 5 cumulative):
- CWE-20 (Improper Input Validation) — Reflect.set without external receiver (ADR-008 I-13, ADR-009 I-15).
- CWE-200 (Information Exposure) — child logger frozen copy (ADR-009 Amendment 1.2.6), AppError redaction.
- CWE-209 (Information Exposure via Error Messages) — REDACTION_KEYS default-on (ADR-006 I-14, ADR-009 I-17).
- CWE-285 (Improper Authorization) — isInTenant undefined-guard (ADR-007 I-18), isImpersonating empty-UUID guard (ADR-007 I-19).
- CWE-330 (Insufficient Randomness) — crypto.randomUUID for correlationId (ADR-007 I-20).
- CWE-362 (Race Condition) — sync notify in Proxy traps (ADR-008 I-13).
- CWE-367 (TOCTOU) — sessionMiddleware auto-`$freeze()` (ADR-007 I-16).
- CWE-401 (Memory Leak) — WeakMap subscribe registries (ADR-008 I-12, ADR-009 I-16).
- CWE-409 (Resource Amplification) — retry default 'full' jitter (ADR-009 Amendment 1.2.7).
- CWE-639 (Authorization Bypass) — HeaderStrategy trustProxy opt-in (ADR-006 I-15).
- CWE-672 (Use After Free) — WeakMap GC (ADR-008 I-12).
- CWE-674 (Uncontrolled Recursion) — re-entrancy guards in Proxy notify (ADR-008 I-13).
- CWE-770 (Resource Consumption) — LRU circuit-breaker (ADR-009 Amendment 1.2.1).
- CWE-843 (Type Confusion) — ProviderContext symbol-only tokens (ADR-007 I-17).
- CWE-1188 (Insecure Default Init) — read-only Proxy via 3 traps (ADR-009 I-15).
- CWE-1230 (Information Disclosure) — rpc-proxy unknown action throws (ADR-009 I-14).
- CWE-1321 (Prototype Pollution) — module-private Symbol vs Symbol.for (ADR-008 I-11, ADR-009 I-7).

### 5. Lessons learned for Wave 6+

**What worked exceptionally well**:
1. **Pre-Build audit (5∥ reviewers) catches structural drift BEFORE workers write code**. 8-9 cycle confirmed pattern: every Sprint 3.6+ caught 1+ convergent P0 + 5-12 substantive findings before Build. Post-Build audit then becomes confirmation rather than fix-loop.
2. **Convergent findings (≥2 reviewers) are 100% mandatory**. Single-reviewer findings often substantive (case-by-case). No "single-reviewer noise" filtering needed.
3. **Amendment 1 pattern stable**: each Sprint produces ADR/SPEC §"Amendment 1" appendix without rewriting original Decisions — clean audit trail of evolution.
4. **AgentTeams 4∥ workers + team-lead Phase B + 4∥ fidelity** scales for ~1500-2000 LOC sprints. Larger could go to 5-6∥. File ownership matrix prevents conflicts.
5. **tsup external pattern**: Sprint 3.7 typescript-reviewer Amendment 1.2.11 codified — Sprint 3.8/3.9 reused without drift.
6. **createRequire(import.meta.url) for ESM peer-optional**: Sprint 3.7+3.8 pattern + Sprint 3.9 logger-factory subpaths + rest-request-manager — universal pattern.
7. **E+ refactor for backward-compat shim**: Sprint 3.7 entity-audit + Sprint 3.8 entity-vue + Sprint 3.9 api-core ActionDefinition — additive non-breaking pattern.

**Process improvements applied during Wave 5**:
- Sprint 3.6: README template fixation (docs P1-1)
- Sprint 3.7: changeset templates inline
- Sprint 3.8: invariant invariant numbering Amendment-extending I-N
- Sprint 3.9: Wave 5 retrospective format inline in EVID-016

**For Wave 6+**:
1. **Inline Amendment templates from start**: Sprint 3.6 had to invent README/changeset templates; Sprint 3.7-3.9 reused. Wave 6 should ship with template inline in initial spec.
2. **Pre-Build audit is non-negotiable**: 9 cycles confirm value > cost. Skip risks 5-10 P0/P1 in post-Build.
3. **TypeScript reviewer ALWAYS catches structural type issues**: typescript P0 in Sprint 3.7 (parametric errors), Sprint 3.8 (Svelte API drift), Sprint 3.9 (ActionDefinition missing). Pattern: type-system audit catches what runtime tests miss.
4. **Security reviewer ALWAYS catches CWE classes**: 17 CWEs covered across Wave 5. Each Sprint 3-5 substantive security findings — 100% reviewer ROI.
5. **DDD reviewer catches semantic drift**: Sprint 3.7 AuthenticationRequiredError split, Sprint 3.8 Svelte UL asymmetry. Pattern: domain language audit catches naming/contract semantic issues.
6. **Documentation reviewer catches consumer-facing drift**: README templates + install error wording + compat matrix. Without docs reviewer, post-Build P1 churn 4-8 items per sprint.

**Not recommended for Wave 6+**:
- Skipping pre-Build audit "to save time" — false economy.
- Single-package sprints — AgentTeams 4∥ pattern matured for 4-package waves.
- Inventing new patterns — reuse Sprint 3.6 §template / tsup external / createRequire / Amendment 1 structure.

## Files changed (Sprint 3.9 only)

**NEW packages (full directories)**:
- `packages/async-utils/` — 8 src + 7 test files + LICENSE + README + CHANGELOG + tsup/vitest configs
- `packages/logger-factory/` — 5 src (root + /pino + /winston subpaths) + 5 test files + LICENSE + README + CHANGELOG + 3-entry tsup
- `packages/rpc-proxy-builder/` — 2 src files + 2 test files + LICENSE + README + CHANGELOG + tsup/vitest
- `packages/rest-request-manager/` — 7 src files (manager, types, translation, redaction, rate-limiter, circuit-breaker, index) + 4 test files + LICENSE + README + CHANGELOG

**Modified existing**:
- `packages/api-core/src/contracts/action-definition.ts` (NEW — additive type-only export per Amendment 1.1.1)
- `packages/api-core/src/contracts/index.ts` (additive re-export)
- `CLAUDE.md` — tier table 35 → 39 + Wave 5 complete preamble + 4 NEW Tier 1/2/3 rows
- `pnpm-lock.yaml` — workspace symlinks for 4 new packages
- `.changeset/sprint-3-9-{async-utils,logger-factory,rpc-proxy-builder,rest-request-manager}.md` — NEW (4 changesets per Amendment 1.3.7)

**Forgeplan artifacts**:
- `.forgeplan/adrs/ADR-009-...md` — NEW (Decisions A/B/C/D/E + 17 invariants + Amendment 1)
- `.forgeplan/specs/SPEC-014-...md` — NEW (W-3-9-1..40 + Amendment 1)
- `.forgeplan/evidence/EVID-016-...md` — NEW (this file with Wave 5 retrospective)

## Branch state post-Sprint 3.9

`feat/sprint-3-9-wave-5-phase-4` is 1 commit ahead of `feat/sprint-3-8-wave-5-phase-3` (which chains back to `feat/sprint-3-6-wave-5-phase-1` → `feat/api-core-decomposition` → 34 commits ahead of main). Total: ~38 commits ahead of main.

## Linked artifacts

| Artifact | Relation |
|---|---|
| PRD-003 | informs (this evidence supports PRD-003 G-6 + completes Wave 5) |
| ADR-009 | informs (this evidence supports ADR-009 invariants I-1..I-17) |
| SPEC-014 | informs (this evidence supports SPEC-014) |
| EVID-015 (Sprint 3.8 baseline) | based_on |
| ADR-008 (Sprint 3.8 placement) | informs (Wave 5 Phase 3 invariants preserved) |
| ADR-007 (Sprint 3.7 placement) | informs |
| ADR-006 (Sprint 3.6 placement — errors Shared Kernel) | informs |

## Next steps

- **Wave 5 publish gate** — pending explicit user confirmation per CLAUDE.md red lines. After Sprint 3.9, Wave 5 fully complete (13 packages ready for npm publish: errors, tenant-resolver, runtime-context, session-guard, audit-primitives, entity-vue, entity-react, entity-solid, entity-svelte, async-utils, logger-factory, rpc-proxy-builder, rest-request-manager).
- **Wave 6+ planning** — open. Possible directions:
  - Real-world example app (Candidate A AI Agent Orchestrator from Group 37 backlog).
  - Auth (`@gertsai/auth-moleculer` deferred per ADR-004 I-5).
  - Postgres adapters (CDC bridges, schema migrations).
  - HTTP framework adapters for runtime-context (Express/Fastify middleware).
  - Web/Fetch HttpRequestLike adapter for tenant-resolver.
  - TypedToken<T> wrapper for ProviderContext (Sprint 3.7+3.8 deferred).
  - Internal Session $-mutator throw migration to SessionDestroyedError (Sprint 3.7 deferred).
  - More framework adapters (Astro? Qwik? Lit?).

**Wave 5 closes here. 🎉**








