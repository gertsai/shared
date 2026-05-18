---
depth: standard
id: EVID-053
kind: evidence
last_modified_at: 2026-05-16T22:28:44.260952+00:00
last_modified_by: claude-code/2.1.142
links:
- target: PRD-037
  relation: informs
status: active
title: Wave 12.E aggregated audit — 3 example apps × 4 domain reviewers
---

# EVID-053 — Wave 12.E aggregated audit findings

Multi-expert audit of 3 example apps (m9s-example backend + m9s-example-web frontend + m9s-example-api-types shared). 4 parallel domain reviewers per RFC-025 (backend logic+arch + frontend SvelteKit + cross-app types + security/Wave-11.A FR).

## Structured Fields

- **verdict:** `weakens` — 5 CRITICAL findings surface across all 3 apps. Most actionable: (a) **runtime bug in search page** — `hit.similarity.toFixed(3)` throws because backend returns `score` not `similarity`; (b) **anonymous can ingest/delete documents** (broken access control); (c) **FR-003 Redis rotation store wired but never consumed** — auth actions still use module-level Map even when `REDIS_URL` set. The Wave 11.A FR-001/002/004/005 verification PASSED. Cross-app type contract has 3 CRITICAL drift items.
- **congruence_level:** `CL3` — same target system, internal validation by 4 specialised agents.
- **evidence_type:** `internal_audit`.
- **R_eff per-finding:** `0.5 − 0.0 = 0.5` (verdict=weakens). Above threshold.
- **Wallclock:** ~25 min wallclock across 4 parallel reviewers.

## Executive Summary

| Severity | Backend | Frontend | Cross-app | Security | **Raw** | **After collapse** |
|---|---:|---:|---:|---:|---:|---:|
| CRITICAL | 0 | 0 | 3 | 2 | 5 | **5** (all distinct) |
| HIGH | 4 | 3 | 6 | 4 | 17 | **~14** |
| MEDIUM | 8 | 6 | 4 | 5 | 23 | ~20 |
| LOW | 6 | 7 | 3 | 3 | 19 | ~15 |

## Wave 11.A FR-001..005 verification (per RFC-025 FR-006)

| FR | Status | Notes |
|---|---|---|
| FR-001 — Real bcrypt + anti-enumeration | ✅ | login + dummy-hash compare confirmed |
| FR-002 — JWT_SECRET no fallback | ✅ | backend + web both throw unconditionally on empty secret |
| FR-003 — Redis rotation store | ⚠️ **PARTIAL** | Redis impl exists + composition root wires `SharedInfrastructure.rotationStore`, BUT auth actions still call module-level synchronous in-memory `consumeJti/registerJti/revokeUser` from `services/auth/src/rotation-store.ts:41`. `REDIS_URL` env has NO effect on the actual refresh-token rotation path. **CRITICAL — see CRIT-1.** |
| FR-004 — Per-tenant SSE caps | ✅ | cap=10, sentinel-error semantics verified |
| FR-005 — CORS env allowlist | ✅ | production hard-fail, dev wildcard + warn |

## CRITICAL findings (5)

### CRIT-1 — FR-003 Redis rotation store wired but never consumed (CWE-613)

**Files:** `examples/m9s-example/src/services/auth/src/actions/login.action.ts:27,132` + `refresh.action.ts:23,97-98`

Both auth actions import `registerJti/consumeJti/revokeUser` from `../rotation-store` (the module-level in-memory Map). Composition root's `SharedInfrastructure.rotationStore` (`composition/infrastructure.ts:120-126`, picks `RedisRotationStore` when `REDIS_URL` set) is never referenced anywhere. Multi-instance prod deploys fail across nodes; reuse detection breaks on process restart.

**Fix (Wave 12.E-fix-1):** pass `infrastructure.rotationStore` into auth service via DI; replace static imports with `await store.consumeJti(...)`. Delete legacy module-level Map.

### CRIT-2 — Anonymous can ingest AND delete documents (CWE-862, OWASP A01)

**Files:** `examples/m9s-example/src/services/ingest/src/actions/{delete-document,upload-document,ingest-document}.action.ts`

3 actions are `auth: 'none'` AND guard with `if (session !== undefined) { assertAuthenticated(session); ... }`. When no session in context, guard SKIPPED and action proceeds. Unauthenticated POST to `/api/v1/ingest/delete` removes any tenant's documents.

**Fix:** invert guard — `if (session === undefined) throw new AuthenticationRequiredError(...)` then unconditional `assertAuthenticated` + `assertSessionInTenant`. OR flip route-level `authentication: true` in `api.service.ts:169-170`.

### CRIT-3 — Live runtime bug in search page (TypeError)

**Files:** `examples/m9s-example-web/src/routes/search/+page.svelte:72` (consumer); backend `services/search/types.ts:53-60` + `domain/chunk.ts:22-27` (source)

Frontend renders `hit.similarity.toFixed(3)` but backend response has `score`, not `similarity`. After typia validation, `responseData.results[i].similarity === undefined` → `.toFixed(3)` throws `TypeError: Cannot read properties of undefined`. Either fails immediately or has been masked by the `as never` cast in `routes/search/+page.server.ts:43-46`.

**Fix:** align contract end-to-end — rename `score` ↔ `similarity` on one side (and `chunkIdx`, `took_ms`), drop `as never` escape hatch so type checking actually runs against wire shape.

### CRIT-4 — Generated `openapi-schema.d.ts` ships seed-spec contradicting backend reality

**File:** `examples/m9s-example-api-types/src/generated/openapi-schema.d.ts:52-69`

`IngestDocumentResponse` declared as `{docId, mode: 'sync' | 'queued', chunksIndexed?}` but backend emits `{docId, jobId, mode: 'queued' | 'inline', chunkCount: number | null}`. `SearchQueryResponse` declared as `{results: [{docId, text, similarity}], took_ms}` but backend emits `{results: [{docId, chunkIdx, text, score}]}`. Hand-written + generated wire spec contradicts typia-validated handler types.

**Fix:** wire `generateOpenAPISchema()` to the live typia pipeline (TODO already in `examples/m9s-example/src/openapi/schema.ts:20-34`); align hand-curated SPEC-019 fixture with typia-validated types.

### CRIT-5 — Generator exported but unused — guaranteed drift

**File:** `examples/m9s-example-api-types/src/openapi/generator.ts:278-683`

`generateOpenAPISchema` (683-LOC function — central feature per RFC-011/SPEC-019) is dead code; no first-party consumer invokes it. Backend wires the static `buildOpenApiSchema()` in `examples/m9s-example/src/openapi/schema.ts:56-258` instead.

**Fix:** either delete the generator path (and seed-mode README), OR wire it into the backend. The current "exported but bypassed" guarantees forever-drift.

## HIGH findings (consolidated, ~14 unique)

### Backend logic + architecture (4)
- H-1 — Misleading JWT_SECRET startup warning (warning at boot, throw on first request — `auth/lifecycle.ts:26-31`)
- H-2 — Queue-mode SSE never emits terminal frames (`ingest-chunk.worker.ts:96-146` — UX bug: every queued ingest reports phantom timeout error)
- H-3 — Worker ignores `_destroyed` post-await (Wave 12.D-fix L-5 contract violation in `ingest-chunk.worker.ts:109-114,124-130`)
- H-4 — Dead-code HTTP scrubber `composition/errors.ts:58-71` — `appErrorToHttpResponse` exported but never wired; OpenAPI schema advertises scrubbing but action handlers leak `userId`/`url`/`originalKind`

### Frontend SvelteKit (3)
- H-5 — XHR upload bypasses tenant + auth (`ingest/+page.svelte:122-123` — no X-Tenant-ID, no Bearer)
- H-6 — SSE EventSource bypasses base URL + tenant (`lib/sse-client.ts:76` — hardcoded relative path, no headers)
- H-7 — Login `safeNextRedirect` misses control chars (`login/+page.server.ts:48-58` — tab/CRLF/NUL bytes)

### Cross-app types (6)
- H-8 — api-types only exports 2 of 9+ REST endpoint types (auth endpoints missing entirely)
- H-9 — `OpenApiGeneratorOptions.schema: any` defeats type safety (`api-types/src/openapi/types.ts:275-284`)
- H-10 — dist leaks `typia` + `@samchon/openapi` types to public surface
- H-11 — Backend `openapi/schema.ts:56-258` is 200-line hand-curated doc that should be generated; advertises `SearchQueryRequest.limit` but handler reads `topK` (live bug — see CRIT-3 + H-12)
- H-12 — Frontend sends `{ query, limit: 10 }` but backend reads `topK` — silently dropped by typia, user-facing top-N knob broken
- H-13 — Frontend still uses `PlaceholderPaths` alias + `as never` casts (Wave-9 pre-snapshot vestigial)

### Security (4)
- H-14 — SSE stream unauthenticated AND tenant-id client-supplied (`api.service.ts:216-217` — IDOR vector)
- H-15 — SSE route lacks rate limiting (`use: []` — CWE-770 DoS)
- H-16 — bcryptjs (pure JS) instead of native bcrypt — CPU starvation under load + breaks anti-enum timing
- H-17 — Frontend `verifyToken` drops `jti` when rebuilding `JwtRefreshClaims` (`lib/server/jwt.ts:130-138` — refresh-token attacker scenario crashes downstream)

## Per-app summary cards (3)

### `examples/m9s-example` (backend) — 7985 LOC
- Backend logic: 4 HIGH + 8 MED + 6 LOW · Security: 2 CRIT + 4 HIGH + 5 MED + 3 LOW
- **Top:** CRIT-1 + CRIT-2 (both critical security/integrity gaps); H-2 + H-3 + H-4 (queue/worker/error-scrubber issues); H-14..H-17 (SSE auth + rate-limit + bcrypt-JS).
- Wave 12 fix-adoption ✅ (m9s-cache subpath, defineAction, queue conditional spread, entity-storage base class, no DI emit sites)

### `examples/m9s-example-web` (frontend) — 4470 LOC
- Frontend: 3 HIGH + 6 MED + 7 LOW · cross-app + security touchpoints
- **Top:** H-5/H-6/H-7 (XHR/SSE/redirect bypasses), H-13 (PlaceholderPaths vestigial), CRIT-3 live bug.
- Storybook 10/10 components covered ✅; Paraglide wired correctly ✅; Svelte 5 runes consistently adopted ✅; no `{@html}` blocks ✅.

### `examples/m9s-example-api-types` (shared) — 1323 LOC
- Cross-app contract: 3 CRIT + 6 HIGH + 4 MED + 3 LOW
- **Top:** CRIT-4 + CRIT-5 (seed-spec + dead generator) — the package's central feature is currently a contract-divergence accelerator. JwtClaims (Wave 11.B / EVID-041) is the ONLY type properly shared end-to-end.

## Cross-app observations

1. **Three competing error envelopes** ship in the same workspace and cannot all be right:
   - Backend runtime: `ProblemDetails` from `@gertsai/errors/http` (RFC 9457 with urn buckets)
   - Backend OpenAPI declaration: `ProblemDetails` in `openapi/schema.ts:236-251` (RFC 9457 shape, no urn bucket)
   - api-types generator: `GertsErrorResponse` (completely different envelope) in `openapi/generator.ts:580-620`
2. **api-types missing auth endpoints** — login/refresh/logout are the most security-critical contracts AND most likely to drift, yet entirely absent from `paths`. Frontend invents inline structural duplicates.
3. **Permissive "auth if present" pattern** — 3 ingest actions follow `if (session !== undefined)` guard, inverting the secure default (CRIT-2 root). Future readers cargo-cult into real products.
4. **Two parallel rotation-store implementations diverged** (CRIT-1 root) — module-level sync Map vs `IRotationStore` port async impl. Both wired, only one consumed.
5. **Wave 11.A FR closures held** — bcrypt/JWT_SECRET/SSE-cap/CORS verifications all ✅. Only FR-003 (Redis rotation) has the wiring gap.
6. **Wave 12.B/C/D substrate fix adoption is clean** in m9s-example (subpath split, defineAction, conditional spread, _destroyed re-check) — Wave-12 lessons applied correctly at consumer site.
7. **Svelte 5 runes adopted consistently** — no legacy `$:` blocks, no `on:click`, `$state`/`$derived`/`$effect` correct. Clean Svelte 5 codebase.
8. **Console as logger** at 4 sites (`composition/infrastructure.ts:157,204`, `pg-document.repository.ts:76`, `openfga-permission.gate.ts:144`) bypasses redacting `createAppLogger`.
9. **Auth model is 3-way inconsistent** in frontend: cookie session for form actions, bearer for `lib/api/client.ts` via ALS, unauthenticated for XHR upload + SSE EventSource. Reference app should pick one and document exceptions.
10. **OpenAPI generator is contract-divergence accelerator** — published spec contradicts handlers; consumers reading the spec get wrong types.

## Suggested follow-up wave structure

Per Wave 12.B + 12.C + 12.D precedents:

**Sub-wave 12.E-fix-1 (5 CRITICAL closures):**
- CRIT-1 wire `infrastructure.rotationStore` into auth actions; delete module-level Map
- CRIT-2 invert anonymous-bypass guards; OR flip route auth to required
- CRIT-3 align search response contract (rename score↔similarity, add chunkIdx, drop `as never` casts)
- CRIT-4 align generated openapi-schema with typia-validated handler types
- CRIT-5 wire `generateOpenAPISchema` to live typia pipeline OR delete dead generator code
- Estimated: ~250 LOC, 1-2 days.

**Sub-wave 12.E-fix-2 (~14 HIGHs):**
- backend H-1..H-4 (JWT_SECRET startup, queue worker frames, dead error scrubber, _destroyed in worker)
- frontend H-5..H-7 (XHR auth, SSE auth, safeNextRedirect)
- cross-app H-8..H-13 (auth endpoint types, OpenAPI generator typing, generator unused, frontend type-checking enabled)
- security H-14..H-17 (SSE auth/rate-limit, bcryptjs→native, frontend jti preservation)
- Estimated: ~350 LOC, 2-3 days.

**Deferred:** ~20 MEDIUM + ~15 LOW → Wave 12.E-polish or rolled into Wave 14.

## Methodology

Per RFC-025:
- 4 parallel agents: `code-analyzer` (backend logic+arch), `frontend-developer` (SvelteKit specifics), `typescript-type-auditor` (cross-app contract), `security-expert` (security + Wave 11.A FR verification)
- Each got ONE prompt covering its domain across all 3 apps
- Read-only audit
- Cross-validation by orchestrator (same-file-line collapse, severity max-merge)
- Wallclock ~25 min total, ~600k tokens combined across 4 reviewers

## Refs

- **PRD-037** — Wave 12.E audit plan
- **RFC-025** — execution strategy
- **EVID-040** — Wave 11.A production-hardening (audit anchor)
- **EVID-041** — Wave 11.B JwtClaims unification (audit anchor)
- **EVID-039** — Wave 10.E re-audit baseline
- **EVID-043/044/048/051** — Wave 12.A/B/C/D precedents
- **PRDs 028/032/035/037 + RFCs 019/023/024/025** — Wave 12 PRD/RFC series
- **CLAUDE.md** — Wave 10-11 status + KNOWN-ISSUES.md residual
- **ADR-006** — `@gertsai/errors` Shared Kernel + RFC 9457 ProblemDetails buckets (Three-envelope drift root cause)




