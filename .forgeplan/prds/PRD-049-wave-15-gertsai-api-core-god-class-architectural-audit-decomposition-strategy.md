---
depth: standard
id: PRD-049
kind: prd
last_modified_at: 2026-05-19T20:40:46.666492+00:00
last_modified_by: claude-code/2.1.142
status: active
title: Wave 15 — @gertsai/api-core god-class architectural audit + decomposition strategy
---

## Problem Statement

Wave 12.G aggregate matrix (EVID-058) ranked `@gertsai/api-core` god-class decomposition as the #1 highest-impact remaining action by `severity_max × consumer_count` score (~30 consumers across 38 packages). The package is the Tier-4 platform contract surface — `ApiController`, `response-wrapper`, `envelope`, `runtime/node`, `moleculer` subpath. Its size + cross-cutting concerns are a known maintainability hotspot per multiple prior EVIDs (043/044/048/051).

## Goals

1. Read-only audit of `packages/api-core/src/` (~end-to-end inventory).
2. Identify single-responsibility violations (god-class / large modules).
3. Surface decomposition candidates with cohesion/coupling analysis.
4. Produce a decomposition strategy ranked by (impact × ease).

## Functional Requirements

**FR-001** — Inventory all `packages/api-core/src/` files with LOC + dependency graph (which file imports which, who imports each).

**FR-002** — Identify modules > 500 LOC with cohesion-coupling analysis. Specifically:
- Does the module have a single semantic responsibility?
- Are exports tightly coupled or can subsets be extracted?
- What's the public surface?

**FR-003** — Identify cross-cutting concerns (logging, error handling, validation, auth, telemetry) that could become separate Tier-1 utilities OR remain consolidated.

**FR-004** — Ranked decomposition proposal: which extractions would yield biggest consumer-API stability + maintainability gain at smallest risk.

## Non-Functional Requirements

**NFR-001** — Read-only audit. No code changes.
**NFR-002** — Produces EVID-067 with `## Structured Fields`.
**NFR-003** — Findings tied to file:line citations.

## Out of Scope

- Actual decomposition (separate Wave 15.A-N PRs per extraction).
- Performance audit (separate wave).
- Wave 14.6 GertsErrorResponse removal (v1.0.0 specific).

## Related Artifacts

- EVID-058 (Wave 12.G aggregate — top-ranked next action)
- EVID-043/044/048/051 (prior Wave 12.A-D audits touching api-core)
- ADR-003 (platform runtime boundaries — relevant for subpath strategy)
- ADR-002 (hex layering)

## Target Audience

- Maintainers of `@gertsai/api-core` (highest consumer count = biggest risk)
- Consumers building new endpoints (clarity on which contracts are stable vs in-flux)
- v1.0.0 release coordinators



