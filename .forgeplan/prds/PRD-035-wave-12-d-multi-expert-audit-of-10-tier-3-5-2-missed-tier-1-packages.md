---
depth: standard
id: PRD-035
kind: prd
last_modified_at: 2026-05-16T21:31:24.459372+00:00
last_modified_by: claude-code/2.1.142
status: active
title: Wave 12.D — multi-expert audit of 10 Tier-3-5 + 2 missed Tier-1 packages
---

# PRD-035 — Wave 12.D — multi-expert audit of 12 packages (10 Tier-3-5 + 2 missed Tier-1)

## Target Audience

- **Primary:** maintainers of `@gertsai/*` higher-tier packages. After Wave 12.A (api-core) + 12.B (15 Tier-1) + 12.C (12 Tier-2), this is the last large audit wave before Wave 12.E (example apps) and Wave 12.F (cross-package consistency).
- **Secondary:** downstream consumers of Tier-3-5 substrate — these packages are the heaviest in the monorepo (`core` alone 30k LOC, `api-rlr` 5.8k, `auth-openfga` 4.8k); bugs here propagate to api-core + example apps.

## Problem Statement

10 Tier-3-5 packages remain unaudited after Waves 12.A/B/C. Plus 2 Tier-1 packages (`@gertsai/async-utils`, `@gertsai/logger-factory`) were inadvertently missed from Wave 12.B's 15-package scope (CLAUDE.md tier-table marks them Tier-1 but PRD-028 omitted them). Total 12 packages.

**Inventory (LOC, sources only):**

| Package | Tier | LOC | Strategy |
|---|---|---|---|
| `@gertsai/core` | 3 | **30789** | SAMPLE 15-25% (biggest single package in monorepo) |
| `@gertsai/api-rlr` | 5 | 5798 | Sample 30-50% if possible |
| `@gertsai/auth-openfga` | 4 | 4782 | Sample 30-50% if possible |
| `@gertsai/hsm` | 3 | 2185 | Full |
| `@gertsai/entity-storage` | 3 | 1848 | Full |
| `@gertsai/runtime-context` | 3 | 854 | Full |
| `@gertsai/session-guard` | 3 | 393 | Full |
| `@gertsai/async-utils` | 1 | 280 | Full (missed in 12.B) |
| `@gertsai/logger-factory` | 1 | 263 | Full (missed in 12.B) |
| `@gertsai/rpc-proxy-builder` | 3 | 104 | Full |

Total ~47,300 LOC; core dominates 65%.

Without this audit, the biggest package in the monorepo (`@gertsai/core`) ships with zero independent review since extraction. Wave 12.A-C precedents found CRITICAL items even in well-tested packages — extrapolating, Tier-3-5 audit will likely surface ≥1 CRITICAL.

## Goals

1. **Coverage:** all 12 packages reviewed across 4 domains.
2. **Findings density:** target ≥1 actionable HIGH per package OR explicit "no findings" verdict with reasoning.
3. **Cross-package consistency:** verify tier-discipline (Tier-3 may depend on Tier-1+Tier-2 only), peer-dep correctness, regression check on Wave-13 + 12.B/12.C-fix-1 external-type-leak elimination.
4. **Pending HIGH from EVID-044 closure:** `@gertsai/utils` consola type-leak (deferred from Wave 12.B-fix-3) — fold into Wave 12.D-fix when reviewers re-confirm during cross-checks.

## Non-Goals

- **NG-001 — No fixes in this wave.** Findings recorded; remediation in Wave 12.D-fix sub-waves.
- **NG-002 — Out of scope:** Wave 12.E (examples), 12.F (cross-consistency), 12.G (aggregate).
- **NG-003 — core deep audit deferred if sampling finds heavy density.** core is 30k LOC; if reviewers find 5+ HIGH in sampled subset, recommend Wave 12.D2 core-focused sub-audit.
- **NG-004 — No publish during audit.**
- **NG-005 — No `api-core` re-audit.** That was Wave 12.A (EVID-043).

## Functional Requirements

- [ ] **FR-001 — Reviewer roster:** 4 parallel (`code-analyzer` ×3 + `security-expert` ×1), each covers all 12 packages in domain.
- [ ] **FR-002 — Package set:** 10 Tier-3-5 + 2 missed Tier-1 (async-utils, logger-factory) per inventory above.
- [ ] **FR-003 — Per-package output:** identical to EVID-044/EVID-048 schema.
- [ ] **FR-004 — Cross-validation:** 12×4 finding-density matrix.
- [ ] **FR-005 — Single `EVID-051`** with `## Structured Fields` (verdict/CL/evidence_type) per ADR-006.
- [ ] **FR-006 — core sampling:** each reviewer documents which files read fully vs sampled vs deferred (15-25% target). If sampled subset shows ≥5 HIGH, recommend Wave 12.D2 sub-audit.
- [ ] **FR-007 — Regression checks:**
  - Wave-13 external-type-leak pattern not recurring (check `dist/index.d.ts` head per package)
  - `engines.node` declared where Node-only types surface (post-12.C-fix-1 entity precedent)
- [ ] **FR-008 — Acceptance:** activate when EVID-051 linked via `informs`, R_eff ≥ 0.5, 12 cards present, 4 reviewer outputs synthesised.

## Non-Functional Requirements

- **NFR-001 — Read-only.**
- **NFR-002 — Token budget:** 4 reviewers × ~5000 LOC effective (with core sampled).
- **NFR-003 — Time bound:** single session, ≤4 hours wallclock.
- **NFR-004 — Findings traceability:** every CRITICAL/HIGH has concrete `file:line`.
- **NFR-005 — Safety:** MCP only.
- **NFR-006 — Reuse Wave 12.A-C output format** — parser-friendly for Wave 12.G aggregate.

## Related Artifacts

- **EVID-043** — Wave 12.A api-core (precedent)
- **EVID-044** — Wave 12.B Tier-1 (precedent; also includes deferred utils-consola HIGH)
- **EVID-048** — Wave 12.C Tier-2 (most-recent precedent)
- **RFC-018** — Wave 12 super-strategy
- **PRD-028 + RFC-019** — Wave 12.B audit pattern (mirrored here for tier discipline)
- **PRD-032 + RFC-023** — Wave 12.C audit pattern (most-recent precedent)
- **CLAUDE.md** — 38-package tier table (Tier-3-5 + Tier-1 missed verification source)

Refs: EVID-048 (most-recent precedent), RFC-024 (execution).




