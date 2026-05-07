---
depth: standard
id: PRD-004
kind: prd
last_modified_at: 2026-05-07T12:48:20.273652+00:00
last_modified_by: claude-code/2.1.132
status: active
title: Sprint 3.11 — m9s-example production-grade reference (real Postgres+pgvector+OpenFGA+BullMQ+oxlint)
---

# PRD-004: Sprint 3.11 — m9s-example production-grade reference (real Postgres+pgvector+OpenFGA+BullMQ+oxlint)

## Problem Statement

`examples/m9s-example` is the canonical reference application external developers consume to learn the Wave 5 stack (errors, tenant-resolver, runtime-context, session-guard, entity-storage, etc.). After Sprint 3.10 + Addendum 1 + Addendum 2, the broker pipeline composes Wave 5 middleware end-to-end through real `broker.call`. However, several core subsystems remain mock- or in-memory-backed. New developers studying the example see anti-patterns presented as canonical: an authorization gate that allows everything, a vector store that forgets data on restart, an asynchronous queue that runs synchronously. This trains incorrect production patterns and erodes the trust signal of the reference.

The gap exists because Sprint 3.10 focused on Wave 5 stack composition through the broker — middleware wiring, session-guard rejection, error mapping. Persistent infrastructure (storage, authorization, async, cache) was deferred. Sprint 3.11 closes that gap so the reference application demonstrates **what production looks like**, not just **what Wave 5 composes like**.

The problem is binary in shape (each subsystem either has a real backend or doesn't) but multi-domain in implementation: persistence (relational + vector), authorization (relationship-based access control), asynchronous processing (durable queue), distributed cache, plus tooling polish (faster lint feedback). Each subsystem also has a contested design point worth ADI: authorization model granularity, migration management approach, lint strategy. Settling these in a single sprint upgrades the reference to credible production-grade in one cohesive shipment.

## Target Audience

### Primary — external developers learning Wave 5

Engineers cloning `examples/m9s-example` to bootstrap a new service using Wave 5 packages. They expect the example to demonstrate production patterns, not toy implementations. Today they encounter mocks they cannot copy verbatim into production. After Sprint 3.11 they get a working real-infra application as the starting point.

### Secondary — internal team migrating apps/pipeline

The production application `apps/pipeline` (separate repo `gertsai_codex`) is on its own migration path to Wave 5 patterns. m9s-example is the canonical reference its migration scripts compare against. Sprint 3.11 removes the "but the example uses mocks" objection from migration planning.

### Tertiary — release-readiness QA / docs reviewers

Before v0.2.0 publish, reviewers walk through m9s-example to validate the Wave 5 packages work end-to-end with real backends. Sprint 3.11 makes that walkthrough cover the actual production codepath, not the in-memory codepath.

## Goals

### G-1 — Production-grade reference application

m9s-example shipped with real persistent storage, real authorization, real durable async queue, and real distributed cache as **default**. Mock-backed implementations remain available as opt-in fallbacks for offline development but are not the default execution path.

### G-2 — Single-command developer onboarding

A single orchestration command brings up all backends; followed by install + start commands the broker boots against real services. Total onboarding ≤ 5 minutes from clean clone (excluding image pulls).

### G-3 — Real-infrastructure end-to-end test coverage

Test suite expands beyond Sprint 3.10 Addendum 2 (Ollama-only) to cover persistent storage, authorization, and async queue under real backends. Each suite env-gated for CI safety; aggregate runs all that detect their backend.

### G-4 — Faster lint feedback

Add a supplementary linter at workspace level providing inner-loop feedback in seconds, not tens-of-seconds. Existing linter retained for catch-all coverage.

### G-5 — Migration-ready schema management

Idempotent versioned migrations for application tables. Auto-apply on dev start; standalone CLI for explicit operations. Rollback-safe forward/back pairs.

## Functional Requirements

- [ ] **FR-1**: Operator can run m9s-example with persistent vector + document storage and recover state across restarts. Referenced by FR-5 (migration management), G-1, NFR-1 (p50 search latency target). Sub-acceptance: ingest+search round-trip survives broker restart with vectors persisted.
- [ ] **FR-2**: Authorization gate denies cross-tenant resource access at the gate layer (not at the application layer). Referenced by NFR-3 (security defaults), G-1. Sub-acceptance: a session scoped to one tenant cannot read another tenant's documents even if it knows the document identifier.
- [ ] **FR-3**: Ingest produces a queued job that returns a job identifier; an asynchronous worker processes the job and persists the result. Operator can poll job status. Referenced by G-1, NFR-1 (enqueue latency target). Sub-acceptance: synchronous fallback preserved when async backend unavailable.
- [ ] **FR-4**: Cache layer uses a distributed backend when configured; falls back to in-memory when not. Cache invalidation tags work identically across drivers. Referenced by G-1, NFR-4 (reproducibility — driver swap is config-only).
- [ ] **FR-5**: CLI commands available for `migrate up`, `migrate down`, `migrate status`. Migration files versioned + paired forward/back. Referenced by G-5, FR-1, NFR-4.
- [ ] **FR-6**: Workspace-level supplementary linter integrated. Per-package overrides where required. Existing linter retained. Referenced by G-4, NFR-1 (full repo lint target ≤ 2s).
- [ ] **FR-7**: Container orchestration brings up all backend dependencies with health checks gating broker start. Referenced by G-2, NFR-2 (onboarding time target).
- [ ] **FR-8**: Real-backend test suites split into one file per backend; each independently env-gated; aggregate command runs all that detect their backend. Referenced by G-3, FR-1/FR-2/FR-3.
- [ ] **FR-9**: Reference documentation contains a self-contained Production Setup section with prerequisites, commands, and smoke verification. Referenced by G-2, NFR-2.
- [ ] **FR-10**: All existing 24 m9s-example tests + Sprint 3.10 e2e (8 tests) PASS unchanged when run with in-memory backends. Real-infra path is additive — pre-Wave-5 + Wave 5 in-memory flows preserved. Referenced by G-1 (default vs opt-in symmetry), risk R-7.

## Non-Functional Requirements

### NFR-1 — Performance targets

- Vector search p50 ≤ 50ms for 1000-document corpus on local Docker (8GB).
- Async enqueue + dequeue round-trip ≤ 500ms.
- Authorization check ≤ 100ms p50 for tenant-scoped tuple lookup.
- Supplementary linter full repo ≤ 2s wall clock (NOT "fast" subjectively — the 2s target is the metric).
- Container orchestration startup ≤ 30s on M1/M2/x86 dev machines (excluding image pulls).

### NFR-2 — Documentation completeness

Production Setup section in reference README must be self-contained — a developer without prior context can run real-infra m9s in under 5 minutes. Example commands tested and copy-pasteable. Referenced by G-2.

### NFR-3 — Security defaults

- Authorization model versioned + checked into repo. Bootstrap relationships seeded for a "tenant-acme + user-default" demo scenario.
- Database credentials in `.env.example` (NOT `.env`). Container orchestration uses environment substitution.
- No secrets in container images (build-arg only for build-time).

### NFR-4 — Reproducibility

- Pinned image versions (no `:latest`).
- Migration scripts deterministic — same input produces same schema regardless of run order count.
- Driver swaps for cache backend are config-only (no source changes).

## Out of Scope

- Production deployment artifacts (Kubernetes manifests, Helm charts, Terraform) — m9s-example is dev/CI reference, not production deployment template.
- Multi-region deployment patterns — single-node backends sufficient for example demonstration.
- Observability stack (`@gertsai/otel` wiring) — separate sprint scope (Wave 6+ Sprint 3.12).
- Performance benchmarks beyond NFR-1 sanity targets.
- Migration of `apps/pipeline` (production application) — m9s-example only.
- v0.2.0 publish gate execution — separate user `Y` decision per CLAUDE.md red lines.

## Acceptance Criteria

- [ ] G-1 (default real-infra): m9s default config requires real backends running, refuses to start otherwise with helpful error. Mock fallbacks opt-in via env (FR-1, FR-2, FR-3, FR-4, FR-10).
- [ ] G-2 (5-min onboarding): orchestration up + install + start succeeds on clean clone in ≤ 5 min excluding image pulls (FR-7, FR-9, NFR-2).
- [ ] G-3 (real-infra suite): 4 real-backend test files (vector-storage, authorization, async-queue, embedder) — each gated, all PASS when backends running (FR-8).
- [ ] G-4 (fast lint): supplementary linter full repo ≤ 2s on monorepo (FR-6, NFR-1).
- [ ] G-5 (migrations): up/down/status CLI applies and rolls back idempotent migrations (FR-5, NFR-4).
- [ ] All FRs delivered with sub-acceptance verified.
- [ ] All NFRs verified by Phase B + post-Build fidelity audit.
- [ ] FR-10 backward-compat: 24 existing m9s tests + 8 e2e tests PASS unchanged.

## Risks

| ID | Risk | Mitigation |
|---|---|---|
| R-1 | Backend resource overhead too heavy for low-end dev machines | Memory fallbacks remain opt-in; documented |
| R-2 | Authorization model granularity suboptimal for vector-store auth | **ADI on this contested decision** (ADR-011 Decision B) |
| R-3 | Vector index choice — perf vs accuracy tradeoff | ADR-011 documents choice + rationale |
| R-4 | Supplementary linter rule incompatibilities with existing linter | Run BOTH; supplement not replace; reconcile in workspace config |
| R-5 | Migration tooling lock-in — affects future schema changes | **ADI on this contested decision** (ADR-011 Decision E) |
| R-6 | Orchestration flakiness across versions | Pin spec version + min-version requirement documented |
| R-7 | Existing 24 tests break under real-infra default | Mock fallback preserved; CI matrix runs both modes (FR-10) |

## Cross-references

- ADR-011 (Sprint 3.11 architectural decisions) — based_on (this PRD)
- SPEC-016 (Sprint 3.11 W-3-11-1..N work items) — based_on (this PRD)
- RFC-002 (Sprint 3.11 cross-package implementation strategy) — based_on (this PRD)
- PRD-003 (Wave 5 vision) — informs (Sprint 3.11 builds on Wave 5 packages)
- ADR-005 (storage-core IStorageProvider) — informs (storage adapter integration)
- ADR-006 (errors Shared Kernel) — informs (auth-gate error mapping)
- ADR-007 (runtime-context middleware) — informs (auth gate plugs into middleware chain)
- EVID-018 (Sprint 3.10 Addendum 2) — informs (Sprint 3.11 builds on action wiring)
- KNOWN-ISSUES — informs (Sprint 3.11 closes m9s-example mock-vs-real gaps)

## Stakeholders

- **Primary**: external developers learning Wave 5 stack via m9s-example template (see Target Audience §Primary).
- **Secondary**: internal team migrating apps/pipeline (see Target Audience §Secondary).
- **Tertiary**: release-readiness QA / docs reviewers (see Target Audience §Tertiary).
- **Implementing reviewer**: post-Build fidelity audit (4-6∥ reviewers per CLAUDE.md AgentTeams pattern).

## Implementation Plan (high-level — see SPEC-016 for W-items)

1. **ADR-011 SHAPE** — architectural decisions for each subsystem.
2. **ADI** on contested decisions (authorization model granularity, migration tooling — per user feedback "ADI на спорных моментах only").
3. **SPEC-016** — W-3-11-1..N work items, file ownership matrix, strategy markers.
4. **RFC-002** — cross-package coordination (which Wave 5 packages need patches).
5. **Pre-Build audit** (5∥ reviewers — architect/security/ddd/typescript/docs).
6. **Build** (4-6∥ workers per disjoint scope).
7. **Phase B verify** — full repo build/test/typecheck/depcruise/lint/real-infra suites.
8. **Post-Build fidelity audit** (4-6∥ reviewers per Track).
9. **EVID-019** + atomic commit + Hindsight Group 44.
10. **Optional**: gh PR + v0.2.0 publish (user `Y` gate per CLAUDE.md red lines).

## Related Artifacts

| Artifact | Type | Relation |
|----------|------|----------|
| ADR-011 (Sprint 3.11 decisions) | ADR | based_on |
| SPEC-016 (Sprint 3.11 work items) | SPEC | based_on |
| RFC-002 (cross-package strategy) | RFC | based_on |
| PRD-003 (Wave 5 vision) | PRD | informs |
| ADR-005 (storage-core) | ADR | informs |
| ADR-007 (runtime-context) | ADR | informs |
| EVID-018 (Sprint 3.10 Addendum 2) | Evidence | informs |

## AI Guidance for SPEC + Build

> Sprint 3.11 ground rules:
- Respect existing `@gertsai/*` package boundaries — no cross-package source changes from m9s-example. If a Wave 5 package needs a fix, that's a separate ADR/SPEC-amendment.
- All schema migrations idempotent — `IF NOT EXISTS` guards everywhere.
- Authorization model + relationships versioned in repo.
- All real-backend tests env-gated via dedicated env vars.
- Mock fallbacks ALWAYS available — production-grade is the default, not the only mode.
- Production Setup README must be testable — paste commands → working broker.







