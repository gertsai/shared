---
depth: standard
id: EVID-025
kind: evidence
last_modified_at: 2026-05-12T18:24:02.183891+00:00
last_modified_by: claude-code/2.1.139
links:
- target: PRD-010
  relation: informs
- target: RFC-006
  relation: informs
status: active
title: Wave 7.3b ship evidence — exactOptionalPropertyTypes enabled workspace-wide, 5-agent parallel sprint
---

# EVID-025: Wave 7.3b ship evidence — `exactOptionalPropertyTypes` enabled workspace-wide via 5-agent parallel sprint

## Structured Fields
- **verdict:** supports
- **congruence_level:** CL3
- **evidence_type:** workspace typecheck + test suite + build + depcruise + oxlint + parallel teammate reports

CL3 because all measurements ran in this workspace against the target system (same monorepo, same Node 22, same dependencies). Verdict `supports` because every PRD-010 FR and NFR measured and PASSED. The 5 parallel teammates spawned via /sprint methodology each reported 0 errors in their owned files; the team-lead (main thread) verified workspace-wide.

## Summary

Wave 7.3b (PRD-010) rollout completed across two phased commits:

1. **`b996367` refactor (Wave 7.3b.1 + 7.3b.2 partial — main-thread serial)** — 16 packages + core/hooks/decorators canonical EOPT fixes (~132 errors fixed, including 16 in core decorators batch).
2. **Wave 7.3b.3 — 5-agent parallel sprint (this evidence)** — 5 teammates spawned in parallel via Agent tool, each owning a disjoint subset of files:
   - **core-errors-files/v1** — 5 files (`errors.ts` + `retry.ts` + `rag/types/errors.ts` + `lru-cache.ts` + `lru-cache.example.ts`) — **21 errors fixed**
   - **core-llm-files/v1** — 6 files (`llm/routing.ts`, `llm/base.ts`, 3 provider files, `text/extraction/llm-extractor.ts`) — **31 errors fixed**
   - **core-hooks-files/v1** — 3 files (`hooks/context.ts` + `manager.ts` + `executor.ts`) — **18 errors fixed**
   - **core-misc-files/v1** — 12 files (deny-ledger × 3, session × 2, query/types, connectors/acl, tokenization × 2, text/splitters × 2, text/readers/directory) — **21 errors fixed**
   - **m9s-example-files/v1** — 11 files in `examples/m9s-example/src/**` — **16 errors fixed**

**Total Wave 7.3b: 239 EOPT errors fixed canonically** (132 serial + 107 parallel). 17/17 packages clean + 1 example clean. Flag flipped, all gates green.

The team-lead also resolved 1 mid-run regression: the canonical conditional spread inside an object literal in `llm/extraction/llm-extractor.ts` conflicted with the surrounding `typia.createValidate<T>()` transform (UnpluginTypia). Refactored to the **mutable-build** pattern (canonical pattern #2) which keeps the literal free of conditional spreads — typia transform happy, EOPT happy, test green.

## Pilot Baseline (re-captured before parallel agent spawn)

- 91 remaining errors in `@gertsai/core` across 25 files (after Wave 7.3b.2 serial work)
- 16 errors in `examples/m9s-example`
- Workspace typecheck wall-clock: ~12s with EOPT disabled (post-7.3a, post-7.3b prep)

## Changes Applied (Wave 7.3b.3 5-agent parallel)

### tsconfig change

- `tsconfig.base.json` — added `"exactOptionalPropertyTypes": true` adjacent to `noUncheckedIndexedAccess` (FR-1 + G-1)

### Source fixes (per-package counts; teammates owned disjoint files)

| Package / scope | Errors fixed by parallel teammates | Lead patterns |
|---|---|---|
| `@gertsai/core` errors+utility (5 files) | 21 | mutable-build (GertsError.toJSON), conditional-assignment in ctors (RateLimitError, ConnectorError, LRUCache), conditional spread on super() calls |
| `@gertsai/core` llm (6 files) | 31 | conditional spread in LLMConfig/LLMResponse/LLMRouterSelectionEvent/ModelRouter* builders, conditional assignment in BaseLLM/AnthropicProvider/OpenAIProvider/GeminiProvider ctors, `Exclude<T['key'], undefined>` cast for mapStopReason return |
| `@gertsai/core` hooks (3 files) | 18 | conditional assignment in LLMCallContext/ToolCallContext ctors, conditional spread on clone(), 6× HookManager.register*Hook call sites, 4× HookExecutor filter-arg builders, HookExecutionEvent envelope |
| `@gertsai/core` misc (12 files) | 21 | conditional spread (dominant), conditional assignment in QueryError ctor, named non-undefined union in tenant-config merge, destructure-strip pattern in applyTenantConfigUpdate, own-property pattern in cached tokenizer |
| `examples/m9s-example` (11 files) | 16 | conditional spread in createDocument factory, all use-case execute() call sites, both IDocumentStore impls, OpenFgaPermissionGate, ApiController.Start invocation, Exclude<…> cast on IngestProcessWorkflow metadata indexed access |
| **Total parallel** | **107** | — |
| **Cumulative Wave 7.3b** | **239** | — |

### Mid-run regression fix (team-lead)

After parallel teammates reported success, full workspace typecheck was 0 errors but `pnpm test` failed in `@gertsai/core` `llm-extractor.test.ts` with a `vite:esbuild` parse error around `r.predicate.toUpperCase()) {)` in the typia-transformed output of `llm-extractor.ts`. Root cause: the parallel teammate (`core-llm-files/v1`) applied conditional spread inside the `Triplet.predicate` object literal, which the `UnpluginTypia` plugin's transform did not flatten correctly (it tried to inject validator code at a position adjacent to the spread expression).

Team-lead fix: replaced the conditional spread with the **mutable-build** pattern (canonical #2) — build `predicate: Mutable<Predicate> = {...}` first, mutate `predicate.evidence` only when defined, then reference the bound variable in the `Triplet` literal. Both typecheck (0 errors) and `vitest run llm-extractor.test.ts` (24/24 pass) green after the fix. This is a useful pattern-selection lesson: when typia's runtime-validator transform is in scope, prefer mutable-build over conditional-spread for the object whose type is typia-validated.

### Quality-gate measurements (final, after EOPT enabled workspace-wide)

| Gate | Result | Threshold | Status |
|---|---|---|---|
| `pnpm typecheck` exit code | 0 | 0 (FR-2) | ✅ |
| `pnpm typecheck` wall-clock | 10.7s | ≤ 1.2 × 14.8s Wave-7.3a baseline = 17.8s (NFR-2) | ✅ (0.72× = 28% faster) |
| `pnpm test` exit code | 0 | 0 (FR-3) | ✅ |
| `pnpm test` pass count | 4953 | ≥ baseline (4953) | ✅ (parity) |
| `pnpm test` skip count | 102 | ≤ 103 baseline | ✅ |
| `pnpm build` exit code | 0 | 0 (FR-4) | ✅ |
| `pnpm depcruise` violations | 0 | 0 (FR-5) | ✅ (119 modules) |
| `pnpm oxlint` errors | 0 | 0 (FR-5) | ✅ (1481 warnings — pre-existing style polish, non-blocking) |
| `grep exactOptionalPropertyTypes tsconfig.base.json` | match | match (FR-1) | ✅ |

### Pattern selection audit (per RFC-006 canonical patterns; per user feedback: no workarounds)

NONE of the rejected workarounds were used anywhere in Wave 7.3b:
- **Zero** instances of `field?: T | undefined` widening of public types
- **Zero** per-package `exactOptionalPropertyTypes: false` opt-outs
- **Zero** new `// @ts-expect-error` or `// @ts-ignore` in production
- **Zero** new `!` non-null assertions added by parallel teammates (one teammate noted a pre-existing `!` in `routing.ts:247` left intact as loop-invariant guarded by the preceding `length === 0` check)

Pattern frequency (from teammate reports):
- **Pattern 1 — Conditional spread**: ~80+ call sites — dominant
- **Pattern 2 — Mutable-build for readonly targets**: ~15 sites (incl. the typia-conflict fix in llm-extractor.ts)
- **Pattern 3 — `delete this.field`**: 4 sites (collection Seq/WeakCollection, m9s-cache memory-driver, api-rlr TypedLuaScript) — applied in serial phase
- **Pattern 4 — Conditional assignment in ctors**: ~20 sites — heavy use in core/llm provider ctors, core/error ctors, core/hooks context ctors
- **Pattern 5 — `Exclude<T, undefined>` cast / named non-undefined union**: 4 sites (errors `SerializedAppCause`, api-core type-guards, llm/providers/anthropic `mapStopReason`, m9s-example IngestProcessWorkflow metadata)
- **Pattern 6 — Type narrowing via `typeof` / `instanceof`**: 3 sites (api-core traceId/parentID, auth-openfga deny entry `instanceof Date`, miscellaneous null|undefined narrowing)

### DTS audit (NFR-3)

The `noUncheckedIndexedAccess` Wave 7.3a evidence audit already covered DTS shape preservation. EOPT additionally tightens emitted `.d.ts` semantics (optional properties no longer accept explicit `undefined`), but ALL canonical fixes ship without changing public optional-property declarations — only the construction sites narrowed. Downstream consumers compiling without EOPT see no change; consumers with EOPT get stricter type-checking that aligns with our public API intent.

### Reversibility audit (NFR-1)

Single `git revert` of either commit (`b996367` for the serial prep + `<this-wave>` for the parallel finish) restores pre-Wave-7.3b state cleanly. The flag flip is one line in `tsconfig.base.json`; the canonical fixes are defensive type-narrowing that retains value independently of the flag (they pass typecheck under both EOPT on/off).

## Pilot-then-Pivot Decision (RFC-006)

Strategy decision applied earlier in the wave:
- Total errors across workspace + `m9s-example`: 222 + 16 = 238
- Max single package: `@gertsai/core` at 107 — **just over the 100 single-package threshold**

Per the canonical-typing user directive (no opt-outs ever), the pivot rule was OVERRIDDEN. core was fixed in full canonically rather than opted out. Outcome confirms this was the correct call — 107 core errors fixed across 25 files using the same 6 patterns that worked for smaller packages.

## Cross-references

| Artifact | Relation |
|---|---|
| PRD-010 | informs (this evidence pack — Wave 7.3b requirements) |
| RFC-006 | informs (this evidence pack — Big Bang with type-widening preference, later overridden to omit-only canon per user feedback) |
| PRD-009 / RFC-005 / EVID-024 | informs (Wave 7.3a precedent — strict-flag pair completion) |
| PRD-008 | informs (Wave 7 closure context) |

## Notes

- Wave 7.3b consumed 3 separate forge-cycle sessions across the day. The 5-agent parallel finish demonstrates the /sprint AgentsTeam pattern at scale — team-lead in main thread coordinates, 5 teammates work in their own contexts on disjoint file ownership, all reporting back to team-lead for final verification + commit. Total cumulative LOC across all canonical fixes: ~640 lines modified across ~70 files.
- User directive codified in Hindsight memory (saved 2026-05-12): "canonical EOPT only — no widening, no opt-outs, no `@ts-expect-error`, minimal `!`". All 239 errors fixed in compliance.
- Typia transform sensitivity (one regression caught at the test phase, not typecheck) reinforces the canonical-pattern-selection rule: prefer mutable-build over conditional-spread when the target type participates in a typia code-gen path. Codified in this evidence; future EOPT work in core/typia-touched packages should default to mutable-build for object construction.
- oxlint warning count (1481) is pre-existing style polish and not a Wave 7.3b regression.




