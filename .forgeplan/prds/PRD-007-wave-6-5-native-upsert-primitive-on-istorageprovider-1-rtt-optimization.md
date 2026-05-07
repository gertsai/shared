---
depth: standard
id: PRD-007
kind: prd
last_modified_at: 2026-05-07T22:56:28.374803+00:00
last_modified_by: claude-code/2.1.132
status: active
title: Wave 6.5 — Native upsert primitive on IStorageProvider (1-RTT optimization)
---

# PRD-007 — Native upsert primitive on `IStorageProvider` (Wave 6.5)

## Context

Closes KNOWN-ISSUES §10. `BaseEntityStorageService.upsert()` (Sprint 3.5)
currently issues **two storage round-trips**: `provider.getDoc()` for
existence check, then `provider.setDoc()` (insert) OR `update` path.
Backends with native upsert (Postgres `INSERT ... ON CONFLICT DO UPDATE`,
SQLite `UPSERT`) can collapse this to ONE RTT — but the
`IStorageProvider` contract has no upsert primitive.

## Target Audience

- **High-throughput service authors** consuming `BaseEntityStorageService` —
  cut every upsert in half.
- **Provider implementers** (`PgStorageProvider`, future MySQL / SQLite /
  Firestore adapters) — gain a clean opt-in slot.
- **m9s-example** — `pg-document.repository.ts` already does its own
  upsert at the SQL level; this optimization unifies the pattern at
  the storage-core abstraction so consumers using `BaseEntityStorageService`
  can opt in without writing raw SQL.

## Problem

Real production hot paths (chunk re-ingest, idempotent webhook handlers,
session refresh) frequently call `upsert()` per request. At even modest
throughput (1000 req/sec × 2 RTTs × 1ms RTT) that's 1 second of avoidable
DB latency budget.

## Goals

1. Add OPTIONAL `upsertDoc(path, entity)` method to `IStorageProvider`
   interface (additive — no breaking change for existing providers).
2. Add `capabilities.upsert: boolean` flag (defaults to `false`).
3. `BaseEntityStorageService.upsert()` checks the capability: if `true`,
   delegates to `provider.upsertDoc()` for one RTT; else falls back to
   the existing 2-RTT path.
4. Implement `upsertDoc` on `InMemoryStorageProvider` (Map-based, trivial).
5. Implement `upsertDoc` on `PgStorageProvider` using
   `INSERT ... ON CONFLICT (id) DO UPDATE SET ... RETURNING id` (1 RTT).
6. Tests: provider-side unit test + service-side integration test
   that asserts `getDoc` is NOT called when `capabilities.upsert === true`.
7. Mark KNOWN-ISSUES §10 RESOLVED.

## Non-Goals

- Bulk upsert (`upsertDocs`) — separate follow-up; current callers are
  per-row.
- Conflict resolution policy beyond "merge new fields" — that's a future
  CRDT/version-vector follow-up.
- Schema migration for new conflict-target columns — out of scope.

## Functional Requirements

- [ ] FR-1. `interface IStorageProvider` gains optional method:
      `upsertDoc?(path, entity): Promise<{ id: string }>`.
- [ ] FR-2. `interface StorageCapabilities` gains `readonly upsert: boolean`.
- [ ] FR-3. `BaseEntityStorageService.upsert()` checks
      `provider.capabilities.upsert` AND the presence of `upsertDoc` —
      both required — before delegating; else uses current 2-RTT path
      (FR-7 backwards-compat).
- [ ] FR-4. `InMemoryStorageProvider.upsertDoc` implemented; capability
      reports `upsert: true`. Tests cover: insert path, update path,
      audit-stamp path (the existing service-level audit pipeline must
      still apply via `set()` / `update()` semantics).
- [ ] FR-5. `PgStorageProvider.upsertDoc` implemented using
      `INSERT ... ON CONFLICT (id) DO UPDATE`. Capability reports
      `upsert: true`. Test: roundtrips a document twice, asserts
      `pg.query` was called exactly ONCE on the second call (mock spy).
- [ ] FR-6. NEW unit test on `BaseEntityStorageService.upsert()` —
      with a fake provider whose `capabilities.upsert === true`,
      asserts `getDoc` was NOT invoked.
- [ ] FR-7. Existing `BaseEntityStorageService` tests (Sprint 3.5)
      continue to pass when provider reports `upsert: false` (the
      backwards-compat 2-RTT path).

## Non-Functional Requirements

NFR-1. **Backwards compat absolute** — providers that DO NOT implement
       `upsertDoc` and report `upsert: false` MUST continue to work;
       service falls back to 2-RTT.
NFR-2. **Audit + invariant integrity** — the native upsert path MUST
       still respect the same audit stamping (`creator_uuid`, `created_*`,
       `last_modified_uuid`, `last_modified_*`) as the 2-RTT path.
       Provider implementations are responsible for translating the
       service's pre-stamped entity into the right SQL columns.
NFR-3. **Type safety** — `IStorageProvider.upsertDoc?` is OPTIONAL on
       the interface; service-side `if (provider.upsertDoc && capabilities.upsert)`
       narrowing is type-safe via discriminated check.

## Acceptance Criteria

AC-1. `pnpm --filter @gertsai/storage-core run test` — existing tests pass + new contract test.
AC-2. `pnpm --filter @gertsai/entity-storage run test` — existing 91+ tests pass + new tests for capability-gated upsert.
AC-3. m9s-example mock + real-infra unchanged (m9s uses raw PgClient repository, not `BaseEntityStorageService`).
AC-4. `pnpm typecheck` — 0 errors workspace-wide.
AC-5. `pnpm depcruise` — 0 violations.

## Risks

R-1. Capability check race — provider's `capabilities` flag could lie.
     Mitigation: defensive `&& provider.upsertDoc` runtime check on the service side.
R-2. Audit stamping divergence between 2-RTT and 1-RTT paths.
     Mitigation: service-level `set()` / `update()` already stamps the
     entity; native `upsertDoc` receives a fully-stamped entity, so
     audit fields end up in the SQL row identical regardless of path.

## Out-of-Scope

- Bulk `upsertDocs`.
- Conflict-resolution strategies beyond "merge new fields".
- Schema migration for adapters that lack a unique `id` constraint.

## Related Artifacts

- **EVID-019** — m9s-example production-grade reference (active).
  Documents §10 as Wave 6+ optimisation.
- **ADR-005** — Storage abstraction (active). Wave 6.5 extends the
  contract additively.
- **EVID-022** (this cycle) — Wave 6.5 evidence pack.
- **KNOWN-ISSUES.md §10** — entry to flip RESOLVED.

Refs: KNOWN-ISSUES §10, ADR-005, Sprint 3.5 W-4B-1.



