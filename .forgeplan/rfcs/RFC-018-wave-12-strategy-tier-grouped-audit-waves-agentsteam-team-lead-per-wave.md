---
depth: standard
id: RFC-018
kind: rfc
last_modified_at: 2026-05-15T16:24:57.535936+00:00
last_modified_by: claude-code/2.1.139
status: draft
title: Wave 12 strategy — tier-grouped audit waves, AgentsTeam + team-lead per wave
---

## Summary

6 audit waves (12.A через 12.F), каждая wave = one focused PR with EVID. Wave 12.A — validation на api-core (NOW). 12.B-D — tier-grouped per-package audits (fresh sessions). 12.E — examples audit. 12.F — cross-consistency. 12.G — aggregate report.

## Motivation

PRD-026 требует audit'а monorepo-wide level (38 packages + 3 examples). Без plan'а: 4 эксперта × 41 audit target = 164 agent calls, нереально in one session. Phasing in 6 waves: 5-7 agents per wave × 6 waves = ~30-40 agent calls total, fits across 4-5 separate sessions.

## Wave Map

| Wave | Targets | Reviewers | Files per wave | EVID |
|---|---|---|---|---|
| **12.A** (NOW) | `@gertsai/api-core` deep | 5 (logic + arch + type + security + tests) | ~12 | EVID-043 |
| **12.B** (fresh) | 15 Tier-1 foundation pkgs | 4 (logic + arch + type + security) | ~30 (key files) | EVID-044 |
| **12.C** (fresh) | 12 Tier-2 mid pkgs | 4 same | ~25 | EVID-045 |
| **12.D** (fresh) | 11 Tier-3-5 app pkgs | 4 same | ~25 | EVID-046 |
| **12.E** (fresh) | 3 example apps | 5 (add frontend-reviewer) | ~30 | EVID-047 |
| **12.F** (fresh) | Cross-consistency | 4 same | ~40 (sample across pkgs) | EVID-048 |
| **12.G** (fresh) | Aggregate report | 1 team-lead synthesis | inputs: 6 EVIDs | EVID-049 |

## Spawn pattern per wave

Each wave follows `fpl-skills:audit` skill recipe:

```bash
# Wave 12.X start:
forgeplan claim PRD-026 --agent team-lead-wave-12-X/v1 --ttl-minutes 120
TeamCreate(team_name="audit-12-X")

# Spawn 4-5 reviewers in parallel via Agent calls (single message):
Agent(subagent_type=general-purpose, description="audit logic-reviewer", prompt=<scope+checklist>)
Agent(subagent_type=general-purpose, description="audit arch-reviewer", prompt=<scope+checklist>)
Agent(subagent_type=general-purpose, description="audit type-reviewer", prompt=<scope+checklist>)
Agent(subagent_type=general-purpose, description="audit security-reviewer", prompt=<scope+checklist>)
# Optional 5th: test-reviewer or frontend-reviewer for 12.E

# After all return: team-lead synthesises → EVID-XXX → commit + PR
```

## Wave 12.A (NOW) — file ownership for the 5 reviewers

**Scope**: `packages/api-core/src/**`. Files ~12 — index.ts, contracts/, lib/{controller,error,oauth,common,apiResponse,envelope,diagnostics}, moleculer/{apiGateService,openapiService,oauth.mixin,types,workflow}.

**Reviewer assignments**:
- **logic-reviewer**: edge cases in `controller/*`, `error/*`, `oauth/*`. Race conditions, null handling, ApiController lifecycle.
- **arch-reviewer**: SOLID compliance, subpath structure (ADR-003), DIP through contracts, controller's responsibility scope.
- **type-reviewer**: any/cast audit on public surface (`@gertsai/api-core/contracts` is pure types — should have zero), generic constraints, response envelope discriminators.
- **security-reviewer**: OAuth mixin correctness, error message sanitisation (PII leak surface), CWE-209.
- **test-reviewer**: coverage of public API, mock realism in unit tests.

## Wave 12.B-D pattern

Per-package summary card from each reviewer (one paragraph per package): `[pkg-name] score X/10 — list critical issues — verdict`. Aggregate matrix at end. No deep dive per file — sweep mode.

## Wave 12.E pattern

3 reviewers go per-app:
- m9s-example backend (largest)
- m9s-example-web
- m9s-example-api-types

Each reviewer reads ~10 key files per app. Cross-cuts: hex layer, real auth flow correctness post-11.A, no leaked demo paths.

## Wave 12.F pattern

Cross-cutting reviewers don't focus on individual files. Each does a `grep -rn` style search across `packages/**` for:
- error subclasses: are they extending `@gertsai/errors` AppError or rolling own?
- imports of `interface JwtClaims` (should be 0 outside api-types post-11.B)
- `: any` annotations not annotated with `// reason:`
- `controller.register(...)` outside `defineAction()` wrapper
- subpath imports — `@gertsai/api-core` root vs `@gertsai/api-core/contracts` ratio

## Wave 12.G aggregate

Team-lead reads all 6 EVIDs (043-048) and synthesizes:
- Total findings by severity across waves
- Score distribution by tier
- Top-10 actionable items for Wave 13 polish PR
- Stop-light per package: green/yellow/red
- Final R_eff aggregate

## Invariants

- **I-1**: Each wave is one PR with one EVID. No bundled multi-wave PRs.
- **I-2**: CRITICAL findings escalate immediately — wave stops, fix lands as Wave 13.X interim PR before next audit wave.
- **I-3**: 4-expert baseline (logic + arch + type + security) for every wave. 5th expert (tests/frontend/perf) only when scope justifies.
- **I-4**: Token budget cap ~350k per wave — if approaching, split scope into sub-waves.

## Rollback Plan

- Audit findings are advisory — never break code.
- If a wave EVID flags a CRITICAL — open remediation PR before next wave; remediation PR is treated as fix-PR not audit-PR.
- Audit EVIDs themselves are forgeplan artifacts; deactivate via `forgeplan_update --status superseded` if methodology turns out wrong.

## Validation Plan

- Wave 12.A is the validation pass. If api-core comes back with <3 HIGH findings + 0 CRITICAL — methodology validated, scale to remaining waves.
- If 12.A reveals many findings — pause, do remediation, re-audit api-core (12.A.1), then scale.

## References

- [[PRD-026]] — this RFC's parent.
- [[PRD-025]] / [[RFC-017]] — Wave 12 super design (this is one part).
- [[EVID-036]] / [[EVID-039]] — proven audit methodology from Wave 10.




