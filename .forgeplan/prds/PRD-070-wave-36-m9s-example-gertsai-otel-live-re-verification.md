---
depth: standard
id: PRD-070
kind: prd
last_modified_at: 2026-05-24T08:28:21.896965+00:00
last_modified_by: claude-code/2.1.145
status: active
title: Wave 36 — m9s-example @gertsai/otel + live re-verification
---

# PRD-070: Wave 36 — m9s-example @gertsai/otel + live re-verification

| Field | Value |
|-------|-------|
| Status | Draft |
| Depth | Standard |
| Created | 2026-05-24 |
| Parent | User request: production-realistic m9s coverage + post-Waves-32-35 live verification |

## Problem Statement

After Wave 35 closed all EVID-087 follow-ups, two concerns remained from honest assessment:
1. m9s-example didn't integrate `@gertsai/otel` for OTLP span emission (only used `buildTraceparent` for header propagation)
2. Live infra re-verification against Docker stack had NOT been done after Waves 32-35 (40+ source changes since the last Wave 29.C smoke)

## Target Audience

- Maintainers verifying v1.0-ready state with concrete end-to-end evidence (not just unit tests)
- Downstream consumers — m9s-example demonstrates the canonical OTel integration pattern for production webapps

## Goals / Success Criteria

- `@gertsai/otel.setupObservability()` wired into m9s-example with optional `OTEL_EXPORTER_OTLP_ENDPOINT` gating
- Graceful shutdown via SIGTERM/SIGINT flushes OTel exporter before broker disconnects
- Live infra smoke (postgres+redis+nats+openfga+ollama) PASSES against latest main: 15 passed / 0 failed
- `@gertsai/queue` migration INVESTIGATED + decision documented (Skip with rationale OR Migrate)

## Functional Requirements

### Phase 0 — Live re-verification (Docker smoke)
- **FR-0**: bring up Docker stack, run `pnpm test:real-infra` against latest main post-Wave-35

### Phase A — @gertsai/otel integration
- **FR-A1**: Add `@gertsai/otel` workspace:* + 4 OTel SDK peer deps to m9s package.json (matching workspace-resolved versions, not spec defaults)
- **FR-A2**: New `src/observability.ts` — `initObservability()` + `shutdownObservability()`. No-op when `OTEL_EXPORTER_OTLP_ENDPOINT` unset
- **FR-A3**: Wire into `src/index.ts` BEFORE service registration; SIGTERM/SIGINT graceful shutdown
- **FR-A4**: `.env.example` documents OTEL_* env vars

### Phase B — @gertsai/queue migration investigation
- **FR-B1**: Investigate m9s queue usage (broker config + workers + addJob calls)
- **FR-B2**: Decision: m9s uses api-core's `BullMQConnectionOptions` API exclusively. `@gertsai/queue` is NOT a drop-in replacement (different consumption model). **SKIPPED with rationale comment** in `services/index.ts`
- **FR-B3**: Documented future Wave 37+ migration candidates if api-core widens its surface

### Phase C — Final live verification
- **FR-C**: Re-run live infra smoke against Wave 36 changes — confirms otel integration doesn't break end-to-end

## Acceptance Criteria

- [x] Phase 0: 15 passed | 4 skipped | 0 failed against live Docker
- [x] Phase A: otel integration added, workspace typecheck 0 errors
- [x] Phase B: skip decision documented
- [x] Phase C: 15 passed | 4 skipped | 0 failed against Wave 36 changes
- [x] EVID-089 created + linked + activated

## Out of Scope

- Manual span emission inside business logic (Wave 37+)
- `@gertsai/queue` migration into api-core (separate upstream RFC)
- Adding other "missing" packages to m9s (otel was highest-value)

## Related Artifacts

| Artifact | Relation |
|----------|----------|
| EVID-087 | based_on (audit findings driving Wave 36) |
| EVID-089 | informs (Wave 36 closure proof) |
| PRD-001 FR-018 | informs (@gertsai/otel original requirement) |



