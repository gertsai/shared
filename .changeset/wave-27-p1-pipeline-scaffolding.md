---
'@gertsai/api-core': patch
---

Wave 27 PR-1 — dormant pipeline scaffolding for action-pipeline extraction.

**No behaviour change.** `_createActionSchema` untouched. PR-1 adds dormant infrastructure that PR-2 onwards will activate per RFC-027 5-PR phased landing plan.

**New `./pipeline` subpath export** (additive, patch-bump-compatible):

- `PipelineContext` — typed per-request state threaded through stages
- `Stage<TIn, TOut>` — `(ctx, deps) => Promise<TOut>` signature
- `PipelineRunner` — sequential stage executor with `translateError` (catch) + `cleanup` (finally) + `PipelineShortCircuit` handling
- `PipelineDeps` — `{ action, controller, service, logger }`
- `PipelineShortCircuit` — sentinel error for raw-response short-circuit
- `StageName` — literal-union of 13 default stage names
- `DEFAULT_STAGES` — empty array placeholder (PR-2/3/4 will fill)
- `translateError` — stage 12 per SPEC-021, PRESERVED VERBATIM from `ApiController.class.ts:892-908`
- `cleanup` — stage 13 per SPEC-021, PRESERVED VERBATIM from `ApiController.class.ts:909-913`

**Tests**: +18 new (9 runner + 5 translate-error + 4 cleanup). All 304 api-core tests green.

**Verification**:
- `pnpm --filter @gertsai/api-core build` — dual ESM+CJS + DTS green for all 5 entrypoints including new `lib/controller/pipeline/index`
- `pnpm --filter @gertsai/api-core typecheck` — 0 errors
- `pnpm --filter @gertsai/api-core test` — 304/304 passed
- `pnpm typecheck` workspace-wide — 0 errors

**Rollback**: pure code refactor, no schema, no migration. Delete `pipeline/` directory + revert `package.json`/`tsup.config.ts` to revert.

Subsequent PRs land stages 1-11 (PR-2/3/4) and `setStageOverride` public API (PR-5) per RFC-027.

Refs: PRD-065, SPEC-021, RFC-027, ADR-015
