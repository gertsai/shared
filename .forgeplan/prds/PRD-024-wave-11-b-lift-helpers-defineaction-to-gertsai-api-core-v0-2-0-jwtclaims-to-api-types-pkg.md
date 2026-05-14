---
depth: standard
id: PRD-024
kind: prd
last_modified_at: 2026-05-14T12:43:56.470793+00:00
last_modified_by: claude-code/2.1.139
links:
- target: EVID-040
  relation: based_on
status: active
title: Wave 11.B lift-helpers — defineAction to @gertsai/api-core v0.2.0 + JwtClaims to api-types pkg
---

## Problem Statement

Wave 10.E (PRD-022) shipped two local helpers inside `m9s-example` that solved important problems but stayed app-scoped: `defineAction()` (retires `: any` on every `controller.register` call site) lives in `examples/m9s-example/src/lib/define-action.ts`; the `JwtClaims` interface is structurally duplicated between `examples/m9s-example/src/services/auth/src/jwt.ts` and `examples/m9s-example-web/src/lib/server/jwt.ts`. Audit EVID-036 flagged both: W-Type-1/W-Type-2 + CI-5 (drift risk).

Wave 11.A (PRD-023) closed the production-hardening layer. This PRD closes the helper-reusability layer so any future `@gertsai/api-core` consumer (incl. real downstream services in other monorepos) benefits from both fixes without copy-pasting.

## Goals

1. **`defineAction()` upstreamed** to `@gertsai/api-core/moleculer` subpath. Changeset minor bump to v0.2.0. All 11 m9s-example actions migrated to import from package; local helper deleted.
2. **`JwtClaims` shared** via existing `@gertsai-examples/m9s-example-api-types` package (no new package needed — re-uses the api-types workspace pkg). Both backend and web jwt.ts re-export from the shared source.

## Target Audience

- **Primary:** future downstream services that import `@gertsai/api-core/moleculer` — they get a real typed `defineAction` from the published package without inventing their own.
- **Secondary:** m9s-example itself — drift risk between web + backend JwtClaims is closed at compile time.

## Functional Requirements

- [ ] **FR-001 (defineAction upstream)**: `packages/api-core/src/lib/define-action.ts` exports `defineAction` + `RegisteredAction`. `packages/api-core/src/moleculer/index.ts` re-exports them. Build (`pnpm --filter @gertsai/api-core build`) succeeds.
  - **Acceptance:** `import { defineAction } from '@gertsai/api-core/moleculer'` resolves; types match.
- [ ] **FR-002 (changeset)**: `.changeset/wave-11-b-define-action.md` declares `@gertsai/api-core: minor` with migration snippet. Ready for the next release PR.
- [ ] **FR-003 (m9s-example migration)**: 11 action files import `defineAction` from `@gertsai/api-core/moleculer` instead of local lib. `examples/m9s-example/src/lib/define-action.ts` deleted. Backend tsc 0.
  - **Acceptance:** `grep -rn "from.*lib/define-action" examples/m9s-example/src/` returns nothing.
- [ ] **FR-004 (JwtClaims shared)**: `examples/m9s-example-api-types/src/jwt-claims.ts` exports `JwtClaims`, `JwtAccessClaims`, `JwtRefreshClaims`, `JwtKind`. Both backend (`services/auth/src/jwt.ts`) and web (`lib/server/jwt.ts`) replace their local `interface JwtClaims` with `import type` + re-export from the api-types pkg. `@gertsai-examples/m9s-example-api-types` added to `examples/m9s-example/package.json` deps.
  - **Acceptance:** web + backend types of `JwtClaims` are structurally the SAME identity (Same `Symbol`), enforced by TypeScript at compile time.

## Non-Functional Requirements

**NFR-1 — Backward compatibility**
  - All 11 m9s-example action files keep their export signatures (`defineAction(controller.register(...))`). External shape unchanged.
  - `JwtClaims` is re-exported from both jwt.ts files (`export type { JwtClaims }`) so callers like `app.d.ts` and `hooks/auth.ts` don't break.

**NFR-2 — Test gates**
  - Backend tsc: 0 errors.
  - Web svelte-check: 0/0/0.
  - Workspace lint: clean.
  - Backend tests: 86+ (no regression).

**NFR-3 — Forgeplan discipline**
  - EVID-041 records ship. Structured fields: `verdict: supports`, `congruence_level: CL3`.

## Stakeholders

- **Owner:** `packages/api-core` + `examples/m9s-example-api-types` + `examples/m9s-example/src/services/**`.
- **Reviewers:** future api-core v0.2.0 release PR reviewer.

## Related Artifacts

- [[PRD-023]] / [[EVID-040]] — Wave 11.A predecessor (production hardening).
- [[PRD-022]] / [[EVID-038]] — Wave 10.E original local-helper shipping.
- [[EVID-036]] — audit findings W-Type-1/2 + CI-5.

## Out of Scope

- OIDC integration — Wave 11.C+.
- Real PG user DB — future.
- Storybook CI deploy — separate small PR.
- oxlint sweep — separate effort.
- npm publish itself — gated by user explicit Y per package (long-standing).




