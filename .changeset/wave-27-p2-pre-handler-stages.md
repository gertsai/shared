---
'@gertsai/api-core': patch
---

Wave 27 PR-2 — extract pre-handler stages 1-5 into `@gertsai/api-core/pipeline`.

Stages 1-5 of the 13-stage `_createActionSchema` closure (per SPEC-021) are now standalone exported functions:

- **Stage 1 `extractParams`** — PRESERVED VERBATIM from `ApiController.class.ts:730-746`. Resolves `params`/`file`/`fileMeta` from `ctx.meta.$params` vs `ctx.params`.
- **Stage 2 `mergeMultipart`** — PRESERVED VERBATIM from `ApiController.class.ts:748-750`. `Object.assign(params, ctx.meta.$multipart)` when present.
- **Stage 3 `coerceQueryString`** — PRESERVED VERBATIM from `ApiController.class.ts:753-774`. Legacy `coerceQueryParams` vs typia `smartCoerce` per REST method.
- **Stage 4 `injectTenantId`** — PRESERVED VERBATIM from `ApiController.class.ts:779-782`. Auto-pop `tenantId` from `ctx.meta` into params.
- **Stage 5 `validateRequest`** — PRESERVED VERBATIM from `ApiController.class.ts:785-790`. Typia validator + `APIError(BAD_REQUEST__INVALID_PARAMS)` throw.

**`_createActionSchema` change**: 62 LOC of inline stages 1-5 replaced with 16-LOC `runStagesSerially([stage1..stage5], ctx, deps)` bridge call. Stages 6-13 stay inline (PR-3/4 will extract). No behaviour change.

**New helper**: `runStagesSerially(stages, initial, deps)` — temporary bridge between the still-monolithic closure (stages 6-13) and extracted stages 1-5. Will be retired in PR-4 when the full `PipelineRunner` orchestrates everything.

**Tests**: +33 new (5×stage averaging 6.2 tests/stage + 2 for `runStagesSerially`). Total api-core test count: 337/337 passing.

**Verification**:
- `pnpm --filter @gertsai/api-core build` — dual ESM+CJS green
- `pnpm --filter @gertsai/api-core typecheck` — 0 errors
- `pnpm --filter @gertsai/api-core test` — 337 passed
- `pnpm typecheck` workspace-wide — 0 errors

**Behaviour preservation**: zero changes to externally-observable behaviour. Same `APIError(BAD_REQUEST__INVALID_PARAMS)` codes, same `params`/`file`/`fileMeta` shape, same coercion semantics. Verified by 18 pre-existing api-core integration tests still passing post-extraction.

Refs: PRD-065, SPEC-021 §Stages 1-5, RFC-027 §PR-2
