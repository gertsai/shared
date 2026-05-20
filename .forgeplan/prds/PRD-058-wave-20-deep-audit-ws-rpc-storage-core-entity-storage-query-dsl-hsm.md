---
depth: standard
id: PRD-058
kind: prd
last_modified_at: 2026-05-20T18:22:14.057238+00:00
last_modified_by: claude-code/2.1.142
status: active
title: Wave 20 — deep audit ws-rpc + storage-core + entity-storage + query-dsl + hsm
---

## Problem Statement

Wave 12.D (EVID-051) covered 10 Tier-3-5 packages + 2 missed Tier-1 packages — but for several large packages the audit was shallow (file-level scan rather than line-by-line semantic review). Wave 13.D2 went deep on core; Wave 18 covered entity-{vue,react,solid,svelte}. This wave does the remaining deep audits:

- `@gertsai/ws-rpc` (~1k LOC) — WebSocket RPC primitives
- `@gertsai/hsm` (~600 LOC) — hierarchical state machine
- `@gertsai/storage-core` (~800 LOC) — IStorageProvider interface + capabilities (Wave 7.2 upsertDoc)
- `@gertsai/query-dsl` (~550 LOC) — type-safe query constraints + SQL compiler
- `@gertsai/entity-storage` (~1700 LOC) — abstract BaseEntityStorageService + InMemoryStorageProvider

Total ~4.5-7k LOC source. v1.0.0 prep should not leave audit gaps.

## Goals

1. Read-only deep audit per package.
2. Surface CRIT/HIGH/MED/LOW findings with file:line citations.
3. Cross-package observations (esp. consistency between storage-core + entity-storage + query-dsl which form a related triple).
4. Wave 21 fix sequence recommendation.

## Functional Requirements

**FR-001** — Each package audited for: logic bugs, architectural violations, type-system leaks, security (esp. ws-rpc + storage which handle external input).

**FR-002** — Cross-package: do storage-core + entity-storage + query-dsl interfaces remain consistent? Are query-dsl SQL emissions safe (SQL injection)? Does entity-storage InMemoryStorageProvider have race conditions?

**FR-003** — ws-rpc: protocol surface security (message validation, abuse-resistance, reconnect/backoff correctness).

**FR-004** — hsm: state-transition correctness, race conditions on concurrent transitions.

## Non-Functional Requirements

Read-only audit. No source modifications.

## Out of Scope

- Actual fixes (Wave 21+)
- Wave 15.D ApiController action-pipeline extraction (still pending)
- Cross-package consolidation per Wave 14 territory

## Related Artifacts

- EVID-051 (Wave 12.D shallow precedent)
- EVID-059 (Wave 13.D2 deep audit precedent for core)
- EVID-067 (Wave 15 api-core deep audit precedent)
- EVID-074 (Wave 18 entity-adapters audit precedent)
- ADR-005 (storage-core architecture)
- Sprint 3.5 (storage-core + query-dsl + entity-storage extraction)



