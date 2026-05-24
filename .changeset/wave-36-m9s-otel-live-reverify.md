---
'@gertsai-examples/m9s-example': patch
---

Wave 36 — m9s-example integrates @gertsai/otel + live infra re-verification of Waves 32-35.

**Phase 0 — Live re-verification against Docker stack** (Postgres pgvector:pg16 + Redis 7 + NATS 2.10 + OpenFGA v1.5 + Ollama 0.5.0 + nomic-embed-text):
- `pnpm test:real-infra` against latest main post-Wave-35: **15 passed | 4 skipped | 0 failed**
- Confirms Wave 27 ApiController pipeline extraction (13 typed stages) + Wave 32 testSession gating + Wave 33 stageTimeoutMs + Wave 34 W2 uuid rename + Wave 35 ComposableStageName all behaviour-correct end-to-end

**Phase A — @gertsai/otel integration**:
- New `src/observability.ts` — `initObservability()` + `shutdownObservability()` with `OTEL_EXPORTER_OTLP_ENDPOINT` gating (no-op when unset)
- Wired into `src/index.ts` BEFORE service registration; SIGTERM/SIGINT graceful shutdown flushes exporter before broker disconnect
- Added `@gertsai/otel` workspace:* + 4 `@opentelemetry/*` peer deps to package.json (matched workspace-resolved versions: `^0.50.0` sdk-node/exporter + `^1.30.0` resources/semantic-conventions)
- `.env.example` documents OTEL_* env vars

**Phase B — @gertsai/queue investigation**: SKIPPED migration with documented rationale. m9s uses api-core's `BullMQConnectionOptions` API exclusively (broker-integrated path); `@gertsai/queue.createWorker` is a standalone non-broker-integrated primitive — not a drop-in replacement. Comment block in `src/services/index.ts` documents the boundary + future Wave 37+ candidates (if api-core widens `BullMQConnectionOptions → QueueConnection`).

**Phase C — Post-Wave-36 live re-verification**:
- Re-built m9s with otel integration
- Re-ran live infra smoke: **15 passed | 4 skipped | 0 failed** (identical to Phase 0 — zero regression)

**Files changed**: 4 m9s + lockfile, +122/-1 LOC.

**Audit evidence**: 2 live Docker runs (current main + Wave 36) confirm Waves 32-35 work end-to-end against real infrastructure — not just unit-test green.

**Bump**: `@gertsai-examples/m9s-example` PATCH — additive OTel integration with optional gating (no behaviour change for consumers without `OTEL_EXPORTER_OTLP_ENDPOINT`).

Refs: PRD-070, EVID-089 (closure proof), EVID-087 (audit driving production-realistic coverage)
