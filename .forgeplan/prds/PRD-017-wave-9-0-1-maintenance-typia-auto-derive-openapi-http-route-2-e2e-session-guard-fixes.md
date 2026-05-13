---
depth: standard
id: PRD-017
kind: prd
last_modified_at: 2026-05-13T23:11:58.886659+00:00
last_modified_by: claude-code/2.1.139
links:
- target: EVID-031
  relation: informs
status: active
title: Wave 9.0.1 maintenance — typia auto-derive + /openapi HTTP route + 2 e2e session-guard fixes
---

# PRD-017: Wave 9.0.1 maintenance — typia auto-derive + /openapi HTTP route + 2 e2e session-guard fixes

## Problem Statement

EVID-031 §"Wave 9.0.1 follow-up tracking" lists 3 maintenance items deferred from Wave 9 ship:

1. **Hand-curated schema bridge**: `examples/m9s-example/src/openapi/schema.ts` (~258 LOC) is a hand-maintained OpenAPI 3.1 IDocument that must be kept in sync with action signatures manually. Wave 9 shipped this as a chicken-and-egg bridge while Teammate B's api-types package matured. Now that `@gertsai-examples/m9s-example-api-types/openapi` exports `generateOpenAPISchema` + `OpenApiMapper<T>` + `ApiEndpointsGenerator<T>`, the bridge should be replaced with full typia auto-derive.

2. **`/openapi/schema.json` HTTP route broken**: Wave 9 Teammate A wired `createOpenApiService` to register `v2.openapi.schema.aggregated` (rest: `GET /schema.json`) and `v2.openapi.schema.local` (rest: `GET /schema.local.json`) as broker actions. Backend startup logs confirm `Service 'v2.openapi'` registered. BUT `mol-services/api.service.ts` route layout has `/api/v1` (whitelist `v1.**`) + static `/openapi` placeholder serving hand-curated JSON. Result: live `GET http://localhost:3031/openapi/schema.json` returns the static placeholder, NOT the auto-derived spec. Frontend `pnpm generate:openapi` cannot fetch the real spec.

3. **2 pre-existing e2e failures**: `tests/e2e.test.ts` has 2 tests failing (`rejects ingest with destroyed session — surfaces 401 Authentication required`, `rejects ingest with cross-tenant session — surfaces 403 Tenant scope violation`). Both expect `broker.call('v1.ingest.document', ...)` to REJECT when session is destroyed or tenant mismatched; tests get `result.resolved === true` instead. Root cause likely in action handler not propagating AuthenticationRequiredError / TenantScopeViolationError when testSession.meta is passed via Moleculer ctx.

## Target Audience

| Persona | Pain before Wave 9.0.1 |
|---|---|
| Frontend developer running `pnpm generate:openapi` | Live spec endpoint serves stub; type generation does not pick up real action changes |
| Backend developer adding new action | Must manually update `src/openapi/schema.ts` to keep spec in sync — error-prone |
| QA running e2e suite | 2 known-failing tests obscure regressions in genuine session-guard behavior |
| Audit reviewer | EVID-031 flagged 3 deferred items — unclosed audit trail |

## Goals

1. **G-1**: `examples/m9s-example/src/openapi/schema.ts` REPLACED with `buildOpenApiSchema()` using `typia.json.schema<OpenApiMapper<ApiEndpointsGenerator<typeof ApiEndpoints>>, '3.1'>()` + `generateOpenAPISchema({schema, servers, info})` from `@gertsai-examples/m9s-example-api-types/openapi`. Measured by: 9 existing openapi-schema tests still PASS + new test asserts schema is structurally identical to Wave 9 hand-curated output (regression guard).

2. **G-2**: `GET /openapi/schema.json` HTTP endpoint serves the broker-registered spec. Measured by: `curl http://localhost:3031/openapi/schema.json | jq '.openapi'` returns `"3.1.0"` + `.paths | keys` returns both `/api/v1/ingest/document` and `/api/v1/search/query`. Achieved by updating `api.service.ts` route configuration to whitelist `v2.openapi.**` via `autoAliases` (Moleculer auto-maps `rest: 'GET /schema.json'` action field to `/openapi/schema.json`).

3. **G-3**: 2 pre-existing e2e session-guard tests PASS. Root cause investigated and fixed in either action handler (mapping AppError → APIError) OR action-handler upstream logic. Measured by: `pnpm test e2e` exit 0 with 8/8 tests pass.

4. **G-4**: Backwards compat. All 9 openapi-schema tests + 6 e2e (currently passing) + remaining 56 m9s tests = 71 tests pass. No new test files needed beyond optional regression guard for G-1.

5. **G-5**: Strict floor preserved. tsc + lint + svelte-check + build all exit 0.

## Functional Requirements

- **FR-1**: `src/openapi/schema.ts` `buildOpenApiSchema()` returns identical IDocument shape via typia + `generateOpenAPISchema` (no hand-maintained literal).
- **FR-2**: `src/index.ts` import of `ApiEndpoints` types from `services/*` (needed for the typia generic).
- **FR-3**: `mol-services/api.service.ts` route layout updated — either (a) extend `/api/v1` whitelist to include `v2.openapi.**`, or (b) replace static `/openapi` handler with a real route + `autoAliases: true` + `whitelist: ['v2.openapi.**']`. Choose (b) — cleaner separation. The hardcoded placeholder JSON deleted.
- **FR-4**: e2e session-guard tests pass. If root cause is action handler missing AppError translation, fix in `src/services/ingest/src/actions/ingest-document.action.ts` catch block (mirror search-query.action.ts post-Wave-8.2 ValidationError pattern).
- **FR-5**: `pnpm --filter @gertsai-examples/m9s-example test` → 71/71 tests pass.

## Non-Functional Requirements

| ID | Category | Constraint | Measurement |
|---|---|---|---|
| NFR-1 | Reversibility | Single `git revert` of merge commit restores Wave 9 hand-curated state | Manual smoke |
| NFR-2 | Compat | Wave 9 OpenAPI contract shape preserved per SPEC-019 | curl + jq assertions |
| NFR-3 | LOC budget | ≤200 production LOC (replace ~258 LOC schema literal with ~50 LOC typia call; ~20 LOC route fix; ~30 LOC test/action fix) | `git diff --stat` |
| NFR-4 | Strict floor | tsc + lint + check exit 0 | CI gates |
| NFR-5 | No new external deps | All work uses existing packages (`@gertsai-examples/m9s-example-api-types` already wired) | package.json diff: 0 |

## Out of Scope

- Promoting `@gertsai-examples/m9s-example-api-types` to a `@gertsai/api-types` shared package (separate Wave 11+ initiative)
- Wave 10 features (auth UI, CMS, file upload, SSE, i18n, Storybook, error UI) — separate PRD-016 → PRD-018+ flow

## Risks & Mitigations

| ID | Risk | Probability | Impact | Mitigation |
|---|---|---|---|---|
| R-1 | typia generic `<OpenApiMapper<ApiEndpointsGenerator<typeof Endpoints>>, '3.1'>` produces a different schema shape than hand-curated SPEC-019 | High | Medium | Add a regression test diffing output structure (key set + types). If divergence is structural improvement (e.g. better-typed details), update SPEC-019 to match. If divergence is bug, fix in typia call site. |
| R-2 | api.service.ts route reorder breaks /api/v1 traffic | Low | High | Add e2e smoke that hits both /api/v1/ingest/document AND /openapi/schema.json |
| R-3 | e2e root cause turns out to be deeper than action handler (e.g. ApiController-level session prepass) | Medium | Medium | Investigate via simple debug commit; if scope expands beyond 1-day fix, defer to Wave 9.0.2 separate sprint |
| R-4 | `typia.json.schema<...>()` requires `tspc` transform; runtime call may break under non-tspc consumers | Low | Low | m9s-example already uses tspc via postinstall `ts-patch install`; verified |

## Related Artifacts

| Artifact | Relation |
|---|---|
| EVID-031 | informs — Wave 9 ship evidence flagged these 3 items |
| PRD-015 / RFC-011 / ADR-014 | informs — Wave 9 parent |
| SPEC-019 | informs — OpenAPI contract shape this maintenance preserves |
| RFC-012 (next) | refines — implementation strategy |
| EVID-032 (next) | informs — Wave 9.0.1 ship evidence

## Affected Files

**MODIFY**:
- `examples/m9s-example/src/openapi/schema.ts` — full replacement (~50 LOC final)
- `examples/m9s-example/src/openapi/index.ts` — barrel unchanged
- `examples/m9s-example/src/index.ts` — minor import of Endpoints types
- `examples/m9s-example/src/mol-services/api.service.ts` — route layout update (~20 LOC delta)
- `examples/m9s-example/src/services/ingest/src/actions/ingest-document.action.ts` — possibly add AppError catch translation (~10 LOC delta) depending on e2e root cause
- `examples/m9s-example/tests/openapi-schema.test.ts` — verify still passes (likely no edit)

**OPTIONAL NEW**:
- `examples/m9s-example/tests/openapi-route.test.ts` — broker.call('v2.openapi.schema.aggregated') asserts shape (~30 LOC) for regression guard

## Acceptance Gate

PRD-017 satisfied when all 5 goals measured PASS, all 5 FRs verified, all 5 NFRs spot-checked, EVID-032 records: (a) live curl /openapi/schema.json returns valid 3.1 spec, (b) 71/71 m9s tests pass, (c) tsc + lint + build exit 0.




