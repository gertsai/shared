---
depth: standard
id: RFC-010
kind: rfc
last_modified_at: 2026-05-13T08:26:21.172074+00:00
last_modified_by: claude-code/2.1.139
links:
- target: PRD-014
  relation: refines
- target: EVID-029
  relation: informs
- target: RFC-009
  relation: informs
status: active
title: Wave 8.3 strategy — chain on 8.2, 3 parallel teammates with disjoint ownership, shared/errors kernel relocation
---

# RFC-010: Wave 8.3 strategy — chain on 8.2, 3 parallel teammates with disjoint ownership, shared/errors kernel relocation

## Summary

Close the 5 audit-deferred items from EVID-029 in a single AgentsTeam wave. Branch chains on `chore/wave-8-2-audit-fixes` (PR #11 OPEN at execution time — user-approved). 3 parallel `general-purpose` teammates own naturally disjoint file sets. Team-lead handles RFC-009 drift fix via `forgeplan_update` (no agent needed). Standard depth — PRD-014 + this RFC + EVID-030, no SPEC, no ADR.

## Motivation

PRD-014 specifies WHAT (5 deferred items, 7 goals, 13 FRs). RFC-010 specifies HOW: file-ownership map, teammate prompt contracts, the `p-limit` ESM/CJS escape hatch, and the chain-branch protocol.

## Goals

- **RG-1** — Single-wave execution; 3 parallel teammates with disjoint files; no pre-seed needed (Wave 8.2 already shipped the composition facade — Wave 8.3 only relocates one file).
- **RG-2** — Backwards compatibility absolute: every Wave 8.2 call site that does not pass `manager:` still works (no behavioural change without opt-in).
- **RG-3** — Strict floor preserved: tsc 0 errors with EOPT + noUncheckedIndexedAccess.
- **RG-4** — Audit-trail closure: EVID-030 informs PRD-014; PR description links audit findings to commit hashes.

## Non-Goals

- Modifying `@gertsai/*` package source code (Wave 8.2 already added the only required package change — `security?:` field on `RestRequestManagerOpts`).
- Adding test relocation / convention changes — m9s uses `tests/`, packages use `src/__tests__/`, documented divergence.
- Removing the per-hostname Map fallback in embedders — kept for backwards compat (NFR-2).
- Optimising the bench script for real Ollama — synthetic stub is intentional (compares relative throughput at different concurrencies).

## Options Considered

### Option A — Single wave, 3 parallel teammates, no pre-seed (CHOSEN)

**Description**: Each teammate's file set is naturally disjoint after Wave 8.2 (composition facade already exists; only one file moves). Spawn all 3 in one `Agent` message. Team-lead waits, runs smoke, emits EVID.

**Pros**:
- No pre-seed serialises into team-lead overhead (saving ~30 LOC delay).
- Wave 7.4/7.5/8.1 pattern: 3 teammates × ~100 LOC each = comfortable AgentsTeam ceiling.
- One wave = one `Agent` message = minimal coordination overhead.

**Cons**:
- Agent 1's `shared/errors.ts` is a contract for everyone else's imports BUT Agent 2 doesn't import from it (only embedders, which import from `@gertsai/errors` directly) and Agent 3 only references it conceptually in markdown. So the dependency surface is real but extremely thin — both Agent 2 and Agent 3 can start without Agent 1's deliverable.

### Option B — Pre-seed `shared/errors.ts` first, then spawn

**Description**: Team-lead writes `shared/errors.ts` (~30 LOC) before spawn. Teammates only update imports.

**Pros**: Eliminates even the thin dependency. Pre-seed is small.

**Cons**: Splits hex-inversion work artificially. Agent 1 then becomes "update imports + depcruise rule only" — less than 100 LOC, violates AgentsTeam ceiling minimum. Better to keep cohesive.

### Option C — Sequential waves: Wave-1 (hex + DI in parallel) + Wave-2 (concurrency + docs)

**Description**: Two waves, 2 teammates each.

**Pros**: Smaller blast radius per wave.

**Cons**: 2× orchestration cost; no real cross-wave dependency (concurrency lives in same files as DI — Agent 2 owns both); pure overhead.

**Decision**: Option A. Single wave, 3 teammates, no pre-seed.

## Proposed Direction

### File ownership map (disjoint — verified)

| Teammate | OWNS (NEW + MODIFY) | LOC delta |
|---|---|---|
| **A: `m9s-hex-inversion`** | NEW: `src/shared/errors.ts` (~30 LOC). MODIFY: `src/composition/errors.ts` (shrink to scrubber only, -30/+15), `src/application/IngestDocumentUseCase.ts` (1-line import), `src/application/SearchDocumentsUseCase.ts` (1-line), `src/services/ingest/src/actions/ingest-document.action.ts` (1-line), `src/services/ingest/src/queues/ingest-chunk.worker.ts` (1-line), `src/services/search/src/actions/search-query.action.ts` (1-2 lines — ValidationError already there from Wave 8.2), `tests/ingest-use-case.test.ts` (1-line), `tests/search-use-case.test.ts` (1-line), `tests/error-taxonomy.test.ts` (1-line), `.dependency-cruiser.cjs` (new rule + comment, ~15 LOC) | +30 src / +25 test/config edits |
| **B: `m9s-embedder-di-concurrency`** | MODIFY: `src/infrastructure/ollama-embedder.ts` (DI ctor opt + p-limit, ~60 LOC), `src/infrastructure/openai-embedder.ts` (DI ctor opt, ~30 LOC), `src/composition/infrastructure.ts` (RestRequestManager factory + inject, ~40 LOC), `tests/embedder-hardening.test.ts` (+1 test for DI precedence, ~20 LOC), `package.json` (p-limit dep + bench script), `.env.example` (EMBEDDER_CONCURRENCY doc). NEW: `scripts/bench-embedder.ts` (~80 LOC) | +130 src / +20 test / +80 script |
| **C: `m9s-readme-modernization`** | MODIFY: `README.md` ONLY (~+80 markdown lines) | +80 md |

**Conflict matrix** (file-level, post-Wave-8.2):

|  | A | B | C |
|---|---|---|---|
| A | — | ✓ | ✓ |
| B | ✓ | — | ✓ |
| C | ✓ | ✓ | — |

✅ Fully disjoint. No teammate touches another's files.

### Per-teammate prompt contracts

**Teammate A — `m9s-hex-inversion`** (subagent_type: `general-purpose`):
> Close audit Arch#1 hex inversion. Create `src/shared/errors.ts` re-exporting `@gertsai/errors` taxonomy + the `permissionDenied()` factory (moved verbatim from `composition/errors.ts`). Strip `composition/errors.ts` to ONLY the HTTP-boundary `appErrorToHttpResponse` wrapper that scrubs `userId`/`url`/`originalKind` (Wave 8.2 Sec#3 behaviour preserved). Update 5 application/services import sites + 3 test files to import from `../shared/errors.js` (relative path per file). Add depcruiser rule `application-cannot-import-composition` blocking `from: ^src/application/, ^src/services/ to: ^src/composition/ severity: error`. Verify `pnpm --filter @gertsai-examples/m9s-example exec depcruise --config .dependency-cruiser.cjs src` reports 0 violations + the new rule is active. NO `// @ts-expect-error`. Reference RFC-006 §Catalog if optional-property friction arises. Strict floor (EOPT + noUncheckedIndexedAccess) must pass.

**Teammate B — `m9s-embedder-di-concurrency`** (subagent_type: `general-purpose`):
> Close audit Arch#4 (DI) + Perf#1 (concurrency). Add `p-limit` runtime dep to `examples/m9s-example/package.json` (try `^6.x` first; if ESM-only conflicts with `tspc` CommonJS output, downgrade to `^5.x` which is CJS-friendly — log the choice in your report). Extend `OllamaEmbedderOptions` and `OpenAIEmbedderOptions` interfaces with `readonly manager?: RestRequestManager` (optional ctor opt). Embedder logic: when `opts.manager` provided, use it directly; when absent, fall back to existing per-hostname `Map<hostname, RestRequestManager>` from Wave 8.2 (do NOT remove the fallback). Replace `OllamaEmbedder.embed(texts)` serial `for ... await embedOne(text)` loop with `Promise.all(texts.map(t => limit(() => this.embedOne(t))))` using `pLimit(parseConcurrency())` where `parseConcurrency()` reads `process.env.EMBEDDER_CONCURRENCY` with default 4 + NaN/<=0 guard. OpenAI embedder unchanged (single-call batch). Update `composition/infrastructure.ts` to construct one `RestRequestManager` per embedder type with full Wave 8.1+8.2 SSRF/security config (Ollama: `allowedHostnames: [hostname]`; OpenAI: no localhost allowlist) and inject via the new ctor opt. Add 1 test in `tests/embedder-hardening.test.ts` asserting that an injected `manager` takes precedence over the lazy Map (instantiate embedder with a mock manager, call `embed`, assert the mock was used). Create `scripts/bench-embedder.ts` (~80 LOC) that imports `OllamaEmbedder`, stubs the manager via a counting fake, runs a 100-item batch at concurrency ∈ {1, 4, 8, 16}, emits `console.table` with `concurrency`, `totalMs`, `throughputItemsPerSec`. Add `"bench:embedder": "ts-node scripts/bench-embedder.ts"` to `package.json` scripts. Document `EMBEDDER_CONCURRENCY` (default 4) in `.env.example`. Strict floor must pass. All 23+ rest-request-manager tests must remain green (no rest-request-manager source touched).

**Teammate C — `m9s-readme-modernization`** (subagent_type: `general-purpose`):
> Close audit Docs#2 — new section in `examples/m9s-example/README.md` "Wave 8.1+ — composition facade + hardened HTTP modernisation". Place it AFTER the existing "Wave 5 stack reference" section. Cover: (a) the composition facade pattern — what `src/composition/{logger}.ts` + `src/shared/errors.ts` (post-Wave-8.3) are for, why a facade vs direct package import; (b) `RestRequestManager`-fronted HTTP — SSRF posture, `allowedHostnames` idiom, retry+CB defaults, the Wave 8.1 + Wave 8.2 + Wave 8.3 progression; (c) Wave 8.2 audit closure narrative — link to EVID-029 for full findings list; reference the 6 expert lenses; (d) adoption checklist for downstream apps — copy verbatim / copy with tuning / do NOT copy categories; (e) migration recipe `PermissionDeniedError` → `permissionDenied()` (now in `shared/errors.ts`) → `ForbiddenError` → `appErrorToHttpResponse`. Cross-reference real ADR/PRD/RFC IDs via GitHub repo URLs (`https://github.com/gertsai/shared/blob/main/.forgeplan/...`). NO code execution. NO LOC counts in prose. Tone match existing Wave 4/Wave 5 stack reference sections.

### Implementation Phases

**Phase 0 — Pre-flight (team-lead, ~5 min)**:
- Branch already created (`chore/wave-8-3-audit-deferred-closure` off `chore/wave-8-2-audit-fixes`).
- Forgeplan claim PRD-014 (team-lead umbrella, TTL 120min).
- No skeleton pre-seed needed — file ownership naturally disjoint.

**Phase 1 — 3 parallel teammates (~40 min wall-clock)**:
- Spawn all 3 in a single `Agent` tool message with `subagent_type: general-purpose`.
- Each teammate reads `RFC-010` (this doc) prompt contract verbatim, executes, reports.

**Phase 2 — Team-lead RFC-009 drift fix + smoke (~10 min)**:
- `forgeplan_update RFC-009` body to align pre-seed code blocks with shipped API (Docs#9). Tactical MCP call, no agent.
- Smoke: `pnpm -F m9s-example {typecheck, test, build}` + `pnpm -F @gertsai/rest-request-manager test` + depcruise verify.
- Bench script smoke (optional — run via `pnpm bench:embedder` if Agent B reports it functional).

**Phase 3 — EVID-030 + activate (~10 min)**:
- `forgeplan_new evidence` + `## Structured Fields` block + `forgeplan_link informs PRD-014`.
- `forgeplan_score PRD-014` → R_eff ≥ 0.5 (target ≥ 0.8 with CL3 internal evidence).
- `forgeplan_activate` for PRD-014 + RFC-010 + EVID-030.

**Phase 4 — Ship (~10 min)**:
- Two commits: `feat(m9s-example): close audit-deferred items (Wave 8.3)` + `docs(forgeplan): activate Wave 8.3 artifacts (PRD-014 / RFC-010 / EVID-030)`.
- `git push -u origin chore/wave-8-3-audit-deferred-closure`.
- `gh pr create --base chore/wave-8-2-audit-fixes --fill` (chain pattern per user pre-flight choice; will rebase against main after PR #11 merges, OR PR #12 merges in stack order after #11).
- PR body cross-references: PRD-014, RFC-010, EVID-030, EVID-029 (parent audit).
- `forgeplan_release PRD-014`. Memory retain Group 55.

### Invariants

- **I-1**: Wave 8.2 invariants preserved (SSRF allowedHostnames per host, PII scrub in ProblemDetails, REDACT_KEYS expanded list, capabilities getter memoised, URL validation in ctor).
- **I-2**: Wave 8.1 invariants preserved (composition facade pattern, RestRequestManager-fronted HTTP, capability declaration, error taxonomy).
- **I-3**: Sprint 3.11 ADR-011 invariants preserved (mock fallback, prod-guard, tenant WHERE).
- **I-4**: Strict floor preserved — every modified file passes `tsc` with EOPT + noUncheckedIndexedAccess.
- **I-5**: Backwards compat absolute — existing call sites without `manager:` ctor opt continue to work unchanged.
- **I-6**: depcruiser rule additive — does not weaken any existing rule.
- **I-7**: `@gertsai/*` package source untouched — Wave 8.3 is application-only.

### Acceptance Test (per PRD-014 FRs)

- FR-1..FR-5 — Agent A smoke: `grep -rn 'composition/errors' src/application/ src/services/` returns 0 lines (all paths use `shared/errors`); `pnpm exec depcruise` reports 0 violations + new rule active.
- FR-6..FR-9 — Agent B smoke: `tests/embedder-hardening.test.ts` new DI precedence test PASS; `package.json` lists `p-limit` (and Agent B reports which major version landed).
- FR-10 — `pnpm -F m9s-example bench:embedder` runs and emits the table.
- FR-11 — Agent C output: README has new section.
- FR-12 — Team-lead `forgeplan_update RFC-009` complete.
- FR-13 — All quality gates green.

## Alternatives Considered (rejected)

| Alt | Reason rejected |
|---|---|
| Skip hex inversion, document the smell only | Leaves the example as a bad-pattern template for downstream copy-pasters |
| Make hex inversion mandatory at @gertsai/* package level (depcruiser in repo root) | Out of scope for an example app patch; would block other examples not yet ready |
| Replace per-hostname Map fallback with composition-root-only DI | Breaks backwards compat (NFR-2); future cleanup once all call sites verified migrated |
| Make `EMBEDDER_CONCURRENCY` required | Adds friction without value; default 4 is reasonable |
| Use Promise.all without p-limit | No upper bound → could overwhelm Ollama with 100+ chunks; defeats the point |
| Implement a tiny in-repo semaphore (~20 LOC) | Reasonable fallback if p-limit ESM/CJS conflicts; documented in R-3 mitigation |

## Rollback Plan

- **Tactical revert**: single `git revert <merge-commit>` restores Wave 8.2 state. All teammates' file changes + bench script + README section reverse cleanly.
- **Partial revert**: removing only `p-limit` dep would require also reverting the embedder loop change; teammate B must keep these atomic per their prompt.
- **Forward fix preferred over rollback** — bugs go in Wave 8.4 patch.

## Risks (delta vs PRD-014)

| ID | Risk | Mitigation |
|---|---|---|
| RFC-R-1 | `p-limit ^6.x` ESM-only conflicts with `tspc` CJS output | Agent B prompt explicitly handles this fallback to `^5.x` or in-repo semaphore |
| RFC-R-2 | PR #11 merges with conflict on `composition/errors.ts` (Wave 8.2 modified it; Wave 8.3 shrinks it further) | Chain branching means Wave 8.3 sees Wave 8.2 state; if PR #11 changes are amended pre-merge, rebase Wave 8.3 after #11 merges |
| RFC-R-3 | Composition root DI introduces init-order bug (manager built before env loaded) | Verified by existing module-load pattern in `services/index.ts` (env-loaded before composition/infrastructure.ts imports) |
| RFC-R-4 | depcruiser rule too strict — blocks a legitimate composition→composition import elsewhere | New rule only blocks `application/, services/ → composition/`; intra-composition is allowed (existing rule unchanged) |

## Related Artifacts

| Artifact | Relation |
|---|---|
| PRD-014 | refines — RFC-010 is the strategy detail for PRD-014 |
| EVID-029 | informs — audit findings inventory that drove the work |
| PRD-013 / RFC-009 | informs — Wave 8.1 parent context |
| ADR-013 | informs — Wave 7.2 capability contract preserved |
| RFC-006 | informs — canonical EOPT patterns for teammates |
| RFC-007 | informs — Wave 7.4 LruTtlMap precedent |
| EVID-030 (next) | informs — Wave 8.3 ship evidence




