---
depth: standard
id: PRD-014
kind: prd
last_modified_at: 2026-05-13T08:24:51.285189+00:00
last_modified_by: claude-code/2.1.139
links:
- target: EVID-029
  relation: informs
- target: PRD-013
  relation: informs
status: active
title: Wave 8.3 audit-deferred closure — hex inversion, embedder DI/concurrency, README, RFC-009 drift
---

# PRD-014: Wave 8.3 — audit-deferred closure (hex inversion, embedder DI/concurrency, README, RFC-009 drift)

## Problem Statement

The Wave 8.2 audit (AUDIT-2026-05-12-215927, see EVID-029) closed 1 CRITICAL + 12 HIGH findings inline. Five further findings — three HIGH and two MEDIUM — were explicitly **deferred** because they require architectural refactor (not a Standard tactical patch). Specifically:

| Deferred finding | Audit ref | Severity | Why deferred |
|---|---|---|---|
| Hex inversion `application/ → composition/` | Arch #1 | HIGH | Touches 5 application/service files + 3 tests + depcruise rule; requires neutral `src/shared/` kernel folder. |
| Module-level `_manager` singletons → composition-root DI | Arch #4 | MED | Ctor signature change on both embedders; backwards-compat needs an optional opt. |
| Serial `embed()` loop → bounded concurrency | Perf #1 | HIGH | Behavioural change in hot path; needs `p-limit` dep + benchmark scaffold. |
| m9s-example README — Wave 8.1+ modernisation section | Docs #2 | HIGH | New documentation; should reference composition facade, RestRequestManager idiom, audit-closure history. |
| RFC-009 signature drift vs shipped code | Docs #9 | MED | `createAppLogger`/`permissionDenied`/`RestRequestManagerOpts` examples diverge from real API after Wave 8.1 implementation. |

While the example application is currently functional (PR #11 ships green on all 61 tests + 23 RRM tests), each deferred finding represents a credibility gap for the reference application — `application/` importing from `composition/` is the wrong direction for hex consumers; module-level singletons make per-tenant manager scoping impossible; serial embedder loops cap throughput at ~1-2 chunks/sec on warm models with non-trivial latency.

Without a Standard-depth follow-up, these regressions normalise into the example downstream adopters copy.

## Target Audience

| Persona | Pain before Wave 8.3 |
|---|---|
| New `@gertsai/*` adopter (engineering) | Copies m9s-example as-is; inherits the wrong hex direction + a serial embedding loop that does not match production throughput needs. |
| Audit-aware engineer reviewing the example | Sees a documented audit (EVID-029) with five known-open items; lower trust score for the reference app. |
| Composition-root maintainer | Cannot inject a custom `RestRequestManager` (e.g. with shared TLS cert pinning or per-tenant rate-limit) without rewriting embedders. |
| Performance-tuning operator | Stuck with serial loop; cannot raise throughput via `EMBEDDER_CONCURRENCY` env knob. |
| RFC reader (six months from now) | Code blocks in RFC-009 are not copy-pasteable. |

## Goals

1. **G-1 — Hex direction restored**: `application/` and `services/` directories no longer import from `composition/`. New `src/shared/errors.ts` houses the `permissionDenied()` factory + `@gertsai/errors` re-exports. `composition/errors.ts` shrinks to the HTTP-boundary scrubber only (its single piece of actual *wiring*). Measured by `pnpm exec depcruise` 0 violations + new rule `from: ^src/application/, ^src/services/ to: ^src/composition/ severity: error`. Closes audit Arch#1.

2. **G-2 — Embedder DI optionality**: Both `OllamaEmbedder` and `OpenAIEmbedder` ctors accept `manager?: RestRequestManager`. When provided, the embedder uses the injected manager. When absent, falls back to the existing per-hostname Map (Wave 8.2 behaviour). Composition root `src/composition/infrastructure.ts` constructs one `RestRequestManager` per embedder type with full SSRF/security config and injects it. Closes audit Arch#4.

3. **G-3 — Bounded concurrency**: `OllamaEmbedder.embed(texts)` replaces the serial `for ... await embedOne(text)` loop with `Promise.all(texts.map(t => limit(() => embedOne(t))))` using `p-limit`. Concurrency floor `EMBEDDER_CONCURRENCY ?? 4`. Benchmark scaffold `examples/m9s-example/scripts/bench-embedder.ts` records throughput at N ∈ {1, 4, 8, 16} for a 100-chunk synthetic batch. Closes audit Perf#1.

4. **G-4 — m9s-example README modernisation**: New section "Wave 8.1+ — composition facade + hardened HTTP modernisation" with: (a) `composition/{logger}.ts` + `shared/errors.ts` pattern explanation, (b) `RestRequestManager`-fronted HTTP + SSRF posture + `allowedHostnames` idiom, (c) Wave 8.2 audit closure history (link to EVID-029), (d) adoption checklist for downstream apps, (e) migration recipe `PermissionDeniedError` → `permissionDenied()` / `ForbiddenError`. Closes audit Docs#2.

5. **G-5 — RFC-009 drift fix**: `forgeplan_update RFC-009` aligns the pre-seed code blocks with the real shipped API (`createAppLogger(moduleName)` not `createAppLogger(name)`, `permissionDenied(...): ForbiddenError<{userId; action; resource}>` not `: AppError`, real `RestRequestManagerOpts` field names). Closes audit Docs#9.

6. **G-6 — Backwards compatibility**: No behavioural change for existing call sites without the new ctor opt. All current 61 m9s-example tests pass unchanged. The 23 `@gertsai/rest-request-manager` tests pass unchanged (no package source modified — Wave 8.3 is application-only after the Wave 8.1 `security` plumbing already shipped).

7. **G-7 — Strict floor preserved**: `pnpm exec tspc --noEmit` exit 0 across m9s-example. EOPT + `noUncheckedIndexedAccess` honoured. No `@ts-expect-error`. RFC-006 canonical patterns where optional-property friction surfaces.

## Functional Requirements

- **FR-1** — `examples/m9s-example/src/shared/errors.ts` exists and re-exports the `@gertsai/errors` taxonomy + `permissionDenied()` factory. Pure data layer — no `@gertsai/errors/http` import, no scrubbing logic.
- **FR-2** — `composition/errors.ts` retains ONLY the `appErrorToHttpResponse` wrapper that scrubs HTTP-boundary details (Wave 8.2 Sec#3 behaviour preserved). Re-exports `ProblemDetails` type for callers.
- **FR-3** — `src/application/IngestDocumentUseCase.ts`, `src/application/SearchDocumentsUseCase.ts`, `src/services/ingest/src/actions/ingest-document.action.ts`, `src/services/ingest/src/queues/ingest-chunk.worker.ts`, `src/services/search/src/actions/search-query.action.ts` all import error types from `../shared/errors.js` (relative) — NOT from `../composition/errors.js`.
- **FR-4** — `tests/ingest-use-case.test.ts`, `tests/search-use-case.test.ts`, `tests/error-taxonomy.test.ts` import from `../src/shared/errors.js` (Wave 8.2 references to `composition/errors.js` updated).
- **FR-5** — `.dependency-cruiser.cjs` includes a new rule `application-cannot-import-composition` (severity: error) blocking `from: ^src/application/` AND `from: ^src/services/` to `^src/composition/`.
- **FR-6** — `OllamaEmbedderOptions.manager?: RestRequestManager` and `OpenAIEmbedderOptions.manager?: RestRequestManager` declared. When set, embedder uses it. When unset, falls back to existing per-hostname Map factory.
- **FR-7** — `src/composition/infrastructure.ts` constructs one `RestRequestManager` for the Ollama path (with `allowedHostnames: [hostname]` per `EMBEDDER_URL`) and one for OpenAI (no localhost allowlist), and injects via the new ctor opt. Existing AllowAllPermissionGate / OpenFgaPermissionGate construction unchanged.
- **FR-8** — `OllamaEmbedder.embed(texts)` uses `p-limit` with concurrency `EMBEDDER_CONCURRENCY ?? 4`. OpenAI embedder unchanged (single-call batch).
- **FR-9** — `examples/m9s-example/package.json` declares `p-limit ^6.x` as a runtime dep.
- **FR-10** — `examples/m9s-example/scripts/bench-embedder.ts` runs a synthetic 100-chunk batch against a `MockEmbedder`-like stub at concurrency ∈ {1, 4, 8, 16}, emits a single-line CSV per N + a `console.table` summary. Invoked via new `pnpm bench:embedder` script.
- **FR-11** — `examples/m9s-example/README.md` includes the new "Wave 8.1+ — composition facade + hardened HTTP modernisation" section after the existing Wave 5 stack reference. Content matches the audit-closure narrative.
- **FR-12** — RFC-009 body updated via `forgeplan_update` so pre-seed code blocks match real shipped signatures.
- **FR-13** — All quality gates green: `pnpm -F m9s-example {typecheck, test, build}` + `pnpm -F @gertsai/rest-request-manager test` + `pnpm exec depcruise` (within m9s-example).

## Non-Functional Requirements

| ID | Category | Constraint | Measurement |
|---|---|---|---|
| NFR-1 | Reversibility | Single `git revert <merge-commit>` restores pre-Wave-8.3 state | Manual smoke |
| NFR-2 | Compat | Existing 61 m9s tests pass without modification (only import paths shift); rest-request-manager 23 tests untouched | vitest exit 0 |
| NFR-3 | LOC budget | Production code delta ≤ 350 LOC; test delta ≤ 50 LOC; markdown delta ≤ 120 LOC | `git diff --stat` |
| NFR-4 | New external dep | Exactly 1 new external dep (`p-limit`); all others workspace internal | `package.json` diff |
| NFR-5 | Strict floor | `tspc --noEmit` exit 0 with EOPT + noUncheckedIndexedAccess | TS compiler |
| NFR-6 | Audit-trail | EVID-030 with `## Structured Fields` block (verdict / congruence_level / evidence_type) informs PRD-014 | `forgeplan_score PRD-014` ≥ 0.5 |
| NFR-7 | depcruise enforcement | New `application-cannot-import-composition` rule prevents future regression | `pnpm exec depcruise --validate` exit 0 |

## Out of Scope

- **Workspace-wide oxlint sweep** (1511 warnings) — separate Wave 8.4 candidate.
- **PRD-008 deferred items** (CheckPermissionOptions discriminated XOR, IamEventType reconciliation) — behavioural decisions, not type-only, separate RFC.
- **npm publish v0.2.0 / v0.3.0** — IRREVERSIBLE, requires explicit per-package user Y.
- **OpenAI embedder concurrency** — already single-call batched (`input: string[]`); no loop to bound. If a future regression splits into per-string calls, revisit.
- **Removing the per-hostname Map fallback in embedders** — keeping it preserves NFR-2; can remove in Wave 8.4+ once all known call sites are migrated.
- **Adding a TimestampProvider DI** — audit Logic#5 deferred (low-priority, not in audit's HIGH list).
- **Test relocation conventions** — m9s uses `tests/`, packages use `src/__tests__/`; documented divergence is acceptable per Wave 8.2 audit Arch#8.

## Risks & Mitigations

| ID | Risk | Probability | Impact | Mitigation |
|---|---|---|---|---|
| R-1 | `pLimit(4)` overwhelms Ollama on cold model load (first call takes 30s+) | Medium | Medium | Conservative default 4; documented `EMBEDDER_CONCURRENCY` knob; bench script demonstrates impact |
| R-2 | Hex inversion fix breaks an unforeseen import path | Low | Medium | Comprehensive grep of `composition/errors` references before/after; depcruiser rule catches missed sites at CI |
| R-3 | `p-limit ^6.x` is ESM-only; build chain on m9s-example uses CommonJS via tspc | Medium | Medium | `p-limit ^6.x` is ESM-only; if incompatible with `tspc` CommonJS output, downgrade to `p-limit ^5.x` (last CJS-friendly) OR use a tiny in-repo semaphore (~20 LOC) — both are acceptable fallbacks |
| R-4 | Composition root DI refactor introduces a subtle init-order issue (manager constructed before env vars loaded) | Low | High | `config` import already loaded before `infrastructure.ts` per existing Sprint 3.11 pattern; verified by tracing project.config.ts module load order |
| R-5 | Bench script depends on a synthetic embedder stub; not representative of real Ollama performance | Confirmed | Low | Bench is for *bounded vs serial* relative comparison, not absolute throughput. Documented in script header. |
| R-6 | RFC-009 forgeplan_update creates frontmatter diff that conflicts with PR #11 base | Low | Low | RFC-009 was activated in Wave 8.1; only body edits flow through `forgeplan_update`; trailing-newline-only diffs from earlier sessions already showed clean revert patterns |

## Strategy (high level — RFC-010 will detail)

**Single-wave AgentsTeam pattern with full pre-seed avoidance** (no shared skeletons needed — file ownership is naturally disjoint after Wave 8.2):

- 3 parallel teammates, all `general-purpose` subagent_type
- Disjoint file ownership: Agent 1 owns `shared/` + import-update sites + depcruise; Agent 2 owns both embedders + `composition/infrastructure.ts` + bench + package.json; Agent 3 owns README only
- Team-lead handles RFC-009 forgeplan_update (single MCP call, no agent needed)
- Chain on `chore/wave-8-2-audit-fixes` branch (user-approved per pre-flight gate)
- Standard depth — PRD-014 + RFC-010 + EVID-030, no SPEC, no ADR (existing ADR-013 + RFC-006 + audit EVID-029 already cover the rationale)

## Related Artifacts

| Artifact | Relation |
|---|---|
| EVID-029 | informs — audit findings inventory + deferred-items table that drove this PRD |
| PRD-013 / RFC-009 / EVID-028 | informs — Wave 8.1 parent (this is the closure-of-deferred follow-up) |
| ADR-013 | informs — Wave 7.2 tri-state capability contract preserved |
| RFC-006 | informs — canonical EOPT patterns for teammates |
| RFC-007 | informs — Wave 7.4 LruTtlMap precedent referenced in embedder DI rationale |
| RFC-010 (next) | refines — Wave 8.3 implementation strategy + 3-teammate ownership map |
| EVID-030 (next) | informs — Wave 8.3 ship evidence |

## Affected Files

**New**:
- `examples/m9s-example/src/shared/errors.ts` (~30 LOC)
- `examples/m9s-example/scripts/bench-embedder.ts` (~80 LOC)

**Modified**:
- `examples/m9s-example/src/composition/errors.ts` (shrink to scrubber only, ~-30 / +5 LOC)
- `examples/m9s-example/src/application/IngestDocumentUseCase.ts` (import path swap, 1 line)
- `examples/m9s-example/src/application/SearchDocumentsUseCase.ts` (1 line)
- `examples/m9s-example/src/services/ingest/src/actions/ingest-document.action.ts` (1 line)
- `examples/m9s-example/src/services/ingest/src/queues/ingest-chunk.worker.ts` (1 line)
- `examples/m9s-example/src/services/search/src/actions/search-query.action.ts` (1-2 lines — ValidationError import already there)
- `examples/m9s-example/src/infrastructure/ollama-embedder.ts` (DI ctor opt + p-limit loop, ~60 LOC)
- `examples/m9s-example/src/infrastructure/openai-embedder.ts` (DI ctor opt, ~30 LOC)
- `examples/m9s-example/src/composition/infrastructure.ts` (RestRequestManager factory + inject, ~40 LOC)
- `examples/m9s-example/tests/ingest-use-case.test.ts` (import path swap, 1 line)
- `examples/m9s-example/tests/search-use-case.test.ts` (1 line)
- `examples/m9s-example/tests/error-taxonomy.test.ts` (1 line)
- `examples/m9s-example/tests/embedder-hardening.test.ts` (+1 test for injected-manager precedence)
- `examples/m9s-example/tests/embedder-retry.test.ts` (verify injected path still passes; likely no edit needed)
- `examples/m9s-example/package.json` (p-limit dep + bench script)
- `examples/m9s-example/.env.example` (EMBEDDER_CONCURRENCY documentation)
- `examples/m9s-example/.dependency-cruiser.cjs` (new rule)
- `examples/m9s-example/README.md` (new section ~80 markdown lines)
- `.forgeplan/rfcs/RFC-009-...md` (forgeplan_update body — drift fix)

**Total**: 19 files touched · 2 new (shared/errors.ts + bench-embedder.ts) · ~320 LOC production + ~50 test + ~80 markdown.

## Acceptance Gate

PRD-014 satisfied when:
1. All 7 goals (G-1..G-7) measured PASS
2. All 13 FRs verified by code review + smoke
3. All 7 NFRs spot-checked
4. EVID-030 records: (a) `grep -rn 'composition/errors' src/` returns 0 hits in application/services dirs, (b) `pnpm exec depcruise` exit 0 + new rule active, (c) bench output recorded for the 4 concurrency levels, (d) 61+ tests pass (incl. 1 new for DI precedence), (e) `pnpm -F m9s-example {typecheck, test, build}` all exit 0, (f) workspace-wide build remains green.





