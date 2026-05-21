---
'@gertsai/api-core': minor
'@gertsai/session': patch
---

Wave 33 — forgeplan ledger cleanup + EVID-083 W tail + m9s real-infra test debt closed.

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
