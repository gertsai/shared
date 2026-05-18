---
depth: standard
id: PRD-038
kind: prd
last_modified_at: 2026-05-16T22:32:11.537951+00:00
last_modified_by: claude-code/2.1.142
links:
- target: EVID-053
  relation: based_on
status: active
title: Wave 12.E-fix combined — 5 CRITICAL + 14 HIGH closures across 3 example apps
---

# PRD-038 — Wave 12.E-fix combined — 5 CRITICAL + 14 HIGH closures

## Target Audience

- **Primary:** new contributors using `examples/m9s-example*` as reference. The 5 CRITICAL items are real production-breakers if copied; closing them keeps the examples production-grade.
- **Secondary:** maintainers of `@gertsai/*` substrate. Wave 11.A FR-003 + cross-app contract correctness are integration tests of Wave 12.B/C/D fixes.
- **Tertiary:** Wave 12.F + 12.G — must build on a clean example-app baseline.

## Problem Statement

EVID-053 surfaced 5 CRITICAL + 14 unique HIGH findings across 3 example apps. Most actionable items:

1. **Runtime bug:** frontend renders `hit.similarity.toFixed(3)` but backend returns `score` (CRIT-3) — search page crashes when actually used.
2. **Broken access control:** 3 ingest actions check session ONLY if present, allowing anonymous POST `/api/v1/ingest/delete` (CRIT-2, CWE-862).
3. **FR-003 broken:** Redis rotation store wired in composition root but never consumed; `REDIS_URL` env has no effect on actual rotation path (CRIT-1, CWE-613).
4. **OpenAPI generator dead code:** 683-LOC central feature of api-types is exported but unused; generated schema contradicts backend reality (CRIT-4, CRIT-5).

14 HIGH items cover: backend (JWT_SECRET startup warning, queue worker SSE terminal frames missing, dead error scrubber, worker _destroyed contract), frontend (XHR/SSE bypass tenant+auth, safeNextRedirect control-char gap), cross-app (auth endpoints missing from api-types, OpenAPI typing gaps, frontend topK/limit drift), security (SSE unauthenticated+rate-limit gap, bcryptjs not native, frontend jti preservation).

Combined into single sprint per AgentsTeam pattern with 3 teammates by app directory ownership.

## Goals

1. **All 5 CRITICAL closed.** Each cited `file:line` patched; verifiable via running tests + manual smoke (search page renders, anon delete returns 401, REDIS_URL test).
2. **All 14 HIGH closed.** Same standard.
3. **No regression:** all existing tests + lint + typecheck stay green.
4. **Migration cost low** — soft-breaking documented in PR body; mostly internal-only changes.

## Non-Goals

- **NG-001** — MEDIUM/LOW findings deferred to polish sprint.
- **NG-002** — Out of scope: Wave 12.F (cross-package consistency), 12.G (aggregate).
- **NG-003** — No `@gertsai/*` substrate fixes — those went through 12.A-D.
- **NG-004** — No three-error-envelope reconciliation (Backend `ProblemDetails` vs OpenAPI schema vs generator `GertsErrorResponse`) — too large; defer to Wave 14 or 12.F.
- **NG-005** — No publish on m9s-example* (these are example apps, not published packages — patch-bump via changesets only for changelog continuity).

## Functional Requirements

### CRITICAL (5)

- [ ] **FR-001 (CRIT-1)** — Wire `infrastructure.rotationStore` into auth actions. Replace static imports from `services/auth/src/rotation-store.ts` with calls through `ctx.service.rotationStore` or `service.lifecycle.created()` injection. Delete the module-level Map. `REDIS_URL` env now actually selects Redis rotation store.
- [ ] **FR-002 (CRIT-2)** — Invert anonymous-bypass guards in `delete-document.action.ts`, `upload-document.action.ts`, `ingest-document.action.ts`. Either flip `auth: 'required'` at route level OR change `if (session !== undefined)` → `if (session === undefined) throw new AuthenticationRequiredError(...)` + unconditional `assertAuthenticated(session) + assertSessionInTenant(session, ...)`.
- [ ] **FR-003 (CRIT-3)** — Align search response contract end-to-end. Backend `services/search/types.ts:53-60` declares `{docId, chunkIdx, text, score}`; frontend `routes/search/+page.svelte:72` reads `hit.similarity`. Pick one canonical name. Recommend keeping backend `score` (matches `domain/chunk.ts`); update frontend to read `hit.score.toFixed(3)`. Drop `as never` cast in `routes/search/+page.server.ts:43-46` so type checking actually verifies the contract.
- [ ] **FR-004 (CRIT-4)** — Regenerate `m9s-example-api-types/src/generated/openapi-schema.d.ts` to match actual backend response shapes: `IngestDocumentResponse: {docId, jobId, mode: 'queued' | 'inline', chunkCount: number | null}`; `SearchQueryResponse: {results: [{docId, chunkIdx, text, score}]}`. Update SPEC-019 hand-curated fixture in `scripts/generate-openapi-contract.mjs:188-244` to mirror typia DTO types.
- [ ] **FR-005 (CRIT-5)** — Either delete `generateOpenAPISchema` (683 LOC dead code in `api-types/src/openapi/generator.ts:278-683`) + companion `OpenApiGeneratorOptions` type surface, OR wire it into the backend (`examples/m9s-example/src/openapi/schema.ts:20-34` TODO). Decision: **delete** — backend's static `buildOpenApiSchema()` is the working path; eliminating the dead generator removes drift risk + simplifies the package surface. Document removal in changeset.

### HIGH backend (4)

- [ ] **FR-006 (H-1)** — `services/auth/lifecycle.ts:26-31` `addStartedHandler` should pre-validate `JWT_SECRET` via `getSecret()` so error fires at boot, not on first request. Remove misleading "demo secret" warning (the demo secret no longer exists post Wave 11.A).
- [ ] **FR-007 (H-2)** — `services/ingest/src/queues/ingest-chunk.worker.ts` emit `embedding`/`persisted`/`done` SSE frames after `useCase.execute(...)` success. Mirror inline branch frame ordering in `ingest-document.action.ts`. Resolves UX bug where queued ingest reports phantom timeout error.
- [ ] **FR-008 (H-3)** — Worker must respect `_destroyed` Wave-12.D-fix L-5 contract. Add `try/catch` for `'destroyed'` AppError; abort silently (no retry).
- [ ] **FR-009 (H-4)** — Wire `composition/errors.ts:appErrorToHttpResponse` as Moleculer service `onError` hook, OR delete the file. Decision: **wire** as `api.service.ts onError` so PII/internal-fields scrub actually applies. Mirror OpenAPI schema advertisement.

### HIGH frontend (3)

- [ ] **FR-010 (H-5)** — `ingest/+page.svelte:122-123` XHR upload must include `X-Tenant-ID` + Bearer header. Use `apiConfig.baseUrl` not hardcoded path. Set `xhr.withCredentials = true` for cross-origin cookie auth fallback.
- [ ] **FR-011 (H-6)** — `lib/sse-client.ts:76` EventSource needs absolute URL from `apiConfig`, `{withCredentials: true}` for cross-origin, AND tenant-id via query param (since EventSource can't set headers).
- [ ] **FR-012 (H-7)** — `login/+page.server.ts:48-58` `safeNextRedirect` reject control chars (`\t`, `\n`, `\r`, NUL bytes). Tighten character allowlist.

### HIGH cross-app (6)

- [ ] **FR-013 (H-8)** — Add to api-types: `LoginRequest`/`LoginResponse`, `RefreshRequest`/`RefreshResponse`, `LogoutRequest`/`LogoutResponse`, `DemoUser`. Source from backend `services/auth/types.ts`. Frontend imports replace inline structural duplicates.
- [ ] **FR-014 (H-9)** — `api-types/src/openapi/types.ts:275-284` `OpenApiGeneratorOptions.schema: any` → if generator is being deleted (FR-005), remove this type too. Else replace with `IJsonSchemaUnit.IV3_1`.
- [ ] **FR-015 (H-10)** — If generator deleted (FR-005), `IJsonSchemaUnit` + `@samchon/openapi` imports drop from dist surface automatically. Verify post-FR-005.
- [ ] **FR-016 (H-11)** — Update `examples/m9s-example/src/openapi/schema.ts:56-258` hand-curated OpenAPI to mirror handler reality: `SearchQueryRequest` has `topK` not `limit`; `IngestDocumentResponse` has `jobId` + `chunkCount`; `SearchQueryResponse.results[i]` has `chunkIdx` + `score`. Goal: doc-to-handler parity.
- [ ] **FR-017 (H-12)** — `examples/m9s-example-web/src/routes/search/+page.server.ts:42` sends `{ query, limit: 10 }`; rename to `topK` to match backend handler. Together with FR-003 and FR-016, restores contract integrity end-to-end.
- [ ] **FR-018 (H-13)** — `examples/m9s-example-web/src/lib/api/client.ts:33,49` drop `PlaceholderPaths` alias + `as never` casts in form action server files. Force openapi-fetch body type-checking against actual `paths` so future drift surfaces at compile time.

### HIGH security (4)

- [ ] **FR-019 (H-14)** — `mol-services/sse-ingest.handler.ts:83-123` + `mol-services/api.service.ts:216-217` require access JWT on SSE route; derive `tenantId` from `claims.tenantId` not query string; reject mismatched `?tenant=` values.
- [ ] **FR-020 (H-15)** — Add separate rate limiter on SSE route (`api.service.ts:211-219`) keyed on IP (since tenant is untrusted) with connection-per-IP cap.
- [ ] **FR-021 (H-16)** — Replace `bcryptjs` with native `bcrypt` (or `argon2` per OWASP). Adjust cost factor for latency target. Update `services/auth/src/{user-repo,actions/login.action}.ts` imports.
- [ ] **FR-022 (H-17)** — `examples/m9s-example-web/src/lib/server/jwt.ts:130-138` `verifyToken` must spread `jti` into returned claims when present (mirror backend `services/auth/src/jwt.ts:147`). Restores `JwtRefreshClaims` invariant.

## Non-Functional Requirements

- **NFR-001 — Backward-compat additive.** Most fixes are internal (private API, server-side). Soft-breaking visible in 2 places: search response `hit.similarity` → `hit.score` (frontend-only rename + contract alignment); OpenAPI generator removal (api-types unused export). Both documented in changesets.
- **NFR-002 — Test budget.** Each affected area gains tests: anti-anon (CRIT-2), rotation store consumed (CRIT-1), search round-trip (CRIT-3), JWT refresh `jti` preservation (FR-022).
- **NFR-003 — File ownership by app directory.** 3 teammates:
  - **A**: `examples/m9s-example/**` (backend) — CRIT-1, CRIT-2, FR-006..009, FR-016, FR-019..021
  - **B**: `examples/m9s-example-web/**` (frontend) — CRIT-3 frontend side, FR-010..012, FR-017, FR-018, FR-022
  - **C**: `examples/m9s-example-api-types/**` + cross-app coordination — CRIT-3 contract alignment, CRIT-4, CRIT-5, FR-013..015
- **NFR-004 — Forgeplan safety.** MCP only.
- **NFR-005 — Time bound.** ≤4 hours wallclock.
- **NFR-006 — No new deps in m9s-example* package.json's** EXCEPT FR-021 (bcryptjs → bcrypt or argon2). Document in changeset.

## Related Artifacts

- **EVID-053** — sources all 19 items (5 CRIT + 14 HIGH)
- **PRD-037 + RFC-025** — Wave 12.E audit parent
- **PRD-029/030/031/033/034/036 + EVID-045/046/047/049/050/052** — Wave 12.B/C/D-fix precedents
- **EVID-040 (FR-003 anchor)** — Wave 11.A production hardening
- **EVID-041** — Wave 11.B `JwtClaims` shared via api-types
- **CLAUDE.md** — Wave 11/12 status + KNOWN-ISSUES.md residual

Refs: EVID-053 (sources), PRD-036 (precedent), PRD-037 (audit parent).




