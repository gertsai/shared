---
depth: standard
id: EVID-041
kind: evidence
last_modified_at: 2026-05-14T12:44:22.402711+00:00
last_modified_by: claude-code/2.1.139
links:
- target: PRD-024
  relation: informs
status: active
title: Wave 11.B ship evidence — defineAction upstreamed + JwtClaims shared — tsc 0 / web 1088-0-0 / lint clean / 86 passed
---

## Summary

Wave 11.B — helpers upstreamed. `defineAction()` lifted from `examples/m9s-example/src/lib/` into `@gertsai/api-core/moleculer` (changeset minor → v0.2.0); `JwtClaims` extracted from duplicate structural copies in web + backend into the shared `@gertsai-examples/m9s-example-api-types` package. 11 m9s-example actions + both jwt.ts files migrated. **All smoke gates green**.

## Structured Fields

- **verdict**: supports
- **congruence_level**: CL3
- **evidence_type**: code_review + internal-test-result

R_eff = max(0, 1.0 − 0.0) = 1.0.

## What was built

### defineAction → `@gertsai/api-core/moleculer`

- `packages/api-core/src/lib/define-action.ts` (NEW, ~75 LOC) — `defineAction(registration: unknown): RegisteredAction` opaque-brand wrapper. Migration JSDoc in source.
- `packages/api-core/src/moleculer/index.ts` — adds `export * from '../lib/define-action'`.
- `.changeset/wave-11-b-define-action.md` (NEW) — `@gertsai/api-core: minor` with migration snippet. Next release PR will bump 0.1.0 → 0.2.0.
- `examples/m9s-example/src/lib/define-action.ts` — **deleted**. The local shim served its purpose.
- 11 action files migrated from `import { defineAction } from '../../../../lib/define-action'` to `import { defineAction } from '@gertsai/api-core/moleculer'`:
  - `services/auth/src/actions/{login,logout,refresh}.action.ts`
  - `services/ingest/src/actions/{ingest-document,upload-document,list-documents,delete-document,start-workflow,embed-batch,store-chunks}.action.ts`
  - `services/search/src/actions/search-query.action.ts`

### JwtClaims → `@gertsai-examples/m9s-example-api-types`

- `examples/m9s-example-api-types/src/jwt-claims.ts` (NEW, ~60 LOC) — exports `JwtClaims`, `JwtAccessClaims` (narrowed `kind: 'access'`), `JwtRefreshClaims` (narrowed `kind: 'refresh'` + required `jti`), `JwtKind` discriminator union.
- `examples/m9s-example-api-types/src/index.ts` — barrel re-exports 4 types.
- `examples/m9s-example/src/services/auth/src/jwt.ts` — replaces local `interface JwtClaims` with `import type` + `export type` from api-types. Saves 22 LOC.
- `examples/m9s-example-web/src/lib/server/jwt.ts` — same migration. Saves 10 LOC.
- `examples/m9s-example/package.json` — adds `@gertsai-examples/m9s-example-api-types: workspace:*` as runtime dep.

## Smoke results (2026-05-14)

| Gate | Command | Result |
|---|---|---|
| api-core build | `pnpm --filter @gertsai/api-core build` | **Success** |
| api-types build | `pnpm --filter @gertsai-examples/m9s-example-api-types build` | **Success** |
| Backend tsc | `pnpm --filter @gertsai-examples/m9s-example exec tsc --noEmit` | **0 errors** |
| Web check | `pnpm --filter @gertsai-examples/m9s-example-web check` | **1088 files · 0 errors · 0 warnings** |
| Workspace lint | `pnpm lint` | **clean** |
| Backend tests | `pnpm --filter @gertsai-examples/m9s-example test` | **86 passed / 3 skipped / 1 pre-existing flake** (no regression) |

## Acceptance verification (PRD-024)

- [x] **FR-001 (defineAction upstream)**: helper + brand exported from `@gertsai/api-core/moleculer`; build succeeds.
- [x] **FR-002 (changeset)**: `.changeset/wave-11-b-define-action.md` declares minor bump with migration snippet.
- [x] **FR-003 (consumer migration)**: 11 actions migrated; local shim deleted. `grep -rn "from.*lib/define-action" examples/m9s-example/src/` returns nothing.
- [x] **FR-004 (JwtClaims shared)**: web + backend both `import type { JwtClaims } from '@gertsai-examples/m9s-example-api-types'`. Single source of truth; structural drift now impossible at compile time.

## Key decisions

- **Reuse existing api-types pkg** instead of creating a new `m9s-example-shared-types`. JwtClaims is structurally an "API contract" (claims appear in JWT tokens crossing the HTTP boundary) — it belongs in the API-types surface. Avoids package-zoo proliferation.
- **`defineAction` in `moleculer/` subpath**, not `contracts/`: it's a Moleculer-specific helper (wraps controller.register's Moleculer-shaped return). `contracts/` stays pure-types only.
- **Re-export `JwtClaims` from local jwt.ts files**: callers (app.d.ts, hooks/auth.ts) already `import { JwtClaims } from '$lib/server/jwt'`. Keeping the re-export preserves those import paths — no shotgun rewrite. New code can import directly from `@gertsai-examples/m9s-example-api-types`.
- **Narrowed JwtAccessClaims + JwtRefreshClaims**: added at the shared-types boundary because the demo's verify path benefits from `jti: string` (no `?:`) on refresh tokens. Optional future use; backend currently still uses the broad `JwtClaims`.

## R_eff impact

```
EVID-038 / 039 / 040 (Waves 10.E / re-audit / 11.A)  → 1.0
EVID-041 (Wave 11.B ship, this evidence)              → 1.0
```

R_eff = 1.0. Helper-reusability layer complete; the m9s-example reference is now also a **demonstration of upstreaming patterns** (local shim → published package with migration changelog).

## What remains (Wave 11.C / backlog)

- **OIDC integration** (Passport + Google/GitHub strategy) — replace `InMemoryUserRepo` with provider-callback path.
- **Real PG user DB** (Prisma adapter) — drop-in replacement for `InMemoryUserRepo`.
- **Storybook CI deploy** — GitHub Action that builds + deploys storybook-static to Pages.
- **oxlint warnings sweep** — 1511 warnings, separate effort.
- **npm publish v0.2.0 / v0.3.0** — IRREVERSIBLE, requires explicit Y per package. The changesets PR is the entry point.

## References

- [[PRD-024]] — Wave 11.B requirements.
- [[PRD-023]] / [[EVID-040]] — Wave 11.A predecessor.
- [[PRD-022]] / [[EVID-038]] — Wave 10.E (original local helpers shipped).
- [[EVID-036]] — audit findings W-Type-1/2 + CI-5 closed by this evidence.



