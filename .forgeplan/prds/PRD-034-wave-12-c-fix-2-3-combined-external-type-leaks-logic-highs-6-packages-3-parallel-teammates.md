---
depth: standard
id: PRD-034
kind: prd
last_modified_at: 2026-05-16T19:54:40.525405+00:00
last_modified_by: claude-code/2.1.142
links:
- target: EVID-048
  relation: based_on
status: active
title: Wave 12.C-fix-2+3 — combined external-type-leaks + logic HIGHs (6 packages, 3 parallel teammates)
---

# PRD-034 — Wave 12.C-fix-2+3 — combined external-type-leaks + logic HIGHs

## Target Audience

- **Primary:** downstream consumers of `@gertsai/queue`, `@gertsai/rest-request-manager`, `@gertsai/flux`, `@gertsai/di`.
- **Secondary:** Wave 12.D / 12.E reviewers — combined fix-2+3 sets precedent for batched HIGH closures in subsequent audit waves.

## Problem Statement

EVID-048 surfaced 11 unique HIGH findings; Wave 12.C-fix-1 (PRD-033) closed 4 in `@gertsai/entity`. The remaining 7 HIGHs split into:

**External-type-leak HIGHs (3 items, 3 packages):**
- H-3: `@gertsai/queue` bullmq types leak in root `dist/index.d.ts` — bullmq peer-optional but consumers must install for types
- H-4: `@gertsai/rest-request-manager` Logger from peer-optional `@gertsai/logger-factory` leaks into `RestRequestManagerOpts.logger?: Logger`
- H-6: `@gertsai/storage-core` capabilities shape doc drift in CLAUDE.md tier-table (boolean-pair shape vs documented tri-state) — documentation fix only

**Logic-correctness HIGHs (4 items, 3 packages):**
- H-7: `@gertsai/flux` `pipe()` overwrites prior pipeline + leaks `end`/`error` listeners (DataStream.ts:378,406-414)
- H-8: `@gertsai/flux` once-listener removal by function-only identity — duplicate registrations corrupt subscription state (FluxilisEventEmitter.ts:444-446)
- H-9: `@gertsai/di` memory leak via `'destroy'` vs `'destroyed'` event-name mismatch with `@gertsai/entity` (manager.ts:203 + Model.ts:46)
- H-10: `@gertsai/rest-request-manager` rate-limiter token float drift causes spurious `RateLimitedError` (rate-limiter.ts:30-49)
- H-11: `@gertsai/queue` `createWorker` passes `password: undefined, db: undefined` unconditionally — inconsistent with `createQueue`'s conditional spread (index.ts:121-126)

**Combined into one PRD** (vs PRD-033's separate fix-1 wave) because the 7 items span 4 packages with disjoint file ownership — 3 parallel teammates can close all 7 in one wave per AgentsTeam pattern.

Without these fixes:
- 2 packages still leak external types in published `.d.ts` (Wave-13-pattern recurrence at Tier-2)
- flux Stream API has silent correctness bugs (pipe overwrite, event-listener leak)
- DI service cleanup misses entity-derived consumers (services with timers leak)
- rest-request-manager throws spurious RateLimitedError under sustained load
- queue may break Redis AUTH due to unconditional undefined password

## Goals

1. **All 7 remaining HIGHs from EVID-048 closed.** Each cited `file:line` verifiably patched.
2. **No regression** — affected packages' test suites stay green; new tests added per fix.
3. **Migration cost minimal** — additive types (`BodyTooLargeError`-style new exports), no breaking signature changes except `validateKeys`-style soft inversions if any.

## Non-Goals

- **NG-001** — MEDIUM/LOW findings from EVID-048 deferred to polish sprint.
- **NG-002** — Wave 12.D / 12.E / 12.F / 12.G out of scope (separate forge-cycles).
- **NG-003** — flux deep refactor / surface trimming out of scope — surgical fixes only.
- **NG-004** — No public-npm-vs-GHPackages migration.

## Functional Requirements

- [ ] **FR-001** — `@gertsai/queue` bullmq types inlined. `dist/index.d.ts` no longer imports `from 'bullmq'`. Local structural interfaces for `Queue<T>`, `Worker<T,R>`, `Job<T>`, `ConnectionOptions`. Runtime imports of bullmq stay (peer-optional + lazy `createRequire`).
- [ ] **FR-002** — `@gertsai/rest-request-manager` `Logger` from `@gertsai/logger-factory` either pinned as hard peer (drop `optional: true`) OR inlined as local minimal interface. Decision in teammate prompt: inline (consistent with FR-001 pattern).
- [ ] **FR-003** — CLAUDE.md tier-table doc update for `@gertsai/storage-core` Wave 7.2 entry — reflect actual `upsert: { supported: boolean; preservesCreatorAudit: boolean }` shape (not tri-state).
- [ ] **FR-004** — `@gertsai/flux` `pipe()` either (a) stores pipes in an array (true fan-out) OR (b) throws on second `pipe()` to make single-pipe contract explicit. Save `on('end')`/`on('error')` refs for `destroy()` cleanup.
- [ ] **FR-005** — `@gertsai/flux` once-listener removal by `ListenerInfo` reference identity, not function match.
- [ ] **FR-006** — `@gertsai/di` listens for `'destroyed'` event (not `'destroy'`), matching `@gertsai/entity`'s `Model.$destroy()` emit.
- [ ] **FR-007** — `@gertsai/rest-request-manager` rate-limiter integer-bucket model with `Math.floor` or epsilon-tolerance for token comparison.
- [ ] **FR-008** — `@gertsai/queue` `createWorker` uses conditional spread for `password` and `db` (mirror `createQueue` pattern).
- [ ] **FR-009** — Changesets per affected package:
  - `@gertsai/queue: minor` (FR-001 + FR-008)
  - `@gertsai/rest-request-manager: minor` (FR-002 + FR-007)
  - `@gertsai/flux: minor` (FR-004 + FR-005)
  - `@gertsai/di: minor` (FR-006)
  - storage-core CLAUDE.md fix is a doc-only commit, no changeset

## Non-Functional Requirements

- **NFR-001 — Backward-compat additive.** New types (`Queue<T>`, `Worker<T,R>`, `Job<T>`, `ConnectionOptions`, `Logger`) replace external-type re-exports with identical structural shape — consumer code unchanged.
- **NFR-002 — Test budget.** Each affected package gains tests for its fix (pipe race, listener identity, event rename, rate-limiter integer math, conditional spread).
- **NFR-003 — File ownership disjoint per teammate.** 3 teammates split across 6 packages:
  - **Teammate A**: queue + storage-core CLAUDE.md (FR-001, FR-003, FR-008) — small scope, 2 unrelated tasks
  - **Teammate B**: flux (FR-004, FR-005) — biggest single-package change
  - **Teammate C**: di + rest-request-manager (FR-002, FR-006, FR-007) — 3 fixes across 2 small-medium packages
- **NFR-004 — Forgeplan safety.** Mutations only via MCP.
- **NFR-005 — Time bound.** ≤2 hours wallclock including spawn + parallel teammates + verification + commit + PR.
- **NFR-006 — Wave-13-pattern regression check.** After all teammates, verify `head -3 dist/index.d.ts` for all 4 affected packages — no external library type imports remain at root.

## Related Artifacts

- **EVID-048** — sources all 7 HIGHs
- **PRD-032** — Wave 12.C audit parent
- **PRD-033 + EVID-049** — Wave 12.C-fix-1 (sibling — sets pattern for AgentsTeam fix waves)
- **PRD-029/030/031 + EVID-045/046/047** — Wave 12.B-fix-1/2/3 precedents
- **CLAUDE.md** — tier-table doc fix (FR-003)
- **ADR-009** — `@gertsai/rest-request-manager` invariants (rate-limiter token-bucket per Amendment 1.2.7)

Refs: PRD-033 (precedent), EVID-048 (sources).




