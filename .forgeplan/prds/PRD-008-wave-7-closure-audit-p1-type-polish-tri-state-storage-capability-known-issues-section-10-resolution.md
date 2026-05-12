---
depth: standard
id: PRD-008
kind: prd
last_modified_at: 2026-05-08T16:20:24.900907+00:00
last_modified_by: claude-code/2.1.131
status: active
title: Wave 7 closure — audit P1 type polish + tri-state storage capability + KNOWN-ISSUES section 10 resolution
---

# PRD-008: Wave 7 closure — audit P1 type polish + tri-state storage capability + KNOWN-ISSUES §10 resolution

## Problem Statement

Two changes shipped to `main` between 2026-05-08 12:11 UTC and 12:11:57 UTC (PRs #6 + #7) without paired Forgeplan artifacts:

- **Wave 7.1** (commit `53e80c0`, +75/-31): two `auth-openfga` type-system polish items (`FgaClientConfig` fields → `readonly`, `CheckPermissionOptions` re-exported from package root) + activation of 7 legacy drafts (EVID-001..004, PRD-001, SPEC-009, SPEC-010) that documented work shipped in Sprints 1–3.5.
- **Wave 7.2** (commit `f791e8a`, +157/-86): `@gertsai/storage-core` capability surface change — `StorageCapabilities.upsert?: boolean` replaced with tri-state `upsert?: { supported: boolean; preservesCreatorAudit: boolean }`. Both shipped providers (InMemoryStorageProvider, PgStorageProvider) gained audit-aware native upsertDoc impls. KNOWN-ISSUES §10 flipped to RESOLVED.

The work is correct, tested, and merged via PRs. The gap is documentation: `forgeplan health` returns "healthy" because it only checks declared artifacts for missing evidence — it has no signal for *undeclared* work. The CLAUDE.md tier-table for `@gertsai/storage-core` and `@gertsai/auth-openfga` referenced commits but no artifacts. ADR-013 was needed for Wave 7.2 because the boolean → tri-state reshape was a public-API contract change with a non-obvious invariant (dual-flag dependency), and no decision record captured the rationale.

This PRD backfills the missing layer so the documentation surface is consistent with shipped code and so future reviewers see the same lineage that consumers see in `git log`.

## Target Audience

### Primary — release-readiness reviewers preparing v0.2.0 publish gate

Before `pnpm changeset publish`, reviewers walk the Forgeplan artifact tree to confirm every public-API surface has an ADR and every shipped sprint has an EVID. Wave 7.2 changed `StorageCapabilities.upsert` shape — an undocumented breaking change on a published-soon package is a publish blocker.

### Secondary — future contributors reviewing storage-core capability semantics

Engineers extending `@gertsai/storage-core` with a new IStorageProvider implementation need to know which capability flags to declare and why both `supported` and `preservesCreatorAudit` are required for the short path. Without ADR-013 they would copy from existing impls without grasping the audit-correctness invariant.

### Tertiary — maintainers running forgeplan blindspots / health

Auditors expect `forgeplan health` to be a credible drift signal (FR-5). After Wave 7 backfill, `health` regains accuracy: it covers what is on `main`, not just what was shaped through Forgeplan upfront. CLAUDE.md tier-table consistency (FR-6) is a related precondition for that accuracy.

## Goals

### G-1 — Forgeplan documentation matches `main` HEAD

After this sprint, every commit on `main` after Sprint 3.10 closure has either an existing or newly-created Forgeplan artifact reachable via `forgeplan graph`. Wave 6.{2,3,4,5} are already documented (EVID-020/021/022 + ADR-012); Wave 7.{1,2} closes the remaining gap. Verified by FR-5 (`forgeplan health` blindspot count = 0) and FR-6 (CLAUDE.md tier-table aligned with current package count + Wave 6/7 changelog).

### G-2 — Architectural decision captured for tri-state capability flag

ADR-013 records the rationale, alternatives considered, and invariants. Future authors of new IStorageProvider impls can read ADR-013 and self-declare both flags correctly.

### G-3 — Deferred Wave 6 audit P1 backlog explicit

Two items deferred from Mega Wave 6 audit (P1-1 `CheckPermissionOptions` discriminated XOR, P1-5 type `IamEventType` derived from `INVALIDATION_EVENTS`) are documented in PRD-008 §Out of Scope so future audits don't re-discover the same items.

### G-4 — KNOWN-ISSUES §10 closure traceable

EVID-023 anchors the §10 RESOLVED transition in Wave 7.2 with reference to commit + tests + capability shape.

## Functional Requirements

- [ ] **FR-1** — PRD-008 active in Forgeplan with all MUST sections filled and reachable from `forgeplan list`. Referenced by G-1.
- [ ] **FR-2** — ADR-013 active recording tri-state capability flag decision: context (Wave 6.5 boolean introduced 1-RTT short path; boolean did not encode audit-correctness), decision (replace with `{ supported, preservesCreatorAudit }`), alternatives (discriminated union rejected as over-engineered), invariants I-1 (silent audit regression prevention), I-2 (KNOWN-ISSUES §10 closure). Referenced by G-2, FR-3.
- [ ] **FR-3** — SPEC-018 active enumerating Wave 7 work items: W-7-1-1 (FgaClientConfig readonly), W-7-1-2 (CheckPermissionOptions re-export), W-7-1-3 (legacy drafts activation), W-7-2-1 (storage-core capability shape), W-7-2-2 (BaseEntityStorageService.upsert dual-flag check), W-7-2-3 (InMemoryStorageProvider audit-aware impl), W-7-2-4 (PgStorageProvider surgical jsonb SQL), W-7-2-5 (test reshape), W-7-2-6 (KNOWN-ISSUES §10 closure). Referenced by G-1, G-2.
- [ ] **FR-4** — EVID-023 active as Wave 7 ship evidence with `## Structured Fields` (verdict + congruence_level + evidence_type) and explicit links to PRD-008 / ADR-013 / SPEC-018 / commits `53e80c0` + `f791e8a`. Referenced by G-1, G-4.
- [ ] **FR-5** — `forgeplan health` reports 0 blindspots after activation. Referenced by G-1, §Target Audience §Tertiary, §Acceptance Criteria G-1.
- [ ] **FR-6** — CLAUDE.md tier-table references already updated in same session (Direction B; commit `2daec5d`) — no further CLAUDE.md changes required as part of this PRD. Referenced by G-1, §Target Audience §Tertiary.

## Non-Functional Requirements

### NFR-1 — No code changes

This PRD is documentation-only. Code on `main` is canonical and unchanged. No package versions bumped. No tests added.

### NFR-2 — Cross-reference fidelity

Every artifact body must cite the exact commit SHA(s) and PR number(s). Every test count claim must match what `pnpm --filter <pkg> test` reports today.

### NFR-3 — R_eff ≥ 0.5

EVID-023 must use verdict=`supports`, congruence_level=`CL3` (internal test on target system — the workspace itself), evidence_type=`workspace test runs + diff verification`. R_eff = max(0, 1.0 − 0.0) = 1.0 expected.

### NFR-4 — No Forgeplan ID-allocator collisions

The Forgeplan ID allocator already exhibited duplicate-ID behaviour during this session (PRD-008 was first allocated as PRD-004 colliding with Sprint 3.11; a parallel session also allocated PRD-008 to a different unrelated draft). Re-running `forgeplan reindex` between create operations recommended; collisions caught and remediated immediately rather than left in trash.

## Out of Scope

- **Code changes to Wave 7 artefacts** — both Wave 7.1 and Wave 7.2 are already on `main`. This PRD documents what shipped, not changes what shipped.
- **Wave 8 design** — separate PRD when scope identified. Not blocked by Wave 7 closure.
- **v0.2.0 publish gate execution** — separate user `Y` decision per CLAUDE.md red lines. Wave 7 closure is one prerequisite, not the trigger.
- **Wave 6 audit P1 deferred items** (P1-1 `CheckPermissionOptions` XOR, P1-5 `IamEventType`) — documented as known-deferred in §Goals G-3; resolution is a future sprint.
- **Re-running pre-Build / post-Build audit on Wave 7** — code already passed PR review and CI green on merge. Backfill does not warrant re-audit.

## Acceptance Criteria

- [ ] G-1 (artifact-vs-`main` parity) — `forgeplan health` reports 0 blindspots (FR-5); `forgeplan list` includes PRD-008 + ADR-013 + SPEC-018 + EVID-023 all in `active` status; CLAUDE.md tier-table consistent with current state (FR-6).
- [ ] G-2 (ADR-013 captures tri-state decision) — ADR-013 body includes Context, Decision, Alternatives, Consequences, Invariants sections; covers boolean→tri-state rationale + dual-flag invariant + audit-correctness reasoning.
- [ ] G-3 (deferred backlog explicit) — PRD-008 §Out of Scope lists both deferred items by name.
- [ ] G-4 (§10 closure traceable) — EVID-023 explicitly references KNOWN-ISSUES §10 RESOLVED transition.
- [ ] All FRs delivered with sub-acceptance verified.
- [ ] All NFRs verified by reading produced artifacts.

## Risks

| ID | Risk | Mitigation |
|---|---|---|
| R-1 | Forgeplan ID allocator returns colliding ID again during this sprint | Run `forgeplan reindex` between each new artifact; verify ID via `forgeplan list` immediately |
| R-2 | Forgeplan validate rejects body for missing MUST section | Reuse PRD-004 (Sprint 3.11) as structural template — known-passing schema |
| R-3 | EVID-023 R_eff scoring < 0.5 if `## Structured Fields` malformed | Copy structural section verbatim from EVID-022 (Wave 6.5) — known-good template |
| R-4 | Future audit re-discovers Wave 6 deferred P1 items as "new" findings | List both items by name in §Out of Scope so they appear in `forgeplan search` |
| R-5 | Wave 7.1 evidence merged with 7.2 evidence in single EVID may obscure 7.1 details | EVID-023 keeps separate "Wave 7.1" / "Wave 7.2" subsections with per-Wave scope verification + test counts |

## Cross-references

- ADR-013 (tri-state storage capability flag) — based_on (this PRD)
- SPEC-018 (Wave 7 work items) — based_on (this PRD)
- EVID-023 (Wave 7 ship evidence) — informs (this PRD)
- ADR-005 (storage-core architecture) — informs (Wave 7.2 extends `IStorageProvider` capability surface from ADR-005)
- EVID-022 (Wave 6.5 upsertDoc primitive) — informs (Wave 7.2 reshapes the capability flag introduced in 6.5)
- ADR-006 (errors Shared Kernel) — informs (`auth-openfga` re-export in Wave 7.1 follows shared-kernel convention)
- KNOWN-ISSUES.md §10 — informs (Wave 7.2 closes this section)

## Stakeholders

- **Primary**: release-readiness reviewers preparing v0.2.0 publish (see Target Audience §Primary).
- **Secondary**: future IStorageProvider authors needing capability semantic clarity.
- **Tertiary**: Forgeplan health auditors needing accurate drift signals.

## Implementation Plan

1. **PRD-008** active (this artifact) — `forgeplan_validate` + `forgeplan_activate`.
2. **ADR-013** SHAPE — tri-state capability flag rationale + invariants.
3. **SPEC-018** SHAPE — Wave 7 work items consolidated (Wave 7.1 + 7.2 in one spec — small enough to fit; cross-references to PR #6 / PR #7 + commits).
4. **EVID-023** SHAPE — ship evidence with `## Structured Fields` block; link `informs` PRD-008, `supports` ADR-013, `supports` SPEC-018.
5. **Validate each artifact** — `forgeplan_validate <ID>` returns 0 MUST errors.
6. **Score** — `forgeplan_score PRD-008` returns R_eff ≥ 0.5 (EVID-023 as evidence link).
7. **Activate all** — draft → active.
8. **Final** `forgeplan_health` — 0 blindspots confirms closure.

## Related Artifacts

| Artifact | Type | Relation |
|----------|------|----------|
| ADR-013 (tri-state capability flag) | ADR | based_on |
| SPEC-018 (Wave 7 work items) | SPEC | based_on |
| EVID-023 (Wave 7 ship evidence) | Evidence | informs |
| ADR-005 (storage-core) | ADR | informs |
| EVID-022 (Wave 6.5 upsertDoc) | Evidence | informs |
| KNOWN-ISSUES §10 | doc | informs |

## AI Guidance for downstream artifacts

> Backfill ground rules:
- **Do not modify code** — every claim must be verifiable by reading current `main` HEAD or `git show <SHA>`.
- **Cite exact SHAs** — `53e80c0` (Wave 7.1), `f791e8a` (Wave 7.2). PR numbers: #6 (7.1), #7 (7.2).
- **Copy test counts verbatim** from PR descriptions — auth-openfga 86/86 (Wave 7.1), entity-storage 102/102 + pg-client 35/35 + m9s 16/16 (Wave 7.2).
- **EVID `## Structured Fields`** must have `verdict`, `congruence_level`, `evidence_type` literally as bullet list `- **field:** value` — schema parser is keyword-strict and prefers EVID-022 format.
- **No speculative scope** — if a claim is not anchored in a commit or test result, drop it.



