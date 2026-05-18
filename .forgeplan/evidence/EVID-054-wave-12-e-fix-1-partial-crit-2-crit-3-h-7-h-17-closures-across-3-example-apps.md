---
depth: standard
id: EVID-054
kind: evidence
last_modified_at: 2026-05-18T10:05:42.519563+00:00
last_modified_by: claude-code/2.1.142
links:
- target: PRD-038
  relation: informs
status: active
title: Wave 12.E-fix-1 (partial) — CRIT-2 + CRIT-3 + H-7 + H-17 closures across 3 example apps
---

## Summary

Wave 12.E-fix-1 (partial) closes 4 of the 19 findings from EVID-053 across 3 example apps (`m9s-example`, `m9s-example-web`, `m9s-example-api-types`). Manual completion after 3 parallel teammates stalled on PRD-038 mid-work (600 s watchdog timeout with no file mutations).

## Structured Fields

- **verdict**: supports
- **congruence_level**: CL3
- **evidence_type**: code_review
- **linked_artifact**: PRD-038
- **summary**: 4/19 findings closed manually; 15 deferred to Wave 12.E-fix-2.

## Closures (this commit)

### CRIT-2 (CWE-862) — Anonymous ingest + delete-document

**Files**:
- `examples/m9s-example/src/services/ingest/src/actions/ingest-document.action.ts`
- `examples/m9s-example/src/services/ingest/src/actions/delete-document.action.ts`

**Pre-fix**:
```ts
const { session, expectedTenantId } = tryGetRequestContextFromCtx(ctx);
if (session !== undefined) {  // ← conditional, fails open
  assertAuthenticated(session);
}
if (expectedTenantId !== undefined) {
  assertSessionInTenant(session, expectedTenantId);
}
```

**Post-fix**:
```ts
const { session, expectedTenantId } = tryGetRequestContextFromCtx(ctx);
assertAuthenticated(session);  // mandatory, fails closed
if (expectedTenantId !== undefined) {
  assertSessionInTenant(session, expectedTenantId);
}
```

`upload-document.action.ts` already defensive (forces fresh UUID for anon, delegates to `v1.ingest.document` via broker.call). Now broker.call fails closed instead of the use case happily ingesting under wire-claimed tenant.

### CRIT-3 — Live runtime crash on /search

**Files**:
- `examples/m9s-example-web/src/routes/search/+page.server.ts`
- `examples/m9s-example-web/src/routes/search/+page.svelte`
- `examples/m9s-example-api-types/src/search-types.ts` (NEW)
- `examples/m9s-example-api-types/src/index.ts`

**Pre-fix**: frontend rendered `{hit.similarity.toFixed(3)}` but backend handler returned `{docId, chunkIdx, text, score}` (no `.similarity` field). Page crashed with TypeError on actual use. Request body sent `limit: 10` but backend `topK` validator silently ignored unknown field.

**Post-fix**:
- `SearchHit` type now `{docId, chunkIdx, text, score}` matching backend
- Template uses `{hit.score.toFixed(3)}` + adds `chunkIdx` display
- Request body renamed `limit` → `topK`
- New canonical `SearchHit`/`SearchQueryRequest`/`SearchQueryResponse` in `m9s-example-api-types` to prevent future drift (FR-013-style shared-types extraction)

### H-7 — `safeNextRedirect` control-char bypass

**File**: `examples/m9s-example-web/src/routes/login/+page.server.ts`

**Pre-fix**: validator only checked for backslash and `:` before first slash. `/\tjavascript:alert(1)` and similar payloads survived. `redirect(303)` did its own validation but defense-in-depth was missing.

**Post-fix**: explicit control-char rejection (`/[\x00-\x1F\x7F]/.test(raw) → '/'`) at validator front.

### H-17 — Frontend `verifyToken` drops `jti`

**File**: `examples/m9s-example-web/src/lib/server/jwt.ts`

**Pre-fix**: return object dropped `jti` field. `JwtRefreshClaims.jti` is REQUIRED — downstream `if (claims.kind === 'refresh') store.consumeJti(claims.jti)` crashed because `claims.jti === undefined`.

**Post-fix**: `...(typeof payload.jti === 'string' && payload.jti.length > 0 && { jti: payload.jti })` mirrors backend `services/auth/src/jwt.ts:147`.

## Deferred to Wave 12.E-fix-2

3 parallel teammates (under team-lead orchestration) stalled at 600 s watchdog timeout with zero file mutations — a system-level issue not attributable to PRD scope. Scope trimmed to manual completion of 4 highest-impact items. Deferred:

- **CRIT-1** — Redis rotation wiring
- **CRIT-4** — regenerate `openapi-schema.d.ts` from current contract surface
- **CRIT-5** — delete dead `generateOpenAPISchema` generator
- **10 HIGHs** — backend H-1..H-4, frontend H-5/H-6, cross-app H-8..H-13, security H-14..H-16

## Verification

- `pnpm build` — green (all packages + 3 example apps)
- `pnpm --filter @gertsai-examples/m9s-example-web run check` — svelte-check 0 errors
- `pnpm --filter @gertsai-examples/m9s-example run test` — 15/17 test files pass; 2 e2e files time out at 30 s ioredis hooks (pre-existing infrastructure failure — requires live Redis in test env, not caused by these fixes)
- `pnpm --filter @gertsai-examples/m9s-example run typecheck` — 0 errors

## Risk Assessment

- **CRIT-2 fix**: Behavioural break (anon requests now 401) — intentional. Any tooling that POSTed to `/api/v1/ingest/{document,delete}` without a JWT must now obtain one via `/api/v1/auth/login`. Documented in changeset body.
- **CRIT-3 fix**: Type shape change (`limit` → `topK`, `similarity` → `score`) — internal frontend↔backend contract only; not a published API.
- **H-7 fix**: Defense-in-depth addition. No behavioural change for legitimate inputs.
- **H-17 fix**: Additive (returns previously-dropped field) — fixes runtime crash, no new failure modes.

R_eff math: weakest closure score = `supports (1.0) − CL3 (0.0) = 1.0`. Aggregate R_eff = 1.0 for the 4 closed items.

## Refs

- PRD-038 (Wave 12.E-fix combined target)
- EVID-053 (Wave 12.E aggregated audit — source of CRIT/HIGH inventory)



