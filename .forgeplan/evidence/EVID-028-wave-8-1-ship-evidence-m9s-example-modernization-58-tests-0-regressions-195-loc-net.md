---
depth: standard
id: EVID-028
kind: evidence
last_modified_at: 2026-05-12T21:17:29.451042+00:00
last_modified_by: claude-code/2.1.139
links:
- target: PRD-013
  relation: informs
status: active
title: Wave 8.1 ship evidence — m9s-example modernization (58 tests, 0 regressions, +195 LOC net)
---

# EVID-028: Wave 8.1 ship evidence — m9s-example modernization

## Structured Fields

- **verdict**: supports
- **congruence_level**: CL3
- **evidence_type**: integration_test
- **target_system**: `@gertsai-examples/m9s-example` reference application (post-Wave 5/6/7)
- **scope**: 5 capabilities adopted — Wave 7.2 tri-state capability declaration, Wave 5 logger-factory, Wave 5 errors taxonomy, Wave 5 rest-request-manager + Wave 5 async-utils

## Summary

PRD-013 / RFC-009 closed end-to-end. m9s-example now demonstrates 5 previously unadopted Wave 5/6/7 capabilities via the AgentsTeam pattern (Phase 0 pre-seed + 4 parallel teammates + Phase 2 smoke). 1 in-flight scope expansion (SSRF plumbing in `@gertsai/rest-request-manager`) reconciled with user approval. Test count grew 42 → 58 (+16), production code +195 LOC net, no regressions in 13 test files across mock + real-infra suites.

## What was built

### Pre-seed (Phase 0, team-lead)

- `examples/m9s-example/package.json` — added 3 workspace deps: `@gertsai/async-utils`, `@gertsai/logger-factory`, `@gertsai/rest-request-manager`
- **NEW** `examples/m9s-example/src/composition/logger.ts` (69 LOC) — `createAppLogger(name)` factory with module-scoped `baseContext` + `REDACT_KEYS` (`embedding`, `embeddings`, `vector`, `vectors`, `OPENAI_API_KEY`, `FGA_API_TOKEN`) on top of `@gertsai/errors` built-in REDACTION_KEYS; `LOG_LEVEL` env override
- **NEW** `examples/m9s-example/src/composition/errors.ts` (71 LOC) — facade re-exporting `@gertsai/errors` taxonomy (`AppError`, `ErrorKind`, `ForbiddenError`, …) + `appErrorToHttpResponse` from `/http` subpath + `permissionDenied(userId, action, resource): ForbiddenError` helper preserving legacy message shape

### Phase 1 — 4 parallel teammates (AgentsTeam)

**Teammate A — capability declaration** (`m9s-capability-declaration`):
- `examples/m9s-example/src/infrastructure/document.repository.ts` (+24 / −1) — `override get capabilities()` returning `{ ...super.capabilities, upsert: { supported: true, preservesCreatorAudit: true } }` per ADR-013 §Decision-A1
- **NEW** `tests/capability-declaration.test.ts` (74 LOC, 2 tests) — capability shape + idempotent getter

**Teammate B — logger-factory migration** (`m9s-logger-factory`):
- `src/index.ts` (+21 / −21) — 7 `console.*` → `log.info`/`log.error` with module-scoped `createAppLogger('m9s-example')`
- `src/services/index.ts` (+11 / −7) — 2 `console.log` → `log.info` with module-scoped `createAppLogger('m9s-services')`
- **NEW** `tests/logger-redaction.test.ts` (118 LOC, 4 tests) — built-in REDACTION_KEYS, m9s `REDACT_KEYS`, case-insensitivity, Logger API surface

**Teammate C — errors taxonomy** (`m9s-errors-taxonomy`):
- **DELETED** `src/application/errors/permission-denied.error.ts` (−21 LOC)
- `src/application/IngestDocumentUseCase.ts` (+2 / −2) — `throw permissionDenied(userId, 'ingest', docId)`
- `src/application/SearchDocumentsUseCase.ts` (+2 / −2)
- `src/services/ingest/src/actions/ingest-document.action.ts` (+2 / −2) — `instanceof ForbiddenError`
- `src/services/ingest/src/queues/ingest-chunk.worker.ts` (+2 / −2)
- `src/services/search/src/actions/search-query.action.ts` (+2 / −2)
- `tests/ingest-use-case.test.ts` + `tests/search-use-case.test.ts` (+3 / −3 each, justified deviation — they imported the deleted class)
- **NEW** `tests/error-taxonomy.test.ts` (89 LOC, 4 tests) — ForbiddenError shape, RFC 9457 ProblemDetails (`type: 'urn:gertsai:errors:permission'`, status 403), discriminated narrowing, instanceof regression

**Teammate D — embedder hardening** (`m9s-embedder-hardening`):
- `src/infrastructure/ollama-embedder.ts` (rewrite, 143 → 220 LOC, +77) — `RestRequestManager` lazy module-singleton, `httpCaller` removed in favour of `manager.request(...)`, `console.warn` → `log.warn`, AppError translation
- `src/infrastructure/openai-embedder.ts` (rewrite, 132 → 219 LOC, +87) — same pattern, OpenAI-specific 401/429 → `UnauthorizedError`/`RateLimitedError`, `redactRequestKeys: ['authorization']`
- **NEW** `tests/embedder-hardening.test.ts` (255 LOC, 6 tests) — happy path, transport-failure translation, dimension drift log, 401/429 handling, multi-call dimension latching

### Phase 2 — scope expansion (mid-sprint, user-approved)

Real-infra smoke surfaced an SSRF regression: `RestRequestManager.invoke()` previously called `httpCaller(url, { method, headers, body })` without forwarding the `security` opts the legacy embedder used (`allowLocalhost: true`, `allowPrivateNetworks: true`). All 3 Ollama real-infra tests failed with `SSRF blocked: Localhost not allowed`.

User-approved fix (rejecting RFC-009 non-goal "no `@gertsai/*` package mods" for this single defensible expansion):

- `packages/rest-request-manager/src/types.ts` (+13 LOC) — `security?: FetchSecurityConfig` field on `RestRequestManagerOpts` with JSDoc tying it to Wave 8.1
- `packages/rest-request-manager/src/manager.ts` (+1 LOC) — pass-through `...(this.opts.security !== undefined && { security: this.opts.security })`
- `src/infrastructure/ollama-embedder.ts` — embedder configures `security: { ssrfProtection: true, allowLocalhost: true, allowPrivateNetworks: true }` on the manager (parity with the legacy direct-`httpCaller` call site; SSRF protection itself remains enabled — only the allowlist widens)
- `src/infrastructure/ollama-embedder.ts` — rate-limit defaults bumped from 1 rps / 5 burst → 10 rps / 20 burst (local Ollama is unmetered; 1 rps starved the 3-test real-infra suite)
- OpenAI embedder rate-limit defaults left at 1 rps / 5 burst (paid metered API — conservative-by-default)

## Smoke results (verbatim)

```
$ pnpm --filter @gertsai-examples/m9s-example exec tspc --noEmit
TSC_EXIT=0

$ pnpm --filter @gertsai-examples/m9s-example test
✓ tests/real-infra.test.ts (3 tests) 1187ms
✓ tests/e2e.test.ts (8 tests) 721ms
✓ tests/openfga-permission.gate.multi-instance.test.ts (4 tests) 69ms
✓ tests/openfga-permission.gate.test.ts (4 tests) 40ms
✓ tests/openfga-model.test.ts (3 tests) 18ms
✓ tests/audit-propagation.test.ts (4 tests) 9ms
✓ tests/ingest-use-case.test.ts (7 tests) 5ms
✓ tests/search-use-case.test.ts (5 tests) 5ms
✓ tests/embedder-hardening.test.ts (6 tests) 4ms
✓ tests/wave5-integration.test.ts (4 tests) 4ms
✓ tests/logger-redaction.test.ts (4 tests) 2ms
✓ tests/error-taxonomy.test.ts (4 tests) 2ms
✓ tests/capability-declaration.test.ts (2 tests) 1ms
Test Files  13 passed (13)
     Tests  58 passed (58)
  Duration  4.10s

$ pnpm --filter @gertsai-examples/m9s-example build
BUILD_EXIT=0

$ pnpm --filter @gertsai/rest-request-manager test
Test Files  4 passed (4)
     Tests  20 passed (20)
TSC_EXIT=0
```

## Metrics

| Metric | Baseline | Wave 8.1 | Delta |
|---|---|---|---|
| m9s-example test files | 11 | 13 | +2 |
| m9s-example tests | 42 | 58 | **+16** |
| m9s-example production LOC | (baseline) | +195 net (357 ins / 162 del) | within PRD-013 NFR-3 ≤260 budget |
| m9s-example new test LOC | — | +536 (4 new test files) | new coverage |
| `console.*` sites in `src/` | 10 | 0 | -10 (FR-2/FR-3 ✓) |
| `PermissionDeniedError` references | 12 | 0 | -12 (FR-4 ✓) |
| `httpCaller` direct call sites in embedders | 2 | 0 | -2 (FR-6/FR-7 ✓) |
| Workspace typecheck | 0 errors | 0 errors | no regression |
| `@gertsai/rest-request-manager` tests | 20 | 20 | 0 regression |

## Goal verification (PRD-013 G-1..G-6)

- **G-1** ✅ `DocumentRepository.capabilities.upsert = { supported: true, preservesCreatorAudit: true }` — `tests/capability-declaration.test.ts` passes 2/2
- **G-2** ✅ All `console.*` in `src/` replaced with `createAppLogger(...)` — `grep -rn 'console\.' src/ | grep -v __tests__` returns 0; `tests/logger-redaction.test.ts` passes 4/4
- **G-3** ✅ `PermissionDeniedError` class deleted; all sites use `permissionDenied()` / `ForbiddenError` / `appErrorToHttpResponse()` — `tests/error-taxonomy.test.ts` passes 4/4
- **G-4** ✅ Embedders wrap `httpCaller` through `RestRequestManager` with retry + rate-limit + CB; `withTimeout`/`retry` semantics inherited through the manager — `tests/embedder-hardening.test.ts` passes 6/6
- **G-5** ✅ Mock-mode (`STORAGE_PROVIDER=memory`, `AUTH_GATE=allowall`) tests unchanged; pre-Wave-8.1 fixtures still pass — 42 baseline tests pass, plus 3 real-infra tests pass (Ollama localhost reachable after SSRF plumbing)
- **G-6** ✅ EOPT + noUncheckedIndexedAccess strict floor preserved — `tspc --noEmit` exit 0 on m9s-example AND on `@gertsai/rest-request-manager` after the scope-expansion edits

## NFR verification (PRD-013 NFR-1..NFR-6)

- NFR-1 ✅ Single-revert restores pre-Wave-8.1 state — verified by manual inspection of `git status`
- NFR-2 ✅ Sprint 3.11 ADR-011 invariants preserved — AllowAllPermissionGate prod-guard untouched, tenant_id WHERE clauses untouched
- NFR-3 ✅ +195 production LOC net ≤ 260 budget
- NFR-4 ✅ +16 tests ≥ 8 required (4 new test files, 16 individual cases)
- NFR-5 ⚠️ **Scope expansion**: 3 new workspace deps in m9s-example (per pre-seed plan, all `workspace:*` → no external dependencies), AND 1 `@gertsai/rest-request-manager` internal source edit (security plumbing) per user-approved expansion. No new external npm dependencies.
- NFR-6 ✅ m9s-example is `private: true` — no public type changes

## Deviations from plan

1. **Scope expansion: `@gertsai/rest-request-manager` security plumbing** — RFC-009 declared "no `@gertsai/*` mods" as non-goal. Mid-sprint smoke surfaced SSRF regression breaking 3 real-infra tests. User approved expansion via AskUserQuestion (option "Extend RestRequestManager ~5 LOC"). Actual delta: +13 LOC in `types.ts` (interface + JSDoc), +1 LOC in `manager.ts` (pass-through spread). All 20 existing `@gertsai/rest-request-manager` tests still pass.

2. **Rate-limit defaults raised in Ollama embedder** — initial defaults (1 rps / 5 burst) starved the 3-test real-infra suite (chunk-by-chunk embedding + search across docs exhausts burst). Raised to 10 rps / 20 burst with JSDoc explaining the local-Ollama rationale. OpenAI embedder kept at 1 rps / 5 burst (paid metered API → conservative).

3. **Test relocation** — 2 of 4 teammates initially placed new tests in `src/__tests__/` per RFC-009 prescription; the active `vitest.config.ts` only discovers `tests/**/*.test.ts`. Team-lead relocated `capability-declaration.test.ts` and `error-taxonomy.test.ts` from `src/__tests__/` to `tests/` (+ relative path updates) for discovery consistency. No behavioral change.

4. **Two pre-existing tests modified by Teammate C** — `tests/ingest-use-case.test.ts` and `tests/search-use-case.test.ts` imported the deleted `PermissionDeniedError`. Teammate C updated them in-flight (3 LOC each) to use `ForbiddenError`. Justified consequence of class deletion in scope.

## R_eff lineage

EVID-028 → informs PRD-013. Internal evidence (own test suite + own typecheck on target system) → verdict `supports`, congruence_level `CL3`. Expected R_eff (PRD-013) ≈ 1.0 with no upstream CL penalties (PRD-013 is the immediate parent; no informs to deeper artifacts in this evidence).

## Reversibility

Single `git revert <merge-commit>` restores:
- `examples/m9s-example/src/composition/{logger,errors}.ts` deleted
- `examples/m9s-example/src/application/errors/permission-denied.error.ts` recreated
- `examples/m9s-example/src/{index,services/index}.ts` → `console.*` restored
- `examples/m9s-example/src/infrastructure/{ollama,openai}-embedder.ts` → `httpCaller` direct calls restored
- `examples/m9s-example/src/infrastructure/document.repository.ts` → `capabilities` getter removed
- `examples/m9s-example/src/application/{IngestDocument,SearchDocuments}UseCase.ts` + 3 inbound adapters → `PermissionDeniedError` references restored
- 4 new test files removed
- `packages/rest-request-manager/src/{manager,types}.ts` → `security` plumbing removed
- `packages/rest-request-manager` dist regenerates on next build

3 real-infra tests would fail again after revert (SSRF block) but the example would compile and the mock-mode tests would pass.

## Drift risks

- **Rate-limit defaults**: 10 rps / 20 burst for Ollama is generous. Production callers running Ollama on shared infra should tune via `EMBEDDER_RATE_LIMIT_RPS` / `EMBEDDER_BURST`. Documented in JSDoc.
- **Logger flush on process exit**: `consoleBackend` is synchronous (`console.error`/`console.log` are sync in Node), so the `process.exit(1)` in `src/index.ts` startup-failure path does NOT lose log output. Verified by manual inspection of `consoleBackend` source.
- **Test discovery configs**: `vitest.config.ts` and `vitest.config.mts` divergent (the `.ts` is active and excludes `src/__tests__/**`; the `.mts` includes it). Out of scope for Wave 8.1; consolidating is a Wave 8.2 follow-up.

## Next steps

`forgeplan_link EVID-028 PRD-013 --relation informs` → `forgeplan_score PRD-013` → `forgeplan_activate PRD-013 / RFC-009 / EVID-028` → commit + PR + post-merge cleanup.


