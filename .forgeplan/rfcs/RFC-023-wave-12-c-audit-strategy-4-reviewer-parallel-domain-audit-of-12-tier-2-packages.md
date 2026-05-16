---
depth: standard
id: RFC-023
kind: rfc
last_modified_at: 2026-05-16T19:21:04.121518+00:00
last_modified_by: claude-code/2.1.142
links:
- target: PRD-032
  relation: informs
status: active
title: Wave 12.C audit strategy — 4-reviewer parallel domain audit of 12 Tier-2 packages
---

# RFC-023 — Wave 12.C audit strategy

## Summary

4 parallel reviewers (logic, architecture, type, security) cover all 12 Tier-2 packages in their respective domain. flux (8456 LOC, 60% of total Tier-2 LOC) requires explicit sampling strategy per reviewer prompt. Output schema identical to EVID-044. Cross-validation by team-lead (main thread). Single EVID-048 with `## Structured Fields`. Total wallclock target ≤4 hours.

## Context

PRD-032 needs operational pinning for Wave 12.C. Same shape as RFC-019 (Tier-1 audit) but adapted for: (a) smaller package count (12 vs 15) with deeper average complexity, (b) flux skew requiring sampling, (c) cross-framework parity check (entity-{vue,react,solid,svelte}), (d) tier-discipline check (Tier-2 may depend on Tier-1 but not Tier-3+).

## Motivation

Wave 12.A surfaced 22+ CRITICAL in api-core. Wave 12.B surfaced 16 actionable HIGH+CRITICAL in Tier-1 — Wave-13-pattern external-type-leak being the most actionable cross-package issue. Tier-2 packages have more business logic and internal dependencies — likely a richer findings catalog. Without 12.C, downstream services ship on top of unaudited cross-cutting layer (queue, di, entity, storage adapters).

## Proposed Direction

### D-1 — Reviewer agent selection

Same as RFC-019:
- `agents-pro:code-analyzer` ×3 → logic, architecture, type
- `agents-pro:security-expert` ×1 → security

### D-2 — Sampling strategy for flux

flux is 8456 LOC (60% of Tier-2 total). Full-read across 4 reviewers is ~34k LOC total reads — token-prohibitive.

**Decision:** each reviewer reads `packages/flux/src/index.ts` + `package.json` fully, plus a domain-specific sample:
- **logic**: 4-5 core files most likely to have state-management hazards (Store, Observable, etc.)
- **arch**: `index.ts` + 2-3 representative modules
- **type**: `index.ts` + types-heavy files
- **security**: input-handling + serialisation files only

If a reviewer finds the sampled subset doesn't show clear issues, they SHOULD explicitly note "no CRITICAL/HIGH found in sampled X% of flux LOC; deeper Wave 12.C2 audit recommended for fuller coverage." This is a documented acknowledged blind spot, not a coverage gap.

### D-3 — Per-domain checklist

Inherits RFC-019 D-3 verbatim. Additional Tier-2-specific items:
- **architecture**: tier-discipline check (Tier-2 must NOT import Tier-3+ except documented exceptions); peer-dep optional-marking correctness (peer-optional Vue/React/Solid/Svelte for entity adapters)
- **type**: regression check for Wave 12.B-fix-1 external-type-leak pattern in published dist; ADR-008 reactive adapter contract conformance
- **logic**: cross-framework parity for entity-{vue,react,solid,svelte} — same observable / detach lifecycle semantics
- **security**: rest-request-manager rate limiter LRU max-hosts cap (CWE-770 protection); queue BullMQ message-handler boundary

### D-4 — Output schema per reviewer

Identical to RFC-019 D-4 (preserves EVID-044 parser shape for eventual Wave 12.G aggregate).

### D-5 — Aggregation by team-lead

Identical to RFC-019 D-5. Cross-domain reconciliation collapses same-`file:line` findings; divergent severity → orchestrator picks max with reasoning block.

### D-6 — EVID artifact

`EVID-048` (next sequence after EVID-047 from Wave 12.B-fix-3).

### D-7 — Read-only

No reviewer writes code or `.forgeplan` files. Tech lead writes EVID via MCP `forgeplan_update`. No code branches created; fixes ship via Wave 12.C-fix sub-waves.

## Implementation Phases

| Phase | Duration | Owner |
|---|---|---|
| Phase 1 — Pre-seed | 5 min | Tech lead |
| Phase 2 — Parallel spawn | 10–25 min wallclock | 4 reviewers |
| Phase 3 — Aggregation | 15-30 min | Tech lead |
| Phase 4 — Evidence draft + activate | 10 min | Tech lead |
| Phase 5 — Branch + commit + PR | 10 min | Tech lead |

Wallclock target ≤1.5 hour.

## Invariants

- **I-1** — Read-only. Reviewers don't mutate files.
- **I-2** — Every CRITICAL/HIGH has concrete `file:line`.
- **I-3** — EVID body contains `## Structured Fields` per ADR-006.
- **I-4** — Per-package summary cards format identical to EVID-044.
- **I-5** — No fix code in this wave; CRITICAL → Wave 12.C-fix-1 (separate fix wave).
- **I-6** — flux sampling strategy explicit in each reviewer's output.

## Rollback Plan

Same as RFC-019: if audit produces low-quality output, mark PRD-032 superseded, discard EVID-048, create follow-up PRD with refined reviewer strategy. Low-risk wave — no code touched.

## Alternatives Considered

### Alt-1 — Skip flux entirely (audit 11 packages)

**Rejected:** flux is the largest single package in the monorepo and a state-management foundation used by entity adapters. Even sampled findings beat zero coverage.

### Alt-2 — Split into 2 sub-waves (entity-frameworks vs distributed-services)

**Rejected:** loses cross-package observation benefit; 2 spawns vs 1. Single-wave parallel-domain pattern is proven (12.B).

### Alt-3 — Use 5 reviewers including tests-reviewer

**Rejected:** Tier-2 test coverage is more visible per-package than at Tier-1. Tests-domain audit deferred to Wave 12.D where it matters most.

## Risks

- **R-1 — flux skew dominates findings density.** Mitigated by sampling strategy (D-2) + explicit blind-spot documentation.
- **R-2 — Cross-framework parity check across 4 entity-{X} adapters may stretch reviewers.** Mitigated: adapters are small (65-254 LOC each), comparable as a group.
- **R-3 — Tier-discipline check for entity-{X} requires reading multiple package.json files.** Mitigated: reviewer prompts include CLAUDE.md tier-table claims for direct verification.

## Open Questions

- **Q-1 — Should flux audit produce a follow-up Wave 12.C2 plan if sampling shows non-trivial findings?** Yes — if any reviewer flags 2+ HIGH in sampled flux subset, recommend Wave 12.C2 as a flux-focused deep-audit. Tracked in EVID-048 §"Suggested follow-up".

Refs: PRD-032 (this wave's PRD), EVID-044 (reference output), RFC-018 (parent), RFC-019 (sibling pattern).



