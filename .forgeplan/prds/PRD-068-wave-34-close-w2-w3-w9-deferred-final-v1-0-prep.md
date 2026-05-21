---
depth: standard
id: PRD-068
kind: prd
last_modified_at: 2026-05-21T22:22:39.917914+00:00
last_modified_by: claude-code/2.1.145
status: draft
title: Wave 34 — close W2/W3/W9 deferred + final v1.0 prep
---

# PRD-068: Wave 34 — close W2/W3/W9 deferred + final v1.0 prep

| Field | Value |
|-------|-------|
| Status | Draft |
| Depth | Deep |
| Created | 2026-05-22 |
| Parent | EVID-083 (W tail residue) + EVID-085 (Wave 33 explicit deferrals) |

## Problem Statement

After Wave 33, three EVID-083 medium findings remain explicitly deferred:
- **W2**: workspace-wide `_uid → uuid` rename across `@gertsai/entity` + `@gertsai/core/session.UsersMetaType` — surface-breaking change requiring decision on scope + migration story
- **W3**: `setStageOverride` extension API limited to replace-only — `addStageBefore`/`addStageAfter`/`wrapStage` could give consumers more power
- **W9**: `wrapResponse.message` flows server-side `action.options.responseMessage` to clients — theoretical XSS, was rejected as "server-side not user input" but worth a hardening pass

Plus 1 ledger cosmetic: PRD-016 active but phase=shape (advisory phase mismatch since Wave 10).

This is the LAST forge-cycle before v1.0 release decision. After Wave 34, all EVID-083 findings (44 across 3 audits + ledger) reach 100% closed-or-explicitly-documented.

## Target Audience

- Maintainers preparing v1.0 — clean residue
- Downstream consumers — uuid parity matters for serialization compat
- Future-self — explicit closure of every deferred finding

## Goals / Success Criteria

- W2 closed via `@gertsai/entity` minor bump (rename Entity._uid → entity.uuid, Entity-toJSONObject) + `@gertsai/core` minor (UsersMetaType.data._uid → uuid)
- W3 closed via new `addStageBefore` + `addStageAfter` + `wrapStage` methods on `ApiController` (`@gertsai/api-core` minor)
- W9 closed via JSDoc clarifying `responseMessage` non-user-input semantics + (optional) escape-on-suspicious-content helper
- PRD-016 phase advanced from `shape` → `ship` via `forgeplan_phase_advance` (Wave 10 actually shipped — phase metadata correction)
- All gates green
- EVID-086 created + linked + activated

## ADI Reasoning Summary (Wave 34 scope decision)

Three hypotheses considered:

**H1 — Big bang (all 3 + ledger in one PR)**:
- Pro: single user gate, single CI run, audit ledger fully closed in one shot
- Con: high blast radius across 3 packages (entity, core, api-core); rollback complexity if one closure regresses
- Risk: medium

**H2 — Phased (W2 alone first, W3+W9 in follow-up)**:
- Pro: W2 is surface-breaking — isolate it for clean revert if downstream breaks
- Con: 2 PRs + 2 publish cycles
- Risk: low

**H3 — W3+W9 first (additive), W2 last (breaking)**:
- Pro: additive changes ship first (consumers can adopt early); breaking last so it sets the v1.0-ready surface
- Con: 2 PRs still
- Risk: low

**Decision (H3)**: Phased — W3+W9 + ledger in single PR (additive), then W2 alone in second PR (surface-breaking minor bump). User can choose to merge both or only first.

Implementation note: spend the same Wave 34 PRD but execute in two PRs to keep blast radius bounded.

## Functional Requirements

### Phase A — W3 setStageOverride extension API (additive)

- **FR-A1**: Add `public addStageBefore(name: StageName, stage: Stage): void` on `ApiController`
- **FR-A2**: Add `public addStageAfter(name: StageName, stage: Stage): void`
- **FR-A3**: Add `public wrapStage(name: StageName, wrapper: (next: Stage) => Stage): void` (around advice)
- **FR-A4**: Storage: per-instance `_stageInserts` ordered map (Map<StageName, { before: Stage[]; after: Stage[]; wrappers: ((next: Stage) => Stage)[] }>)
- **FR-A5**: `_createActionSchema` resolves effective stages by applying inserts + wrappers to the corresponding default
- **FR-A6**: Sensitive-stage warning (Wave 32.D) extended to new methods too
- **FR-A7**: ≥6 new tests covering each method + composition order + sensitive-stage warn
- **FR-A8**: README "Custom pipeline composition" section updated

### Phase B — W9 wrapResponse XSS hardening (defensive doc + opt-in helper)

- **FR-B1**: Add JSDoc to `wrap-response.ts` clarifying `responseMessage` MUST be server-controlled (not user-input)
- **FR-B2**: Add JSDoc to `ApiController.register` / `ActionOptions.responseMessage` field documenting same contract
- **FR-B3**: NO runtime sanitization (would hide misuse); doc-only defense

### Phase C — Ledger cosmetics

- **FR-C1**: Advance PRD-016 phase via `forgeplan_phase_advance` (shape → ship; Wave 10 actually shipped per EVID-038)

### Phase D — W2 workspace-wide `_uid → uuid` rename (deferred to follow-up PR if H3)

- **FR-D1**: `@gertsai/entity/src/Entity.ts`: `_uid: string` → `uuid: string` in EntityJSON; `toJSONObject()` returns `{ uuid, data }` (was `{ _uid, data }`)
- **FR-D2**: `@gertsai/entity/src/EntityWithMetadata.ts`: same in EntityWithMetadataJSON; `toJSONObject()` returns `{ uuid, data, metadata, __typename }`
- **FR-D3**: `@gertsai/entity/src/types.ts:136`: rename in EntityJSON interface
- **FR-D4**: `@gertsai/core/src/session/types.ts:378`: `_uid` → `uuid` in UsersMetaType.data
- **FR-D5**: Update tests: Entity.test.ts (3 sites), EntityWithMetadata.test.ts (3 sites), pg-client storage-provider.test.ts (1 site)
- **FR-D6**: Update README in `@gertsai/entity` to reflect new surface

### Phase E — Final verification

- **FR-E1**: Read-only production-validator pass
- **FR-E2**: All gates green

## Non-functional Requirements

- All bumps minor (additive new APIs) except W2 batch which is also minor pre-1.0 per CLAUDE.md
- Build + typecheck workspace-wide green
- Test count delta: +6 to +12 new
- Audit-trail comments `// Wave 34.{Phase} (EVID-083 W-N | ledger)` on every closure

## Acceptance Criteria

- [ ] Wave 34.A: 3 new public methods on ApiController + 6 tests passing
- [ ] Wave 34.B: JSDoc added to wrap-response.ts + ActionOptions.responseMessage
- [ ] Wave 34.C: PRD-016 phase advanced via MCP
- [ ] Wave 34.D: W2 rename across @gertsai/entity + @gertsai/core complete
- [ ] All workspace gates green
- [ ] EVID-086 created + linked + activated

## Out of Scope

- v1.0 release decision (major bump 0.x → 1.0.0) — pending user trigger
- W2 W3 W9 reopening — these are explicit final closures, no further follow-up planned

## Risks

- **W2 surface break**: any consumer reading `entity.toJSONObject()._uid` post-Wave-34 gets `undefined`. Mitigated by changeset note + minor bump
- **W3 extension API**: new public surface may need iteration based on real-world feedback. Mitigated by additive (replace-only `setStageOverride` still works)
- **Phased landing**: if user merges only Phase A+B+C and not D, residue persists — explicit in PR descriptions

## Related Artifacts

| Artifact | Relation |
|----------|----------|
| EVID-083 | based_on (W tail final closures) |
| EVID-085 | refines (Wave 33 left these 3 deferred) |
| PRD-067 | refines (Wave 33 ledger work) |
| EVID-086 | informs (Wave 34 closure proof) |

