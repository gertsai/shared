---
depth: standard
id: EVID-095
kind: evidence
last_modified_at: 2026-10-30T22:14:01.681767+00:00
last_modified_by: omp-coding-agent/1.0.0
links:
- target: PRD-072
  relation: informs
- target: RFC-028
  relation: informs
status: deprecated
title: 'Sol activation gate: scoped repair verified, inherited Wave 37 readiness remains blocked'
---

---
assigned_number: 95
created: 2026-10-30
predicted_number: 95
slug: evid-sol-activation-gate-scoped-repair-verified-inherited-wave-37-readiness
updated: 2026-10-30
---

# Independent Sol activation gate

## Structured Fields

verdict: refutes
congruence_level: 3
evidence_type: audit

## Scope and verdict

**Verdict: BLOCKER for activation of PRD-072 and RFC-028.** This is an activation-readiness judgment, not a new production-code defect. Reviewer: openai-codex/gpt-6.1-sol, separate read-only context from Luna implementation and previous source reviews. Parent records the observed verdict; no forced activation or graph manipulation.

## Findings

- Scoped source and release review: PASS. All cited provider/SQL and service/rule P1/P2 repairs are covered by EVID-093. The final release follow-up read the corrected changeset and SetWriteOpts/provider documentation, confirming merge is now the default and `{ merge: false }` retains overwrite semantics.
- Activation remains blocked. Before this gate pack was linked, parent scoring reported PRD-072 self_score=1 but r_eff=0 through SPEC-008 -> ADR-005 -> active PRD-071; RFC-028 only reported r_eff=1 while its parent stayed draft. Repository activation requires positive effective trust.
- PRD-071 is an existing broader Wave 37 feature. EVID-090 explicitly reports 2/9 typed queries plus 7/9 documented escape hatches and an INCONCLUSIVE FR-D5 real-infrastructure gate. PRD-071 text still requires at least six migrated queries and a feature-specific real-infra run. Reconcile those requirements with any authorized scope decision; this bounded repair does not silently redefine or certify them. EVID-089 covers an earlier wave.
- EVID-092 retains its earlier refutes verdict and failing observations, with deprecated current applicability. EVID-094 preserves the separately observed, unchanged migration CLI failure. Neither is rewritten as a passing result.

## Acceptance coverage

AC1 relational state, AC2 memory atomicity, AC3 rule/service behavior and AC4 independent authorship/review are supported by EVID-093. AC5 commands and release records are supported after the explicit breaking-default disclosure correction: 5794 passed, 105 skipped, 28 compiled smoke scenarios passed, build/types/lint/scoped exports/frozen-lock/release status checks passed. Those observations do not establish unrelated PRD-071 real-infrastructure completion or migration CLI usability.

## Required disposition and revisit trigger

Keep PRD-072 and RFC-028 in draft. Do not force activation, delete a legitimate dependency, relabel a failure, or substitute root default-suite results for broader feature-specific gates. Revisit when existing Wave 37 readiness is truthfully resolved or reconciled by an authorized substantive decision, inherited effective trust is positive, and a new independent guardian pass is recorded. Then retire this dated activation judgment through the supported lifecycle.

## Verification boundary

The gate and release follow-up were read-only; they ran no tests/builds and made no source, artifact, Git or release changes. Runtime commands were executed by the parent and are pinned in EVID-093. No commit, push, PR, merge or npm publication was performed.


## Deprecation

Reason: Dated readiness blocker resolved: EVID-096 proves Wave37/CLI gates; separately authorized test-only maintenance and actual green root regression EVID-098 remove final root blocker; independent Sol guardian EVID-099 explicitly authorizes retirement. Historical failures and links preserved.
Date: 2026-10-31
