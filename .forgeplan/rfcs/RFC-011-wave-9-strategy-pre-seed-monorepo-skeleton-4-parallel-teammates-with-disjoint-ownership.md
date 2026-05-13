---
depth: standard
id: RFC-011
kind: rfc
last_modified_at: 2026-05-13T21:57:28.758949+00:00
last_modified_by: claude-code/2.1.139
links:
- target: PRD-015
  relation: refines
status: active
title: Wave 9 strategy — pre-seed monorepo skeleton + 4 parallel teammates with disjoint ownership
---

# RFC-011: Wave 9 strategy — pre-seed monorepo skeleton + 4 parallel teammates with disjoint ownership

## Summary

Close PRD-015 + SPEC-019 + ADR-014 via single-wave AgentsTeam pattern. Team-lead pre-seeds the monorepo skeleton (workspace yaml + package.json scaffolds for `m9s-example-api-types` + `m9s-example-web`). Then 4 parallel `general-purpose` teammates own disjoint file sets. Deep depth — accompanies PRD + SPEC + ADR per `forgeplan_route` recommendation.

## Motivation

PRD-015 specifies WHAT (3 packages, 7 goals, 10 FRs). SPEC-019 specifies the OpenAPI contract shape. ADR-014 records the SvelteKit + openapi-fetch + sibling-layout choice. RFC-011 specifies HOW to ship them in one sprint without teammate file conflicts.

## Goals

- **RG-1** — Single-wave execution; 4 parallel teammates with disjoint files; no inter-teammate dependencies after pre-seed merges
- **RG-2** — Backend `examples/m9s-example/` modifications are minimal (~30 LOC) — just `createOpenApiService` registration; preserves all 62 existing tests
- **RG-3** — Web app reaches "interactive demo" state in one sprint: ingest form works, search results render, no auth UI (per Wave 10 split)
- **RG-4** — End-to-end type safety verifiable via `pnpm typecheck` from a fresh clone after `pnpm generate:openapi`
- **RG-5** — Strict floor preserved (EOPT + noUncheckedIndexedAccess) for all new TS

## Non-Goals (handled in Wave 10 per PRD-016)

- Auth UI flow / login pages / JWT refresh
- File upload (text-paste only in Wave 9)
- SSE / streaming responses on frontend
- i18n / multi-language UI
- Storybook / design system showcase
- Production-grade error UI (skeletons, retries, offline banners)
- Real-time channels integration via EventSource
- OAuth providers / external IdP

## Proposed Direction

Single-wave AgentsTeam pattern (proven across Waves 7.4 / 7.5 / 8.1 / 8.3). Team-lead pre-seeds branch + monorepo skeleton (workspace yaml + package.json scaffolds for 2 new packages + initial install). Then 4 parallel `general-purpose` teammates own disjoint file sets. ADR-014 captures the irreversible framework choice (SvelteKit + openapi-fetch + sibling layout) so RFC-011 only needs to detail execution mechanics, not justify framework. Phase 0 below is the pre-seed; Phase 1 the parallel spawn; Phase 2 smoke + EVID emission; Phase 3 ship via commits + PR.


## Phase 0 — Pre-seed (team-lead, ~45 min)

### 0.1 Branch + recon

```bash
git checkout -b feat/wave-9-full-stack-reference
```

**Recon — verify availability of upstream patterns** (PRD-015 R-1 mitigation):

```bash
# Does @gertsai/api-core export OpenApiMapper / ApiEndpointsGenerator?
grep -rn "OpenApiMapper\|ApiEndpointsGenerator\|createOpenApiService\|generateOpenAPISchema" \
  /Users/explosovebit/Work/GertsAi/shared/packages/api-core/src/

# If not — check upstream:
grep -rn "createOpenApiService\|generateOpenAPISchema" \
  /Users/explosovebit/Work/GertsAi/gertsai_codex/packages/api-core/src/ \
  /Users/explosovebit/Work/GertsAi/gertsai_codex/packages/api-types/src/
```

**Decision tree**:

- **If `@gertsai/api-core` exposes the helpers** → Wave 9 backend wiring is a thin import-and-call (Teammate A scope ~150 LOC)
- **If NOT** → vendor-port minimal helpers from upstream into `examples/m9s-example-api-types/src/openapi-helpers/`. Adds ~200 LOC to Teammate B scope but doesn't block. Track for promotion to `@gertsai/api-core/openapi` in a future Wave (post-9.x).

The recon result drives Teammate A's prompt detail; should be done BEFORE spawn.

### 0.2 Monorepo skeleton (~80 LOC)

**New `examples/m9s-example-api-types/`**:

- `package.json` — `"name": "@gertsai-examples/m9s-example-api-types"`, `"private": true`, scripts (`build`, `generate:openapi`, `typecheck`), peer deps (`@gertsai/api-core: workspace:*` if needed for type imports), dev deps (`openapi-typescript`, `typescript`)
- `tsconfig.json` — extends workspace base + `noEmit: false` + `outDir: ./dist`
- `src/index.ts` — barrel: `export type { paths } from './generated/openapi-schema';`
- `src/generated/.gitkeep` (generated content emitted by build script)
- `scripts/.gitkeep` (script lands via Teammate B)
- `README.md` stub (Teammate D will expand)

**New `examples/m9s-example-web/`**:

- `package.json` — `"name": "@gertsai-examples/m9s-example-web"`, `"private": true`, scripts (`dev`, `build`, `preview`, `check`, `lint`), runtime deps (`@gertsai-examples/m9s-example-api-types: workspace:*`, `openapi-fetch`, `tailwindcss`), dev deps (`@sveltejs/kit`, `@sveltejs/adapter-node`, `svelte`, `vite`, `typescript`, `@playwright/test`)
- `svelte.config.js`, `vite.config.ts`, `tsconfig.json`, `src/app.html`, `src/app.d.ts` — SvelteKit init scaffold
- `src/routes/+layout.svelte` + `src/routes/+page.svelte` placeholder ("Hello m9s-example-web")
- `e2e/` directory stub
- `playwright.config.ts` skeleton
- `README.md` stub
- `.env.example`

**Workspace updates**:

- `pnpm-workspace.yaml` — verify `examples/*` glob covers new packages (likely yes)
- `.moon/workspace.yml` — if explicit project list, add both new packages

### 0.3 Pre-seed smoke

```bash
pnpm install                              # Picks up new workspace packages
pnpm --filter @gertsai-examples/m9s-example-api-types build  # Empty success
pnpm --filter @gertsai-examples/m9s-example-web dev &        # Hello world @ http://localhost:5173
sleep 5; curl -sf http://localhost:5173 > /dev/null && echo "OK"
kill %1
```

Pre-seed merged → spawn 4 teammates in Phase 1.

## Phase 1 — 4 parallel teammates (~75 min wall-clock)

### File ownership map (DISJOINT — verified)

| Teammate | Owns | LOC delta |
|---|---|---|
| **A: `m9s-openapi-emission`** | MODIFY `examples/m9s-example/src/index.ts` (+~50 LOC). MODIFY `examples/m9s-example/package.json` (+1 script if needed). NEW (if upstream lacks helpers): `examples/m9s-example/src/openapi/` minimal helpers (~80 LOC). Smoke test: `curl http://localhost:3031/openapi/schema.json` returns 200 with valid 3.1 spec containing both paths. | ~50–130 src |
| **B: `m9s-api-types-pkg`** | OWN `examples/m9s-example-api-types/` package contents EXCEPT `package.json` (pre-seeded). Files: `scripts/generate-openapi-contract.mjs` (~150 LOC), `src/index.ts` (barrel — verify), `src/generated/openapi-schema.d.ts` (generated by running script — commit first generation as snapshot), `README.md` expansion. | ~250 LOC |
| **C: `m9s-sveltekit-web`** | OWN `examples/m9s-example-web/` EXCEPT pre-seeded `package.json` + config files. Files: `src/routes/` (4 routes — full content), `src/lib/api/client.ts`, `src/lib/api/server-fetch.ts` (server-side fetch wrapper if needed for cookie passthrough), Tailwind config files, `e2e/ingest-search.spec.ts` (1 test), `README.md` expansion. | ~600 src / ~80 test |
| **D: `m9s-wave-9-docs`** | MODIFY `examples/m9s-example/README.md` (add "Full-stack reference (Wave 9)" section). MODIFY root `README.md` (add Wave 9 pointer). NEW `examples/m9s-example-web/README.md`, `examples/m9s-example-api-types/README.md`. MODIFY `examples/m9s-example/.env.example` (add `WEB_BASE_URL` if needed). | ~150 markdown |

**Conflict matrix**:

|  | A | B | C | D |
|---|---|---|---|---|
| A | — | ✓ | ✓ | ✓ |
| B | ✓ | — | ✓ | ✓ |
| C | ✓ | ✓ | — | ✓ |
| D | ✓ | ✓ | ✓ | — |

Disjoint. Two notes:

- Teammate D modifies `examples/m9s-example/README.md` — same file Teammate A might want to update, but A is told NOT to touch README (only `src/index.ts` + `package.json`)
- Teammate B's generated `openapi-schema.d.ts` depends on Teammate A's backend emitting the spec. Sequencing: Teammate A's smoke (curl) happens first; once spec is live, Teammate B runs generation and commits the snapshot.

To resolve sequencing without serializing the wave: pre-seed includes a **vendored OpenAPI snapshot** (Teammate B uses a placeholder spec for first generation, then re-runs after Teammate A's wiring lands during smoke phase). Acceptable trade-off — `generate-openapi-contract.mjs` is idempotent.

### Per-teammate prompts

**Teammate A — `m9s-openapi-emission`**:
> Wire `createOpenApiService` into `examples/m9s-example/src/index.ts`. Recon: check whether `@gertsai/api-core/moleculer` exports `createOpenApiService` + whether `@gertsai/api-core/contracts` exports `OpenApiMapper` / `ApiEndpointsGenerator`. If yes: use them. If no: vendor minimal versions into `examples/m9s-example/src/openapi/` (port from `/Users/explosovebit/Work/GertsAi/gertsai_codex/packages/api-core/`). Register `openApiService` in `ApiController.Start({ services: [...] })`. Set OpenAPI info from `project.config.APP_VERSION`. Smoke: backend starts cleanly + `curl http://localhost:3031/openapi/schema.json` returns 200 with valid OpenAPI 3.1 JSON containing `paths['/api/v1/ingest/document']` AND `paths['/api/v1/search/query']`. Document recon decision in commit body + report. Strict floor: 0 new tsc errors. DO NOT modify `services/`, `application/`, `infrastructure/`, or any other directory beyond `src/index.ts` + (optionally) new `src/openapi/`. NO @gertsai/* package source modifications.

**Teammate B — `m9s-api-types-pkg`**:
> OWN `examples/m9s-example-api-types/` package contents. Write `scripts/generate-openapi-contract.mjs` mirroring `/Users/explosovebit/Work/GertsAi/gertsai_codex/packages/api-types/scripts/generate-openapi-contract.mjs`. Script: (1) reads `OPENAPI_FETCH_URL` env (default `http://localhost:3031/openapi/schema.json`), (2) fetches with retry, (3) validates spec shape per SPEC-019 §Validation tests, (4) runs `openapi-typescript@^7` programmatically to emit `src/generated/openapi-schema.d.ts`, (5) snapshots raw JSON to `src/generated/openapi.json`. Expand `src/index.ts` barrel to `export type { paths } from './generated/openapi-schema';`. Run generation once (against a running backend OR via vendored placeholder spec if Teammate A hasn't merged yet — placeholder is fine, scripts must be idempotent). Commit the generated `.d.ts` snapshot so the package builds without requiring backend running. Expand README. Strict floor + 0 tsc errors.

**Teammate C — `m9s-sveltekit-web`**:
> OWN `examples/m9s-example-web/` package contents. SvelteKit 2 + Svelte 5 runes + Tailwind v4 + openapi-fetch + adapter-node. Routes per PRD-015 FR-6: `+layout.svelte` (nav + theme), `+page.svelte` (home — 3 stat cards reading from `/api/v1/health` or similar; static for Wave 9), `ingest/+page.svelte` + `ingest/+page.server.ts` (form action POSTing to backend), `search/+page.svelte` + `search/+page.server.ts` (server load with form data), `docs/+page.svelte` (static — list demo docs). `src/lib/api/client.ts`: `createClient<paths>({ baseUrl: env.PUBLIC_API_BASE_URL ?? 'http://localhost:3031' })`. Auth headers passthrough — for Wave 9 just `X-Tenant-ID: tenant-acme` from env. 1 playwright e2e test in `e2e/ingest-search.spec.ts`: navigate to /ingest, fill form, submit, navigate to /search, query, assert result row present. Tailwind: minimal palette (slate + blue accent), no design system bloat. Strict floor + svelte-check 0 errors + 0 eslint warnings. NO new backend deps, NO modifications outside `examples/m9s-example-web/`.

**Teammate D — `m9s-wave-9-docs`**:
> Documentation. (1) `examples/m9s-example/README.md` — add new top-level section "Full-stack reference (Wave 9+)" pointing to `examples/m9s-example-web/` and `examples/m9s-example-api-types/` with usage tldr. Reference EVID-029 audit closure + PRD-015. (2) `examples/m9s-example-web/README.md` — full README explaining: prereqs (Node 22, pnpm 10, backend running), `pnpm dev` flow, route structure, openapi-fetch client pattern, link to ADR-014 for framework rationale. (3) `examples/m9s-example-api-types/README.md` — explains the generation pipeline, when to re-run `pnpm generate:openapi`, how `paths` type is consumed. (4) ROOT `README.md` — verify if there's a Wave 8.1+ pointer; add Wave 9 entry. (5) `examples/m9s-example/.env.example` — add `PUBLIC_API_BASE_URL` (referenced by web), `WEB_BASE_URL` if backend needs CORS allowlist (likely no — backend doesn't restrict origins in dev). Markdown only. No code execution. ~150 lines total markdown.

## Phase 2 — Smoke + activate (team-lead, ~30 min)

```bash
# Full smoke
pnpm typecheck                                                # workspace
pnpm test                                                     # all packages
pnpm build                                                    # all packages
pnpm lint                                                     # ESLint --max-warnings 0
pnpm --filter @gertsai-examples/m9s-example exec depcruise --config .dependency-cruiser.cjs src

# End-to-end demo verification
docker compose up -d                                          # if not running
pnpm --filter @gertsai-examples/m9s-example dev &             # backend
sleep 10
pnpm --filter @gertsai-examples/m9s-example-api-types generate:openapi  # re-generate types from live spec
pnpm --filter @gertsai-examples/m9s-example-web dev &         # frontend @ 5173
sleep 5
curl -sf http://localhost:5173 > /dev/null && echo "WEB UP"
curl -sf http://localhost:3031/openapi/schema.json | jq '.paths | keys' # should list both paths
RUN_E2E=1 pnpm --filter @gertsai-examples/m9s-example-web exec playwright test  # 1 test PASS

# Cleanup
pkill -f "ts-node-dev.*m9s-example"
pkill -f "vite.*m9s-example-web"
```

## Phase 3 — EVID + activate + ship (team-lead, ~20 min)

- `forgeplan_new evidence` with `## Structured Fields` block (verdict, congruence_level, evidence_type)
- `forgeplan_link EVID-031 PRD-015 --relation informs`
- `forgeplan_score PRD-015` — expect R_eff ≥ 0.5 (target 0.8 with CL3 internal evidence; precedent like Wave 8.3 R_eff=0 with informs chain → grade B accepted)
- Activate: PRD-015 + SPEC-019 + RFC-011 + ADR-014 + EVID-031 (5 artifacts)
- Wave 10 PRD-016 stays DRAFT for the next sprint
- 3 commits (per RFC-011 anti-large-PR mitigation — could be 1 if comfortable):
  - (a) `feat(m9s-example): wire createOpenApiService for live /openapi/schema.json (Wave 9)`
  - (b) `feat: new examples/m9s-example-api-types package with generate-openapi-contract.mjs (Wave 9)`
  - (c) `feat: new examples/m9s-example-web SvelteKit 2 app with openapi-fetch typed client (Wave 9)`
  - Plus single docs commit + activate
- Push + `gh pr create --base main`

## Invariants

- **I-1** — All Wave 8.x invariants preserved (Wave 5 Phase 1-4 packages + Wave 8.1/8.2/8.3 patterns)
- **I-2** — `examples/m9s-example/` backend functional contract unchanged: existing 62 tests pass; broker startup unaffected beyond `createOpenApiService` addition
- **I-3** — Strict floor: tsc with EOPT + noUncheckedIndexedAccess + ESLint hex boundary rules
- **I-4** — Sibling monorepo layout: never nest web inside backend
- **I-5** — `openapi-fetch` is the only typed-client mechanism; tRPC/Hono/orval explicitly rejected per ADR-014
- **I-6** — Frontend's `paths` type comes from `@gertsai-examples/m9s-example-api-types`, never imported directly from backend source (preserves layer separation)
- **I-7** — Backend OpenAPI spec is auto-generated from action types, never hand-edited

## Acceptance Test (per PRD-015 FRs)

- FR-1 — Teammate A smoke: `curl http://localhost:3031/openapi/schema.json | jq '.openapi'` returns `"3.1.0"`
- FR-2 — Existing 62 m9s tests pass unchanged
- FR-3..FR-4 — Teammate B: `pnpm --filter ...-api-types build` exit 0; `dist/index.{js,d.ts}` exist; `src/generated/openapi-schema.d.ts` non-empty with `paths` export
- FR-5..FR-8 — Teammate C: `pnpm --filter ...-web build && pnpm --filter ...-web dev` both succeed; `curl http://localhost:5173` returns 200
- FR-9 — `RUN_E2E=1 pnpm --filter ...-web exec playwright test` 1/1 PASS
- FR-10 — Workspace gates green

## Rollback Plan

- **Tactical revert**: single `git revert <merge-commit>` removes both new packages + the ~30 LOC `createOpenApiService` addition in `src/index.ts`. Backend reverts to pre-Wave-9 state. All 62 tests still pass.
- **Partial revert** (keep OpenAPI emission, drop frontend): drop `examples/m9s-example-web/` only. `m9s-example-api-types` becomes orphan but still builds. Not recommended — leaves dead package; better to full-revert and re-do.

## Risks (delta vs PRD-015)

| ID | Risk | Mitigation |
|---|---|---|
| RFC-R-1 | Phase 0 recon discovers `@gertsai/api-core` does NOT expose OpenAPI helpers — Teammate A scope expands ~80 LOC to vendor-port | Acceptable — RFC-011 explicitly scopes this fallback in Teammate A's prompt |
| RFC-R-2 | `openapi-typescript@^7` emits `unknown` for many response fields if typia json schema lacks strictness | Spot-check generated `.d.ts` during Teammate B smoke; if too lax, add typia config to `JsonSchema<Options>` |
| RFC-R-3 | SvelteKit 2 + Tailwind 4 + Svelte 5 + Vite combination has version incompatibility | Pre-seed pins exact versions tested against Node 22 + TS 5.9; lock during scaffold |
| RFC-R-4 | Playwright install bloats CI install time | Use `playwright install chromium` (single browser); add to install-only when `RUN_E2E=1` |
| RFC-R-5 | First `pnpm generate:openapi` requires backend running — chicken-and-egg in fresh CI | Commit a snapshot of `openapi-schema.d.ts` so `pnpm install` + `pnpm build` work offline; `generate:openapi` only re-runs when developer wants to refresh |

## Related Artifacts

| Artifact | Relation |
|---|---|
| PRD-015 | refines — Wave 9 strategy detail |
| SPEC-019 | informs — OpenAPI contract shape this strategy emits |
| ADR-014 | informs — framework choice this strategy implements |
| EVID-029 | informs — audit gaps that motivated Wave 9 |
| EVID-031 (next) | informs — Wave 9 ship evidence
| PRD-016 (next) | informs — Wave 10 deferred scope


