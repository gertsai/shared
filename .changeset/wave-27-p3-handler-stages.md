---
'@gertsai/api-core': patch
---

Wave 27 PR-3 — extract handler-invocation stages 6-8 into `@gertsai/api-core/pipeline`.

Stages 6-8 moved into standalone files (PRESERVED VERBATIM per SPEC-021 line-range contracts):

- **Stage 6 `establishAuthSession`** — auth check + session creation. Throws `APIError(NOT_AUTHORIZED)` when `auth: 'required'` without `user_uuid`; calls `sessionFactory` when credentials present.
- **Stage 7 `buildTraceContext`** — W3C traceparent build via `@gertsai/otel/moleculer.buildTraceparent`. Spreads optional `ctx.requestID`, `ctx.id`, `ctx.parentID`, `ctx.tracing` per PRD-052 FR-004.
- **Stage 8 `invokeHandler`** — central `action.options.handler.call(deps.service, deps)` invocation. Assembles deps: `session`, `ctx`, `service`, `params`, `addJob` (wrapped with trace injection), `getQueue`, `files`, `call` (unwraps `.data`), `logger`, `respond`. Stores `{ code, message, data, raw }` in `ctx.result`.

`ApiController._createActionSchema` change: closure shrunk by net 41 LOC. `runStagesSerially` call extended from `[stage1..stage5]` to `[stage1..stage8]`. Stages 9-13 stay inline (PR-4 finishes the rest).

**`PipelineDeps.sessionFactory`** added as **optional** field. Stage 6 throws a clear runtime error if missing when `auth: 'required' | 'optional'`. Optional shape keeps PR-1/PR-2 mock test deps backward-compatible (no required-property breakage).

**`respond` helper** relocated to `pipeline/helpers.ts` (moved out of `ApiController.class.ts` where it was only used by the action handler). Avoids stage → ApiController circular import.

**Tests**: +20 new (7×establishAuthSession + 6×buildTraceContext + 7×invokeHandler). Total api-core test count: **357/357 passing**.

**Verification**:
- `pnpm --filter @gertsai/api-core build` — dual ESM+CJS green
- `pnpm --filter @gertsai/api-core typecheck` — 0 errors
- `pnpm --filter @gertsai/api-core test` — 357 passed
- `pnpm typecheck` workspace-wide — 0 errors

**Behaviour preservation**: zero changes to externally-observable behaviour. Same `APIError(NOT_AUTHORIZED)` codes, same W3C traceparent format, same handler invocation shape with `this` bound to Moleculer service, same job-trace injection semantics.

Refs: PRD-065, SPEC-021 §Stages 6-8, RFC-027 §PR-3
