---
depth: standard
id: PRD-015
kind: prd
last_modified_at: 2026-05-13T21:54:19.897589+00:00
last_modified_by: claude-code/2.1.139
links:
- target: EVID-029
  relation: informs
status: active
title: 'Wave 9 — full-stack reference: auto-OpenAPI emission + api-types pkg + SvelteKit web'
---

# PRD-015: Wave 9 — full-stack reference (auto-OpenAPI + api-types + SvelteKit web)

## Problem Statement

The Wave 8.2 multi-expert audit (EVID-029) and the post-Wave-8.3 feature-coverage review surfaced two gaps that block m9s-example from being a credible full-stack reference for downstream `@gertsai/*` adopters:

1. **OpenAPI schema generation is a placeholder.** `/openapi` endpoint returns a hardcoded shell, not an auto-generated OpenAPI 3.x spec derived from action types. Pipeline (`apps/pipeline` in upstream `gertsai_codex`) emits a live `/openapi/schema.json` via `typia.json.schema<OpenApiMapper<...>>()` + `generateOpenAPISchema()` + `createOpenApiService()`. m9s-example does not. Consequence: there is no way to drive a typed external client from the example.

2. **No frontend application.** Adopters opening m9s-example see Moleculer actions, BullMQ workers, OpenFGA gates — but no end-user surface. They cannot answer "how do I render an ingest form? how do I show search results? how does the frontend get types?" without leaving the example. Pipeline has `apps/webapp/` consuming `@gerts/api-types` via `openapi-fetch`; m9s-example has nothing equivalent.

Together these gaps make m9s-example a backend-only demo rather than the SaaS template the project markets it as.

## Target Audience

| Persona | Pain before Wave 9 |
|---|---|
| New `@gertsai/*` adopter (full-stack engineer) | Sees backend hex pattern but cannot copy a complete app — has to invent frontend integration from scratch |
| Product owner evaluating `@gertsai/*` for a new SaaS | "What does the end product look like?" — no answer from existing repo |
| External developer consuming m9s-example API | No typed client; has to read action source code + write fetch by hand |
| Audit reviewer | Backend-only example fails feature-coverage check (OpenAPI 🟡, frontend ❌); two known gaps remain after Wave 8.x closure |

## Goals

1. **G-1 — Auto-generated OpenAPI 3.1 spec**: `GET /openapi/schema.json` returns a live OpenAPI document derived from registered action types via `typia.json.schema<OpenApiMapper<ApiEndpointsGenerator<typeof ApiEndpoints>>, '3.1'>()`. Measured by: HTTP smoke against running m9s returns 200 + valid `application/json` with `openapi: '3.1.0'` field + paths array containing at minimum `/api/v1/ingest/document` and `/api/v1/search/query`. Closes EVID-029 §9 partial coverage.

2. **G-2 — `examples/m9s-example-api-types/` workspace package**: new package emitting `paths` type from generated `openapi-schema.d.ts`. Build script `generate-openapi-contract.mjs` fetches live spec from `http://localhost:3031/openapi/schema.json`, runs `openapi-typescript` → emits `src/generated/openapi-schema.d.ts` + `src/generated/openapi.json`. Public exports: `paths` type. Measured by: `pnpm --filter @gertsai-examples/m9s-example-api-types build` exits 0 with non-empty `dist/`.

3. **G-3 — `examples/m9s-example-web/` SvelteKit 2 app**: new workspace package with 4 routes (`/`, `/ingest`, `/search`, `/docs`) using SvelteKit form actions + server load + `openapi-fetch` client typed via `paths` from G-2. Measured by: `pnpm --filter @gertsai-examples/m9s-example-web dev` exits 0 (background) + curl http://localhost:5173 returns 200 + page renders.

4. **G-4 — End-to-end demo flow**: from a fresh `docker compose up -d` + `pnpm dev` (backend) + `pnpm --filter ...-web dev`, a user can: (a) open http://localhost:5173/ingest, fill `text` + `docId`, submit form → document persisted in Postgres; (b) open /search, type query → results visible via real Ollama embedding cosine search. Measured by: 1 playwright e2e test runs through this path successfully.

5. **G-5 — Sibling monorepo layout**: `examples/m9s-example-api-types/` and `examples/m9s-example-web/` are workspace siblings to `examples/m9s-example/`. Wired into root `pnpm-workspace.yaml` + `.moon/workspace.yml`. Measured by: `pnpm install` from root resolves both new packages.

6. **G-6 — No `@gertsai/*` package source modification**: Wave 9 is application-only. All package sources unchanged. Measured by: `git diff main..HEAD packages/` returns 0 lines.

7. **G-7 — Strict floor preserved**: All new TypeScript code passes `tspc --noEmit` with EOPT + noUncheckedIndexedAccess. Workspace `pnpm lint` exits 0. Measured by: CI gates green.

## Functional Requirements

- **FR-1** — `examples/m9s-example/src/index.ts` instantiates `createOpenApiService({ schema: typia.json.schema<OpenApiMapper<ApiEndpointsGenerator<typeof ApiEndpoints>>, '3.1'>(), servers: [{url: serverUrl}], info: {title: 'm9s-example', version: APP_VERSION} })` and passes it to `ApiController.Start({ services: [..., openApiService] })`. Available as `GET /openapi/schema.json` and (optionally) `GET /openapi/ui` (Swagger UI).
- **FR-2** — Registered actions in `services/ingest/src/actions/ingest-document.action.ts` and `services/search/src/actions/search-query.action.ts` define `params` + `response` typia validators. (Already done in Wave 5; verify no regression.)
- **FR-3** — `examples/m9s-example-api-types/` exists as a workspace package with `package.json`, `tsconfig.json`, `src/index.ts` (barrel) + `src/generated/openapi-schema.d.ts` (generated) + `scripts/generate-openapi-contract.mjs` (build script) + `pnpm generate:openapi` script.
- **FR-4** — `generate-openapi-contract.mjs` fetches `http://localhost:3031/openapi/schema.json` (configurable via `OPENAPI_FETCH_URL` env), runs `openapi-typescript` v7+ → outputs `src/generated/openapi-schema.d.ts`. Idempotent — re-running overwrites previous output. Validates that `paths` is non-empty.
- **FR-5** — `examples/m9s-example-web/` exists as a workspace package with `@sveltejs/kit ^2.x` + `svelte ^5.x` + `@sveltejs/adapter-node ^5.x` + `openapi-fetch ^0.13+` + `tailwindcss ^4.x` + `typescript ^5.9`. `pnpm dev` runs vite dev server on port 5173.
- **FR-6** — `examples/m9s-example-web/src/routes/` contains: `+layout.svelte` (nav header), `+page.svelte` (home with 3 stat cards), `ingest/+page.svelte` (form), `ingest/+page.server.ts` (form action → `api.POST('/api/v1/ingest/document')`), `search/+page.svelte` (results), `search/+page.server.ts` (server load → `api.POST('/api/v1/search/query')`), `docs/+page.svelte` (list).
- **FR-7** — `examples/m9s-example-web/src/lib/api/client.ts` exports `api = createClient<paths>({ baseUrl })` where `paths` is imported from `@gertsai-examples/m9s-example-api-types`. `baseUrl` reads from env (default `http://localhost:3031`).
- **FR-8** — Tailwind v4 configured via vite plugin; basic design tokens applied to nav + cards + buttons (not a full design system — just enough for credibility).
- **FR-9** — 1 playwright e2e test in `examples/m9s-example-web/e2e/ingest-search.spec.ts` exercises ingest → search round-trip. Skipped by default unless `RUN_E2E=1`.
- **FR-10** — All quality gates green: `pnpm typecheck && pnpm test && pnpm build && pnpm lint && pnpm --filter @gertsai-examples/m9s-example-web build`.

## Non-Functional Requirements

| ID | Category | Constraint | Measurement |
|---|---|---|---|
| NFR-1 | Reversibility | Single `git revert` of merge commit removes all 3 packages cleanly. No `@gertsai/*` package source touched. | Manual revert smoke |
| NFR-2 | Compat | All 62 existing m9s-example tests pass unchanged. `pnpm dev` backend still works. | Test exit 0 |
| NFR-3 | Bundle | SvelteKit web prod build < 200KB total (gzipped initial route bundle). | `du -sh build/client/_app/immutable/` |
| NFR-4 | DX | `pnpm install && pnpm generate:openapi && pnpm dev:all` (composite script) brings up backend + web with no manual config beyond `.env`. | Manual smoke |
| NFR-5 | Type safety end-to-end | Backend action signature change surfaces as TS error in frontend after `pnpm generate:openapi`. | Manual smoke (regress test) |
| NFR-6 | New deps | sveltekit + svelte + vite + adapter-node + openapi-fetch + openapi-typescript + tailwind + a few peer deps = ~10 new runtime + dev deps. All from npm public registry. | `package.json` diff |
| NFR-7 | LOC budget | Production code delta ≤ 1300 LOC across 3 packages. Test delta ≤ 100 LOC. Markdown delta ≤ 150 LOC. | `git diff --stat` |
| NFR-8 | Strict floor | EOPT + noUncheckedIndexedAccess preserved for all new TS. ESLint boundaries pass for new directories. | CI gates |

## Out of Scope (deferred to Wave 10 — see PRD-016)

The following will explicitly NOT ship in Wave 9. They land as Wave 10 follow-up sprint:

- **Auth UI flow** (logged-in/logged-out pages, JWT refresh, /login form) — Wave 9 ships allow-all gate only
- **Multi-page CMS / admin** (settings, tenant switcher, user management)
- **File upload** (only text-pasted ingest in Wave 9; no PDF/DOCX/image)
- **Streaming responses** (SSE for search results; channels-driven live updates)
- **i18n** (English-only in Wave 9)
- **Storybook / design system showcase** (Tailwind primitives only)
- **Production-grade error UI** (only basic toasts; no skeletons, retries, offline banners)
- **Real-time channels integration on frontend** (no `EventSource` consumer)
- **Tenant switcher in UI** (X-Tenant-ID hardcoded to `tenant-acme` from .env)
- **OAuth providers** (no Google/GitHub login)

## Risks & Mitigations

| ID | Risk | Probability | Impact | Mitigation |
|---|---|---|---|---|
| R-1 | `typia.json.schema<OpenApiMapper<...>>()` requires upstream `@gertsai/api-types` infrastructure not yet present in shared monorepo | High | High | Investigate during Phase 0 recon: does `@gertsai/api-core/contracts` expose `OpenApiMapper` / `ApiEndpointsGenerator` types? If not, downgrade scope to manual OpenAPI emission (~150 LOC less polished but functional) OR vendor minimal helpers from upstream gertsai_codex |
| R-2 | SvelteKit 2 + Svelte 5 + Tailwind 4 toolchain mismatch with monorepo Node 22 / TS 5.9 | Medium | Medium | Use proven version matrix: SvelteKit 2.5+, Svelte 5.0+, Tailwind 4.0+, Node 22.x — all stable as of 2026. Lock versions in package.json |
| R-3 | `tspc` (typia transformer) breaks under SvelteKit's Vite-driven build | Low | High | SvelteKit web does NOT use tspc — it uses standard vite + svelte-vite plugin. Only m9s-example backend uses tspc. Boundaries isolated |
| R-4 | `openapi-fetch` doesn't preserve typia branded types over the wire | Medium | Low | typia branded types serialize as plain strings/numbers; `openapi-typescript` represents them as `string` in generated `.d.ts`. Acceptable for Wave 9 — branded typing is internal to backend |
| R-5 | New monorepo packages break root `pnpm typecheck` / `pnpm lint` due to forgotten tsconfig include / depcruise rules | Medium | Medium | Add minimal `tsconfig.json` + `.dependency-cruiser.cjs` exception for SvelteKit (Vite-driven, not part of tspc graph) per-package |
| R-6 | Port conflict — backend 3031 (.env), web 5173 (vite default) | Low | Low | Document in .env.example + web vite.config.ts |
| R-7 | Auto-OpenAPI emission generates over-permissive `additionalProperties: true` for action params and breaks downstream client | Medium | Medium | Configure typia json schema with `strict: true` mode; spot-check generated spec for `additionalProperties: false` on action request bodies |
| R-8 | Wave 9 PR too large for review (~1300 LOC) | High | Low | 3-commit split: feat(backend openapi), feat(api-types), feat(web). Each individually reviewable. Or 3 separate PRs in stack if requested |

## Strategy (high level — RFC-011 will detail)

**Deep depth — PRD + SPEC + RFC + ADR** as recommended by `forgeplan_route`. ADR-014 captures the irreversible framework choice (SvelteKit vs Astro vs Solid vs Qwik) so future readers understand the trade-offs.

**Single-wave AgentsTeam pattern, 4 parallel teammates after pre-seed**:

- Pre-seed (team-lead): branch + workspace yaml + package.json skeletons for 2 new packages + initial pnpm install
- Wave 1 parallel:
  - Teammate A: `m9s-openapi-emission` — backend `src/index.ts` + `createOpenApiService` wiring + verify GET /openapi/schema.json
  - Teammate B: `m9s-api-types-pkg` — package contents + generate-openapi-contract.mjs + first generation run
  - Teammate C: `m9s-sveltekit-web` — full app structure + 4 routes + client + 1 e2e test
  - Teammate D: `m9s-wave-9-docs` — root README hub + per-package READMEs + .env.example updates

**Chain branching not applicable** — Wave 9 is on fresh main after PR #14 merged.

## Related Artifacts

| Artifact | Relation |
|---|---|
| EVID-029 | informs — Wave 8.2 audit feature coverage gaps (OpenAPI partial, frontend missing) |
| PRD-013 / RFC-009 | informs — Wave 8.1 m9s-example modernization parent |
| PRD-014 / RFC-010 / EVID-030 | informs — Wave 8.3 audit-deferred closure (most recent) |
| ADR-011 (local) | informs — Sprint 3.11 m9s-example production-grade baseline preserved |
| SPEC-019 (next) | informs — OpenAPI contract shape detail |
| RFC-011 (next) | refines — Wave 9 implementation strategy |
| ADR-014 (next) | informs — SvelteKit + openapi-fetch pattern choice |
| EVID-031 (next) | informs — Wave 9 ship evidence |
| PRD-016 (next) | informs — Wave 10 deferred scope (auth UI / CMS / file upload / SSE / i18n / Storybook / error UI) |

## Affected Files

**New packages** (sibling to examples/m9s-example):
- `examples/m9s-example-api-types/` — package.json, tsconfig.json, src/index.ts, src/generated/openapi-schema.d.ts (generated), scripts/generate-openapi-contract.mjs, README.md
- `examples/m9s-example-web/` — SvelteKit 2 scaffold: package.json, svelte.config.js, vite.config.ts, src/app.html, src/app.d.ts, src/routes/{+layout.svelte, +page.svelte, ingest/+page.{svelte,server.ts}, search/+page.{svelte,server.ts}, docs/+page.svelte}, src/lib/api/client.ts, e2e/ingest-search.spec.ts, README.md, .env.example

**Modified** (existing m9s-example):
- `examples/m9s-example/src/index.ts` — add `createOpenApiService` registration (~30 LOC)
- `examples/m9s-example/package.json` — add `"dev:all": "concurrently -k 'pnpm dev' 'pnpm --filter ...-web dev'"` (or similar)
- `examples/m9s-example/.env.example` — document `WEB_BASE_URL` if needed (likely no change — backend doesn't know about web)
- `examples/m9s-example/README.md` — new "Full-stack reference (Wave 9)" section pointing to api-types + web packages

**Workspace config**:
- `pnpm-workspace.yaml` — add `'examples/m9s-example-api-types'` + `'examples/m9s-example-web'` (verify; may already be included via `examples/*` glob)
- `.moon/workspace.yml` — add project entries if needed

**Total**: 3 packages (2 new + 1 modified) · ~1230 LOC production + ~80 LOC tests + ~150 LOC markdown.

## Acceptance Gate

PRD-015 satisfied when:
1. All 7 goals (G-1..G-7) measured PASS
2. All 10 FRs verified by code review + smoke
3. All 8 NFRs spot-checked
4. EVID-031 records: (a) GET /openapi/schema.json returns valid 3.1 spec; (b) `pnpm --filter ...-api-types generate:openapi && build` exits 0; (c) `pnpm --filter ...-web dev` starts at http://localhost:5173; (d) playwright e2e test PASS; (e) `pnpm typecheck && pnpm test && pnpm build && pnpm lint` all exit 0; (f) all 62 existing m9s tests still pass.






