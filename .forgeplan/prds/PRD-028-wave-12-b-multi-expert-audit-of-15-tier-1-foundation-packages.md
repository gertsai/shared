---
depth: standard
id: PRD-028
kind: prd
last_modified_at: 2026-05-16T04:39:52.706605+00:00
last_modified_by: claude-code/2.1.142
links:
- target: RFC-018
  relation: based_on
status: active
title: Wave 12.B — multi-expert audit of 15 Tier-1 foundation packages
---

# Wave 12.B — multi-expert audit of 15 Tier-1 foundation packages

## Target Audience

- **Primary:** maintainers of `@gertsai/*` published packages (this repo's core contributors) — need a structured record of which Tier-1 packages have been independently reviewed and which findings remain open.
- **Secondary:** downstream consumers of the foundation libs (Wave 11.D shipped to GH Packages: `gertsai_codex`, `GertsHub`, and internal Moleculer services) — need confidence that bumping a Tier-1 minor doesn't import latent CRITICAL bugs.
- **Tertiary:** Wave 14 refactor team — Wave 12.B findings feed cross-cutting refactor scope (e.g., if `errors` package surfaces taxonomy gaps, Wave 14 ApiController decomp may need taxonomy alignment).

## Problem Statement

After Wave 12.A closed `@gertsai/api-core` (38-package monorepo's main library) via 5-reviewer deep audit (EVID-043) → Wave 13 shipped 6 CRITICAL fixes → `@gertsai/api-core@0.3.0` published.

**The remaining 37 packages of `@gertsai/*` have NOT been audited.** Per `RFC-018` (Wave 12 audit plan), the next wave 12.B targets **15 Tier-1 foundation packages** — flat utility libs with zero internal deps (or only depending on each other). They are the **substrate** every other package builds on. Bugs in Tier-1 propagate to all 22 higher-tier packages + 3 example apps.

These packages were extracted from `gertsai_codex` (Phase 1 Sprint 3.x) and Sprint 3.6 (errors + tenant-resolver fresh). None received a multi-expert audit since extraction. Some preserve git history (P strategy), some are fresh (F), some are shims (S) — all currently published to GitHub Packages and consumed by `@gertsai/api-core`, by themselves transitively, and by `examples/m9s-example`.

Without audit, we ship to internal-testing consumers without verified evidence of: **logic correctness, architectural boundary cleanliness, type-safety hygiene, security hardening**. The Wave 12.A api-core audit found 22+ CRITICAL items in a single package — extrapolating naïvely to 15 unaudited foundation packages implies a non-trivial backlog of latent issues.

## Goals

1. **Coverage:** all 15 Tier-1 packages reviewed across 4 expert domains (logic, architecture, type-system, security) within a single forge-cycle session.
2. **Findings density:** identify CRITICAL/HIGH issues per package; for `@gertsai/api-core` Wave 12.A produced ~22 CRITICAL — target ≥1 CRITICAL-actionable finding per Tier-1 package OR explicit "no critical issues" verdict with reviewer justification.
3. **Cross-package consistency:** detect divergence in error taxonomy use, naming, subpath patterns, peer-deps, defineAction parity — feed into Wave 12.F cross-consistency audit.

## Non-Goals

- **NG-001 — No code fixes in this wave.** Findings get recorded; remediation is a SEPARATE follow-up wave (modelled on Wave 13 / PRD-027 = "fix critical from EVID-043"). This keeps audit independent from author-of-fix bias.
- **NG-002 — No public-API redesign.** Audit identifies issues IN THE CURRENT contract. API redesign (e.g., split `@gertsai/session` into `session-core` + `session-guard`) is a Wave 14+ concern.
- **NG-003 — Not in scope: Tier-2, Tier-3-5 packages.** 12 Tier-2 packages (di, flux, queue, entity, storage-core, query-dsl, audit-primitives, entity-{vue,react,solid,svelte}, rest-request-manager) go to Wave 12.C. 11 Tier-3-5 packages (core, hsm, entity-storage, rpc-proxy-builder, runtime-context, session-guard, async-utils, logger-factory, auth-openfga, api-rlr) go to Wave 12.D.
- **NG-004 — Not in scope: example apps audit.** `examples/m9s-example`, `examples/m9s-example-web`, `examples/m9s-example-api-types` → Wave 12.E.
- **NG-005 — No publish during this wave.** Audit is markdown + evidence only; no `pnpm changeset publish` triggered. Fix wave (next sprint) handles publish.
- **NG-006 — No SLA promise.** Findings get recorded; severity priority queueing is not part of THIS PRD.

## Functional Requirements

- [ ] **FR-001 — Reviewer roster:** 4 parallel reviewers minimum: `logic-reviewer`, `architecture-reviewer`, `type-reviewer`, `security-reviewer`. Each reviewer covers ALL 15 packages in its own domain (not 4 reviewers per package — that's 60 spawns).
- [ ] **FR-002 — Package set:** `fsm`, `fetch`, `collection`, `llm-costs`, `utils`, `m9s-cache`, `ws-rpc`, `config`, `tenant`, `otel`, `pg-client`, `session`, `entity-audit`, `errors`, `tenant-resolver`. 15 packages total per Tier-1 list in CLAUDE.md.
- [ ] **FR-003 — Per-package output:** each reviewer returns a structured report with one section per package. Sections must include: severity-ranked findings (CRITICAL/HIGH/MEDIUM/LOW), file:line references, suggested remediation per finding.
- [ ] **FR-004 — Cross-validation:** team-lead (orchestrator) cross-validates reviewer outputs: same-finding-different-domain (e.g. type leak that's also security risk) is collapsed; divergent severity ratings are reconciled with explicit reasoning.
- [ ] **FR-005 — Evidence artifact:** single `EVID-NNN` aggregating findings per Wave 12.A pattern. Body includes `## Structured Fields` (verdict, congruence_level, evidence_type) per ADR-006 / R_eff math. CL3 (same target system, internal review). verdict = supports if R_eff ≥ 0.5 across all findings.
- [ ] **FR-006 — Acceptance criteria:** PRD acceptable to activate when (a) EVID-NNN linked with `informs` relation, (b) R_eff ≥ 0.5, (c) Per-package summary cards present in EVID body, (d) at least 4 reviewer outputs synthesised.

## Non-Functional Requirements

- **NFR-001 — Read-only audit:** this PRD does NOT prescribe fixes. Fixes for CRITICAL findings ship as Wave 12.B fix sub-wave (separate PRD, e.g. PRD-029, modelled on PRD-027/Wave-13).
- **NFR-002 — Token budget:** 4 reviewers × 15 packages — each reviewer should target ≤4000 LOC inspection scope total. Tier-1 packages are small (utils-style libs, 100-500 LOC each), realistic.
- **NFR-003 — Time bound:** single session, ≤4 hours wallclock including spawn, reviewer wallclock, cross-validation, evidence drafting.
- **NFR-004 — Findings traceability:** every CRITICAL finding references concrete `file:line` or `file:line-range`, never vague ("the API is bad" not acceptable; "`packages/fsm/src/Machine.ts:88` — `transition()` mutates `_current` outside state-guard, race risk under concurrent dispatch — would be CWE-362" required).
- **NFR-005 — Safety:** no destructive changes to `.forgeplan/*` markdown (mutate via MCP only). No git push/branch operations during audit phase (separate fix wave).
- **NFR-006 — Reuse Wave 12.A pattern:** structurally mirror EVID-043 (the api-core audit evidence) — per-package summary cards, ranked findings table, cross-domain validation notes. Consistent format simplifies aggregate Wave 12.G report (PRD-030 later).

## Related Artifacts

- **PRD-026** — Wave 12 comprehensive audit plan (super-PRD covering 12.A-G). This wave is sub-iteration 12.B.
- **RFC-018** — Wave 12 audit strategy: 5 reviewers, 7 sub-waves, per-package summary card format. THIS PRD inherits the format.
- **EVID-043** — Wave 12.A api-core audit evidence (gold-standard reference for output format + R_eff ≥ 0.5 acceptance).
- **PRD-027** — Wave 13 api-core fix wave (closed CRITICALs from EVID-043). THIS PRD's findings feed analogous fix PRD-029 for Tier-1.
- **ADR-006** — `@gertsai/errors` as Shared Kernel — Tier-1 audit must verify errors package matches ADR-006 invariants.
- **ADR-007** — runtime-context architecture — Tier-1 audit for session/tenant must verify ADR-007 invariants are upheld.
- **CLAUDE.md** — 38-package tier table (canonical Tier-1 list).

Refs: RFC-018 (Wave 12 plan), EVID-043 (Wave 12.A api-core), PRD-026 (Wave 12 super-PRD), ADR-006 (R_eff math), ADR-007 (runtime-context).





