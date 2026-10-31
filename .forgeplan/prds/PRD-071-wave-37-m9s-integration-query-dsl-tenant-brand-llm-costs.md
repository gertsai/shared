---
depth: standard
id: PRD-071
kind: prd
last_modified_at: 2026-10-31T13:46:26.165579+00:00
last_modified_by: omp-coding-agent/1.0.0
links:
- target: ADR-016
  relation: based_on
- target: PRD-070
  relation: refines
status: active
title: 'Wave 37 — m9s integration: query-dsl + tenant brand + llm-costs'
---

# PRD-071: Wave 37 — m9s integration: query-dsl + tenant brand + llm-costs

| Field | Value |
|-------|-------|
| Status | Draft |
| Depth | Standard |
| Created | 2026-05-26 |
| Parent | ADR-016 (m9s role expansion decision) |

## Problem Statement

m9s-example currently:
- Historically read tenant values as plain `string` at five surfaces: RequestContext normalization in `tryGetRequestContextFromCtx`, both PG adapter tenantId option types, and both PG construction sites in `pickStores` — no compile-time guarantee that a tenant value was actually resolved before reaching infrastructure
- Has nine operational SQL paths: `PgDocumentRepository.save` existence SELECT, UPDATE and INSERT; `findById`, `listSummaries`, `count`, `softDelete`; and `PgVectorStore.addChunks`, `search`. `PgVectorStore.size()` is a tenth physical diagnostic SQL site, outside the operational denominator
- Has no cost-tracking instrumentation around embedder calls (`openai-embedder.ts` has `usage.prompt_tokens` in response but discards it; `ollama-embedder.ts` is local but has no symbolic-cost record either)

As the first wave of Phase 1.5 (ADR-016), Wave 37 integrates three `@gertsai/*` packages with concrete landing sites identified by a read-only m9s audit on 2026-05-26:
- `@gertsai/query-dsl`: typed SELECT builders for two operational paths, with seven documented raw SQL escapes
- `@gertsai/tenant` brand: `TenantId` branded type at composition boundary, propagating into repo constructors
- `@gertsai/llm-costs`: USD cost tracking around openai-embedder (uses `usage.prompt_tokens`) + symbolic tracking for ollama-embedder (local, $0 but tokens recorded)

This wave is **Standard depth** (per ADR-016) — no fsm/hsm-style architectural choice involved; all three integrations are additive over known signatures.

## Target Audience

- m9s consumers (future) — see realistic typed-query patterns + branded tenant types + cost observability all in one app
- Future v1.0 evaluators — see all three packages exercised in a reference webapp
- Downstream copy-cat services — direct landing-site reference for similar shape
- Repo maintainers — closes 3 of 7 P1.5 missing-package gaps in one wave

## Goals / Success Criteria

- NOTE-001 Option A-restore scope: two typed SELECT paths and seven justified raw SQL operational paths (2/9 + 7/9); physically two typed and eight raw sites including diagnostic `size()`
- `meta.tenantId` reads pass through `TenantId` brand at composition boundary; downstream repo constructors typed `TenantId` not `string`; typecheck enforces brand at compile time
- USD cost tracking wired around openai-embedder; symbolic (token-count-only) tracking for ollama-embedder
- m9s test suite green; +6 to +10 new tests covering brand boundary + cost emission + query-dsl roundtrips
- EVID-NN created with R_eff > 0; PRD-071 activated after evidence lands

## ADI Reasoning Summary

Three sub-tasks considered as one wave vs split:

**H1 — Bundle all three into Wave 37 (this PRD)**:
- Pro: single PR, single review, all three land at once; team-lead can parallelize across files (different file owners)
- Con: bigger diff; if one regresses the other two are stuck behind it
- Risk: low — file ownership is non-overlapping if team-lead splits Stream-A (pg-document.repository + pg-vector.store + wave5-middlewares = query-dsl + tenant brand bundle) and Stream-B (embedders + action handler = llm-costs)

**H2 — Split into Wave 37.A (query-dsl) + 37.B (tenant brand) + 37.C (llm-costs)**:
- Pro: smaller PRs, easier individual review
- Con: 3× the artifact overhead; query-dsl + tenant brand DO share files (pg-document.repository.ts + pg-vector.store.ts) so .A then .B causes file conflicts
- Risk: medium (conflict resolution overhead)

**H3 — Wave 37 bundles query-dsl + tenant brand (shared file scope); separate Wave 37.B for llm-costs**:
- Pro: file-ownership-clean within a wave
- Con: not much smaller; same review burden; two PRs instead of one
- Risk: low

**Decision (H1)**: bundle all three. File-conflict risk handled by team-lead orchestrator assigning Stream-A (pg-document + pg-vector + wave5-middlewares.ts) to ONE specialist agent and Stream-B (embedders + action handler) to a SECOND specialist; no shared file ownership across streams. Tests are written by tester agent against the merged result.

## Functional Requirements

### Phase A — query-dsl integration (Stream A)

- **FR-A1**: Preserve typed constraints for the `save` existence SELECT and `findById` SELECT in `pg-document.repository.ts`. `findById` also retains the existing static `deleted_at IS NULL` fragment; it is not fully DSL-only.
- **FR-A2**: Preserve seven operational raw SQL escapes: document UPDATE, INSERT, listSummaries, count, softDelete; vector addChunks and search. Diagnostic `PgVectorStore.size()` is an additional raw physical site outside the nine-path operational denominator.
- **FR-A3**: Each raw escape documents the applicable current DSL gap (DML, aggregate, projection/expression, soft-delete predicate or pgvector operator). No package-level DSL extension is authorized by this wave.
- **FR-A4**: All migrated queries preserve `tenant_id = ?` WHERE clause (no security regression — this is non-negotiable)
- **FR-A5**: Update `examples/m9s-example/package.json` to add `"@gertsai/query-dsl": "workspace:*"` (follow existing workspace-dep pattern)
- **FR-A6**: Audit-trail comment on each migrated query: `// Wave 37.A (PRD-071 — query-dsl) — migrated from raw SQL <ref>`

### Phase B — tenant brand integration (Stream A continued)

- **FR-B1**: `examples/m9s-example/src/composition/wave5-middlewares.ts:110` — adapt `ctx.meta.tenantId` plain-string → branded `TenantId` via `@gertsai/tenant` helper at the middleware boundary (first place tenant ID leaves Moleculer context envelope)
- **FR-B2**: `pg-document.repository.ts:73` constructor — type `opts.tenantId: TenantId` (was `string`)
- **FR-B3**: `pg-vector.store.ts:62` constructor — type `opts.tenantId: TenantId` (was `string`)
- **FR-B4**: Update all construction sites in composition root (`examples/m9s-example/src/composition/infrastructure.ts` per audit) to pass the branded value
- **FR-B5**: Update `examples/m9s-example/package.json` to add `"@gertsai/tenant": "workspace:*"`
- **FR-B6**: Audit-trail comment: `// Wave 37.B (PRD-071 — tenant brand) — TenantId enforces tenant resolution at compile time`
- **FR-B7**: Comments in `wave5-middlewares.ts:9` and `wave5-middlewares.ts:14` updated to reflect new brand-based contract

### Phase C — llm-costs integration (Stream B)

- **FR-C1**: `examples/m9s-example/src/infrastructure/openai-embedder.ts:embed()` — emit USD cost event using `usage.prompt_tokens` × per-model rate from `@gertsai/llm-costs` rate table. Event must include: `tenantId`, `model`, `tokens`, `usdCost`, `timestamp`
- **FR-C2**: `examples/m9s-example/src/infrastructure/ollama-embedder.ts:embed()` — emit symbolic cost event (model name + tokens estimated via length/4 heuristic if no usage telemetry; `usdCost: 0` since local). Same event shape as FR-C1 for downstream consistency
- **FR-C3**: Cost events flow via `@gertsai/llm-costs` API — emission mechanism is whichever the package recommends (event emitter, otel attribute, async callback). Team-lead reads `@gertsai/llm-costs` README + types BEFORE assigning this stream (per Risk section)
- **FR-C4**: `services/ingest/src/actions/embed-batch.action.ts:67` — NO surface change at the action handler; cost emission lives in the embedder layer (preserves IEmbedder port contract)
- **FR-C5**: Update `examples/m9s-example/package.json` to add `"@gertsai/llm-costs": "workspace:*"`
- **FR-C6**: Audit-trail comments: `// Wave 37.C (PRD-071 — llm-costs) — USD/symbolic cost event emitted per embedding call`

### Phase D — verification (Tester + reviewer)

- **FR-D1**: `pnpm --filter m9s-example test` green (all existing tests + new tests)
- **FR-D2**: `pnpm --filter m9s-example typecheck` green — TenantId brand should catch any plain-string regression at compile time
- **FR-D3**: `pnpm --filter m9s-example build` green
- **FR-D4**: `pnpm build` workspace-wide green (no transitive break)
- **FR-D5**: Live Docker re-verification: `pnpm test:real-infra` against postgres+redis+nats+openfga+ollama stack (Wave 36 pattern from EVID-089) — minimum 15/15 must still pass
- **FR-D6**: Verify a real raw INSERT → typed SELECT roundtrip, update, tenant isolation and tombstone behavior with actual PG adapters; runtime TenantId valid/empty boundaries and compile-only rejection of plain strings; five real embedder cost-event contracts using HTTP test doubles (not live OpenAI). Verify the five original tenant surfaces separately from both branded embedder constructors and `Wave5ContextSnapshot.expectedTenantId`.
- **FR-D7**: EVID-NN written with: typed counts (queries migrated / surfaces branded / cost events emitted), test delta, structured fields section with `verdict: supports` + `congruence_level: 3` + `evidence_type: test` (or `audit` for independent review) (internal test on target system)

## Non-functional Requirements

- All changes confined to `examples/m9s-example/` — NO `@gertsai/*` package source modified (ADR-016 invariant)
- All changes additive — m9s public API contracts (REST routes, action signatures, IEmbedder port shape) unchanged
- Audit-trail comments: `// Wave 37.{Phase} (PRD-071 — {package})` on every non-trivial line per ADR-016 convention
- Test count delta: minimum +6 to +10 new tests
- Live infra verification mandatory (Wave 36 precedent — `EVID-089`)
- No new peer dependencies on m9s consumers (m9s itself is a consumer; this is a self-contained feature)

## Authorized criterion replacement

NOTE-001 records the existing human Option A-restore decision. It replaces the original ≥6 typed migrations and typed INSERT expectation with two typed SELECT paths, seven documented operational raw escapes, and a real raw INSERT → typed SELECT check. This reconciliation is not new verification; checkboxes remain unchecked until observed runs. Historical NOTE-001 timeline is preserved.

## Acceptance Criteria

- [x] **Phase A (query-dsl)**: nine operational paths reviewed; two typed SELECT paths and seven documented raw escapes; diagnostic size() recorded separately (two typed + eight raw physical sites). Real raw INSERT → typed SELECT verified.
- [x] **Phase B (tenant brand)**: RequestContext normalization, both PG option types and both pickStores construction sites verified (five original surfaces); embedder constructors and snapshot brand checked separately; plain strings rejected at compile time.
- [x] **Phase C (llm-costs)**: cost events emitted from openai-embedder (USD-typed via `usage.prompt_tokens` × rate) + ollama-embedder (symbolic, `usdCost: 0`); calculator-derived cost events visible through logger-capture tests (Option A-restore, no aggregator requirement)
- [x] **Phase D (verify)**: all gates green (test, typecheck, build, workspace-build, real-infra 15/15 minimum)
- [x] EVID-096 created, linked informs PRD-071 and activated with numeric Structured Fields. Independent scoped PASS / activation BLOCKER recorded in EVID-097.
- [x] PRD-071 already active; current observed R_eff 0.9. No reactivation performed.

## Out of Scope

- Wave 38 frontend `rpc-proxy-builder` integration (separate wave)
- Migrating `@gertsai/*` packages themselves — m9s is consumer only (ADR-016 invariant)
- Production trial deploy — deferred per ADR-016 until after Wave 40
- pgvector operator support inside `@gertsai/query-dsl` package itself — if missing, m9s uses escape hatch (FR-A3); package improvement is separate PRD against `@gertsai/query-dsl`
- New cost-tracking dashboard UI — Wave 40 streaming track may consume cost events for a budget widget, but not in Wave 37

## Risks

- **`@gertsai/query-dsl` pgvector gap (Medium)**: cosine similarity `<=>` operator may not be expressible in current query-dsl DSL → would require raw-SQL escape hatch per FR-A3. Acceptable but reduces "typed-everywhere" demo value of Wave 37. Mitigation: team-lead reads `@gertsai/query-dsl` README + types BEFORE assigning Stream-A to confirm extent.
- **`TenantId` brand churn (Low)**: if `@gertsai/tenant` brand API has changed since the m9s baseline was set, compile errors may cascade. Mitigation: Stream-A specialist starts by reading `@gertsai/tenant/src/index.ts` and the package README; smoke-typecheck before writing migration code.
- **`@gertsai/llm-costs` API uncertainty (Medium)**: package may not have a usage-emission API ready for consumer-side wiring (could be aggregator-only / DI-only / event-bus-only). Mitigation: team-lead reads `@gertsai/llm-costs` README + types BEFORE assigning Stream-B; if API not ready, Phase C scope may shrink to "rate-table lookup + manual emission" with audit-trail comment.
- **Live infra flake (Low)**: Docker stack tests have known startup-order sensitivity. Mitigation: Wave 36 EVID-089 pattern + 2 independent run requirement (per Wave 36 precedent).
- **Audit-trail comment proliferation (Low cosmetic)**: 8 + 5 + 5 = ~18 comments added. Mitigation: trim to "one comment per logical block, not per line"; reviewer subagent enforces.

## Related Artifacts

| Artifact | Relation |
|---|---|
| ADR-016 | based_on (parent decision: m9s role expansion to full ecosystem reference) |
| ROADMAP.md Phase 1.5 | parent-doc reference (concrete wave plan) |
| EVID-NN (Wave 37 closure) | informs (to be created at wave end with structured fields) |
| EVID-089 | informs (Wave 36 live-infra pattern + closure proof — Wave 37 follows same gate) |
| Hub-ADR-011 | informs (pg-client agnostic invariant — preserved; m9s wraps `@gertsai/pg-client/storage` subpath via existing repo classes, not direct pg-client) |
| ADR-005 | informs (storage-core architecture — m9s already uses these layers via `entity-storage` + `pg-client/storage`; Wave 37 adds typed-query layer on top)
| PRD-070 (Wave 36) | refines (Wave 37 builds on Wave 36 m9s baseline; otel still wired) |

## Current closure boundary

EVID-096 proves the executed Option A scope gates. Separately authorized package-test maintenance removed the incidental default endpoint assertion, without production changes. EVID-098 records final root regression5788 passed/105 skipped/0 failed and types PASS; EVID-099 independent Sol guardian PASS authorizes lifecycle closure after score/validation. EVID-095/EVID-097 retain historical failures with deprecated current applicability. PRD-071 was already active and is not reactivated.

