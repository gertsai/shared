---
depth: standard
id: PRD-056
kind: prd
last_modified_at: 2026-05-20T09:07:31.350997+00:00
last_modified_by: claude-code/2.1.142
status: active
title: Wave 18 — entity-{vue,react,solid,svelte} reactive adapters audit
---

## Problem Statement

Wave 13.D2 (EVID-059) deeply audited `@gertsai/core` un-sampled 84%. But 4 reactive adapter packages from Sprint 3.8 (per ADR-008) have NEVER been audited:
- `@gertsai/entity-vue` (`/vue` subpath was re-export shim earlier; standalone since Wave 3.8)
- `@gertsai/entity-react`
- `@gertsai/entity-solid`
- `@gertsai/entity-svelte`

Total ~700 LOC source code, used by m9s-example + downstream consumers building Svelte/React/Solid/Vue UIs on top of `@gertsai/entity` reactive Models.

Wave 12.G aggregate matrix (EVID-058) deferred these because they're younger code with smaller surface. v1.0.0 prep should not leave audit gaps.

## Goals

1. Read-only audit of `packages/entity-{vue,react,solid,svelte}/src/`.
2. Surface findings graded CRIT/HIGH/MED/LOW with file:line citations.
3. Recommended Wave 19 fix sequence per finding density.

## Functional Requirements

**FR-001** — Cohesion/coupling check per adapter. Each implements `ReactiveAdapter` interface from `@gertsai/entity`. Audit:
- Proxy traps (get/set/deleteProperty) correctness — esp. set returning `false` per ADR-008 (CWE-1188)
- Re-entrancy guards — Sprint 3.8 added these per ADR-008 I-11
- Prototype pollution surface (existing tests assert this — verify still correct)
- WeakMap subscribe correctness — Sprint 3.8 I-13
- Sync notify vs deferred (microtask vs schedule)

**FR-002** — Cross-cutting: did 4 adapters drift in semantics? Each implements the same interface but for different reactive runtimes. Surface inconsistencies that would surprise consumers swapping adapters.

**FR-003** — Security: prototype-pollution + injection surface. Existing tests assert this — verify coverage adequacy.

**FR-004** — Type-system: any/unknown leaks. Generic variance bugs. exactOptionalPropertyTypes compliance.

## Non-Functional Requirements

**NFR-001** — Read-only audit. No source code modifications.
**NFR-002** — Produces EVID-074 with structured fields.
**NFR-003** — File:line citations for each finding.

## Out of Scope

- Actual fixes (separate Wave 19 PR per finding density)
- Wave 15.D ApiController action-pipeline extraction
- Cross-package consolidation (Wave 14 territory)

## Related Artifacts

- ADR-008 (entity reactive adapters per-framework)
- Sprint 3.8 W-3-8-{1..21} (originating implementation)
- EVID-058 (Wave 12.G — deferred audit)
- EVID-059 (Wave 13.D2 precedent for read-only deep audit)
- EVID-067 (Wave 15 api-core audit precedent)

## Target Audience

- Maintainers of `@gertsai/entity-{vue,react,solid,svelte}`
- Consumers building UI on top of these adapters (m9s-example + downstream)
- v1.0.0 release coordinators (audit gap closure)



