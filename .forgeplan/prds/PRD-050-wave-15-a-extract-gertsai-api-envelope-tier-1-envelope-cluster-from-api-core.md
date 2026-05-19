---
depth: standard
id: PRD-050
kind: prd
last_modified_at: 2026-05-19T20:54:55.205416+00:00
last_modified_by: claude-code/2.1.142
status: active
title: Wave 15.A — extract @gertsai/api-envelope Tier-1 (envelope cluster from api-core)
---

## Problem Statement

EVID-067 §Wave 15.A identifies the envelope cluster in `@gertsai/api-core` as the highest impact-over-effort decomposition target: 1,901 LOC across 6 files in `packages/api-core/src/lib/envelope/`, pure typia interfaces + helpers (browser-safe), 0 internal dep on Moleculer.

The cluster is reusable outside Moleculer-bound apps (FastAPI / Rust ts-types generators per existing `contracts/index.ts` JSDoc), but its current location in api-core (Tier-4, Moleculer-coupled) blocks consumption.

## Goals

1. Create new `@gertsai/api-envelope` Tier-1 package (browser-safe; no Moleculer deps).
2. Move envelope cluster (~1,901 LOC across 6 files) from `api-core/src/lib/envelope/` to new package.
3. Re-export shim in `api-core/src/lib/envelope/index.ts` preserves existing public API.
4. Zero breaking change for any of ~30 api-core consumers.

## Functional Requirements

**FR-001** — New package `packages/api-envelope/` with:
- `package.json` — `"name": "@gertsai/api-envelope"`, `"version": "0.1.0"`, `"license": "Apache-2.0"`, `"private": false`, `"publishConfig": { "access": "public" }`.
- Tier-1 deps: only `typia` + `tslib` + `tags` (mirror what envelope/ files currently import). No `@gertsai/*` deps if avoidable.
- `tsup.config.ts` — uniform tsup dual ESM+CJS per Sprint 3.0 §U-1..U-6.
- `tsconfig.json` extending `../../tsconfig.base.json`.
- `src/index.ts` re-exporting envelope public surface.

**FR-002** — Move 6 envelope files preserving git history via `git mv`:
- `packages/api-core/src/lib/envelope/types/error.ts` (620 LOC) → `packages/api-envelope/src/types/error.ts`
- `packages/api-core/src/lib/envelope/types/response.ts` (361 LOC) → `packages/api-envelope/src/types/response.ts`
- `packages/api-core/src/lib/envelope/types/list.ts` (409 LOC) → `packages/api-envelope/src/types/list.ts`
- `packages/api-core/src/lib/envelope/types/index.ts` → `packages/api-envelope/src/types/index.ts`
- `packages/api-core/src/lib/envelope/response-wrapper.ts` (422 LOC) → `packages/api-envelope/src/response-wrapper.ts`
- `packages/api-core/src/lib/envelope/type-guards.ts` (450 LOC) → `packages/api-envelope/src/type-guards.ts`

**FR-003** — `packages/api-core/src/lib/envelope/index.ts` becomes thin re-export shim from `@gertsai/api-envelope`. All existing `api-core` public envelope exports preserved (including the deliberate non-re-export of error-helpers per EVID-067 §Doctor Strange #1).

**FR-004** — Update `packages/api-core/package.json` dependencies to include `@gertsai/api-envelope: workspace:*`.

**FR-005** — Migrate envelope tests (if any in api-core test suites that test envelope-only behaviour) to new package OR leave in api-core if integration-tested with controller — make explicit per file.

## Non-Functional Requirements

**NFR-001** — Build green: new package + api-core + all 30 consumers compile.
**NFR-002** — Workspace test suite passes: no regressions.
**NFR-003** — Zero behaviour change. All `import { ... } from '@gertsai/api-core/contracts'` etc. continue resolving identically.
**NFR-004** — Net LOC: ~+2,400 in new pkg, ~-2,400 in api-core, ~+50 shim overhead = ~+50 raw LOC. Single source of truth wins.

## Out of Scope

- Wave 15.B BullMQ extraction (separate PR)
- Wave 15.C Pub/Sub extraction (separate PR)
- Fixing dual error-helper collision (EVID-067 Doctor Strange #1; out-of-scope for this extraction; tracked for v1.0.0)
- Renaming or restructuring envelope public surface — pure mechanical move.

## Related Artifacts

- EVID-067 (Wave 15 audit — §15.A recommendation)
- EVID-058 (Wave 12.G aggregate — top action)
- ADR-002 (hex layering — envelope is shared kernel, not domain)
- ADR-003 (platform runtime boundaries — Tier-1 placement)

## Target Audience

- Maintainers of `@gertsai/api-core` and ~30 consumer packages
- Future non-Moleculer adopters (FastAPI / Rust / browser-side type generation consumers)
- v1.0.0 release coordinators (this is a precursor to breaking-change cleanup in 15.A+)



