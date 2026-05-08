---
depth: standard
id: EVID-022
kind: evidence
last_modified_at: 2026-05-07T23:06:23.086936+00:00
last_modified_by: claude-code/2.1.132
links:
- target: PRD-007
  relation: informs
status: active
title: Wave 6.5 — IStorageProvider.upsertDoc primitive + service-side fast path
---

# EVID-022 — Wave 6.5 IStorageProvider.upsertDoc

## Structured Fields
- **verdict:** weakens
- **congruence_level:** CL3
- **evidence_type:** unit tests + workspace regression check + ADI on audit-correctness blocker

## Summary

Wave 6.5 (PRD-007) added the optional `upsertDoc?` primitive and
`capabilities.upsert?` flag to `IStorageProvider`. `BaseEntityStorageService.upsert()`
now branches on the capability — fast 1-RTT path when provider opts
in, back-compat 2-RTT path otherwise.

**Verdict = "weakens" (NOT "supports")** because the
audit-correctness ADI blocked enabling the fast path on the shipped
providers. Both `InMemoryStorageProvider` and `PgStorageProvider`
report `capabilities.upsert: false`. The ONE-RTT optimization remains
deferred to per-provider audit-aware follow-up; this evidence
documents the API extension landed cleanly without breaking the
backwards-compat path.

## ADI Trace

**Blocker (round 1)**: existing `upsert.test.ts` (Sprint 3.5) failed
after enabling `InMemoryStorageProvider.capabilities.upsert: true`.
Three tests broke: `inserts a new entity (delegates to set)`,
`updates an existing entity (delegates to update) and preserves
creator audit`, and the routing-opts test.

- H1: tests are checking implementation details (which provider method
  was called) — fix tests to assert outcome, not method calls.
- H2: tests are correctly catching a regression — the fast path
  re-stamps `creator_uuid` on UPDATE, breaking audit invariants.
  **TRUE** — confirmed by reading `buildDataForSet` (populates
  create-time + modify-time fields on every call).
- H3: `InMemoryStorageProvider` could check insert-vs-update inside
  `upsertDoc` to apply the right stamping — but that's a 2-RTT
  internal probe, defeating the whole point.

**Resolution**: H2 confirmed. Reverted `capabilities.upsert: true`
to `false` on BOTH providers + documented in KNOWN-ISSUES that the
optimization is deferred per-provider. Interface extension stays
(future-compatible). New `upsert.fast-path.test.ts` exercises the
fast path through a hand-rolled `RecordingProvider(true)` so the
service-side branch IS verified.

## Test Results

```
 ✓ src/__tests__/upsert.fast-path.test.ts (7 tests) [NEW Wave 6.5]
 ✓ src/__tests__/upsert.test.ts (3 tests) preserved Sprint 3.5
 ✓ src/__tests__/InMemoryStorageProvider.test.ts (39 tests)
 ✓ src/__tests__/BaseEntityStorageService.event-emission.test.ts (10 tests)
 ✓ src/__tests__/BaseEntityStorageService.event-emission.transaction.test.ts
 ✓ src/__tests__/BaseEntityStorageService.eventEmitter.public.test.ts
 ✓ src/__tests__/BaseEntityStorageService.test-d.ts (6 tests)

 Test Files  8 passed
      Tests  102 passed (was 95; +7 new fast-path tests)
```

Workspace-wide:
- `pnpm -r run typecheck` — 0 errors
- `pnpm -r --workspace-concurrency=4 run test` — all packages green
- `pnpm depcruise` — 0 violations

## Files Changed

NEW (1):
- `packages/entity-storage/src/__tests__/upsert.fast-path.test.ts` — 7 tests covering both fast (cap=true) + slow (cap=false) paths via `RecordingProvider`

MODIFIED (5):
- `packages/storage-core/src/types.ts` — added optional `upsertDoc?` to `IStorageProvider` + optional `upsert?: boolean` to `StorageCapabilities`
- `packages/entity-storage/src/BaseEntityStorageService.ts` — `upsert()` branches on capability; fast path uses `buildDataForSet` for stamping; bypasses fast path when batch/transaction routing opts present
- `packages/entity-storage/src/InMemoryStorageProvider.ts` — implemented `upsertDoc()` (Map.set wrapper) but reports `capabilities.upsert: false` until audit-aware impl
- `packages/pg-client/src/storage-provider.ts` — implemented `upsertDoc()` (`INSERT ... ON CONFLICT DO UPDATE`) but reports `capabilities.upsert: false` for same audit reason
- `KNOWN-ISSUES.md` — flipped §10 to PARTIALLY RESOLVED with status notes

## Next Steps (deferred)

1. Audit-aware `upsertDoc` on `InMemoryStorageProvider` — pre-check
   existence inside the provider via the local Map (sync, no RTT cost)
   so it can apply create-only stamping for first-write OR
   modify-only stamping for re-write. Flip cap to `true` when shipped.
2. Audit-aware `upsertDoc` on `PgStorageProvider` — switch from a
   single `data: jsonb` column model to columnar audit fields with
   explicit `INSERT ... ON CONFLICT DO UPDATE SET col1 = EXCLUDED.col1, ...`
   that EXCLUDES `creator_uuid`/`created_*`. Flip cap to `true`.
3. Add an `IStorageProvider.upsertDocBatch?` for bulk variant —
   separate ADR.

## Methodology trace

OBSERVE → ROUTE (Standard, PRD only) → SHAPE (PRD-007 valid) →
BUILD (interface + 2 provider impls + service-side branch + new test) →
ADI (1 round, H2 confirmed audit-correctness regression) →
SCALE-BACK (revert capability flags to `false` on both providers,
keep interface) → PROVE (this evidence, CL3 weakens — work landed
cleanly but deferred main optimization win) → SHIP (commit local).



