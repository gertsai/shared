---
depth: standard
id: SPEC-018
kind: spec
last_modified_at: 2026-05-08T13:46:25.179488+00:00
last_modified_by: claude-code/2.1.131
links:
- target: PRD-008
  relation: based_on
status: active
title: Wave 7 work items — audit P1 type polish (W-7-1-*) + tri-state upsert capability (W-7-2-*)
---

# SPEC-018: Wave 7 work items — audit P1 type polish (W-7-1-*) + tri-state upsert capability (W-7-2-*)

## Overview

Backfill specification enumerating the work items shipped in Wave 7.1 (commit `53e80c0`, PR #6) and Wave 7.2 (commit `f791e8a`, PR #7). All items are **already shipped on `main`** — this SPEC documents what landed, not what remains to do.

PRD-008 is the parent. ADR-013 captures the architectural decision underpinning the W-7-2-* items.

## Scope

In scope:
- 3 W-7-1-* items (auth-openfga type polish + legacy drafts activation).
- 6 W-7-2-* items (storage-core capability reshape + audit-aware impls + KNOWN-ISSUES §10 closure).
- File ownership matrix per item.
- Acceptance per item with test counts cited from PR descriptions.

Out of scope:
- Pre-Build / post-Build audit — code already merged via PR; no re-audit warranted.
- Deferred Wave 6 audit P1 items (`CheckPermissionOptions` discriminated XOR, `IamEventType` derivation) — captured in PRD-008 §Out of Scope.

## Data Models

The Wave 7.2 items reshape one public type in `@gertsai/storage-core`:

```ts
// Before Wave 7.2 (introduced Wave 6.5)
interface StorageCapabilities {
  readonly upsert?: boolean;
  // …other capabilities unchanged
}

// After Wave 7.2 (commit `f791e8a`)
interface StorageCapabilities {
  readonly upsert?: {
    readonly supported: boolean;
    readonly preservesCreatorAudit: boolean;
  };
  // …other capabilities unchanged
}
```

Both flags are required for the 1-RTT fast path. See ADR-013 §Decision and §Invariants I-1 for the dual-flag dependency rationale.

The Wave 7.1 items add no new public types; they modify existing ones:

- `FgaClientConfig` — every field gains `readonly` modifier (W-7-1-1). No structural change; tightening only.
- `CheckPermissionOptions` — re-exported at package root (W-7-1-2). The interface itself is unchanged.

## API Contracts

### `IStorageProvider.upsertDoc(id, data)` (capability-gated)

Implementations declaring `capabilities.upsert = { supported: true, preservesCreatorAudit: true }` MUST honor:

1. **INSERT** when no row with `id` exists: persist `data` verbatim including `creator_uuid` + `created_at` from incoming.
2. **UPDATE** when a row with `id` exists: persist incoming `data` MERGED with existing row, where `creator_uuid` and `created_at` come from the existing row (not from incoming). All other fields come from incoming.
3. **One round-trip total** (no pre-read). Implementations needing pre-read should declare `preservesCreatorAudit: false` (or omit the flag entirely) so `BaseEntityStorageService.upsert()` falls back to the 2-RTT path.
4. Fast path does NOT emit `ENTITY_CREATED` / `ENTITY_UPDATED` events because the impl cannot distinguish insert from update without pre-read. Listeners requiring this distinction should use `provider.onDocumentSnapshot` (where supported) or stay on the slow path.

### `BaseEntityStorageService.upsert(id, data)` (consumer-facing)

Routes to `provider.upsertDoc(...)` if and only if `capabilities.upsert?.supported === true && capabilities.upsert?.preservesCreatorAudit === true`. Otherwise falls back to the original 2-RTT `getDoc(id) → set/update` path. The slow path retains existing semantics (event emission, audit stamping via service layer).

## Work Items

### Wave 7.1 — auth-openfga type polish + legacy drafts activation (commit `53e80c0`, PR #6, +75/-31)

#### W-7-1-1 — `FgaClientConfig` fields → `readonly`

- **Files**: `packages/auth-openfga/src/types.ts`.
- **Strategy**: F+ (fix on existing — additive type tightening).
- **Rationale**: `GertsFgaClient` constructor copies fields into a fresh internal object; external mutation after construction was never intended. Tightening `readonly`-per-field eliminates a silent footgun and matches the existing convention on `OpenFgaPermissionGateOptions` + `CheckPermissionOptions`.
- **Acceptance**: `pnpm --filter @gertsai/auth-openfga test` 86/86 PASS unchanged; type-check 0 errors.
- **Source**: Mega Wave 6 audit P1-4 (deferred to Wave 7+).

#### W-7-1-2 — `CheckPermissionOptions` re-exported from package root

- **Files**: `packages/auth-openfga/src/index.ts`.
- **Strategy**: F+ (additive export).
- **Rationale**: Interface previously only inferable at call sites; consumers threading the options bag through their own helpers had no name to import. Now: `import type { CheckPermissionOptions } from '@gertsai/auth-openfga'`.
- **Acceptance**: type-check 0 errors; export traceable via `grep` from package root.
- **Source**: Mega Wave 6 audit P1-5 (type subset deferred to Wave 7+; non-type subset `IamEventType` reconciliation remains deferred — captured in PRD-008 §Out of Scope).

#### W-7-1-3 — Legacy drafts activated (Forgeplan housekeeping)

- **Files**: 7 yaml + 7 markdown projection state files in `.forgeplan/state/`. No source-package files touched.
- **Artifacts activated**: EVID-001 (Sprint 1 hygiene), EVID-002 (Sprint 2 Phase 0 smoke), EVID-003 (Sprint 2 Phase A api-core decomposition), EVID-004 (Sprint 3.0 unified dual-package release foundation), PRD-001 (Wave 2 Backend Foundation Extension), SPEC-009 (Sprint 3.5.1 fidelity fixes — activated with `--force` due to 1 historical MUST validation error: missing API Contracts section, schema added later), SPEC-010 (Sprint 3.5.2 m9s-example Wave 4 migration).
- **Strategy**: F+ (status transition only).
- **Rationale**: Drafts documented work shipped Sprints 1–3.5 but were never moved out of draft. Forgeplan health was returning false-positive cleanliness because draft-status drafts don't show up in blindspot checks until activated.
- **Acceptance**: `forgeplan list` shows all 7 in `active` status post-W-7-1-3.

### Wave 7.2 — tri-state upsert capability + audit-aware impls (commit `f791e8a`, PR #7, +157/-86)

#### W-7-2-1 — `StorageCapabilities.upsert` shape change

- **Files**: `packages/storage-core/src/types.ts`.
- **Strategy**: F+ at API boundary (replaces unreleased capability flag introduced Wave 6.5; v0.2.0 not yet published — no external blast radius).
- **Change**: `readonly upsert?: boolean` → `readonly upsert?: { readonly supported: boolean; readonly preservesCreatorAudit: boolean }`. See §Data Models above.
- **Rationale**: Per ADR-013 — boolean did not encode audit-correctness, leading to silent regression risk on UPDATE.
- **Acceptance**: type-check 0 errors workspace-wide; downstream consumers (entity-storage + pg-client + InMemoryStorageProvider) compile against new shape.

#### W-7-2-2 — `BaseEntityStorageService.upsert()` dual-flag check

- **Files**: `packages/entity-storage/src/BaseEntityStorageService.ts`.
- **Strategy**: F+ (logic update).
- **Change**: Short-circuit to `provider.upsertDoc(...)` requires BOTH `capabilities.upsert?.supported === true` AND `capabilities.upsert?.preservesCreatorAudit === true`. Either false/missing → fallback to 2-RTT `getDoc → set/update` path.
- **Rationale**: ADR-013 invariant I-1.
- **Acceptance**: `entity-storage/src/__tests__/upsert.fast-path.test.ts` covers both routing branches.

#### W-7-2-3 — `InMemoryStorageProvider.upsertDoc()` audit-aware impl

- **Files**: `packages/entity-storage/src/InMemoryStorageProvider.ts`.
- **Strategy**: F+ (capability impl).
- **Change**: Pre-checks `Map.has(id)` (zero RTT — sync local Map). On UPDATE: merges `creator_uuid` + `created_at` from existing onto incoming. Declares `capabilities = { upsert: { supported: true, preservesCreatorAudit: true } }`.
- **Acceptance**: `entity-storage/src/__tests__/upsert.test.ts` audit-preservation assertions PASS against the new audit-aware impl (existing assertions retained from Sprint 3.5).

#### W-7-2-4 — `PgStorageProvider.upsertDoc()` surgical jsonb SQL

- **Files**: `packages/pg-client/src/storage-provider.ts` + `packages/pg-client/src/storage-provider.test.ts` (capability assertion update).
- **Strategy**: F+ (capability impl).
- **Change**:

  ```sql
  INSERT INTO <table> (id, data) VALUES ($1, $2)
  ON CONFLICT (id) DO UPDATE
    SET data = <table>.data || (EXCLUDED.data - 'creator_uuid' - 'created_at')
  ```

  `-` strips creator fields from incoming, `||` merges remaining onto existing. One round-trip, audit-correct on both INSERT (creator from incoming) and UPDATE (creator preserved from existing).

- **Acceptance**: `pnpm --filter @gertsai/pg-client test` 35/35 PASS; capability declaration `{ supported: true, preservesCreatorAudit: true }` asserted in `storage-provider.test.ts`.

#### W-7-2-5 — Test reshape (`upsert.fast-path.test.ts` + `upsert.test.ts`)

- **Files**: `packages/entity-storage/src/__tests__/upsert.fast-path.test.ts` + `packages/entity-storage/src/__tests__/upsert.test.ts`.
- **Strategy**: F+ (test alignment with new capability shape + audit-aware impl).
- **Changes**:
  - `upsert.fast-path.test.ts` — `RecordingProvider` constructs new tri-state shape.
  - `upsert.test.ts` — removed event-emission assertions (fast path no longer emits `ENTITY_CREATED`/`ENTITY_UPDATED` because the service cannot tell insert from update without pre-read; documented in ADR-013 §Consequences §Neutral). Audit-preservation assertions retained — they pass against the new audit-aware InMemory impl.
- **Acceptance**: `pnpm --filter @gertsai/entity-storage test` 102/102 PASS.

#### W-7-2-6 — KNOWN-ISSUES §10 closure

- **Files**: `KNOWN-ISSUES.md`.
- **Strategy**: F+ (doc update).
- **Change**: §10 status flipped from open to RESOLVED with reference to `f791e8a` and ADR-013.
- **Acceptance**: `KNOWN-ISSUES.md` §10 contains "RESOLVED" marker; reachable from EVID-023.

## File Ownership Matrix

| File | Wave | Items |
|---|---|---|
| `packages/auth-openfga/src/index.ts` | 7.1 | W-7-1-2 |
| `packages/auth-openfga/src/types.ts` | 7.1 | W-7-1-1 |
| `.forgeplan/state/{EVID-001..004,PRD-001,SPEC-009,SPEC-010}.yaml` + 7 md projections | 7.1 | W-7-1-3 |
| `packages/storage-core/src/types.ts` | 7.2 | W-7-2-1 |
| `packages/entity-storage/src/BaseEntityStorageService.ts` | 7.2 | W-7-2-2 |
| `packages/entity-storage/src/InMemoryStorageProvider.ts` | 7.2 | W-7-2-3 |
| `packages/pg-client/src/storage-provider.ts` | 7.2 | W-7-2-4 |
| `packages/pg-client/src/storage-provider.test.ts` | 7.2 | W-7-2-4 |
| `packages/entity-storage/src/__tests__/upsert.fast-path.test.ts` | 7.2 | W-7-2-5 |
| `packages/entity-storage/src/__tests__/upsert.test.ts` | 7.2 | W-7-2-5 |
| `KNOWN-ISSUES.md` | 7.2 | W-7-2-6 |

No file ownership conflicts: every file owned by exactly one work item.

## Strategy Markers Summary

All Wave 7 items are **F+** (fix-on-existing, additive — no breaking changes from the publishable consumer's perspective; capability shape change in W-7-2-1 is allowed because v0.2.0 is not yet published per CLAUDE.md §Текущий статус).

## Acceptance Criteria

- [ ] All 9 W-* items shipped on `main` with claims verifiable by `git show <SHA>` and `pnpm --filter <pkg> test`.
- [ ] `auth-openfga` 86/86 PASS post-Wave-7.1.
- [ ] `entity-storage` 102/102 PASS post-Wave-7.2.
- [ ] `pg-client` 35/35 PASS post-Wave-7.2.
- [ ] m9s-example real-infra 16/16 PASS unchanged (no regression on Postgres / OpenFGA / BullMQ).
- [ ] Workspace-wide typecheck 0 errors; depcruise 0 violations; oxlint 0 errors.
- [ ] KNOWN-ISSUES.md §10 RESOLVED marker present.

## Related Artifacts

| Artifact | Type | Relation | Notes |
|---|---|---|---|
| PRD-008 | PRD | based_on | Wave 7 closure parent |
| ADR-013 | ADR | based_on | tri-state capability flag decision underpinning W-7-2-* |
| EVID-023 | Evidence | informs | Wave 7 ship evidence (test results + commit verification) |
| EVID-022 | Evidence | informs | Wave 6.5 upsertDoc primitive — context for W-7-2-1 reshape |
| ADR-005 | ADR | informs | storage-core architecture — capability surface ownership |
| PR #6 | git | implementation | Wave 7.1 reference (`53e80c0`) |
| PR #7 | git | implementation | Wave 7.2 reference (`f791e8a`) |

## Notes

- This SPEC was authored after the work shipped (backfill). Item ordering reflects the canonical Wave-1 → Wave-2 narrative even though all items merged within the same hour on 2026-05-08.
- `--force` activation of SPEC-009 in W-7-1-3 was a deliberate audit-trail compromise: the historical SPEC predated the current MUST schema; re-authoring its body retroactively would mask the actual workflow.




