---
depth: standard
id: PRD-013
kind: prd
last_modified_at: 2026-05-12T20:32:36.595926+00:00
last_modified_by: claude-code/2.1.139
status: active
title: m9s-example modernization to Wave 5/6/7 reference baseline
---

# PRD-013: Wave 8.1 — m9s-example modernization to Wave 5/6/7 reference baseline

## Problem Statement

`examples/m9s-example/` is the canonical reference application demonstrating production-grade use of `@gertsai/*` packages. It was last modernized in Sprint 3.11 (commit `782a3e0`, May 7 2026 — ADR-011 + SPEC-016 + EVID-018/019) when it switched defaults to real infrastructure (Postgres+pgvector, OpenFGA ReBAC, BullMQ+Redis, Ollama, docker-compose).

Since then, **10 enhancement waves** shipped — 6.2 / 6.3 / 6.4 / 6.5 / 7.1 / 7.2 / 7.3a / 7.3b / 7.4 / 7.5 — bringing new cross-cutting capabilities. An Explore-agent audit (this session, 2026-05-12) showed m9s-example is **~70% caught up**:

- **Already canonical**: tenant-resolver, runtime-context, session-guard, Wave 6.2 apiToken plumbing, Wave 6.3 fingerprint scoping, Wave 7.1 type re-exports, Wave 7.3a/b strict flags inherited.
- **Gaps**: 5 capabilities not adopted that would either (a) align m9s-example with the catalog it's meant to demonstrate, or (b) close production-readiness drifts (logging, error taxonomy, outbound HTTP hardening).

| Gap | Capability | Current state in m9s-example | Wave |
|---|---|---|---|
| #16 | Tri-state upsert capability declaration | `DocumentRepository extends BaseEntityStorageService` works, but `capabilities` property missing | 7.2 |
| #8 | `@gertsai/logger-factory` adoption | Raw `console.*` everywhere (src/index.ts, infrastructure/*, services/*) | 5 |
| #1 | `@gertsai/errors` taxonomy | Custom `PermissionDeniedError` thrown; no ProblemDetails on HTTP boundary | 5 |
| #10 | `@gertsai/rest-request-manager` for embedders | `httpCaller()` direct calls to Ollama/OpenAI without retry/CB | 5 |
| #7 | `@gertsai/async-utils` primitives | Ad-hoc `setTimeout` + manual retry patterns in embedder code | 5 |

Reference application is the de-facto documentation for new adopters — every gap above is a missed teaching moment for downstream consumers.

## Target Audience

| Persona | Pain before Wave 8.1 |
|---|---|
| New `@gertsai/*` adopter (engineering) | Copies m9s-example as starting template; inherits raw `console`, custom error subclasses, unwrapped embedder fetches — propagating tech debt into greenfield projects |
| Production deployment engineer | Has to write logging factory + CB wrappers themselves; can't point team at reference example for "how we do it" |
| Catalog maintainer (`@gertsai/*` author) | Wave 5/6/7 capability surface area undocumented in canonical example; harder to validate "is this package actually useful in real apps?" |
| Security auditor | Embedder calls to external APIs (Ollama, OpenAI) have no circuit-breaker — review surface area is opaque |

## Goals

1. **G-1**: `DocumentRepository` declares `capabilities = { upsert: { supported: true, preservesCreatorAudit: true } }` per Wave 7.2 ADR-013 tri-state contract. Measured by unit test: capability read via `provider.capabilities` returns expected object shape. Satisfies FR-1.
2. **G-2**: All `console.*` calls in `examples/m9s-example/src/**` replaced with `createLogger(...)` from `@gertsai/logger-factory`. Sensitive keys (`apiToken`, `clientSecret`, `embeddings`, `vector`, `password`) registered in redaction list. Measured by grep `console\.` returning 0 hits in `src/`. Satisfies FR-2, FR-3.
3. **G-3**: `PermissionDeniedError` custom class removed; replaced with `@gertsai/errors` `ErrorKind.PermissionDenied` + AppError instance. HTTP boundary returns RFC 9457 ProblemDetails via `@gertsai/errors/http`. Measured by typecheck + integration test asserting response body shape. Satisfies FR-4, FR-5.
4. **G-4**: `ollama-embedder.ts` and `openai-embedder.ts` wrap outbound `httpCaller()` calls in `RestRequestManager` from `@gertsai/rest-request-manager` with default config (retry attempts=3, full jitter, rate-limit 60 rpm, CB threshold 5 failures / 30s window). Embedder ad-hoc timeout patterns replaced with `withTimeout()` from `@gertsai/async-utils`. Measured by integration test simulating Ollama 503 → retry → CB-open transition. Satisfies FR-6, FR-7, FR-8.
5. **G-5**: Backwards compat — `STORAGE_PROVIDER=memory`, `AUTH_GATE=allowall` (dev mode), `REDIS_URL` unset (inline mode) all still work; existing test fixtures pass without modification. Measured by `pnpm --filter @gertsai/m9s-example test` exit 0 with existing 42+ mock-mode tests unchanged. Satisfies FR-9.
6. **G-6**: Strict floor satisfied — `pnpm --filter @gertsai/m9s-example exec tsc --noEmit` exit 0 with EOPT + noUncheckedIndexedAccess (Wave 7.3a/b inheritance preserved). Satisfies FR-10.

## Functional Requirements

- **FR-1**: `DocumentRepository.capabilities` returns `{ upsert: { supported: true, preservesCreatorAudit: true } }` matching ADR-013 §Decision-A1 shape.
- **FR-2**: All log-emitting modules in `src/` call `createLogger({ name: '<module>', backend: consoleBackend(), redactKeys: REDACT_KEYS })`. Shared `REDACT_KEYS` const exported from `src/composition/logger.ts`.
- **FR-3**: `REDACT_KEYS` covers at minimum: `apiToken`, `clientSecret`, `password`, `embedding`, `embeddings`, `vector`, `vectors`, `accessToken`, `bearer`. Matched case-insensitive (logger-factory default per ADR-009 I-17).
- **FR-4**: `PermissionDeniedError` class deleted; all throw sites use `new AppError({ kind: ErrorKind.PermissionDenied, message, details, correlationId })` from `@gertsai/errors`.
- **FR-5**: HTTP boundary (Moleculer error mapper / Fastify error handler if any) translates `AppError` to RFC 9457 `application/problem+json` via `@gertsai/errors/http` `toProblemDetails()` helper.
- **FR-6**: `ollama-embedder.ts` constructs a singleton `RestRequestManager` instance per embedder hostname; all outbound calls go through `manager.fetch(url, init)`.
- **FR-7**: `openai-embedder.ts` mirrors FR-6 pattern.
- **FR-8**: Embedder timeout previously implemented via ad-hoc `setTimeout` + `AbortController` replaced with `withTimeout(promise, ms)` from `@gertsai/async-utils`. Retry replaced with `retry(fn, opts)` (default `'full'` jitter per ADR-009 Amendment 1.2.7).
- **FR-9**: `.env.example` documents new config keys if any (`EMBEDDER_RATE_LIMIT_RPM`, `EMBEDDER_CB_THRESHOLD`, `LOG_LEVEL`); all optional with documented defaults.
- **FR-10**: Workspace quality gates remain green (`pnpm build && pnpm test && pnpm typecheck`).

## Non-Functional Requirements

| ID | Category | Constraint | Measurement |
|---|---|---|---|
| NFR-1 | Reversibility | Single `git revert` of the merge commit restores pre-Wave-8.1 state | Manual smoke |
| NFR-2 | Compat | All Sprint 3.11 ADR-011 invariants preserved (I-1 mock fallback, I-12 AllowAllPermissionGate prod-guard, I-13 tenant_id WHERE clause) | Existing 42+ mock tests + 16+ real-infra tests pass |
| NFR-3 | LOC budget | Total delta ≤ 260 LOC across all 5 capabilities (audit estimate 195 ±30%) | `git diff main..HEAD --stat \| tail -1` |
| NFR-4 | Test floor | New tests added ≥ 8 (capability declaration, error mapping, logger redaction, RestRequestManager wiring, withTimeout/retry replacements) | vitest reporter count |
| NFR-5 | No new runtime deps | All 5 capabilities use packages already in `examples/m9s-example/package.json` workspace deps; no new external dependencies | `package.json` diff: 0 new entries |
| NFR-6 | DTS additive | No public type changes from m9s-example perspective — it's not a published library | N/A (not a npm package) |

## Out of Scope

- **#5 TimestampProvider injection** — entity-audit Wave 4 base class already stamps timestamps; explicit DI would be paranoid in mock mode. Deferred to Wave 8.2 if needed.
- **#9 rpc-proxy-builder** — Moleculer broker.call is already type-safe via `ServiceContextBase`. Adoption would add LOC without ergonomic gain. Skipped.
- **#19 Wave 7.4 LRU cache tuning** — m9s-example is single-tenant-per-process demo; explicit `configureFgaClientCache(maxSize, ttlMs)` adds noise without value. Defaults sufficient.
- **#20 Wave 7.5 OAuth2 ClientCredentials adoption** — m9s-example targets self-hosted OpenFGA; apiToken sufficient. Adoption deferred until production branch needs Auth0 FGA Cloud (separate ADR if needed).
- **Frontend adapters (#6 entity-{vue,react,solid,svelte})** — m9s-example is backend-only. N/A.
- **OpenAI/Ollama SDK migration** — keeping raw `fetch` via `httpCaller` is intentional (zero-vendor-lock); only wrapping with RestRequestManager is in scope.

## Risks & Mitigations

| ID | Risk | Probability | Impact | Mitigation |
|---|---|---|---|---|
| R-1 | `RestRequestManager` defaults aggressive enough to break Ollama integration in dev (slow local model + retry storm) | Medium | Medium | Conservative defaults: retry attempts=3, base delay 250ms; document via `EMBEDDER_*` env knobs; provide passthrough mode for opt-out (`EMBEDDER_HARDENING=off`) |
| R-2 | Logger redaction misses a key currently logged in plain (e.g. `userId` inside structured log object) | Medium | Low (PII not normally embedded by example) | Adversarial review of all log sites pre-merge; redaction keys conservative-extensive list; greppable for follow-up |
| R-3 | `AppError` JSON shape diverges from current `PermissionDeniedError` shape, breaking downstream consumers (if any) of m9s-example HTTP API | Low | Low (reference app, no SLA) | Document migration note in README; consumers expected to track reference-app version explicitly |
| R-4 | Wave 7.2 capability declaration interpreted incorrectly by future BaseEntityStorageService consumers (e.g. assuming `preservesCreatorAudit: true` when underlying provider doesn't) | Low | Medium | Capability is declarative-only contract per ADR-013; m9s-example uses Postgres adapter which DOES preserve creator_uuid (verified Sprint 3.11 EVID-019) |
| R-5 | EOPT strict floor surfaces new type errors in modified files | Medium | Low | Wave 7.3b RFC-006 catalog provides 6 canonical patterns; teammates apply Pattern 1/2/4 as needed |
| R-6 | Existing m9s-example tests use spies on `console.log/error` — switching to logger breaks them | Medium | Medium | Audit existing tests for `console` spies; either update to spy on logger backend, or keep test-mode logger backend that proxies to console |

## Strategy (high level — RFC-XXX will detail)

**Adoption order by impact / blast radius**:

1. **Pre-seed** (team-lead, ~30 LOC): `src/composition/logger.ts` with shared `REDACT_KEYS` const + `createAppLogger(name)` factory. `src/composition/errors.ts` with re-exports from `@gertsai/errors`. Skeletons let parallel teammates import contract immediately.
2. **Wave parallel** (4 teammates, disjoint files):
   - Teammate A: capability declaration + tests (~15 LOC) — `infrastructure/document.repository.ts`
   - Teammate B: logger migration (~50 LOC) — `infrastructure/*.ts`, `services/*.ts`, `index.ts`, composition root
   - Teammate C: errors taxonomy (~40 LOC) — `application/IngestDocumentUseCase.ts`, `SearchDocumentsUseCase.ts`, `infrastructure/openfga-permission.gate.ts`, HTTP error mapper
   - Teammate D: rest-request-manager + async-utils (~90 LOC) — `infrastructure/ollama-embedder.ts`, `openai-embedder.ts`
3. **Smoke + EVID** (team-lead): full pnpm build/test/typecheck; record EVID with structured fields.

## Related Artifacts

| Artifact | Relation |
|---|---|
| ADR-011 (local, Sprint 3.11) | informs — m9s-example production-grade baseline (mock fallback I-1, prod-guard I-12, tenant WHERE I-13) preserved |
| ADR-013 (Wave 7.2) | informs — tri-state upsert capability contract being adopted (FR-1) |
| PRD-010 / RFC-006 (Wave 7.3b) | informs — EOPT canonical patterns guidance for teammates |
| ADR-009 Amendment 1 (Wave 5 Phase 4) | informs — async-utils default `'full'` jitter + rest-request-manager LRU defaults |
| PRD-008 (Wave 7 closure parent) | informs — overall Wave 7 reference-baseline goal |
| RFC-XXX (next) | refines — Wave 8.1 implementation strategy + file ownership |
| EVID-XXX (next) | informs — Wave 8.1 ship evidence |

## Affected Files

- `examples/m9s-example/src/composition/logger.ts` (NEW — shared logger factory + REDACT_KEYS, ~30 LOC pre-seed)
- `examples/m9s-example/src/composition/errors.ts` (NEW — re-exports from `@gertsai/errors`, ~10 LOC pre-seed)
- `examples/m9s-example/src/infrastructure/document.repository.ts` (MODIFY — add `capabilities` getter, ~15 LOC)
- `examples/m9s-example/src/infrastructure/openfga-permission.gate.ts` (MODIFY — replace `PermissionDeniedError` throws with `AppError`, ~10 LOC)
- `examples/m9s-example/src/infrastructure/ollama-embedder.ts` (MODIFY — wrap `httpCaller` with RestRequestManager, replace ad-hoc retry/timeout, ~45 LOC)
- `examples/m9s-example/src/infrastructure/openai-embedder.ts` (MODIFY — mirror Ollama wrapper, ~45 LOC)
- `examples/m9s-example/src/infrastructure/*.ts` (MODIFY logger calls — pg-document.store.ts, pg-chunk.store.ts, pg-vector.store.ts, memory-*.ts, ~15 LOC)
- `examples/m9s-example/src/application/IngestDocumentUseCase.ts` (MODIFY — replace `PermissionDeniedError`, ~10 LOC)
- `examples/m9s-example/src/application/SearchDocumentsUseCase.ts` (MODIFY — replace `PermissionDeniedError`, ~10 LOC)
- `examples/m9s-example/src/services/**/*.ts` (MODIFY logger calls, ~10 LOC)
- `examples/m9s-example/src/index.ts` + composition root (MODIFY logger, ~5 LOC)
- `examples/m9s-example/src/__tests__/capability-declaration.test.ts` (NEW — Wave 7.2 capability shape test, ~30 LOC)
- `examples/m9s-example/src/__tests__/error-taxonomy.test.ts` (NEW — AppError + ProblemDetails mapping test, ~40 LOC)
- `examples/m9s-example/src/__tests__/embedder-hardening.test.ts` (NEW — RestRequestManager retry/CB transition test, ~50 LOC)
- `examples/m9s-example/.env.example` (MODIFY — document EMBEDDER_* + LOG_LEVEL knobs, ~10 LOC)
- `examples/m9s-example/package.json` (MODIFY — ensure all 5 packages in `dependencies`, ~5 LOC)
- `examples/m9s-example/README.md` (MODIFY — Wave 8.1 adoption notes section, ~20 LOC)

Existing `PermissionDeniedError` class file (likely `examples/m9s-example/src/infrastructure/errors.ts` or inline) — DELETE.

## Acceptance Gate

PRD-013 satisfied when all 6 goals (G-1..G-6) measured PASS, all 10 FRs verified by code review + tests, all 6 NFRs spot-checked, EVID-XXX records: (a) test count delta (target +8 minimum), (b) LOC delta (target ≤260), (c) `grep -c 'console\.' src/` returns 0, (d) `pnpm --filter @gertsai/m9s-example test && pnpm --filter @gertsai/m9s-example typecheck && pnpm --filter @gertsai/m9s-example build` all exit 0, (e) full workspace smoke unchanged.



