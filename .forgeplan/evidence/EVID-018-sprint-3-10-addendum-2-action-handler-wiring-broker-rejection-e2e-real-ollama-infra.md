---
depth: standard
id: EVID-018
kind: evidence
last_modified_at: 2026-05-07T11:26:29.037215+00:00
last_modified_by: claude-code/2.1.132
links:
- target: ADR-010
  relation: informs
- target: SPEC-015
  relation: informs
- target: EVID-017
  relation: informs
status: active
title: Sprint 3.10 Addendum 2 — action handler wiring + broker rejection e2e + real Ollama infra
---

# EVID-018: Sprint 3.10 Addendum 2 — action handler wiring + broker rejection e2e + real Ollama infra

## Structured Fields

- **verdict**: supports
- **congruence_level**: CL3 (same — internal test on target system; broker.call rejection paths verified end-to-end + real Ollama embedder integration verified)
- **evidence_type**: internal-test

## Summary

Closes both explicit limitations called out in EVID-017 §Addendum 1 §"What this does NOT cover":

1. **Limitation #1 closed**: Action handlers (`ingest-document.action.ts` + `search-query.action.ts`) now wire `ctx.locals.requestContext.{session, tenantId}` through to use cases — broker-level session-guard rejection paths fully exercised via real `broker.call`.
2. **Limitation #2 closed**: Real **Ollama** (`nomic-embed-text`) embedder e2e suite added (`real-infra.test.ts`) — verifies Wave 5 stack composes through to a real external HTTP service. Env-gated for CI safety.

**Branch**: `feat/sprint-3-10-wave-5-polish` (continues Sprint 3.10 work). Addendum 2 ships as follow-up commit on the same branch.

**Test count delta**: 4904 → **4907 passed** (+3 — 4 broker-rejection added, 3 real-infra added counted only when OLLAMA_E2E=1; -1 skipped since e2e was already revived in Addendum 1). Full repo: 4907 passed / 0 failed / 106 skipped.

## Deliverables

### A — Action handler Wave 5 wiring

Both `v1.ingest.document` and `v1.search.query` action handlers now read `ctx.locals.requestContext` via the new `tryGetRequestContextFromCtx(ctx)` helper in `examples/m9s-example/src/composition/wave5-middlewares.ts`, extract `session` + `expectedTenantId`, and pass them through to the use case as **additive optional** arguments (per ADR-010 I-2 / I-3 — pre-Wave-5 callers unaffected).

Added session-guard error → APIError mapping in both handlers:
- `AuthenticationRequiredError` → `APIError(UNAUTHORIZED_REQUEST)` (HTTP 401 equivalent).
- `TenantScopeViolationError` → `APIError(FORBIDDEN__INSUFFICIENT_RIGHTS)` (HTTP 403 equivalent).

Net effect: the canonical Wave 5 reference in m9s-example is now end-to-end functional through the broker — not just composing context, but consuming it in the use-case rejection path.

### B — Wave5ContextSnapshot helper + RequestContext class duplication finding (P2 for Wave 6+)

`tryGetRequestContextFromCtx(ctx): Wave5ContextSnapshot` introduced. Returns `{ session, expectedTenantId }` (both optional).

**P2 follow-up surfaced**: `RequestContext` class is **duplicated** between `@gertsai/runtime-context/dist/index.cjs:108` and `@gertsai/runtime-context/dist/moleculer/index.cjs:96`. tsup's per-subpath bundling produces independent class identities — `instanceof RequestContext` fails when the value was composed by `sessionMiddleware` (from `/moleculer` subpath) and the consumer imports `RequestContext` from the root surface.

**Workaround applied**: `tryGetRequestContextFromCtx` uses **structural duck-typing** (`'sessionOptional' in value && 'tenantIdOptional' in value`) instead of `instanceof`. Documented inline in `wave5-middlewares.ts`.

**Wave 6+ proper fix**: investigate runtime-context's `tsup.config.ts` to make subpaths share the underlying `request-context.ts` module (likely needs `external: ['./request-context']` or moving the class to a separate package). Until that lands, structural typing is the consumer-side fix.

### C — Broker-level session-guard rejection e2e (4 NEW tests)

`tests/e2e.test.ts` extended with a second describe block: **"m9s-example e2e (broker.call) — session-guard rejection paths"**. Boots a SECOND broker with a custom Wave 5 stack containing a `sessionFactory` that reads `ctx.meta.testSession` (test-injected `Session` fixture). Test scenarios:

1. **Destroyed session** → `broker.call('v1.ingest.document', ...)` rejects → `AuthenticationRequiredError` mapped to APIError (`Authentication required` / `UNAUTHORIZED`).
2. **Cross-tenant** (session.tenantId='tenant-foo' vs header='tenant-bar') → rejects → `TenantScopeViolationError` mapped to APIError (`Tenant scope violation` / `FORBIDDEN`).
3. **Happy path** (valid session matching tenant) → succeeds, returns expected docId.
4. **Search rejection symmetry** — `v1.search.query` with destroyed session → same code path as ingest → APIError (`UNAUTHORIZED`).

All assertions go through the real Moleculer broker pipeline. No mocks at the rejection path — Use case throws session-guard error → action handler catches → maps to APIError → broker.call rejects.

### D — Real Ollama e2e suite (3 NEW env-gated tests)

`tests/real-infra.test.ts` (NEW) — boots m9s-example broker with `EMBEDDER_PROVIDER=ollama` + `EMBEDDER_URL=http://localhost:11434` + `EMBEDDER_MODEL=nomic-embed-text`. Auto-detects Ollama availability (probes `/api/tags` with 1s timeout); skips suite cleanly if absent.

Test scenarios:

1. **Ingest with real embeddings** — `broker.call('v1.ingest.document', { docId, text })` → real HTTP POST to Ollama → real 768-dim vector → in-memory chunk store. Verifies chunkCount > 0.
2. **Search with real cosine sim** — ingest a document, then `broker.call('v1.search.query', ...)` with a semantically similar query. Real Ollama embeds query, real cosine similarity over real vectors. Asserts top hit IS the ingested doc + score in [-1, 1] cosine range.
3. **Boundary case** — short text "Brief." through real embedder. Asserts ≥1 chunk produced.

All 3 passed locally with Ollama 0.x + `nomic-embed-text:latest`.

### E — Production action wiring tests pass

After action handler wiring, the 16 pre-Wave-5 regression tests (`ingest-use-case.test.ts` 7 + `search-use-case.test.ts` 5 + `audit-propagation.test.ts` 4) **continue to pass unchanged**. Pre-Wave-5 callers don't pass `session` / `expectedTenantId` → use case skips assertion branch → behaviour identical to before. ADR-010 I-2 / I-3 regression invariant preserved.

## Files (delta vs commit `d3d364a`)

| File | Change | LOC delta |
|---|---|---|
| `examples/m9s-example/src/composition/wave5-middlewares.ts` | +`Wave5ContextSnapshot` interface + `tryGetRequestContextFromCtx` helper with structural duck-typing + Session import | +77 / -2 |
| `examples/m9s-example/src/services/ingest/src/actions/ingest-document.action.ts` | Wave 5 RC unwrap + session-guard error → APIError mapping | +37 / 0 |
| `examples/m9s-example/src/services/search/src/actions/search-query.action.ts` | Same wiring as ingest | +32 / 0 |
| `examples/m9s-example/tests/e2e.test.ts` | Second describe block (4 rejection scenarios) + custom sessionFactory broker boot | +248 / 0 |
| `examples/m9s-example/tests/real-infra.test.ts` | NEW — Ollama integration suite (3 tests, env-gated) | NEW |

## Quality gates

| Gate | Result | Details |
|---|---|---|
| `pnpm typecheck` | ✅ green | All packages |
| `pnpm build` | ✅ green | All 39 packages + m9s-example (sequential `--workspace-concurrency=1` due to parallel DTS race observed at concurrency=4 — separate flakiness, not Sprint 3.10 regression) |
| `pnpm test` (with `OLLAMA_E2E=1`) | ✅ **4907 passed**, 106 skipped, **0 failed** | Real Ollama integration verified |
| `pnpm depcruise` | ✅ no violations (113 modules, 236 deps cruised) | m9s Shared Kernel exception preserved from Phase B |

## Implementation traps surfaced + documented

1. **RequestContext class duplication across subpaths** — tsup bundles a separate copy of the `RequestContext` class into each subpath bundle (`@gertsai/runtime-context` root vs `@gertsai/runtime-context/moleculer`). `instanceof RequestContext` fails across the boundary. Fix at consumer: structural duck-typing (`'sessionOptional' in value`). Wave 6+ fix at runtime-context: tsup `external` config or class extraction.

2. **Moleculer `localAction` middleware order — same trap as Addendum 1** — for the custom Wave 5 stack in the rejection-path describe block, the test re-confirmed: array `[m0, ..., mN]`, **last index N = OUTERMOST** (runs first chronologically). The custom `[tenantMiddleware, customSessionMiddleware]` works because both share the resolver instance (sessionMiddleware fallback resolves tenant if `ctx.meta.tenantId` missing).

3. **EMBEDDER_PROVIDER env var must be set BEFORE module load** — `project.config.ts` evaluates `process.env.EMBEDDER_PROVIDER` once at module-scope. `real-infra.test.ts` sets the env in `beforeAll` BEFORE the `requireFromHere(...)` calls so the actions pick up `'ollama'` instead of the default `'mock'`.

## Invariants verified

- ADR-010 I-2 (use-case input/output signatures unchanged) — ✅ all pre-Wave-5 callers pass without optional fields, branch skipped.
- ADR-010 I-3 (16/16 regression preserved) — ✅ confirmed by m9s test suite count.
- ADR-010 I-4 (`SessionDestroyedError` from `@gertsai/errors`) — ✅ session-guard rejection path uses correct Shared Kernel.
- ADR-010 I-14 (`// SECURITY:` inline + ⚠️ SECURITY README) — ✅ preserved, action wiring did not affect.

## Cross-references

- ADR-010 §B + I-14 (m9s as Wave 5 canonical reference) — Addendum 2 closes the wiring gap so the canonical reference is **functional end-to-end**, not just compositional.
- ADR-007 §Decision D + I-16 (sessionMiddleware composes RequestContext) — verified through real broker.call.
- ADR-006 §D §6 (errors Shared Kernel) — `AuthenticationRequiredError` + `TenantScopeViolationError` from `session-guard` re-export shim work correctly across module boundaries (R-6 single-source identity preserved).
- EVID-017 (Sprint 3.10 + Addendum 1) — informs (this addendum is the natural follow-up).
- EVID-012 §5 (Sprint 3.5.2 e2e gap) — Addendum 1 closed broker boot; Addendum 2 closes broker session-guard rejection.

## Lessons (Group 43 retrospective)

1. **Action-wiring is non-substitutable** — Sprint 3.10 originally added `session` + `expectedTenantId` as optional input to use cases, but actions never wired them in. Mock-based wave5-integration tests (calling use cases directly) couldn't catch this. **Real broker.call e2e is the only way to verify the wiring exists**. Lesson: when adding "optional" feature flags through a layered stack (middleware → action → use case), at least ONE end-to-end test must exercise the full chain — not just the use-case unit boundary.

2. **Class duplication via tsup subpath bundling** — runtime-context exports `RequestContext` from both root and `/moleculer` subpath. Each tsup entry produces an independent bundled copy → `instanceof` fails. Generic pattern: dual subpath packages must be careful about class identity. Documented as P2 follow-up for Wave 6+.

3. **Real-infra env gating** — `OLLAMA_E2E=1` opt-in keeps CI safe (no Ollama on minimal containers) while letting local + release-readiness sweeps exercise the real path. Pattern reusable for future external-dep tests.

4. **Forge-cycle Tactical scope is appropriate here** — Addendum 2 is strictly additive (additive optional fields, new tests, structural duck-typing in helper). No public API change. No tier discipline impact. Per CLAUDE.md routing, Tactical doesn't require new ADR/SPEC artifacts; reuses existing ADR-010 + SPEC-015 invariants. EVID-018 alone is sufficient.

## Next steps

1. ✅ Atomic commit on `feat/sprint-3-10-wave-5-polish` (this evidence + 4 modified + 1 new file).
2. ✅ EVID-018 active.
3. ✅ Hindsight retain Group 43 (Addendum 2 lessons).
4. → Sprint 3.11 (Standard+ scope) — full real infra + oxlint via separate `/forge-cycle`. Forgeplan PRD-004 + ADR-011 + SPEC-016. Multi-day work, separate sessions.
5. → v0.2.0 publish gate (after Sprint 3.11) — 13 Wave 5 packages + Sprint 3.10 patches. Irreversible, requires explicit user `Y` per CLAUDE.md red lines.





