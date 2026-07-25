# @orchdev/api-core

## 0.8.3

### Patch Changes

- 6aa9efa: fix(api-core): honor the ResponseCode of a transport-serialised APIError instead of collapsing to HTTP 500 (#115)

  An `APIError` thrown from a handler loses its `instanceof` identity when it crosses
  the Moleculer transport boundary (reconstructed as a plain object) or when imported
  from a different installed copy of `@gertsai/api-core` (dual-package hazard). The
  error-translation layer recognised `APIError` only via `instanceof` (plus the
  unrelated `__ORCHESTRA_ERROR__` brand), so such errors fell through to
  `APIError.fromError()` and were re-wrapped as `INTERNAL_ERROR` — e.g.
  `APIError(ResponseCode.CONFLICT)` was served as **HTTP 500 `internal_error`**
  instead of **409**.

  The translation layer now also recognises an `APIError` **structurally** (by
  `name === 'APIError'` / the `__API_ERROR__` brand plus a valid `ResponseCode`
  `code`) via the new `APIError.isAPIErrorLike()` guard, and rebuilds it with the new
  `APIError.fromSerialized()` — preserving the original `code` (and therefore the HTTP
  status) and the already-formatted message verbatim (no double-prefix). Applied at
  all three shared error-translation sites: the pipeline `translateError` stage, the
  Moleculer api-gate `sendError`, and the queue/subscriber error translators in
  `ApiController`.

  Affects every consumer that throws domain `APIError`s with a non-default
  `ResponseCode`. Unblocks gertsai/gerts-hub#9.

## 0.8.2

### Patch Changes

- 4954ce3: Wave 35 — polish 9 of 11 EVID-087 audit follow-ups (2 explicitly deferred).

  5-phase forge-cycle through 4 parallel teammates by disjoint file scope. Closes all actionable polish items from Wave 31/32/33/34 multi-expert audit (8.6/10, APPROVE_WITH_FIXES).

  **Phase A — types + extension API tightening**:

  - **type-W2** (CRIT-priority): `ComposableStageName = Exclude<StageName, 'translateError' | 'cleanup'>` narrows `setStageOverride`/`addStageBefore`/`addStageAfter`/`wrapStage` signatures. Compile-time rejection of `'translateError'`/`'cleanup'` (which are hard-wired in PipelineRunner). Was silent no-op runtime bug.
  - **arch-W1 + type-W1 consensus**: replaced parallel `STAGE_NAMES`/`DEFAULT_STAGES` arrays with single `STAGE_REGISTRY` tuple-array (`as const satisfies`). Eliminates parallel-array drift hazard + `STAGE_NAMES[i]!` non-null assertion. Backward-compat derived exports preserved.
  - **arch-W2**: reverted Wave 33.C W1 cosmetic `sessionFactory` param rename — `user_uuid`/`user_type` now consistent with wire-level Moleculer `ContextMeta` snake_case. JSDoc-only revert.

  **Phase B — middleware edge case hardening**:

  - **logic-W1**: `Array.isArray()` guard on multi-value `x-tenant-id` HTTP header in `tryGetRequestContextFromCtx`. Misleading "Tenant scope violation" replaced with clear "multi-value tenant header" error.
  - **logic-W2**: empty-string `testSession.tenantId=''` now collapses to `undefined` via `normalizedSessionTenantId`. Prevents silent `isInTenant('')` ambiguity downstream.

  **Phase C — test fidelity**:

  - **test-C1** (CRITICAL): replaced impossible assertion in `coercion.test.ts` 4th CRIT-6 test (`expect(typeof __proto__).not.toBe('number')` — always true regardless of guard). New test snapshots `Object.getOwnPropertyNames(Object.prototype)`, runs coerceQueryParams with prototype-pollution payload + legit `limit: '42'`, asserts prototype unchanged + legit value coerced. Now FAILS if guard removed.
  - **test-W1**: widened runner.test.ts `stageTimeoutMs` ratio from 4x (25ms vs 100ms) to 10x (20ms vs 200ms) — reduces slow-CI-runner flake risk.
  - **security-W2**: added AC-A7 + AC-A8 tests covering `addStageAfter` + `wrapStage` sensitive-stage `logger.warn` emission (mirrors AC-A6 for `addStageBefore`).
  - **security-W1**: deferred — testSession gating negative test is structurally untestable inside running Vitest suite (module-load env capture happens before `process.env` mutation can take effect). Requires separate Vitest worker config. Documented for future hardening.

  **Phase D — perf-check + README polish**:

  - **arch-W4**: dropped dead `controller: {}` from `perf-check.mjs` deps literal (PipelineDeps dropped field in Wave 32.C HIGH-5).
  - **logic-W3**: `gatePct <= 0` guard (was `< 0`) — closes DoS-via-bad-baseline vector (a committed `gate_pct: 0` would make any drift fail CI).
  - **arch-W3**: added "Naming boundary" sections to `storage-core/README.md` + `entity-storage/README.md` documenting `_uid` (storage row-id) vs `uuid` (entity JSON) distinction.

  **Phase E — final verification**:

  - `pnpm typecheck` workspace — 0 errors
  - `pnpm --filter @gertsai/api-core test` — **401/401** (399 + 2 new AC-A7/A8)
  - `pnpm --filter @gertsai/session test` — 32/32
  - `pnpm --filter @gertsai-examples/m9s-example typecheck` — 0 errors
  - m9s real-infra test count unchanged (pre-existing Docker timeout, not regression)

  **Bump**: `@gertsai/api-core` PATCH — `ComposableStageName` is a TYPE NARROWING (subset of existing `StageName`). Calls like `setStageOverride('translateError', ...)` that previously compiled but silently no-op'd now FAIL at compile time. This is a strict improvement; existing consumer code that passed 11 valid stage names is unaffected.

  **API impact**: zero public surface breaks for correct consumer code. Only previously-broken-but-silent code (anchor='translateError'/'cleanup') now surfaces as compile error — net positive.

  After Wave 35: EVID-087 9/11 closed (82%), 2 deferred. Combined session audit closure 44/44 unchanged. Project state v1.0-ready.

  Refs: PRD-069, EVID-088 (closure proof), EVID-087 (audit source)

## 0.8.1

### Patch Changes

- Updated dependencies [9de7cf7]
  - @gertsai/core@0.6.0
  - @gertsai/auth-openfga@0.4.1

## 0.8.0

### Minor Changes

- f7549b8: Wave 34 PR-1 — W3 setStageOverride extension API + W9 wrapResponse XSS docs + ledger cosmetic.

  ADI reasoning (Gemini-3-Flash-Preview via forgeplan_reason): H2 (Additive-First Phasing) high-confidence — ship W3+W9+ledger first (additive only), W2 surface-breaking rename follows in PR-2.

  **Phase A — W3 setStageOverride extension API (additive)**:

  Three new public methods on `ApiController` for richer pipeline composition (closes EVID-083 W3 — was deferred as "design decision, future RFC needed"):

  - `addStageBefore(anchor, stage)` — inject custom stage BEFORE named default; multiple calls compose in insertion order (first-pushed runs first)
  - `addStageAfter(anchor, stage)` — inject AFTER; same composition semantics
  - `wrapStage(anchor, wrapper)` — around-advice; multiple wrappers compose onion-style (last-pushed = outermost, post-code runs last)

  All three methods emit `logger.warn` when targeting sensitive stages (`establishAuthSession`/`validateRequest`/`validateResponse`/`injectTenantId`) per Wave 32.D pattern.

  Snapshot isolation matches `setStageOverride` semantics: inserts captured at schema-build time, already-registered actions retain their original pipeline.

  `_createActionSchema` resolves effective stages by composing: `slot.before[] → wrappers(override-or-default) → slot.after[]` per anchor.

  **Phase B — W9 wrapResponse XSS hardening (docs-only)**:

  Added security note to `wrap-response.ts` JSDoc + `ActionOptions.responseMessage` field JSDoc clarifying that `responseMessage` is server-controlled. Pipeline does NOT sanitize at runtime — fail-loud design contract over silent corruption. Closes EVID-083 W9 ("XSS risk from responseMessage") which was deferred as not-an-issue but documenting the contract makes it explicit.

  **Phase C — Ledger cosmetic**:

  PRD-016 advisory phase advanced `shape → done` via `forgeplan_phase_advance`. Wave 10 actually shipped per EVID-038 (linked Wave 33 Phase A); phase metadata now reflects reality. Closes 1 advisory phase mismatch in `forgeplan health`.

  **Tests**: +6 new in `apiController-stage-override.test.ts` (AC-A1..A6 — insertion order, around composition, onion order, sensitive-stage warn). All 399 api-core tests passing (393 + 6).

  **Bump rationale**: `@gertsai/api-core` MINOR — new public extension methods are additive. Existing `setStageOverride` signature unchanged; all consumers binary-compatible.

  **Deferred to Wave 34 PR-2**: W2 workspace-wide `_uid → uuid` rename across `@gertsai/entity` + `@gertsai/core` — surface-breaking minor bump, isolated for clean revert if downstream breaks.

  Refs: PRD-068, EVID-083 W3 + W9, ADI reasoning H2, Wave 32 PRD-066 (`setStageOverride` baseline)

## 0.7.0

### Minor Changes

- 33eacbc: Wave 33 — forgeplan ledger cleanup + EVID-083 W tail + m9s real-infra test debt closed.

  5-phase forge-cycle via 3 teammates (sequential by file scope):

  **Phase A — Retroactive evidence links (forgeplan ledger)**:

  - 10 `informs` links created via MCP: EVID-033/038/040/044..047/048/051/053/055 → PRD-016, RFC-016, RFC-019..026
  - `forgeplan health` blind_spots: **10 → 0**

  **Phase B — Duplicate deprecations (skipped)**:

  - 8 forgeplan health "duplicate" pairs are false positives (different waves: 12.B/12.C/12.D, 13.A/13.B; different package scopes). No actual duplicates.

  **Phase C — EVID-083 W tail (7 of 10 closures)**:

  - **W1** (`@gertsai/api-core`): `PipelineDeps.sessionFactory` params renamed `user_uuid/user_type → operatorUuid/operatorType` (Wave 29.A parity)
  - **W4** (`@gertsai/api-core`): `cleanup.ts` adds `await ctx.session?.$destroy()` (forward-compat with async destroy)
  - **W5** (`@gertsai/api-core`): new optional `PipelineDeps.stageTimeoutMs` + `Promise.race`-based per-stage timeout in runner (DoS mitigation; default undefined preserves current behaviour)
  - **W6** (`@gertsai/api-core`): drop unnecessary `as { success, errors? }` cast in `validate-response.ts`
  - **W7** (`@gertsai/api-core`): drop unnecessary `as QueueTraceContext | undefined` cast in `build-trace-context.ts`
  - **W8** (`@gertsai/api-core`): strip `.value` field from validator error logging in `validate-response.ts` loose mode (PII redaction)
  - **W10** (`@gertsai/session`): validate `operator.uuid` non-empty + `operator.type` non-empty in `Session.$switchOperator` before mutation (pre-mutation rejection prevents half-rotated state)

  **Skipped W findings (out of scope)**:

  - **W2**: workspace-wide `_uid → uuid` rename across `@gertsai/entity` + `@gertsai/core` — major scope, separate decision
  - **W3**: `setStageOverride` extension API (`addStageBefore`/`wrapStage`) — design decision, future RFC needed
  - **W9**: `wrapResponse` XSS hardening — `responseMessage` is server-side, not user input

  **Phase D — m9s real-infra test debt (4 fixes)**:

  - 3 Ollama tests: `REDIS_URL=''` + `STORAGE_PROVIDER=memory` set BEFORE `requireFromHere` (dotenv preserves explicit values); docIds use `randomUUID()` (was non-UUID strings rejected by `PgDocumentRepository.coerceUuid`)
  - 1 BullMQ test: `STORAGE_PROVIDER=memory` (avoids 384-vs-768 vector dim mismatch in MemoryVectorStore which has no dim check)
  - Result: 15 passed / 0 failed (was 11 passed / 4 failed against live Docker stack)

  **Phase E — Final verification (production-validator)**:

  - `pnpm typecheck` workspace: 0 errors
  - `pnpm --filter @gertsai/api-core test`: **393 passed** (+3 since Wave 32: +1 cleanup async, +2 runner timeout)
  - `pnpm --filter @gertsai/session test`: **32 passed** (+2 W10 validation)
  - `pnpm --filter @gertsai/api-core build`: dual ESM+CJS green
  - `pnpm --filter @gertsai/api-core perf:check`: baseline reproducible
  - m9s-example real-infra against live Docker: 15 passed / 0 failed

  **Bump rationale**:

  - `@gertsai/api-core`: **minor** — new `PipelineDeps.stageTimeoutMs` field is additive public surface
  - `@gertsai/session`: **patch** — `$switchOperator` validation is fail-fast on bad input (was silent corruption); no public signature change

  After Wave 33: audit ledger clean, W tail closed where actionable, m9s suite green end-to-end against real infra. Combined Wave 25+31 audit closure: **41/44 findings (93%)**, remaining 3 explicitly deferred with documented rationale.

  Refs: PRD-067, EVID-085 (closure proof), EVID-083 (W tail source), Wave 32 PRD-066.

## 0.6.2

### Patch Changes

- c7f3920: Wave 32 — close 2 CRIT + 9 HIGH from EVID-083 audit (Wave 31 multi-expert review).

  7-phase sequential forge-cycle through 6 teammates by disjoint file scope:

  **Phase A — Security CRIT-1 + CRIT-3 (testSession seam)**:

  - `wave5-middlewares.ts`: `TEST_SESSION_ALLOWED` requires `NODE_ENV !== 'production' && GERTSAI_TEST_SESSION_ALLOW === '1'`
  - Module-load-time throw if `GERTSAI_TEST_SESSION_ALLOW=1` in production (fail-loud)
  - `expectedTenantId` derived from `testSession.tenantId` (single source of truth); throws on header mismatch
  - `vitest.config.ts` sets env for tests

  **Phase B — Security CRIT-6 (prototype pollution)**:

  - `coercion.ts`: `DANGEROUS_KEYS` Set + `if (DANGEROUS_KEYS.has(field)) continue` in 4 coerce helpers
  - +4 tests verifying `Object.prototype` not mutated via `__proto__`/`constructor`/`prototype` field names

  **Phase C — Pipeline core hardening (HIGH-2/5/8/9)**:

  - `runner.ts`: `cleanup(ctx, deps)` wrapped in try/catch in finally; cleanup errors logged via `deps.logger?.error`, original error preserved (JS finally-vs-catch fix)
  - `types.ts` + `ApiController.class.ts`: dropped unused `controller: AnyApiController` field from `PipelineDeps`
  - `establish-auth-session.ts`: removed `meta.user_type as any` cast + `eslint-disable` (newly-introduced regression closed)
  - `wrap-response.ts`: replaced `ctx.result!` non-null with explicit guard + diagnostic error (safe under setStageOverride('invokeHandler', ...))

  **Phase D — setStageOverride threat model (HIGH-4)**:

  - `ApiController.class.ts`: module-private `SENSITIVE_STAGES` Set (4 names: `establishAuthSession`, `validateRequest`, `validateResponse`, `injectTenantId`)
  - `setStageOverride` emits `logger.warn` on sensitive-stage override
  - Enhanced JSDoc with `@security` warning + composition-pattern example
  - README.md: new "Security boundary — sensitive stages" subsection

  **Phase E — Missing tests (HIGH-10/11)**:

  - `cleanup.test.ts`: +1 test for `$destroy() throws` (meets SPEC-021 ≥5 AC)
  - `establish-auth-session.test.ts`: +2 tests for `sessionFactory === undefined` (required + optional)
  - `apiController-stage-override.test.ts`: +2 bonus tests for warn on sensitive/non-sensitive override

  **Phase F — perf-check.mjs hardening (HIGH-3)**:

  - Default `PERF_WARMUP` 200 → 1000 (V8 TurboFan threshold)
  - `parseFiniteIntEnv` / `parseFiniteNumberEnv` validators (NaN-silent-bypass closed)
  - `--dry-run` flag for `--update` mode (poison protection)
  - baseline JSON.parse wrapped (tampering surfaces with distinct exit codes 4-7)
  - dist/ existence check up-front

  **Phase G — Final verification**:

  - `pnpm typecheck` workspace: 0 errors
  - `pnpm --filter @gertsai/api-core test`: 390/390 passing (+5 new since EVID-083)
  - `pnpm --filter @gertsai/api-core build`: dual ESM+CJS green
  - m9s-example: 15 passed, 1 skipped, 1 failed (pre-existing Docker timeout, NOT regression)

  **API impact**: zero public surface breaks. `PipelineDeps.controller` was internal (never documented; no stage used it). `setStageOverride` signature unchanged; `logger.warn` is additive observability.

  After Wave 32: **Wave 25 (EVID-080) + Wave 31 (EVID-083) audit ledgers 100% closed**. Path clear for v1.0 release decision.

  Refs: PRD-066, EVID-083 (Wave 31 audit), EVID-084 (Wave 32 closure proof), Wave 27 PRD-065/SPEC-021/RFC-027/ADR-015.

## 0.6.1

### Patch Changes

- 98f41f1: Wave 29 — final pre-v1.0 polish: M4 uuid rename + bench harness fix + perf gate.

  **@gertsai/session MINOR bump — surface-breaking** (pre-1.0 minor per CLAUDE.md semver policy):

  - **M4 (EVID-080)** — `OperatorRef._uid → OperatorRef.uuid` rename. Parity with the rest of `@gertsai/*` ecosystem (the underscore-prefix was Orchestra-legacy carryover).
    - Type: `interface OperatorRef { readonly uuid: string; readonly type: OperatorType }` (was `_uid`)
    - `Session.$switchOperator(operator)` reads `operator.uuid` (was `operator._uid`)
    - `operator-switched` event emits `{ prev: { uuid, type }, current: { uuid, type } }` (was `_uid`)

  Migration: replace `{ _uid: x, type: y }` with `{ uuid: x, type: y }` at all call-sites passing `OperatorRef` to `Session.$switchOperator`, and update event listeners reading `prev._uid` to `prev.uuid`. No other surface changes.

  **@gertsai/entity-audit patch cascade** — depends on session; behaviour unchanged.

  **@gertsai/api-core patch — bench harness fix + perf gate**:

  - Removed broken vitest experimental `bench` harness (produced NaN samples with vitest 3.x). Replaced with standalone Node perf-check script at `scripts/perf-check.mjs`.
  - New baseline at `packages/api-core/perf-baseline.json` — 10000 samples post-warmup, captured on darwin-arm64 Node 22.18:
    - p50: 1.6μs
    - p95: 3.6μs
    - p99: 6.8μs
  - New npm scripts:
    - `pnpm --filter @gertsai/api-core perf:check` — run + print (no gate)
    - `pnpm --filter @gertsai/api-core perf:update` — capture new baseline (overwrites `perf-baseline.json`)
    - `pnpm --filter @gertsai/api-core perf:gate` — CI regression gate (exits 1 if p95 regression > `PERF_GATE_PCT` env, default 30%)
  - Default gate is **±30%** (not ±2% per RFC-027) because: single-machine variance is high without dedicated bench hardware; baseline is post-extraction (no pre-extraction baseline exists). Future infra can tighten via `PERF_GATE_PCT=5 pnpm perf:gate` on dedicated CI runners.

  **Wave 29.C (m9s-example real-infra smoke)** intentionally NOT bundled into this changeset — requires live Docker stack (Postgres + Redis + NATS + OpenFGA + Ollama). Documented as manual verification step pre-v1.0 release. Per-stage unit tests + integration tests (75+ from Wave 27 + 30+ from session) cover behaviour preservation at the granular level.

  Closes EVID-080 M4 last open finding. After Wave 26 + 28 + 29: **100% of EVID-080 audit findings closed** (HIGH 5/5, MED 7/7, LOW 10/10). v1.0 audit ledger is clean.

  Refs: PRD-064, EVID-080 (Wave 25 audit M4), PRD-065 NFR perf, RFC-027 §Bench plan replacement.

## 0.6.0

### Minor Changes

- e27a5d2: Wave 27 PR-4 — **integration milestone**: extract response-handling stages 9-11 + wire up full `PipelineRunner` orchestrator.

  Stages 9-11 moved into standalone files (PRESERVED VERBATIM per SPEC-021 line-range contracts):

  - **Stage 9 `rawResponseShortcut`** — throws `PipelineShortCircuit(data)` when handler returned `raw: true`. Runner catches outside the `translateError` path and returns data directly without wrapping.
  - **Stage 10 `validateResponse`** — when `config.RESPONSE_VALIDATION === true`, validates handler result against `action.options.response`. Strict mode throws `APIError(BAD_REQUEST__INVALID_RESPONSE)`; loose mode logs error and passes through.
  - **Stage 11 `wrapResponse`** — produces final `{code, message, data}` shape in `ctx.result` with fallback chain `result.code → action.responseCode → ResponseCode.SUCCESS`.

  **`ApiController._createActionSchema`** now a **15-LOC orchestrator** (was 193 LOC in original closure). Full `new PipelineRunner(DEFAULT_STAGES).run(initialCtx, deps)` invocation. All 13 stages now extracted (11 in `DEFAULT_STAGES`; stages 12+13 hard-wired into runner's `catch`/`finally`).

  **`ApiController.class.ts` size**: 1178 LOC → 1005 LOC (-173 LOC, -14.7%). The `_createActionSchema` method itself shrunk from 193 → 25 LOC including method scaffolding (the handler body is just 15 LOC).

  **`PipelineDeps.strictResponseValidation`** added as **optional** field — captured at schema-build time from `ApiController._config.strictResponseValidation`. Chosen over runtime cast `(deps.controller as ...)._config` for type safety and to avoid silent `undefined` if controller shape ever changes.

  **`PipelineRunner.run`** return-value semantics finalised: when `ctx.result.code !== undefined` (always after stage 11), returns `{ success: true, code, message, data }`; otherwise returns `ctx.result?.data` (partial-pipeline edge for tests with empty stages list).

  **`runStagesSerially` retired** — was a temporary bridge during PR-2/3. Removed from `runner.ts`, `index.ts`, and its 2 tests dropped from `__tests__/runner.test.ts`.

  **Minor bump rationale**: this PR makes `@gertsai/api-core/pipeline` subpath reachable as a documented public composition surface (additive). Consumer code can now `import { PipelineRunner, DEFAULT_STAGES, extractParams, ... } from '@gertsai/api-core/pipeline'`. PR-1..PR-3 were `patch` because the pipeline was dormant; PR-4 promotes it to a feature.

  **Tests**: +19 new (6 raw-response-shortcut + 6 validate-response + 7 wrap-response). PipelineRunner tests updated to verify new envelope-return semantics. Total api-core: **376/376 passing**.

  **Verification**:

  - `pnpm --filter @gertsai/api-core build` — dual ESM+CJS green
  - `pnpm --filter @gertsai/api-core typecheck` — 0 errors
  - `pnpm --filter @gertsai/api-core test` — 376 passed (27 test files)
  - `pnpm typecheck` workspace-wide — 0 errors

  **Behaviour preservation**: zero changes to externally-observable behaviour. Same `APIError` codes, same `{success, code, message, data}` envelope, same `raw: true` short-circuit semantics, same response validation strict/loose paths.

  **Deferred to PR-5**:

  - Bench harness `__bench__/pipeline-runner.bench.ts` per RFC-027 §Bench plan (vitest bench config not yet wired)
  - `setStageOverride` public API per RFC-027 §PR-5

  Refs: PRD-065, SPEC-021 §Stages 9-11, RFC-027 §PR-4, ADR-015

### Patch Changes

- 1d1fd18: Wave 27 PR-1 — dormant pipeline scaffolding for action-pipeline extraction.

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

- 964a57e: Wave 27 PR-2 — extract pre-handler stages 1-5 into `@gertsai/api-core/pipeline`.

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

- 6bdeaa2: Wave 27 PR-3 — extract handler-invocation stages 6-8 into `@gertsai/api-core/pipeline`.

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

- b7a1e2d: Wave 27 PR-5 — **final PR**: `setStageOverride` public API + bench harness + README docs. Closes Wave 15.D extraction project.

  **`ApiController.setStageOverride(name, stage)`** — public method to override a single named stage in the action pipeline. Override is captured at schema-build time (snapshot isolation); already-registered actions retain their original pipeline.

  ```ts
  import { ApiController } from "@gertsai/api-core";
  import type { Stage } from "@gertsai/api-core/pipeline";

  const myAuthStage: Stage = async (ctx, deps) => {
    // custom auth logic, fall back to default behaviour
    return ctx;
  };

  const controller = ApiController.resolveController("v1", "graph");
  controller.setStageOverride("establishAuthSession", myAuthStage);
  ```

  **`STAGE_NAMES`** constant — extracted to `pipeline/default-stages.ts` (11 entries aligned by index with `DEFAULT_STAGES`). Re-exported from `@gertsai/api-core/pipeline`.

  **Bench harness** — `packages/api-core/src/lib/controller/pipeline/__bench__/pipeline-runner.bench.ts`. Runs via `pnpm --filter @gertsai/api-core exec vitest bench --run`. Two benches: full 11-stage zero-work pipeline + isolated `wrapResponse` stage. **No perf gate** in this PR — establishes harness only (RFC-027 §Bench plan baseline never captured pre-extraction). Future PRs may add p95 ≤+2% gate when baseline is recorded.

  **README** — new `## Action pipeline (Wave 27)` section documenting:

  - Default 11-stage order + role of each
  - `setStageOverride` usage example with snapshot-isolation note
  - Custom-runner composition example

  **`@ts-ignore` cleanup**: 0 removals. All 5 remaining instances in `ApiController.class.ts` target code NOT extracted to typed stages (resolve-controller generic widening, subscribe-on-topic options spread, Orchestra duck-type checks in queue/subscriber schemas, Moleculer lifecycle `this.Promise`). Preserved verbatim.

  **Tests**: +5 new (in `src/__test__/apiController-stage-override.test.ts`):

  - AC-SO-1: override replaces named stage in new schemas
  - AC-SO-1 variant: override on one stage does not affect other stages
  - AC-SO-2: snapshot isolation — override after schema-build does not mutate closed handler
  - AC-SO-3: already-registered actions retain original pipeline
  - AC-SO-4: multiple overrides on different stages compose in `STAGE_NAMES` order

  Total api-core: **381/381 passing**.

  **Verification**:

  - `pnpm --filter @gertsai/api-core build` — dual ESM+CJS green
  - `pnpm --filter @gertsai/api-core typecheck` — 0 errors
  - `pnpm --filter @gertsai/api-core test` — 381 passed (28 test files)
  - `pnpm --filter @gertsai/api-core exec vitest bench --run` — functional (no perf gate)
  - `pnpm typecheck` workspace-wide — 0 errors

  **Wave 27 summary** (after all 5 PRs):

  | Before                                 | After                                                     |
  | -------------------------------------- | --------------------------------------------------------- |
  | `ApiController.class.ts`: 1178 LOC     | 1005 LOC (-14.7%)                                         |
  | `_createActionSchema`: 193-LOC closure | 25-LOC `PipelineRunner` orchestrator                      |
  | Stages: 0 (monolith)                   | 13 typed `Stage<TIn, TOut>` functions                     |
  | Stage tests: 0 (only e2e)              | 75+ unit tests across 13 stages                           |
  | Public composition surface: none       | `@gertsai/api-core/pipeline` subpath + `setStageOverride` |

  Refs: PRD-065, SPEC-021, RFC-027 §PR-5, ADR-015

## 0.5.2

### Patch Changes

- Updated dependencies [30d3b10]
  - @gertsai/logger-factory@2.0.1

## 0.5.1

### Patch Changes

- Updated dependencies [391310d]
  - @gertsai/auth-openfga@0.4.0
  - @gertsai/api-queue@0.2.1

## 0.5.0

### Minor Changes

- e16d41f: Wave 14.6 (PRD-054 / EVID-057 §Error Envelope — FINAL) — remove the deprecated RFC-030 `GertsErrorResponse` envelope.

  **Removed** (closes the deprecation path opened in Wave 14.4):

  - `GertsErrorResponse` interface
  - `GertsErrorDetail` interface
  - `createGertsError` factory
  - `validateGertsError`, `validateGertsErrorEquals`, `assertGertsError`, `isGertsError` typia validators
  - `toProblemDetails` migration helper
  - `ProblemDetailsLike` interface (consumers should import canonical `ProblemDetails` from `@gertsai/errors/http`)
  - Convenience creators returning `GertsErrorResponse`: `validationError`, `notFoundError`, `authError`, `rateLimitError`, `internalError`
  - `isErrorResponse` type guard

  **Migrated**:

  - `wrapErrorResponse(options)` now returns canonical RFC 9457 `ProblemDetails & { _legacy }` from `@gertsai/errors/http` (per ADR-006 §A1.5). Taxonomy-specific extras (`code`, `type`, `retryable`, `retryAfter`, `stage`, `requestId`, `timestamp`, `tenantId`) live in `ProblemDetails.details` per RFC 9457 §3.2 ("extension members"). `trace_id` maps to `correlationId`.
  - `@gertsai/api-core/moleculer/apiGateService.template.ts` — reads `X-Request-ID` from `problem._legacy.request_id` (top-level field replaced by `details.requestId`).
  - `GertsAnyResponse` union — error arm is now `ProblemDetails` (was `GertsErrorResponse`).

  **Kept** (still useful taxonomy support; not wire envelopes):

  - `GertsErrorType`, `GertsErrorCode`, `GertsProcessingStage` types — live inside `ProblemDetails.details`
  - `ERROR_STATUS_CODES`, `RETRYABLE_ERROR_CODES` lookup tables
  - `generateRequestId()`, `getStatusCode()`, `isRetryable()` helpers
  - `GERTS_TYPE_TO_PROBLEM_URN` mapping (newly exported — used by `wrapErrorResponse`)

  **Migration path for downstream consumers**:

  ```ts
  // Before
  import {
    createGertsError,
    type GertsErrorResponse,
  } from "@gertsai/api-envelope";
  const err: GertsErrorResponse = createGertsError({
    type: "not_found_error",
    code: "ENTITY_NOT_FOUND",
    message: "Entity not found",
  });

  // After
  import { appErrorToHttpResponse } from "@gertsai/errors/http";
  import { NotFoundError } from "@gertsai/errors";
  const { status, body } = appErrorToHttpResponse(
    new NotFoundError({
      message: "Entity not found",
      details: { code: "ENTITY_NOT_FOUND" },
    })
  );
  ```

  The `body` is canonical RFC 9457 `ProblemDetails`. For OpenAI-compatible domain-code routing, place the code in `details.code` — the api-envelope `wrapErrorResponse` does this automatically for inbound Orchestra responses.

  Per audit (Wave 14.4 / EVID-057) there are no external consumers of the removed symbols. Breaking change is contained inside `@gertsai/api-envelope` + `@gertsai/api-core` and pre-1.0 SemVer permits a minor bump.

### Patch Changes

- Updated dependencies [e16d41f]
  - @gertsai/api-envelope@0.3.0

## 0.4.0

### Minor Changes

- 5cfbfec: Wave 16.A+B — close two EVID-067 §Doctor Strange items.

  **16.A — Legacy OAuth module removed (BREAKING but pre-1.0).**

  The self-`@deprecated` `OAuth` class, `AuthProvider` registry, and `MX()`
  Moleculer mixin under `src/lib/oauth/` + `src/moleculer/oauth.mixin.ts`
  have been deleted. The grep audit across `packages/*` and `examples/*`
  confirmed zero active external consumers — the only call site was
  `apiGateService.template.ts` itself (which used to mount `MX()` by
  default), and `m9s-example` already opted out via `disableAuth: true`.

  - `apiGateService.template.ts` no longer mounts any auth mixin by
    default. The `OrchestraApiGateOptions.disableAuth` field is preserved
    as a no-op for type-shape back-compat (slated for removal at v1.0.0).
  - The `OAuthError` branch of the gateway error handler is gone; auth
    errors flow through the existing `mapAuthErrorToResponseCode` /
    duck-typed `AuthenticationError` / `AuthorizationError` paths.
  - `import '@gertsai/api-core/oauth'` now throws a loud migration error
    at import time instead of returning the legacy surface.
  - `oauth2-server` + `@types/oauth2-server` dropped from `package.json`.
  - ~494 LOC of deprecated-but-default code removed.

  Migration: mount your own Express-style auth middleware in
  `settings.use`. If you still need the legacy surface, pin to
  `@gertsai/api-core@0.3.x`.

  **16.B — Lazy config (no env-var reads on `/moleculer` import).**

  `src/config.ts` previously called `loadConfig({...})` at module top
  level. That side-effect fired the moment anything in the
  `@gertsai/api-core/moleculer` subpath was imported, leaking ~30 env
  vars into the resolved config object — defeating the
  `"sideEffects": false` declaration and the deliberate root-export
  omission of `runtime/node`.

  The default export is now a `Proxy` that memoises
  `loadConfig({...defaults})` on first property access. All consumer call
  sites (`config.ALLOWED_ORIGINS`, `config.HEALTHCHECK_ENABLED`, etc.) are
  source-compatible; the `process.env` read happens lazily when something
  actually asks for a field.

  A new test (`__test__/no-side-effects-on-import.test.ts`) asserts that
  importing `../config` does not read any tracked env key and that the
  first property access does. The test uses a `process.env` `Proxy` to
  record every read by name.

  Closes EVID-067 §Doctor Strange #3 and #4.

## 0.3.5

### Patch Changes

- 20c748f: Wave 15.A — Extract envelope cluster from `@gertsai/api-core` into new Tier-1 `@gertsai/api-envelope` package per EVID-067 §15.A.

  **Rationale**: api-core's envelope cluster (~1,901 LOC across 6 files: `types/{error,response,list,index}.ts` + `response-wrapper.ts` + `type-guards.ts`) is pure typia tagged interfaces + helpers — browser-safe, zero Moleculer coupling. Its prior location in api-core (Tier-4) blocked consumption by FastAPI / Rust ts-types generators (already advertised in `contracts/index.ts` JSDoc).

  **New package**: `@gertsai/api-envelope@0.1.0` (Tier-1, browser-safe).

  - Deps: `typia ^9.7.0`, `@standard-schema/spec ^1.1.0`. NO `@gertsai/*` deps.
  - Includes 9 files moved via `git mv` (6 production + 3 co-located test files).
  - Plus new `orchestra-shim.ts` (41 LOC) — structural counterparts of api-core's `OrchestraApiResponse<CODE>` / `ResponseCode`. Solves the type-only cross-boundary dep that previously bound the envelope to api-core's `apiResponse/` subsystem. Real `OrchestraApiResponse` instances duck-type into the shim, so existing api-core callers compile and run unchanged.

  **api-core changes**:

  - `packages/api-core/src/lib/envelope/index.ts` → thin re-export shim from `@gertsai/api-envelope`. Preserves deliberate non-re-exports per EVID-067 §Doctor Strange #1 (`validationError`, `notFoundError`, `authError`, `rateLimitError`, `internalError`, `GertsProcessingStage` — fossil of incomplete RFC-030 migration).
  - `packages/api-core/package.json` → adds `@gertsai/api-envelope: workspace:*` dep.
  - 2 api-core test files updated to import directly from `@gertsai/api-envelope` (was `'../lib/envelope/...'`).

  **Behaviour**: zero change. All existing `import { ... } from '@gertsai/api-core/contracts'` / `'@gertsai/api-core'` continue resolving identically via shim.

  **Tests**: 95 envelope tests now run in api-envelope package; 284 + 95 = 379 total preserved across api-core + api-envelope (was 379 in api-core alone). Workspace typecheck 0 errors across 39 packages + 3 example apps.

  **Workspace size**: 38 packages + 3 examples → **39 packages + 3 examples**.

  Net diff: 22 files / +379 insertions / -35 deletions (mostly scaffold for new package; moved files show as renames with 0 line delta via git's rename-detection).

  Refs: PRD-050, EVID-067 (Wave 15 audit — §15.A recommendation), EVID-058 (Wave 12.G top-ranked action).

- 4d5145f: Wave 15.B — Extract BullMQ queue/worker lifecycle from `@gertsai/api-core/ApiController` into new Tier-2 `@gertsai/api-queue` package per EVID-067 §15.B.

  **Rationale**: `ApiController.class.ts` (1,511 LOC god-class per EVID-067 §1) had ~540 LOC of BullMQ queue/worker lifecycle (selective worker-mode, `_registeredQueues`, `_bootWorkers()`, `_addJob()`, `_getQueue()`) entangled with action pipeline logic. Plus ~190 LOC of BullMQ types in `controller/types.ts`. Extraction enables consumers needing only queue lifecycle without api-core's Moleculer transport plumbing.

  **New package** `@gertsai/api-queue@0.1.0` (Tier-2):

  - Deps: `@gertsai/queue: workspace:*` (Tier-1 BullMQ wrappers) + `lodash.forin`
  - Peer deps: `moleculer` + `bullmq` (lazy-required)
  - 4 src files (+935 LOC):
    - `types.ts` (425 LOC) — all BullMQ types moved from api-core
    - `schema.ts` (167 LOC) — `createQueueSchemaFragment(queue, opts)` pure function with `QueueErrorTranslator` for api-core's `APIError`-scrub semantics
    - `methods.ts` (82 LOC) — `createQueueServiceMethods(queueConfig)` factory for `getQueue`/`addJob` mixin
    - `lifecycle.ts` (281 LOC) — `bootQueueWorkers/stopQueueWorkers/stopQueues` honouring `workersEnabled`/`enabledWorkers`
  - `methods.test.ts` (4 smoke tests pass)

  **Approach: pure functional extraction** (chosen over class composition / mixin). New package exports stateless helpers; state stays on `ApiController` (registry + selective-mode flags tied to controller lifecycle). Preserves existing `ApiController.registerWorker(...)` / `ApiController.Start({workersEnabled, enabledWorkers})` public surface verbatim — zero consumer change.

  **api-core changes**:

  - `ApiController.class.ts`: 1511 → 1241 (**-270 LOC**, -18%). `_createQueueSchema()` delegates to `createQueueSchemaFragment`; `started()` worker boot → `bootQueueWorkers(this, {workersEnabled, enabledWorkers, queueConfig})`; `stopped()` teardown → `stopQueueWorkers/stopQueues`. Removed unused bullmq imports (Queue/Worker/Job/JobDataWithTraceContext).
  - `controller/types.ts`: 1037 → 760 (**-277 LOC**, -27%). 10 type declarations removed; re-exported from `@gertsai/api-queue` for back-compat.
  - `package.json`: +`@gertsai/api-queue: workspace:*` dep.

  **SPEC-020 created**: documents selective worker-mode contract (API Gateway vs Worker Node deployment patterns) per EVID-067 §Doctor Strange #2. Previously undocumented; now in `.forgeplan/specs/`.

  **Behaviour**: zero change. All existing `ApiController.registerWorker()` / `service.addJob()` / `service.getQueue()` public methods preserved.

  **Tests**: 284/284 api-core tests pass + 4 new api-queue tests. Workspace typecheck 0 errors across 40 packages + 3 example apps (svelte-check 1079 files / 0 errors).

  **Workspace size**: 39 packages + 3 examples → **40 packages + 3 examples**.

  **Concern flagged**: `QueueActionCallFunction` declared twice (api-queue simplified + api-core full generic with RegisteredActions declaration-merge). Internal-only; consumers see no change. Worth a one-line note if surfaces during Wave 15.C.

  **After Wave 15.A+B**: api-core source shrinks ~22% (toward EVID-067's 33% Wave 15 total goal). Remaining 15.C — Pub/Sub extraction (~250 LOC, ~1.5d).

  Refs: PRD-051, SPEC-020, EVID-067 (Wave 15 audit), EVID-068 (Wave 15.A precedent).

- 11f825b: Wave 15.C — Extract Pub/Sub lifecycle to new Tier-2 + adopt logger-factory + otel/moleculer. **Completes Wave 15 cycle** per EVID-067 §15.C.

  **Final Wave 15 cumulative result**: `ApiController.class.ts` shrinks **1511 → 1178 LOC** (-333, -22% from baseline). api-core source down ~25-30% overall after 15.A+B+C. Workspace **38 → 41 packages**.

  **New package** `@gertsai/api-pubsub@0.1.0` (Tier-2):

  - Optional peer: `@google-cloud/pubsub` + `bullmq` (lazy-required)
  - 4 src files + 2 test files (+922 total LOC):
    - `types.ts` (171) — SubscriberHandlerCtx, SubscribeHandler, SubscribeOptions, ApiControllerSubscribedTopics, SubscriptionProcessingEvents
    - `schema.ts` (110) — `createSubscriberSchemaFragment` with `errorTranslator` injection (preserves api-core APIError-scrub semantics outside this package)
    - `methods.ts` (118) — `createPubsubServiceMethods` with optional `colorize` callbacks (keeps colorts in api-core)
    - `lifecycle.ts` (126) — `bootPubsubSubscriptions` + `stopPubsubSubscriptions`; module JSDoc documents §Doctor Strange #5 resolution
  - 7 tests pass (4 methods + 3 lifecycle including §Doctor Strange #5 closure assertion)

  **§Doctor Strange #5 resolved — DELETE + document**:

  Per EVID-067 §Doctor Strange #5, `stopped()` had 17 lines of commented-out `pubSub.detachSubscription(name)` code. Investigation revealed:

  - `detachSubscription` is **Pub/Sub Lite** API, NOT standard `@google-cloud/pubsub`
  - If un-commented at runtime: `TypeError: pubSub.detachSubscription is not a function`
  - Standard Pub/Sub subscriptions are server-owned; client only closes streaming-pull
  - Required behaviour (drop cached `Subscription` from `$subscriptions`) preserved in `stopPubsubSubscriptions`

  Deleted the dead code. Future opt-in hook (e.g. emulator-recycle) can be added as `stopPubsubSubscriptions(service, { onDetach })` callback without breaking the public API. Closure rationale documented verbatim in `packages/api-pubsub/src/lifecycle.ts` module JSDoc + README. Dedicated `lifecycle.test.ts` test asserts `$subscriptions` is emptied.

  **api-core changes**:

  - `ApiController.class.ts`: 1241 → **1178 LOC** (-63 this PR). Adopted `bootPubsubSubscriptions`/`stopPubsubSubscriptions`/`createPubsubServiceMethods`/`createSubscriberSchemaFragment` from api-pubsub. Replaced inline traceparent IIFE (~22 LOC) with `buildTraceparent` from `@gertsai/otel/moleculer`. Replaced `createSimpleFallbackLogger` with `@gertsai/logger-factory.createLogger` adapter (**default-on redaction now active for fallback logs**). Removed `_forIn` import + inline `colorts` body. Deleted 17 lines of commented-out detached-subscription code per §Doctor Strange #5.
  - `controller/types.ts`: **-106 LOC**. Removed 6 Pub/Sub type body definitions; re-exported from `@gertsai/api-pubsub` for source-level back-compat.
  - `package.json`: `+@gertsai/api-pubsub`, `+@gertsai/logger-factory`, `+@gertsai/otel` deps.

  **`@gertsai/otel` enhancement** (minor bump):

  - Added `buildTraceparent(input: BuildTraceparentInput): BuiltTraceparent | undefined` to `moleculer` subpath (~90 LOC). Centralises W3C trace-header assembly. Structural input shape (`{ requestID, id, parentID, tracing }`) — non-Moleculer hosts can use it too.
  - +4 unit tests (undefined-on-falsy-tracing, W3C assembly, non-zero enforcement, dash-stripping/right-padding).

  **Behaviour**: zero change for users not using Pub/Sub. All existing `ApiController.subscribePubsub()` / topic registration / `stopped()` lifecycle hook work identically.

  **Tests**: 284/284 api-core pass + 7 new api-pubsub tests + 13/13 otel pass (was 9, +4 new for buildTraceparent). Workspace typecheck 0 errors across 41 packages + 3 example apps (svelte-check 1080 files / 0 errors).

  **Workspace size**: 40 packages + 3 examples → **41 packages + 3 examples**.

  **Surfacing barrier**: `@gertsai/otel/moleculer` was missing the per-action traceparent helper (pre-Wave-15.C only exported broker-level `withMoleculerTracing`). Resolved additively by adding `buildTraceparent` to otel — small, fully tested, preserves all existing behaviour.

  **After Wave 15.A+B+C**: api-core surfaces cleaned, three new packages give consumers granular dependency control. v1.0.0 prep stronger. Total ~5.5d effort delivered.

  Refs: PRD-052, EVID-067 (Wave 15 audit), EVID-068 (15.A), EVID-069 (15.B), SPEC-020 (selective worker-mode from 15.B).

- Updated dependencies [20c748f]
- Updated dependencies [4d5145f]
- Updated dependencies [11f825b]
  - @gertsai/api-envelope@0.2.0
  - @gertsai/api-queue@0.2.0
  - @gertsai/api-pubsub@0.2.0
  - @gertsai/otel@0.2.0

## 0.3.4

### Patch Changes

- Updated dependencies [0f71f1d]
- Updated dependencies [7109c49]
  - @gertsai/core@0.5.0
  - @gertsai/auth-openfga@0.3.3

## 0.3.3

### Patch Changes

- 8f5533f: Wave 14.4 — Mark `GertsErrorResponse` `@deprecated` + add `toProblemDetails` migration helper per EVID-057 §Error Envelope.

  EVID-057 confirmed the 3-way drift between RFC 9457 `ProblemDetails` (canonical per ADR-006), m9s-example OpenAPI schema (matches canonical), and `@gertsai/api-core GertsErrorResponse` (RFC-030 hybrid outlier with ZERO external consumers). This wave marks the deprecation path without removing anything — removal is a v1.0.0 breaking change.

  **`@deprecated` markers added to**:

  - `GertsErrorResponse` interface
  - `createGertsError` function
  - `validateGertsError` typia validator
  - `validateGertsErrorEquals` typia validator
  - `assertGertsError` typia validator
  - `isGertsError` typia type-guard

  Each marker carries `@see` pointing to `appErrorToHttpResponse` from `@gertsai/errors/http` and a removal note for `@gertsai/api-core@1.0.0`.

  **New migration helper**: `toProblemDetails(error: GertsErrorResponse): ProblemDetailsLike`. Maps RFC-030 envelope → RFC 9457 ProblemDetails shape:

  - `error.type` → ADR-006 URN bucket (e.g. `validation_error` → `urn:gertsai:errors:validation`)
  - `error.message` → ProblemDetails.title + .detail
  - `error.code` + `error.param` + `error.stage` + `error.retryable` + `error.retry_after` → `ProblemDetails.details`
  - `request_id` → `details.requestId`; `trace_id` → `correlationId`; `tenant_id` → `details.tenantId`

  Local `ProblemDetailsLike` interface mirrors `@gertsai/errors/http.ProblemDetails` field-for-field — defined locally to avoid introducing a new dep from api-core. Consumers building real HTTP response bodies should prefer the canonical type at runtime.

  **Behaviour**: zero change. Existing consumers see TS deprecation hints (not errors); all 379 api-core tests continue passing. Build + typecheck green.

  **No public-API break.** Patch bump. Removal cycle:

  - v0.x.y (this PR): @deprecated marker + migration helper landed
  - v1.0.0 (Wave 14.6): `GertsErrorResponse` interface + `createGertsError`/`validateGertsError`/`isGertsError`/`toProblemDetails` removed; all `@gertsai/api-core` internal consumers migrated to ProblemDetails

  Refs: PRD-046, EVID-057 (Wave 12.F audit), ADR-006 (@gertsai/errors Shared Kernel + ProblemDetails canonical), EVID-062 (Wave 14.1+14.2 LRU precedent), EVID-063 (Wave 14.3+14.5 URL precedent).

- Updated dependencies [739b3de]
  - @gertsai/auth-openfga@0.3.2
  - @gertsai/core@0.4.1

## 0.3.2

### Patch Changes

- Updated dependencies [f0f6f26]
- Updated dependencies [7bc148b]
  - @gertsai/core@0.4.0
  - @gertsai/auth-openfga@0.3.1

## 0.3.1

### Patch Changes

- Updated dependencies [05258e5]
- Updated dependencies [05258e5]
  - @gertsai/core@0.3.0
  - @gertsai/auth-openfga@0.3.0

## 0.3.0

### Minor Changes

- 2e111ed: Wave 13 — close CRITICAL audit findings from EVID-043 (api-core Wave 12.A
  deep-audit). 6 surgical fixes shipped together as a minor version bump
  (some are behavior-changing, justified under 0.x SemVer).

  **Security (4 fixes):**

  - **CWE-347 (BYPASS_AUTH)**: `OAuth.authenticate` now hard-throws when
    `BYPASS_AUTH=true` AND `NODE_ENV === 'production'`. The env flag
    previously decoded Firebase JWT payload via `atob()` without
    verifying the signature — production deploys with this env set were
    trivially impersonatable.

  - **CWE-942 (CORS)**: `ALLOWED_ORIGINS` is now parsed as a comma-
    separated allowlist by a new `parseCorsOrigins()` helper.
    Production + unset/empty/`'*'` → throw at boot (combined with
    `credentials: true` this would be the textbook CSRF-amplifier).
    Non-prod + unset → wildcard `'*'` with a console.warn so local-dev
    works out of the box. Default of `ALLOWED_ORIGINS` env changed from
    legacy string sentinel `'none'` to empty string `''`.

  - **CWE-345 / CWE-770 (XFF rate-limit)**: API gateway rate limiter
    switched from raw `req.headers['x-forwarded-for']` to the hardened
    `extractClientIp()` helper (validates octet ranges, rejects CR/LF/NUL
    injection, selects last IP from XFF chain = trusted proxy hop).
    Previous code accepted any XFF value as-is — attackers rotating the
    header bypassed the limit trivially.

  - **CWE-532 (debug logging)**: `apiGateService.template` default
    `logRequestParams` + `logResponseData` changed from `'debug'` to
    `null`. At debug level the gateway dumped OAuth password-grant
    credentials, `client_secret`, freshly-minted access tokens into logs.
    Consumers can still opt in via `settings: { logRequestParams: 'debug' }`.

  **Logic (2 fixes):**

  - **OAuth stub methods** (`getUser`, `revokeToken`, `saveToken`,
    `getRefreshToken`, `validateScope`) now `throw new Error('Not
implemented')` instead of silently returning `undefined` via
    `console.log` no-op. Previous behavior caused `oauth2-server` to
    surface opaque 500s on any grant flow. Throw makes misuse loud.

  - **OAuth `authenticate` null-check** on `token.user` before
    dereferencing `token.user._uuid`. oauth2-server may return a token
    without an associated user object (e.g. client-credentials grant);
    previous code threw `TypeError: Cannot read properties of undefined`
    at runtime via `@ts-ignore`. Now throws a clear `InvalidTokenError`.

  **Type safety (2 improvements):**

  - **`defineAction()` generic** tightened from `(registration: unknown)
=> RegisteredAction` to `<T extends Record<string, unknown>>
(registration: T) => T & RegisteredAction`. Rejects
    `defineAction(undefined)`, `null`, primitives at compile time AND
    preserves the inferred shape of the input. Backward-compatible for
    consumers using `defineAction(controller.register(...))` —
    `controller.register` return satisfies the new constraint.

  - **`OAuthContextMeta` interface** + `setAuthenticatedMeta(ctx, user)`
    helper added. Eliminates four `@ts-ignore` lines on `ctx.meta` writes
    in `OAuth.authenticate` + firebase-auth path. Single typed cast at
    the helper boundary.

  **Tests:** new `define-action.test.ts` with 9 cases covers runtime
  identity, side-effect preservation, type contract, generic constraint
  rejection, and brand semantics. Closes EVID-043 Test C1 (defineAction
  was untested since Wave 11.B shipped).

  **Deferred (Wave 14):** god-class `ApiController` decomposition (1500
  LOC SRP/OCP/DIP violations per arch-reviewer), `/contracts` typia
  extraction (ADR-003 leak), `ActionOptions = any` defaults conversion
  to `unknown`, `OAuth` class proper typing, comprehensive test coverage
  for BullMQ workers + Pub/Sub + Diagnostics. See PRD-027 → Wave 14 PRD.

  Refs: PRD-027, EVID-043.

## 0.2.0

### Minor Changes

- 0755c6d: Initial OSS release of `@gertsai/*` first-wave packages (v0.1.0).

  Extracted with preserved git history from internal `gertsai_codex` monorepo
  into the public `gertsai/shared` repository, под Apache 2.0. 14 packages
  across 5 tiers per [ADR-009][adr-009] + [ADR-011][adr-011]:

  - **Tier 1** (zero internal deps): `fsm`, `fetch`, `collection`, `llm-costs`,
    `utils`, `m9s-cache`, `ws-rpc`
  - **Tier 2** (depends on Tier 1): `di` (→ utils), `flux` (→ collection)
  - **Tier 3**: `core` (→ llm-costs), `hsm`
  - **Tier 4**: `auth-openfga` (→ core), `api-core` (→ core + auth-openfga)
  - **Tier 5** (per ADR-011): `api-rlr` (→ api-core; database-agnostic
    `PgClient` interface — drop-in compat с Prisma/Drizzle/raw-pg)

  Highlights:

  - **`@gertsai/api-rlr`**: production-grade rate limit middleware для
    Moleculer.js. Sliding-Window + GCRA через Redis Lua scripts; PostgreSQL
    adapter accepts any client structurally compatible с Prisma's
    `$queryRawUnsafe` / `$executeRawUnsafe` / `$transaction` surface.
  - **`@gertsai/api-core`**: unified `APIError`/`ResponseCode` (RFC-053),
    `ApiController`, Moleculer mixins, OpenAPI merge.
  - **`@gertsai/core`**: identity, errors, response envelope, tracing primitives.
  - **`@gertsai/fsm`** / **`@gertsai/hsm`**: zero-dep finite & hierarchical state
    machines.

  See individual package READMEs for install + quickstart.

  [adr-009]: https://github.com/gertsai/shared/blob/main/.forgeplan/adrs/ADR-009-trivexdev-as-single-oss-umbrella-for-shared-packages-and-fluxis.md
  [adr-011]: https://github.com/gertsai/shared/blob/main/.forgeplan/adrs/ADR-011-first-wave-extension-to-14-packages-add-api-rlr-refines-adr-009.md

- 1d1e833: Sprint 2 — api-core decomposition Phase A (per ADR-003 + SPEC-002).

  **`@gertsai/api-core` v0.2.0** — three subpath exports без breaking changes:

  - `@gertsai/api-core/contracts` — pure types (APIError, ResponseCode, response envelope, OpenAPI helpers). Zero runtime side effects, zero peer deps на Moleculer/BullMQ/dotenv/GCP. Safe для browser, FastAPI clients, Rust ts-types.
  - `@gertsai/api-core/moleculer` — Moleculer-specific runtime (ApiController, queues, channels, OAuth, gateway, **workflows experimental stub**). Lazy-init.
  - `@gertsai/api-core/runtime/node` — Node.js-specific factories (`loadConfig`, `createGcpLoggerStream`). Opt-in side effects.

  Root `@gertsai/api-core` остаётся backward-compatible через deprecated reexports с JSDoc warnings — но **больше не экспортирует `loadConfig`** (move на `/runtime/node`).

  **`@gertsai/core` v0.2.0** — language-neutral workflow contracts:

  - `WorkflowDefinition`, `WorkflowRun`, `WorkflowSignal`, `WorkflowState`, `WorkflowStepResult`, `EventEnvelope` — single source of truth для всех runtime adapters (Moleculer сейчас, FastAPI/Go/Rust позже).

  **`@gertsai/api-rlr` v0.2.0** — migrated к `@gertsai/api-core/contracts` subpath. Per-package tsconfig override на ESNext+Bundler для resolver compatibility.

  **Migration guide для consumers**:

  ```typescript
  // BEFORE (v0.1.x)
  import { APIError, ResponseCode } from "@gertsai/api-core";
  import { ApiController } from "@gertsai/api-core";
  import { loadConfig } from "@gertsai/api-core"; // ← removed

  // AFTER (v0.2.x)
  import { APIError, ResponseCode } from "@gertsai/api-core/contracts";
  import { ApiController } from "@gertsai/api-core/moleculer";
  import { loadConfig } from "@gertsai/api-core/runtime/node";
  ```

  Root imports continue to work для `APIError`/`ApiController`/etc., но triggers JSDoc deprecation warning. `loadConfig` requires explicit subpath migration.

  **Breaking surface only**: `loadConfig` no longer reexported from root. Workaround — explicit subpath. All other v0.1.x APIs preserved через root reexports.

  Refs: PRD-001, ADR-003 (Platform Runtime Boundaries), SPEC-002 (Sprint 2 checklist), EVID-002 (smoke), EVID-003 (Sprint 2 evidence).

- e830ae6: Sprint 3.1 — workflows full implementation + ESLint hex-layer enforcement

  **`@gertsai/core`** — additive `WorkflowDefinition.params?: object` field for
  runtime adapter input validation (e.g. fastestValidator schemas in
  `@moleculer/workflows`). Non-breaking; older definitions remain valid.

  **`@gertsai/api-core`** — `controller.setWorkflows({...})` is now a
  production-ready 4th surface alongside `actions`, `queues`, `channels`:

  - `setWorkflows(controller, registration)` adapts language-neutral
    `WorkflowDefinition`s into Moleculer-flavoured workflow schemas via the new
    `adaptWorkflowDefinition()` helper, then registers them through an internal
    `_registerWorkflow` hook on `ApiController`.
  - `ApiController._attachWorkflowsToServices` is invoked at synthesized-schema
    build time (per RFC-001 amendment 2026-05-05, Option (a)) so workflows are
    visible to the `@moleculer/workflows` middleware before broker start.
  - `createMoleculerConfig({ workflows: { ... } })` now lazy-requires
    `@moleculer/workflows` and pushes its middleware. Lazy require keeps the
    peer-dep optional for consumers who do not need workflows.

  **Repo** — `eslint-plugin-boundaries` config (flat) added for
  `examples/m9s-example/src/**`, mirroring `.dependency-cruiser.cjs` rules with
  deny-by-default semantics. Provides IDE-side feedback complementing the
  existing CI dep-cruiser gate. 0 violations baseline.

  **`examples/m9s-example`** migrated from a hand-rolled `IngestWorkflowService`
  ServiceSchema to a pure `WorkflowDefinition` (`application/IngestProcessWorkflow.ts`)
  registered through `controller.setWorkflows({ 'ingest.process': ... })`. The
  runtime workflow name moved from `wf-ingest.ingest.process` →
  `v1.ingest.process` (synthesized as `<svc.fullName>.<wf.name>`).

  Refs: RFC-001 (active), SPEC-003, ADR-002, ADR-003.

- 56eb238: Add `defineAction()` typed wrapper retiring `: any` annotations at every
  `controller.register(...)` call site. Exported from
  `@gertsai/api-core/moleculer`.

  Migration:

  ```ts
  // Before:
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export const upload: any = controller.register('upload', { ... });

  // After:
  import { defineAction } from '@gertsai/api-core/moleculer';
  export const upload = defineAction(controller.register('upload', { ... }));
  ```

  `defineAction` returns the opaque `RegisteredAction` brand — the export
  type-erases the leaked Moleculer/typia shape (`ITypiaValidator` etc.)
  without losing handler-body typing. Side effect of registration is
  unchanged; the helper is a runtime no-op cast.

  Closes EVID-036 audit findings W-Type-1 / W-Type-2 at the package boundary
  instead of per-app shim (originally local in `examples/m9s-example/src/lib/`
  since Wave 10.E PRD-022).

### Patch Changes

- 1f8494e: Sprint 1 hygiene fixes (SPEC-001) — preрequisite для first npm publish v0.1.0.

  **`@gertsai/api-core`**:

  - **H-1**: `private: true → false`, `license: "MIT" → "Apache-2.0"`, добавлен `publishConfig.access: "public"` (release-blocker fix).
  - **H-2**: убран `import 'dotenv/config'` side-effect из root `src/index.ts` — больше не загружает `.env` при импорте библиотеки.
  - **H-3**: Google Cloud Logger переведён на lazy factory `createGcpLoggerStream()` — больше нет MetadataLookupWarning к `169.254.169.254` при импорте moleculer config.
  - **H-4**: `@google-cloud/pubsub` перемещён в `peerDependencies` (`^4.0.0`, optional) — TypeScript consumers больше не получают unresolvable type reference на `PubSub`.

  **`@gertsai/api-rlr`**:

  - **H-5**: `ioredis` (`^5.7.0`) перемещён в `peerDependencies` — runtime import теперь корректно declared.
  - **H-6**: `moleculer-web` (`^0.10.8`) перемещён в `peerDependencies` — аналогично H-5.

  Все existing тесты остаются зелёными (api-core 370/370, api-rlr 289/337 — 48 Redis-required skipped).

  Source: docs/dd.md audit (2026-05-05). Refs: PRD-001, ADR-003, SPEC-001 в `.forgeplan/`.

- 155d0c0: Sprint 3.0.1 — pre-publish hardening (audit-pre-sprint-3-2 convergent fixes)

  **`@gertsai/core`** (minor — additive):

  - `WorkflowDefinition.params` is now `Readonly<Record<string, unknown>>` (was
    `object`), better representing fastestValidator-style schema literals
    (audit F-T-2).
  - `WorkflowSignal.meta?: WorkflowSignalMeta` — additive optional field with
    `tenantId`, `userId`, `correlationId`. Forestalls Sprint 3.2 forced minor
    bump for tenant context propagation (audit F-S-1).
  - `typesVersions` map added so `@gertsai/core/rag` and `@gertsai/core/llm`
    resolve cleanly under Node10/legacy `moduleResolution: "node"` consumers
    (audit F-T-4 + F-P-1).

  **`@gertsai/api-core`** (patch — internal refactor + additive):

  - `setWorkflows` is now generic `<M extends WorkflowRegistration>` so
    consumers' precise per-workflow `WorkflowDefinition<I, O>` types are
    preserved (audit F-T-3).
  - The internal registration hook is now keyed by a `Symbol.for(...)` Symbol
    instead of a public underscore-prefixed method, so it does not surface in
    emitted `.d.ts` (audit F-T-1, the original critical leak).
  - `ApiController` formally `implements ApiControllerInternalHook`; consumers
    no longer need `as unknown as Parameters<typeof setWorkflows>[0]` casts.
  - `MoleculerWorkflowSchema.params` tightened to `Readonly<Record<string, unknown>>`.
  - `adapter.ts` reads `WorkflowSignal.meta` from `ctx.meta` defensively and
    attaches it only when at least one string field is present.
  - `as unknown as ServiceSchema` casts in `_attachWorkflowsToServices` and
    `generateServiceSchema` removed — `CoreServiceSchema` now declares optional
    `workflows?: Record<string, MoleculerWorkflowSchema>` (audit F-T-5).
  - `typesVersions` map added so `@gertsai/api-core/contracts`,
    `@gertsai/api-core/moleculer`, and `@gertsai/api-core/runtime/node` resolve
    cleanly under Node10/legacy consumers (audit F-T-4 + F-P-1).
  - `attw` exits clean across all subpaths (was 💀 Resolution failed in Sprint
    3.0).

  **Repo-wide**:

  - TypeScript pinned to `5.9.3` workspace-wide (single root devDep; per-package
    pins removed). Single resolved version verified via `pnpm why typescript`
    (audit F-CR-4).
  - All 14 packages now have uniform `package.json` scripts: `build`, `clean`,
    `test`, `typecheck`, `lint`. `pnpm -r --parallel run typecheck` now covers
    15/15 workspaces (was silently skipping 5+) (audit F-CR-5).
  - Legacy `.eslintrc.cjs` deleted (canonical config is the flat
    `eslint.config.mjs` since Sprint 3.0) (audit F-CR-1).
  - `.forgeplan-web/` added to ESLint ignores to silence unrelated build-output
    warnings.
  - m9s-example workflow registration: documentation explicitly notes that
    module-load registration is required (workflow attach happens during
    `controller.Start({services})` — `addStartedHandler` callbacks fire too
    late). Comment cites EVID-005 + audit F-CR-3 + RFC-001 amendment 2026-05-05.

  **Out of scope**: Sprint 3.2 scope redesign (architect NO-GO findings F-A-1
  observe→otel rename, F-A-2 database→pg-client, F-A-3 drop auth-moleculer)
  will land as PRD-001 amendment + ADR-012 in a follow-up commit. v0.2.0 npm
  publish remains gated on user approval after this hardening.

  Refs: SPEC-005 (active), audit-pre-sprint-3-2 (5 reviewers, 6 convergent
  findings + 3 architect scope critical, all addressed or routed).

- c6896c4: Initial release of @gertsai/rpc-proxy-builder (Tier 3). Type-safe RPC proxy generator.

  - `createRpcProxy<TActionMap>(transport, actions)` — Proxy with **3 traps** per ADR-009 I-15:
    - `get`: returns action fn or throws `Error('Unknown RPC action: ...')` per I-14 (CWE-1230 fail-open + namespace probing prevention).
    - `set`: returns false (TypeError in strict mode).
    - `deleteProperty`: returns false.
  - Module-private `Symbol('rpc-proxy')` brand markers per Sprint 3.8 I-11 reuse (CWE-1321 prototype pollution protection).
  - `isRpcProxy(value)` type guard with forgery resistance.
  - WeakMap-backed idempotent cache (same actions map → same proxy ref).
  - Type-only peer on `@gertsai/api-core/contracts` (consumes `ActionDefinition<I, O>`).
  - Generic over transport — implementable for Moleculer broker / WebSocket / HTTP / custom.

  @gertsai/api-core patch: NEW additive `ActionDefinition<TInput, TOutput>` type-only contract added to `/contracts` subpath per ADR-009 Amendment 1.1.1. Backward-compat preserved (additive only).

- Updated dependencies [0755c6d]
- Updated dependencies [1d1e833]
- Updated dependencies [155d0c0]
- Updated dependencies [e830ae6]
  - @gertsai/auth-openfga@0.2.0
  - @gertsai/core@0.2.0

## 0.5.33

### Patch Changes

- Updated dependencies [f8af2e3]
  - @orchdev/sdk@0.14.6

## 0.5.32

### Patch Changes

- Updated dependencies [69b367a]
  - @orchdev/sdk@0.14.5

## 0.5.31

### Patch Changes

- chore(deps): updated ioredis & segment dependencies
- Updated dependencies [64197cb]
  - @orchdev/sdk@0.14.4

## 0.5.30

### Patch Changes

- Updated dependencies [d538458]
- Updated dependencies [6c18169]
  - @orchdev/sdk@0.14.3

## 0.5.29

### Patch Changes

- Updated dependencies
  - @orchdev/sdk@0.14.2

## 0.5.28

### Patch Changes

- Updated dependencies
  - @orchdev/sdk@0.14.1

## 0.5.27

### Patch Changes

- Updated dependencies [a6b0c47]
- Updated dependencies [dac86c8]
  - @orchdev/sdk@0.14.0

## 0.5.26

### Patch Changes

- Updated dependencies [d121757]
  - @orchdev/sdk@0.13.4

## 0.5.25

### Patch Changes

- Updated dependencies [82c0496]
  - @orchdev/sdk@0.13.3

## 0.5.24

### Patch Changes

- Updated dependencies
  - @orchdev/sdk@0.13.2

## 0.5.23

### Patch Changes

- Updated dependencies
  - @orchdev/sdk@0.13.1

## 0.5.22

### Patch Changes

- Updated dependencies [3deb0a1]
- Updated dependencies [0db56d2]
  - @orchdev/sdk@0.13.0

## 0.5.21

### Patch Changes

- Updated dependencies
  - @orchdev/sdk@0.12.3

## 0.5.20

### Patch Changes

- Updated dependencies [8c603b3]
- Updated dependencies [764c604]
  - @orchdev/sdk@0.12.2

## 0.5.19

### Patch Changes

- Updated dependencies
- Updated dependencies [dc86b84]
- Updated dependencies
  - @orchdev/sdk@0.12.1

## 0.5.18

### Patch Changes

- Updated dependencies [3c29b9f]
- Updated dependencies [382154b]
- Updated dependencies [3bc73da]
  - @orchdev/sdk@0.12.0

## 0.5.17

### Patch Changes

- Updated dependencies [e59f10e]
- Updated dependencies
  - @orchdev/sdk@0.11.3

## 0.5.16

### Patch Changes

- Updated dependencies
  - @orchdev/sdk@0.11.2

## 0.5.15

### Patch Changes

- Updated dependencies [8247a8b]
- Updated dependencies [59e3142]
  - @orchdev/sdk@0.11.1

## 0.5.14

### Patch Changes

- Updated dependencies [d04a02d]
  - @orchdev/sdk@0.11.0

## 0.5.13

### Patch Changes

- Updated dependencies [7182ce9]
  - @orchdev/sdk@0.10.3

## 0.5.12

### Patch Changes

- Updated dependencies [742230a]
  - @orchdev/sdk@0.10.2

## 0.5.11

### Patch Changes

- Updated dependencies [93d85aa]
- Updated dependencies [93d85aa]
  - @orchdev/sdk@0.10.1

## 0.5.10

### Patch Changes

- Updated dependencies [166378b]
  - @orchdev/sdk@0.10.0

## 0.5.9

### Patch Changes

- Updated dependencies [19bb939]
  - @orchdev/sdk@0.9.7

## 0.5.8

### Patch Changes

- Updated dependencies [0136379]
  - @orchdev/sdk@0.9.6

## 0.5.7

### Patch Changes

- Updated dependencies [b0ad9ce]
- Updated dependencies [cba609d]
  - @orchdev/sdk@0.9.5

## 0.5.6

### Patch Changes

- 7f4603e: Implemented custom fields in messages, used by support bot
- Updated dependencies [7f4603e]
  - @orchdev/sdk@0.9.4

## 0.5.5

### Patch Changes

- Fixed memory leak in Api
- Updated dependencies
  - @orchdev/sdk@0.9.3

## 0.5.4

### Patch Changes

- Updated dependencies [662d6fa]
  - @orchdev/sdk@0.9.2

## 0.5.3

### Patch Changes

- Updated dependencies
  - @orchdev/sdk@0.9.1

## 0.5.2

### Patch Changes

- Fixed tests and build

## 0.5.1

### Patch Changes

- Updated dependencies [dc17255]
- Updated dependencies [de29341]
- Updated dependencies [49d0c53]
- Updated dependencies [b70f6ab]
  - @orchdev/sdk@0.9.0

## 0.5.1-rc.1

### Patch Changes

- Updated dependencies
  - @orchdev/sdk@0.9.0-rc.1

## 0.5.1-rc.0

### Patch Changes

- Updated dependencies [de29341]
- Updated dependencies
- Updated dependencies [b70f6ab]
  - @orchdev/sdk@0.9.0-rc.0
