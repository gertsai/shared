---
depth: standard
id: RFC-019
kind: rfc
last_modified_at: 2026-05-16T04:42:19.990687+00:00
last_modified_by: claude-code/2.1.142
links:
- target: PRD-028
  relation: informs
status: active
title: Wave 12.B audit strategy — 4-reviewer parallel domain audit of 15 Tier-1 packages
---

# RFC-019 — Wave 12.B audit strategy

## Context

Per PRD-028, Wave 12.B audits 15 Tier-1 foundation packages with 4 parallel domain reviewers. RFC-018 already established the high-level Wave 12 audit strategy (5 sub-waves, per-package cards, R_eff math). This RFC pins the **execution-level** decisions specific to 12.B:

- WHICH reviewer agent for each domain?
- HOW are packages grouped per reviewer prompt (15 in one prompt vs N × M batching)?
- WHAT exact checklist per domain?
- HOW are findings aggregated to single EVID?
- HOW are conflicts cross-validated?

This RFC is the operational manual. It does NOT re-derive depth/scope (PRD-028 does), and does NOT prescribe fixes (Wave 12.B-fix PRD-029 will).

## Motivation

Wave 12.A surfaced 22+ CRITICAL findings in a single library (`@gertsai/api-core`) — none would have been caught by `pnpm test` + manual review. The multi-domain reviewer pattern is **the only proven mechanism** in this repo for finding latent CRITICAL issues at scale. Without 12.B, we publish 15 Tier-1 libs to GH Packages with zero independent verification, and downstream consumers (`gertsai_codex`, `GertsHub`, internal services) ship on top of unaudited substrate. The cost of an undetected `@gertsai/session` auth-bypass or `@gertsai/errors` taxonomy gap propagates to **every** consumer simultaneously.

A second motivation: the audit pattern from 12.A produced EVID-043 with structured-fields R_eff = 1.0. Re-applying the **same** pattern keeps Wave 12.B's evidence format compatible for the eventual Wave 12.G aggregate report (PRD-030 future) — that aggregate report rolls up all 6 sub-wave evidences into a 38-package risk matrix. If 12.B invents a new format, aggregate is harder.

Third motivation: parallelism. 4 reviewers running concurrently fit the available wallclock budget (~4h cap per NFR-003 of PRD-028); doing this sequentially would extend the audit over multiple sessions and let context drift across them.

## Proposed Direction

### D-1 — Reviewer agent selection

Use the `agents-pro:code-analyzer` agent for all 4 domain reviewers. Rationale:
- Single agent with explicit `severity:` and `domain:` ordering produces consistent format across all 4 outputs (vs. 4 different agents each with own structure).
- Each spawn injects a different `domain focus:` directive in the prompt — logic / arch / type / security — turning one agent into 4 specialised reviewers.
- Wave 12.A used `agents-core:code-reviewer` with similar tactic; switching to `code-analyzer` gives explicit 5-domain (quality/performance/security/architecture/tech-debt) framework that maps onto our 4 (we collapse quality+tech-debt into "logic").

**Alternative considered:** spawn 4 different domain-specialist agents (`agents-pro:security-expert`, `agents-pro:architect-reviewer`, `agents-domain:typescript-type-auditor`, `agents-core:code-reviewer`). Rejected: output schemas vary per agent, harder to aggregate. Keep variant agnostic — same agent + 4 different prompts.

### D-2 — Single-prompt-15-packages per reviewer

Each reviewer gets ONE prompt covering ALL 15 Tier-1 packages in its domain. Total: 4 spawns. Rationale:
- Tier-1 packages are small (utils-style, 100-500 LOC each) — total inspection scope per reviewer ~5000 LOC, fits comfortably in agent context.
- Cross-package findings (e.g., "fsm and hsm both have race in transition()") emerge naturally when reviewer sees all in one prompt.
- 4 spawns × 1 prompt each = 4 spawns total = simple aggregate. Compare: 15 packages × 4 domains = 60 spawns, prohibitive.

**Alternative considered:** 4 reviewers × 5 batches of 3 packages = 20 spawns. Rejected: same cross-package visibility loss, 5× spawn overhead.

### D-3 — Per-domain checklist (input to each spawn)

| Domain | Checklist |
|---|---|
| **logic** | Race conditions (CWE-362), null-deref, off-by-one, exception swallowing, async/await mistakes, infinite-loop hazards, type-juggling bypasses, magic numbers without constants, missing cancellation, idempotency of public methods |
| **architecture** | SOLID violations (esp. SRP god-funcs / DIP bypasses), tier-discipline (Tier-1 must NOT depend on Tier-2+), peer-dep correctness, subpath exports portable, no circular deps, public API surface drift from CLAUDE.md tier table, single-responsibility per module |
| **type** | `any` usage justification, missing return types, unsafe casts, generic constraint laxness, type leak across package boundary (à la Wave 13 `@standard-schema/spec`), missing readonly, `unknown` vs `any`, type-only imports correctness |
| **security** | OWASP Top 10 mappings, secret/credential leaks, injection vectors, deserialization, missing input validation, CWE-942 (CORS), CWE-347 (auth bypass), prototype pollution, regex DoS, integer overflow |

### D-4 — Output schema per reviewer

Each reviewer MUST return markdown with the following structure:

```
# Wave 12.B — <Domain> audit

## Summary
- Packages reviewed: 15
- CRITICAL findings: N
- HIGH findings: N
- MEDIUM findings: N
- LOW findings: N

## Per-package findings

### @gertsai/<package-name>
- **[SEVERITY]** <Title> — `<file:line>` — <body>; remediation: <one sentence>
- (or "No findings in this domain")

(repeat for all 15 packages)

## Cross-package observations
- <observation about pattern divergence / consistency issues>

## Files audited
- packages/fsm/src/...
- (file list to confirm reviewer's scope coverage)
```

### D-5 — Aggregation by team-lead (orchestrator)

After 4 spawns return:
1. Aggregator builds a 15×4 finding-density matrix (rows: packages, cols: domains).
2. Cross-domain reconciliation: same `file:line` flagged by multiple reviewers → collapsed into ONE finding with combined severity = max(individual_severities) + `domains: [logic, security]` tag.
3. Divergent severity (logic-reviewer says HIGH, security-reviewer says CRITICAL on same item) → orchestrator picks max severity with explicit `## Cross-validation notes` block.
4. Output: single `EVID-NNN` markdown with `## Structured Fields` (verdict=supports, congruence_level=CL3, evidence_type=internal_audit) per ADR-006 R_eff math.

### D-6 — EVID artifact creation

```
EVID-NNN — Wave 12.B aggregated audit findings
  → linked to PRD-028 via `informs` relation
  → R_eff = min(per-package-evidence-scores) per weakest-link principle
  → CL3 (internal same-target audit), penalty 0.0
  → verdict=supports if no CRITICAL contradicts our shipped 0.3.0 contract;
    verdict=weakens if at least 1 CRITICAL surfaces in published code already
```

### D-7 — File ownership during audit

**Read-only.** No reviewer writes code or .forgeplan files. Only orchestrator (forge-cycle) writes:
- `.forgeplan/evidences/EVID-NNN-*.md` (via MCP `forgeplan_new` + `forgeplan_update`)
- `.forgeplan/state/PRD-028.yaml` (auto-updated by `forgeplan_activate`)

No code branches created from audit; CRITICAL fixes ship via Wave 12.B-fix sub-wave (PRD-029, modelled on Wave 13).

## Implementation Phases

| Phase | Duration | Owner | Output |
|---|---|---|---|
| Phase 1 — Setup | 5 min | Orchestrator | Read CLAUDE.md tier table, confirm 15-pkg list, prep 4 spawn prompts each domain-tailored |
| Phase 2 — Parallel spawn | 5–15 min wallclock | 4 × `code-analyzer` agents | 4 reviewer markdown reports per D-4 schema |
| Phase 3 — Aggregation | 15–30 min | Orchestrator | 15×4 finding matrix, cross-validation notes |
| Phase 4 — Evidence draft | 10 min | Orchestrator | `EVID-NNN` body with `## Structured Fields` per ADR-006 |
| Phase 5 — Link + score + activate | 5 min | MCP `forgeplan_link/score/activate` | EVID linked to PRD-028 via `informs`; R_eff ≥ 0.5 verified; PRD-028 → active |
| Phase 6 — Commit | 5 min | git + gh CLI | New branch `audit/wave-12-b-tier1`, conventional commit `chore(audit): Wave 12.B — Tier-1 packages`; PR to main with Refs: PRD-028 |

## Invariants

- **I-1** — No reviewer modifies code or .forgeplan markdown. Read-only audit phase. Violation: agent spawn must be aborted, finding discarded.
- **I-2** — Every CRITICAL finding has a concrete `file:line` (not vague). Without `file:line` → reviewer prompt must be rejected by orchestrator and re-spawned.
- **I-3** — EVID body MUST contain `## Structured Fields` section per ADR-006 R_eff math. Without it, `forgeplan_score` returns CL0 → R_eff schlops to 0.1 → activate fails.
- **I-4** — Per-package summary cards format identical to EVID-043 (Wave 12.A). Cross-wave aggregate (Wave 12.G) depends on parser-friendly consistency.
- **I-5** — No fix code in this wave. CRITICAL → PRD-029 (separate fix wave). Mixing audit + fix in one PR is rejected per Wave 12.A precedent.

## Rollback Plan

If audit produces low-quality output (e.g., all 4 reviewers truncate, or aggregate has <50% finding-density vs expected), rollback:

1. Mark `PRD-028` status=`superseded` via `forgeplan_update`.
2. Discard `EVID-NNN` draft (no merge, no activate).
3. Create `PRD-028a` reusing PRD-028 body verbatim, but with a different reviewer-strategy section (e.g., sequential per-package instead of parallel per-domain).
4. No git push needed for rollback — audit is .forgeplan-only until commit step.

This is a low-risk wave: even worst-case (all reviewers return useless output), there is no code regression — only wasted token budget.

## Alternatives Considered

### Alt-1 — Per-package round-robin

Spawn 1 reviewer per package, rotate domains across spawns. 15 spawns total.

**Rejected:** loses cross-package visibility (each spawn only sees one package); aggregation harder (15 reports vs 4); domain consistency suffers because different package-specific contexts dilute domain checklist focus.

### Alt-2 — Sequential audit (one reviewer at a time)

Run reviewers serially: logic → arch → type → security. 4 spawns, blocking.

**Rejected:** loses ~3× wallclock speedup of parallel spawning. No benefit since reviewers don't read each other's output (orchestrator does the cross-validation).

### Alt-3 — Use Wave 12.A reviewer set verbatim (5 reviewers)

Wave 12.A used 5 reviewers including a tests-reviewer.

**Rejected for 12.B:** test-coverage gap is a separate concern (Test C1-5 deferred from EVID-043 — handled in Wave 14 or a Test-Coverage sprint). Tier-1 packages have lighter test surfaces than api-core, and tests-domain auditing would be 80% redundant with logic-domain for Tier-1. Drop to 4 reviewers; reintroduce tests-reviewer for Wave 12.D (Tier-3-5 audit) where it matters more.

## Risks

- **R-1 — Reviewer fatigue at 15-package scope per spawn:** mitigated by package-size cap (Tier-1 avg ~250 LOC); if reviewer truncates output mid-package, orchestrator re-spawns just for missing packages.
- **R-2 — False-CRITICAL inflation:** Wave 12.A had ~22 CRITICAL on a single package; Tier-1 packages are simpler. Set explicit reviewer guidance "prefer HIGH for non-exploitable correctness issues; reserve CRITICAL for production-data-loss / auth-bypass / RCE risks". Orchestrator post-validates severity per CWE mapping during cross-validation.
- **R-3 — Aggregation context overflow:** 4 reviewer outputs × ~15 packages each = 60 finding sections. Aggregator may struggle if dense. Mitigation: aggregator runs in main thread (orchestrator) with progressive write — Per-package card written immediately on receiving each reviewer output, not at the end.

## Open Questions

- **Q-1 — Should `@gertsai/auth-openfga` (Tier-4) be included?** No — it's Tier-4 per CLAUDE.md. Audited in Wave 12.D.
- **Q-2 — Should `audit-primitives` (Tier-2) be folded in?** No — Tier-2, audited in Wave 12.C.
- **Q-3 — How to handle preserved-history packages with legacy patterns?** Reviewer flags as MEDIUM unless there's a concrete current-day risk; rationale: legacy patterns are "asymmetric debt" — predictable, documented, slated for gradual migration.

Refs: PRD-028 (this wave's PRD), EVID-043 (Wave 12.A reference output), RFC-018 (parent strategy), ADR-006 (R_eff math).


