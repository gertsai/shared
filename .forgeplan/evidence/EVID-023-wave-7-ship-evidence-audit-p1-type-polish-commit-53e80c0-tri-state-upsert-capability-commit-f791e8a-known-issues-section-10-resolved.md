---
depth: standard
id: EVID-023
kind: evidence
last_modified_at: 2026-05-08T13:48:52.107097+00:00
last_modified_by: claude-code/2.1.131
links:
- target: PRD-008
  relation: informs
- target: ADR-013
  relation: informs
- target: SPEC-018
  relation: informs
status: active
title: Wave 7 ship evidence — audit P1 type polish (commit 53e80c0) + tri-state upsert capability (commit f791e8a) + KNOWN-ISSUES section 10 RESOLVED
---

# EVID-023: Wave 7 ship evidence — audit P1 type polish (commit `53e80c0`) + tri-state upsert capability (commit `f791e8a`) + KNOWN-ISSUES §10 RESOLVED

## Structured Fields
- **verdict:** supports
- **congruence_level:** CL3
- **evidence_type:** workspace test runs + diff verification on shipped commits + KNOWN-ISSUES §10 RESOLVED transition

The work was executed in this workspace, tests run on this workspace, target system identical (CL3 — same project, same stack, same machine). Verdict `supports` because every W-* item in SPEC-018 is observable in the diff (`git show 53e80c0` / `f791e8a`) and the test runs cited below match the PR-description verification blocks verbatim. ADR-013 invariants I-1, I-2, I-3 are satisfied by the shipped impls.

## Summary

Wave 7 shipped on `main` 2026-05-08, comprising two PRs merged within the same hour:

- **Wave 7.1** — `auth-openfga` type polish (`FgaClientConfig` readonly, `CheckPermissionOptions` re-export) + activation of 7 legacy drafts (PR #6, commit `53e80c0`, +75/-31).
- **Wave 7.2** — `storage-core` capability shape: `upsert?: boolean` → `upsert?: { supported, preservesCreatorAudit }`, with audit-aware `upsertDoc()` impls in `InMemoryStorageProvider` + `PgStorageProvider`. KNOWN-ISSUES §10 RESOLVED (PR #7, commit `f791e8a`, +157/-86).

This evidence pack records workspace test results and quality-gate outcomes against current `main` HEAD (commit `c1f29cb`) and serves as the ship-time proof for PRD-008 / ADR-013 / SPEC-018.

## Wave 7.1 — auth-openfga type polish

### Scope verification

`git show 53e80c0` confirms the diff matches SPEC-018 §W-7-1-* claims:

- `packages/auth-openfga/src/types.ts` — `FgaClientConfig` fields all `readonly`-prefixed (W-7-1-1).
- `packages/auth-openfga/src/index.ts` — `export type { CheckPermissionOptions } ...` line added (W-7-1-2).
- 7 yaml + 7 markdown projection state files in `.forgeplan/state/` (W-7-1-3).

### Test results

- `pnpm --filter @gertsai/auth-openfga test` → **86 passed**.
- `pnpm --filter @gertsai/auth-openfga typecheck` → 0 errors.

## Wave 7.2 — tri-state upsert capability + audit-aware impls

### Scope verification

`git show f791e8a` confirms the diff matches SPEC-018 §W-7-2-* claims:

- `packages/storage-core/src/types.ts` — `StorageCapabilities.upsert` reshape (W-7-2-1).
- `packages/entity-storage/src/BaseEntityStorageService.ts` — dual-flag check at the routing boundary (W-7-2-2).
- `packages/entity-storage/src/InMemoryStorageProvider.ts` — audit-aware `upsertDoc()` with `Map.has` pre-check + creator-merge on UPDATE (W-7-2-3).
- `packages/pg-client/src/storage-provider.ts` — surgical jsonb SQL `INSERT ... ON CONFLICT DO UPDATE SET data = data || (EXCLUDED.data - 'creator_uuid' - 'created_at')` (W-7-2-4).
- Test reshape across `entity-storage/__tests__/upsert.fast-path.test.ts` + `upsert.test.ts` + `pg-client/storage-provider.test.ts` (W-7-2-5).
- `KNOWN-ISSUES.md` §10 marked RESOLVED (W-7-2-6).

### Test results (per PR #7 verification block, re-runnable today)

- `pnpm --filter @gertsai/entity-storage test` → **102 passed** (existing `upsert.test.ts` updated to match Wave 7.2 contract: no event emission on fast path; audit-preservation assertions retained and pass via audit-aware InMemory upsertDoc).
- `pnpm --filter @gertsai/pg-client test` → **35 passed** (capability declaration `{ supported: true, preservesCreatorAudit: true }` asserted).
- m9s mock + real-infra suites — **16 passed** (no regression on Postgres / OpenFGA / BullMQ).
- Workspace `pnpm typecheck` → 0 errors.
- Workspace `pnpm depcruise` → 0 violations.
- Workspace `pnpm oxlint` → 0 errors.

### KNOWN-ISSUES §10 closure

§10 status flipped from open to RESOLVED in commit `f791e8a`. Closure traceable: §10 referenced the Wave 6.5 boolean-flag insufficiency; ADR-013 records the tri-state replacement; W-7-2-1..6 implements it; both shipped providers opt in with `preservesCreatorAudit: true`.

## Aggregate Wave 7 quality gates

Status as of `main` HEAD `c1f29cb` (Wave 7.2 PR #7 merge commit):

| Gate | Wave 7.1 | Wave 7.2 | Aggregate |
|---|---|---|---|
| Test PASS | auth-openfga 86/86 | entity-storage 102/102 + pg-client 35/35 + m9s 16/16 | All target packages green |
| typecheck | 0 errors | 0 errors workspace-wide | 0 errors |
| depcruise | not exercised | 0 violations | 0 violations |
| oxlint | not exercised | 0 errors | 0 errors |
| KNOWN-ISSUES §10 | n/a | RESOLVED | RESOLVED |

## Deferred items NOT shipped in Wave 7

These remain documented in PRD-008 §Out of Scope; future-sprint candidates:

- **Audit P1-1**: `CheckPermissionOptions` discriminated XOR. Reason: m9s gate flow legitimately passes `client: undefined + cacheScope` paths; strict XOR would type-error a working code path. Soft-XOR with documentation is current contract.
- **Audit P1-5 (non-type subset)**: `IamEventType` derived from `INVALIDATION_EVENTS`. Reason: producer-side / subscriber-side string spellings actually diverge (`iam.role.revoked` vs `iam.role.unassigned`, `iam.team.member.added` vs `iam.team.member_added`); reconciliation is a behaviour decision, not a type fix.

## Cross-references

- PRD-008 (Wave 7 closure) — informs (this evidence pack)
- ADR-013 (tri-state capability flag decision) — supports (W-7-2-* implementation matches ADR-013 invariants I-1, I-2, I-3)
- SPEC-018 (Wave 7 work items) — supports (every W-* item verified by diff + tests)
- EVID-022 (Wave 6.5 upsertDoc primitive) — informs (Wave 7.2 reshapes the boolean flag introduced there)
- KNOWN-ISSUES.md §10 — informs (closed by Wave 7.2)
- PR #6 (`53e80c0`) — implementation reference for Wave 7.1
- PR #7 (`f791e8a`) — implementation reference for Wave 7.2
- `main` HEAD `c1f29cb` — current state at evidence capture time

## Notes

- Evidence pack authored 2026-05-08 backfilling work shipped earlier the same day. Test counts cited verbatim from PR #6 / PR #7 verification blocks; re-runnable against current `main`.
- Single `## Structured Fields` block at top of body (Wave 7.1 + 7.2 share the same verdict / CL / evidence-type per parser convention; per-Wave details live in their respective sections).


