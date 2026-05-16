---
depth: standard
id: RFC-024
kind: rfc
last_modified_at: 2026-05-16T21:32:00.456301+00:00
last_modified_by: claude-code/2.1.142
links:
- target: PRD-035
  relation: informs
status: active
title: Wave 12.D audit strategy — 4-reviewer parallel with aggressive core sampling
---

# RFC-024 — Wave 12.D audit strategy

## Summary

4 parallel reviewers cover 12 packages (10 Tier-3-5 + 2 missed Tier-1) per domain. `@gertsai/core` (30789 LOC, 65% of total) requires aggressive sampling (15-25%); `api-rlr` (5798) and `auth-openfga` (4782) sampled 30-50%; remaining 9 small packages full-read. Output format identical to EVID-044/EVID-048. Cross-validation by team lead. Single `EVID-051` with structured fields. Wallclock target ≤2 hours.

## Context

PRD-035 needs operational pinning for Wave 12.D. Same shape as RFC-019 (Tier-1) + RFC-023 (Tier-2). Two new wrinkles:
1. **core sampling** — 30k LOC dwarfs even flux's 8.5k. Need explicit sampling-strategy guidance per reviewer.
2. **Missed Tier-1 packages** — async-utils + logger-factory inadvertently omitted from Wave 12.B PRD-028's 15-package list. Fold into 12.D rather than create a separate retrofit wave.

## Motivation

Tier-3-5 covers the heaviest packages in the monorepo:
- `core` (30k LOC) — platform contracts (Workflow types per Sprint 3.1) — biggest blast radius if there's a CRITICAL
- `api-rlr` (5.8k) — rate-limiter / retry-loop runtime
- `auth-openfga` (4.8k) — OpenFGA ReBAC adapter
- `hsm` (2.2k) — hierarchical state machines
- `entity-storage` (1.8k) — session-aware audit-stamped CRUD

Bugs here propagate to `api-core` and example apps via dependency chain. Without audit, Wave 12 closure is incomplete.

## Proposed Direction

### D-1 — Reviewer agent selection

Identical to RFC-019 + RFC-023:
- `agents-pro:code-analyzer` ×3 → logic, architecture, type
- `agents-pro:security-expert` ×1 → security

### D-2 — core sampling strategy (target 15-25%)

`packages/core/src` is 30789 LOC. Each reviewer reads:
1. `src/index.ts` (entry barrel) — fully
2. `package.json` + `dist/index.d.ts` head — verify tier-discipline + Wave-13 regression
3. Domain-specific sample of 5-8 representative files:
   - **logic**: state-management cores (Workflow.ts, Component, etc.); event/lifecycle files
   - **arch**: SOLID compliance in main classes; circular-dep verification
   - **type**: generic-heavy files (especially Workflow types per Sprint 3.1)
   - **security**: input-validation paths, serialization, deserialization

If sampled subset finds ≥5 HIGH issues, recommend Wave 12.D2 core-focused sub-audit. Otherwise document blind spots.

### D-3 — api-rlr + auth-openfga sampling (30-50% target)

These are mid-size (5-6k each). Reviewers sample core public API + critical paths:
- **api-rlr**: rate-limit / retry-loop algorithms; integer math regression check (post-12.C-fix-2+3 pattern)
- **auth-openfga**: API token handling per Wave 6.2 (EVID-020) + scoped-singleton pattern per Wave 6.3 (EVID-021/ADR-012)

### D-4 — Per-domain checklist (inherits RFC-019 D-3 + RFC-023 extensions)

Additions for Wave 12.D:
- **architecture**: Tier-3+ may depend on Tier-1-2 — verify dep graph; check `entity-storage` depends on `entity` (Tier-2) + `storage-core` (Tier-2) + `session` (Tier-1) per CLAUDE.md
- **type**: regression check `@gertsai/core` for Wave-13-pattern leaks (especially Workflow types from Sprint 3.1 + Sprint 3.0.1 F-1 hook contract)
- **logic**: cross-package interaction between `runtime-context` + `session-guard` + `entity-storage` (3 separate Tier-3 packages with overlapping invariants per ADR-007)
- **security**: `auth-openfga` token validation (EVID-020), `api-rlr` rate-limit-bypass surface, `runtime-context` provider-context type-safety per ADR-010

### D-5 — Output schema per reviewer

Identical to RFC-019 D-4 / RFC-023 D-4. Preserve EVID-044/048 parser shape for Wave 12.G aggregate.

### D-6 — Aggregation by team-lead

Cross-domain collapse, severity max-merge. Findings density matrix 12×4.

### D-7 — EVID-051 artifact

`## Structured Fields` per ADR-006. CL3 internal audit.

## Implementation Phases

| Phase | Duration | Owner |
|---|---|---|
| Phase 1 — Pre-seed (recon + tier-discipline check) | 5 min | Team lead |
| Phase 2 — Parallel spawn (4 reviewers) | 15–30 min wallclock | reviewers |
| Phase 3 — Aggregation + cross-validation | 15-30 min | team lead |
| Phase 4 — Evidence draft + activate | 10 min | team lead |
| Phase 5 — Branch + commit + PR | 10 min | team lead |

Wallclock target ≤1.5 hour.

## Invariants

- **I-1** — Read-only.
- **I-2** — CRITICAL/HIGH cite `file:line`.
- **I-3** — EVID-051 body contains `## Structured Fields`.
- **I-4** — Per-package summary cards format identical to EVID-044/048.
- **I-5** — No fix code in this wave.
- **I-6** — core sampling strategy explicit in each reviewer's output.
- **I-7** — Wave-13-pattern regression check across all 12 packages.

## Rollback Plan

Same pattern as RFC-019/023: if audit produces low-quality output, mark PRD-035 superseded, discard EVID-051, retry with refined reviewer strategy.

## Alternatives Considered

### Alt-1 — Skip core entirely

**Rejected:** core is the platform-contracts package; skipping defeats Wave 12 coverage goal.

### Alt-2 — core-only sub-audit (Wave 12.D1) + rest separately (Wave 12.D2)

**Rejected at this stage:** parallel-4-reviewer pattern handles core via sampling; if sampling reveals heavy issues, can defer to D2 then.

### Alt-3 — Skip async-utils + logger-factory (cover separately as Wave 12.B retrofit)

**Rejected:** they're small (280 + 263 LOC), folding into 12.D is cheaper than separate retrofit wave.

## Risks

- **R-1 — core sampling under-covers critical paths.** Mitigated: explicit reviewer sampling strategy per domain; if sampled subset shows ≥5 HIGH, escalate to Wave 12.D2.
- **R-2 — auth-openfga security findings may need OpenFGA-specific expertise.** Mitigated: `security-expert` agent has security domain bias; focus on token handling + scoped-singleton invariants per ADR-012.
- **R-3 — Tier-3-5 packages have overlapping invariants (runtime-context, session-guard, entity-storage all per ADR-007).** Reviewers should flag cross-package consistency issues, not just per-package.

## Refs

- PRD-035 (this wave's PRD)
- EVID-043/044/048 (precedents)
- RFC-018 (parent strategy)
- RFC-019/023 (sibling patterns)
- ADR-007 (runtime-context architecture)
- ADR-012 (auth-openfga multi-instance scoping per Wave 6.3)



