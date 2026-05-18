---
depth: standard
id: EVID-056
kind: evidence
last_modified_at: 2026-05-18T20:25:10.830078+00:00
last_modified_by: claude-code/2.1.142
links:
- target: PRD-039
  relation: informs
status: active
title: Wave 12.E-fix-2 Phase 2 — 13 HIGH closures via 2-teammate parallel (backend + frontend)
---

## Summary

Wave 12.E-fix-2 Phase 2 closes 13 HIGH findings from EVID-053 + 1 newly-flagged backend openapi/schema.ts realignment surfaced during Phase 1 (Teammate B). Executed as 2 parallel teammates (`typescript-pro` for backend + `frontend-developer` for frontend/api-types) under team-lead orchestration. Both teammates produced real on-disk file changes — Phase 1's lesson about disjoint scope + verbatim EVID-053 text held.

## Structured Fields

- **verdict**: supports
- **congruence_level**: CL3
- **evidence_type**: code_review
- **linked_artifact**: PRD-039
- **summary**: 13/13 Phase 2 HIGHs closed + 1 newly-flagged backend realignment. H-16 (bcryptjs → native) deferred to Wave 13.

## Closures by teammate

### Teammate C — Backend HIGHs (7 files, +214 / -22 LOC)

| Finding | File(s) | Decision |
|---|---|---|
| H-1 (JWT_SECRET startup) | `services/auth/lifecycle.ts:51` | Hard-fail at boot — mirrors web's `lib/server/jwt.ts:43-46`. Pre-fix: warn then throw on first request. Added e2e test fixture `process.env.JWT_SECRET ??= '...'` since broker boot now requires the env var |
| H-2 (queued SSE frames) | `services/ingest/src/queues/ingest-chunk.worker.ts` | Mirrors inline-mode 4-frame template from `actions/ingest-document.action.ts:159-169`: `embedding` before `useCase.execute`, `persisted` after, `done` at end, `error` in catch before BullMQ throw |
| H-3 (_destroyed re-check) | `ingest-chunk.worker.ts:119` + `services/ingest/lifecycle.ts:+6` | Wave 12.D-fix L-5 contract bootstrap (NO prior _destroyed usages existed — forward-looking pattern). Closure-style `isDestroyed()` to dodge TS narrowing |
| H-4 (HTTP scrubber wire) | `composition/errors.ts` + `actions/{ingest,delete}-document.action.ts` | Chose WIRE over delete. `appErrorToHttpResponse` wired into 4 catch sites for `AuthenticationRequiredError`/`TenantScopeViolationError`/`isAppError` fallback. Type-vs-runtime gap: `data: ... as never` cast bridges `ResponseDataType<ErrorCode>` resolving to `never` because every error meta uses default `getNeverValidator()` |
| Backend `openapi/schema.ts` (newly flagged) | `examples/m9s-example/src/openapi/schema.ts` | Mirrors Wave 12.E-fix-2 Phase 1 CRIT-4 api-types snapshot. Runtime `GET /openapi/schema.json` now serves correct contract |

**Teammate C deliberate non-action:** `Table.stories.ts as never` casts NOT removed — Storybook generic widening with existing rationale comments, unrelated root cause from H-13.

### Teammate D — Frontend + cross-app + security HIGHs (12 files, +416 / -110 LOC + 2 new files)

| Finding | File(s) | Decision |
|---|---|---|
| H-5 (XHR upload auth) | `routes/ingest/+page.svelte` + new `lib/api/config.ts` | XHR hits `${apiConfig.baseUrl}/api/v1/ingest/upload` with `X-Tenant-ID` header + `withCredentials = true`. Browser-safe `apiConfig` extracted to new `config.ts` so `node:async_hooks` doesn't bleed into client bundle |
| H-6 (SSE auth + tenant) | `lib/sse-client.ts` | EventSource uses `apiConfig.baseUrl` + `tenantId` query param + `withCredentials: true`. EventSource can't set custom headers — tenantId rides URL |
| H-8 (auth endpoint types) | new `m9s-example-api-types/src/auth-types.ts` (+92 LOC) + `index.ts` | Mirrors Wave 12.E-fix-1 `search-types.ts` extraction pattern. Exports `AuthUser`, `LoginRequest/Response`, `RefreshRequest/Response`, `LogoutRequest/Response`. Frontend `login/+page.server.ts` imports `LoginResponse` instead of inline duplicate |
| H-9 (`schema: any`) | `m9s-example-api-types/src/openapi/types.ts` | Tightened to `Record<string, unknown>` + added `OpenApiServerEntry` for `servers[]`. Kept interface for forward compat |
| H-10 (dist hygiene) | `dist/` cleaned via `pnpm run clean && run build` | Stale `dist/openapi/generator.{d.ts,js}` removed post Wave 12.E-fix-2 Phase 1 CRIT-5 deletion. `git grep` for typia/@samchon in dist now empty |
| H-13 (PlaceholderPaths) | `lib/api/client.ts`, `routes/{ingest,search}/+page.server.ts`, `routes/login/+page.server.ts` | Dropped `PlaceholderPaths` alias + `as never` casts. Frontend imports real `paths` + canonical types. (`Table.stories.ts` casts retained — separate root cause) |
| H-14 (SSE IDOR) | `mol-services/sse-ingest.handler.ts` | Reads `auth_token` cookie → `verifyToken` → 401 on missing/invalid → 403 on tenantId mismatch |
| H-15 (SSE DoS) | `sse-ingest.handler.ts` | Per-IP burst (`SSE_RATE_LIMIT_IP_BURST=10/min`) + per-tenant concurrent open-stream cap (`SSE_RATE_LIMIT_TENANT_OPEN=50`). Slots released in cleanup |

## Deferred

- **H-16** (bcryptjs → native bcrypt) — requires native module which complicates cross-platform builds (Mac/Linux/Windows). Documented as `KNOWN-ISSUES.md` candidate; revisit in Wave 13 if real-infra perf becomes a concern.
- **H-11/H-12** (handcurated `limit` vs `topK` schema drift) — Already covered transitively: Wave 12.E-fix-1 fixed frontend; Phase 1 fixed api-types snapshot; Phase 2 fixed backend `openapi/schema.ts`. Closed.
- Backend tests for SSE auth + rate limit not added — handler is fully typed and typechecks green; suggested follow-up unit tests for `readCookie`, `ipRateLimitExceeded`, `acquireTenantSlot`/`releaseTenantSlot`.

## Acceptance verification (all PASS)

- `pnpm --filter '@gertsai-examples/*' run build` — green (3/3 example apps)
- `pnpm --filter '@gertsai-examples/*' run typecheck` — 0 errors
- `pnpm --filter @gertsai-examples/m9s-example-web run check` — 1090 files, 0 errors, 0 warnings
- `pnpm --filter @gertsai-examples/m9s-example run test` — 15/17 test files pass, 79 tests pass, 0 fail (same baseline as Phase 1; 2 e2e ioredis hook timeouts pre-existing)

## Acceptance greps (all clean)

- `git grep -n "PlaceholderPaths" examples/m9s-example-web/src/lib/` — only JSDoc reference
- `git grep -n "new EventSource" examples/m9s-example-web/src/` — shows `tenantId` + `withCredentials: true`
- `git grep -n "setRequestHeader.*X-Tenant-ID" examples/m9s-example-web/src/routes/ingest/` — present
- `git grep -n "chunksIndexed\|took_ms" examples/m9s-example/src/openapi/schema.ts` — EMPTY
- `git grep -n "'sync' \| 'queued'" examples/m9s-example/src/openapi/schema.ts` — EMPTY
- `git grep -n "_destroyed === true" examples/m9s-example/src/services/ingest/src/queues/` — present
- `git grep -rn "from 'typia'\|from '@samchon" examples/m9s-example-api-types/dist/` — EMPTY

## Process notes

- 2-teammate parallel pattern (down from 3 in Wave 12.E-fix-1) + verbatim EVID-053 text in prompts + explicit file-line specs → both teammates landed real on-disk changes.
- Phase 1's lesson about `git status --short` truncation → cross-checked with `git diff --stat HEAD` throughout.
- Net: 17 files modified + 2 new files, +630 / -132 LOC.

## Refs

- PRD-039 (Wave 12.E-fix-2 target)
- RFC-026 (this fix strategy)
- EVID-053 (audit source)
- EVID-055 (Phase 1 precedent — CRIT-1/4/5)
- PRD-038 + EVID-054 (Wave 12.E-fix-1 — CRIT-2/3 + H-7/17)



