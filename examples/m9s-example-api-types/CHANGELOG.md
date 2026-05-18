# @gertsai-examples/m9s-example-api-types

## 0.0.5

### Patch Changes

- f9384ae: Wave 12.E-fix-1 (partial) — close CRIT-2 + CRIT-3 + 2 frontend security
  HIGHs from EVID-053.

  **CRIT-2 (CWE-862) — Anonymous can ingest + delete documents.** Fix:
  made authentication MANDATORY in `delete-document.action.ts` and
  `ingest-document.action.ts`. Pre-fix the guard was conditional
  (`if (session !== undefined) { assertAuthenticated(session); }`)
  which let unauthenticated POSTs proceed. `upload-document.action.ts`
  already defensive (forces fresh UUID for anon) and delegates to
  `v1.ingest.document` via broker.call — which now fails closed.

  **CRIT-3 — Live runtime bug in search page.** Pre-fix the frontend
  rendered `{hit.similarity.toFixed(3)}` but the backend handler
  returned `{docId, chunkIdx, text, score}` (no `.similarity` field).
  The page crashed with TypeError when search was actually used. Fix:

  - Update `SearchHit` type to match backend `{docId, chunkIdx, text, score}`
  - Update svelte template to `{hit.score.toFixed(3)}` + add `chunkIdx`
    display in the docId line
  - Rename request field `limit` → `topK` to match backend handler
    (pre-fix backend silently ignored `limit` because typia validates
    against `topK`)
  - New canonical `SearchHit`/`SearchQueryRequest`/`SearchQueryResponse`
    types in `m9s-example-api-types/src/search-types.ts` to prevent
    future drift (FR-013-style extraction)

  **H-7 — `safeNextRedirect` control-char bypass.** Added explicit
  control-char rejection (`/[\x00-\x1F\x7F]/`) at the validator front.
  Pre-fix `/\tjavascript:alert(1)` and similar payloads could survive
  the validator (`redirect(303)` did its own validation, but defense-
  in-depth at the trust boundary).

  **H-17 — Frontend `verifyToken` drops `jti`.** Added `jti` spread
  when present on the payload. `JwtRefreshClaims.jti` is REQUIRED;
  pre-fix a refresh-token edge case (`if (claims.kind === 'refresh')
store.consumeJti(claims.jti)`) crashed because `claims.jti === undefined`.

  **Deferred to Wave 12.E-fix-2:** CRIT-1 (Redis rotation wiring),
  CRIT-4 (regenerate openapi-schema.d.ts), CRIT-5 (delete dead generator),

  - 10 remaining HIGHs (backend H-1..H-4, frontend H-5/H-6, cross-app
    H-8..H-13, security H-14..H-16). 3 parallel teammates stalled mid-work
    on PRD-038; manual completion of the remaining 15 items is a separate
    sprint.

  Refs: PRD-038, EVID-053 (CRIT-2, CRIT-3, H-7, H-17 closures).

## 0.0.4

### Patch Changes

- @gertsai/api-core@0.3.1

## 0.0.3

### Patch Changes

- Updated dependencies [2e111ed]
  - @gertsai/api-core@0.3.0

## 0.0.2

### Patch Changes

- Updated dependencies [0755c6d]
- Updated dependencies [1f8494e]
- Updated dependencies [1d1e833]
- Updated dependencies [155d0c0]
- Updated dependencies [e830ae6]
- Updated dependencies [c6896c4]
- Updated dependencies [56eb238]
  - @gertsai/api-core@0.2.0
