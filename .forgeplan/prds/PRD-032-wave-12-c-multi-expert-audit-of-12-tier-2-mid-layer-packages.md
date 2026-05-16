---
depth: standard
id: PRD-032
kind: prd
last_modified_at: 2026-05-16T19:20:30.011652+00:00
last_modified_by: claude-code/2.1.142
links:
- target: RFC-018
  relation: based_on
status: active
title: Wave 12.C — multi-expert audit of 12 Tier-2 mid-layer packages
---

# PRD-032 — Wave 12.C — multi-expert audit of 12 Tier-2 mid-layer packages

## Target Audience

- **Primary:** maintainers of `@gertsai/*` Tier-2 packages — need structured record of independently reviewed packages and remaining findings.
- **Secondary:** downstream consumers (`gertsai_codex`, `GertsHub`) who depend on Tier-2 via api-core's queue/di/entity wiring + the example app frontend stack.
- **Tertiary:** Wave 14 refactor team — findings feed cross-cutting scope.

## Problem Statement

After Wave 12.A closed `@gertsai/api-core` and Wave 12.B audited 15 Tier-1 packages (EVID-044), 12 Tier-2 packages remain unaudited. Tier-2 sits between flat utility libs (Tier-1) and application-tier packages — they have internal `@gertsai/*` dependencies and frame the framework adapters (entity-{vue,react,solid,svelte}), distributed coordination (queue, di, flux), and storage abstractions (storage-core, query-dsl, audit-primitives, rest-request-manager).

**Inventory (LOC):** flux 8456, di 1270, query-dsl 969, storage-core 821, rest-request-manager 721, entity 581, entity-svelte 254, entity-react 226, entity-solid 211, queue 191, audit-primitives 100, entity-vue 65. **Total ~14k LOC; flux dominates 60%.**

These packages are currently published to GitHub Packages. Without an audit, downstream services ship on top of unaudited Tier-2 substrate. Wave 12.B audit found 16 actionable HIGH+CRITICAL items in 15 Tier-1 packages — extrapolating ROI, Tier-2 audit may surface 10-20 more.

## Goals

1. **Coverage:** all 12 Tier-2 packages reviewed across 4 expert domains (logic, architecture, type, security) in a single session.
2. **Findings density:** identify HIGH/CRITICAL per package; for flux (8456 LOC, the largest of any package in the monorepo) explicitly note sampling strategy and acknowledged blind spots.
3. **Cross-package consistency:** verify Tier-2 → Tier-1 dependency discipline + cross-framework adapter parity (entity-{vue,react,solid,svelte}) + matches CLAUDE.md tier-table claims.

## Non-Goals

- **NG-001 — No code fixes.** Findings recorded; remediation in separate Wave 12.C-fix sub-waves per the precedent set by Wave 12.B-fix-1/2/3.
- **NG-002 — No public-API redesign.** Audit identifies issues in current contract.
- **NG-003 — Out of scope: Tier-3-5 (Wave 12.D), examples (Wave 12.E), cross-consistency (Wave 12.F), aggregate (Wave 12.G).
- **NG-004 — No publish during this wave.** Audit is markdown + evidence only.
- **NG-005 — No SLA promise.** Severity priority queueing not part of this PRD.
- **NG-006 — flux deep-audit deferred if scope explodes.** If reviewers find flux dwarfs all other findings (which is plausible given 60% LOC share), this PRD allows splitting flux into a separate sub-audit (Wave 12.C2). Same approach as `@gertsai/collection` which dominated Wave 12.B findings.

## Functional Requirements

- [ ] **FR-001 — Reviewer roster:** 4 parallel reviewers (`code-analyzer` ×3 + `security-expert` ×1), each covering all 12 packages in its domain.
- [ ] **FR-002 — Package set:** `di`, `flux`, `queue`, `entity`, `storage-core`, `query-dsl`, `audit-primitives`, `entity-vue`, `entity-react`, `entity-solid`, `entity-svelte`, `rest-request-manager`. 12 packages per Tier-2 list in CLAUDE.md.
- [ ] **FR-003 — Per-package output:** each reviewer returns structured report — severity-ranked findings with `file:line` references, suggested remediation per finding. Identical schema to RFC-019/EVID-044.
- [ ] **FR-004 — Cross-validation:** team-lead cross-validates outputs — same-finding-different-domain collapsed; divergent severity reconciled with explicit reasoning. Findings density matrix 12×4.
- [ ] **FR-005 — Evidence artifact:** single `EVID-NNN` aggregating findings with `## Structured Fields` (verdict, congruence_level, evidence_type) per ADR-006. CL3 internal audit.
- [ ] **FR-006 — flux strategy:** flux is 6× larger than next-biggest Tier-2 package. Reviewers MUST acknowledge sampling strategy explicitly — which files read fully, which sampled, which deferred to a follow-up Wave 12.C2.
- [ ] **FR-007 — Acceptance:** activate when EVID-NNN linked via `informs`, R_eff ≥ 0.5, per-package summary cards present (12 cards), ≥ 4 reviewer outputs synthesised.

## Non-Functional Requirements

- **NFR-001 — Read-only audit.** No code or .forgeplan mutations from reviewers.
- **NFR-002 — Token budget.** 4 × ~5000 LOC inspection scope. flux requires sampling.
- **NFR-003 — Time bound.** Single session, ≤4 hours wallclock.
- **NFR-004 — Findings traceability.** Every CRITICAL/HIGH has concrete `file:line`. Vague references rejected.
- **NFR-005 — Safety.** No destructive changes; MCP for .forgeplan only.
- **NFR-006 — Reuse Wave 12.B pattern.** Output format identical to EVID-044 — parser-friendly for eventual aggregate Wave 12.G report.

## Related Artifacts

- **EVID-044** — Wave 12.B Tier-1 audit (precedent, same shape)
- **PRD-028** — Wave 12.B audit plan (sibling, scaled to 12 Tier-2 packages)
- **RFC-018** — Wave 12 super-strategy
- **PRD-029/030/031 + EVID-045/046/047** — Wave 12.B-fix-1/2/3 (precedents for follow-up fix waves)
- **CLAUDE.md** — 12 Tier-2 packages per tier table
- **ADR-005** — storage-core architecture
- **ADR-007** — runtime-context (interacts with di, session-guard at Tier-2 boundary)
- **ADR-008** — entity-{framework} reactive adapter ISP split per ADR-008 Decision B

Refs: PRD-028 (precedent), EVID-044 (reference output), RFC-018 (parent strategy), RFC-023 (execution).





