---
depth: standard
id: ADR-014
kind: adr
last_modified_at: 2026-05-13T21:55:35.933289+00:00
last_modified_by: claude-code/2.1.139
links:
- target: RFC-011
  relation: informs
status: active
title: SvelteKit 2 + openapi-fetch as the full-stack reference pattern for @gertsai/* example applications
---

# ADR-014: SvelteKit 2 + openapi-fetch as the full-stack reference pattern for @gertsai/* example applications

## Status

Proposed — pending PRD-015 / RFC-011 / EVID-031 activation. Once active, this ADR is the canonical justification for SvelteKit appearing in `examples/m9s-example-web/` and (by precedent) any future `examples/*-web/` packages.

## Context

m9s-example is the canonical reference application for `@gertsai/*` adopters. After Wave 8.x closure, it is a credible backend-only demo. The Wave 8.2 audit + post-audit review (EVID-029) flagged that:

- `/openapi` endpoint is a hardcoded placeholder, blocking type-safe external consumption
- No frontend application exists — adopters cannot see "how do I build a UI on top of this"

Pipeline (`apps/pipeline` in upstream `gertsai_codex`) solves both: it emits a live OpenAPI 3.1 spec via `typia.json.schema<OpenApiMapper<...>>()`, and `apps/webapp/` consumes it via `openapi-fetch`. We can mirror that pattern; the question is **which frontend framework to use in m9s-example-web**.

The choice is partially irreversible: once a framework lands in a reference application, downstream adopters copy it. Switching later requires deprecating the old reference and orphaning users who built on top. This ADR captures the decision so a future reader (6 months out, evaluating the choice retrospectively) understands the trade-off space.

## Decision

**Use SvelteKit 2 (Svelte 5 runes) + `openapi-fetch` for `examples/m9s-example-web/`.**

Sibling monorepo layout: `examples/m9s-example-api-types/` and `examples/m9s-example-web/` as workspace siblings to `examples/m9s-example/`. Wired through root `pnpm-workspace.yaml`.

`openapi-fetch` (not `orval`, not `tRPC`) for the typed client — mirrors pipeline `apps/webapp/src/shared/api/client.ts:16-22` pattern verbatim.

## Considered Alternatives

| Framework | Bundle (gzip) | DX | OpenAPI ergonomics | SSR | Real-time | Reference value 2026 |
|---|---|---|---|---|---|---|
| **SvelteKit 2** | ~15 KB | ★★★★★ | openapi-fetch + `paths` | SSR + form actions | SSE / WS stores | ★★★★★ |
| Astro 5 + Svelte islands | ~10 KB static / +islands | ★★★★ | Same | Server islands | islands ≠ interactive-first | ★★★ |
| Solid Start 1.0 | ~12 KB | ★★★★ | Same | SSR + resources | signals | ★★★ |
| Qwik City | ~5 KB (resumable) | ★★★ (steep) | Same | Resumable SSR | tasks signals | ★★ (foundation funding ended Q4 2025) |
| Next.js 16 (RSC) | ~70 KB+ | ★★★★ | openapi-fetch OR tRPC OR auto-RPC; pick one | RSC + Server Actions | server actions + SSE | ★★★ (explicitly excluded by user) |
| Nuxt 4 | ~30 KB | ★★★★ | Same | SSR + nitro | useFetch + ws | ★★ (Vue declining for new ref apps) |
| TanStack Start | ~15 KB | ★★★★ | Built for `@tanstack/router` typed routes | SSR | ws | ★★ (beta, not stable for refs) |

### Why SvelteKit 2 wins

1. **Smallest interactive bundle**. ~15 KB runtime; no virtual DOM; reactive compilation produces lean output. Critical for a *reference* — adopters see "look at this perf" and copy it.

2. **Form actions native**. `<form method="POST" action="?/ingest">` requires zero extra libraries. Maps 1-to-1 onto m9s-example's REST POST workflows. Pipeline's `apps/webapp` does the same via hand-written hooks; SvelteKit makes it idiomatic.

3. **Server load functions** with end-to-end type safety. `+page.server.ts` imports `openapi-fetch` client + `paths` type from `@gertsai-examples/m9s-example-api-types` — backend action signature change surfaces as TS error in frontend route. No runtime "what shape is this response" guessing.

4. **`openapi-fetch` first-class fit**. Pipeline already proved this pattern in production (gertsai_codex `apps/webapp/src/shared/api/client.ts`). Verbatim port works.

5. **DX trend 2026**. Svelte 5 runes (`$state`, `$derived`, `$effect`) — the most modern reactive model among the candidates. Community growth outpacing Solid/Qwik per npm download trends 2025-2026.

6. **Demo value**. Adopters see SvelteKit and think "I can copy this and ship next week." Astro feels static-doc; Next feels enterprise-bloat; SvelteKit feels purpose-built for SaaS.

### Why NOT Astro 5

Static-first. m9s-example ingest/search workflows are interactive (forms POST, results refresh on query change). Astro shines when 80% of content is pre-rendered (marketing sites, docs, blogs). Here 80% is `POST`/`PATCH` interactivity. Wrong tool.

### Why NOT Solid Start

Excellent fine-grained reactivity, but ecosystem is ~3-5x smaller than Svelte's. Adopters less likely to know Solid; steeper onboarding. Not a deal-breaker, but loses on **reference value** dimension.

### Why NOT Qwik City

Resumability is a genuine innovation, but the Builder.io Qwik foundation funding ended Q4 2025; community momentum stalled per GitHub activity in 2026. Risky to anchor a reference application on a framework with uncertain stewardship.

### Why NOT TanStack Start

Promising — type-safe routes, excellent integration with TanStack Query — but beta as of mid-2026. Not stable enough for a reference. Re-evaluate post-1.0 (likely Wave 12+).

### Why NOT Next.js 16 (RSC)

User explicitly excluded React/Next from the candidate set during framework discussion. Setting aside personal preference: RSC is a powerful primitive but ecosystem fragmentation around RSC vs Server Actions vs Pages Router creates ambiguity that distracts from the `@gertsai/*` story.

## Why `openapi-fetch` (not orval / tRPC / Hono RPC)

| Client | Pros | Cons | Decision |
|---|---|---|---|
| **openapi-fetch** | ~6 KB; works with any OpenAPI spec; pipeline-proven; framework-agnostic | Manual fetch syntax — no auto-generated hooks | ✅ Chosen |
| orval | Generates React Query / SWR / fetch hooks per route | Heavier; framework-specific (React-flavored); extra build step | ❌ — SvelteKit doesn't need React hooks |
| tRPC | End-to-end TS without OpenAPI | Loses REST contract; tightly couples backend + frontend type chain; breaks if backend wants a non-TS client | ❌ — m9s-example demonstrates REST/Moleculer, can't bypass OpenAPI |
| Hono RPC | End-to-end TS; very fast | Requires Hono backend; m9s-example uses Moleculer | ❌ — wrong backend |

`openapi-fetch` matches pipeline pattern exactly and preserves the REST/OpenAPI contract that makes m9s-example accessible to non-TS consumers.

## Why sibling monorepo layout (not nested, not split repo)

Three options considered:

1. **`examples/m9s-example-web/` sibling** (CHOSEN). Backend (`examples/m9s-example/`) and frontend live next to each other as workspace packages. Clean separation; each has its own `package.json`, build, tests. Both ship together as the m9s-example demo.

2. `examples/m9s-example/web/` nested. Frontend inside the backend package. Simpler folder structure but unusual; workspace tooling (`pnpm --filter`, `moon`) doesn't see it as a separate unit; CI gates can't run selectively.

3. `examples/m9s-example/{backend,web}/` rename. Restructures the existing `examples/m9s-example/` into two sub-folders. Maximal disruption to git history; the existing path is referenced from CLAUDE.md, audit evidence, KNOWN-ISSUES.

Sibling layout (1) gives clean separation with minimal disruption to existing references. Same pattern as pipeline (`apps/pipeline` + `apps/webapp`).

## Why a separate `m9s-example-api-types` package (not inlined in web)

Two-package split (`api-types` + `web`) over single-package alternatives:

- **Caching**: `m9s-example-api-types` rebuilds only when backend OpenAPI spec changes. Web app builds without re-running OpenAPI generation if types unchanged.
- **External consumers**: A future hypothetical `examples/m9s-example-mobile/` or `examples/m9s-example-cli/` can import `paths` from `api-types` without depending on SvelteKit.
- **Mirror of pipeline pattern**: `gertsai_codex/packages/api-types` is a standalone package. Adopters copying the pattern get the same shape.

Trade-off: one extra package boundary. Acceptable.

## Consequences

### Positive

- Reference application now covers end-to-end "Moleculer action → typia → OpenAPI → openapi-fetch → SvelteKit page" — closes EVID-029 audit gap on OpenAPI + frontend
- SaaS-template positioning is credible — adopters see a complete product, not just a backend
- Pipeline pattern parity strengthens the `@gertsai/*` cross-repo cohesion narrative
- Type safety from backend action signature → frontend page server load function, verifiable via `pnpm typecheck`

### Negative

- **Lock-in**: Framework choice is sticky. If SvelteKit ecosystem stalls (low probability per 2026 trends), migrating the reference is a multi-week effort.
- **Maintenance surface**: 3 packages instead of 1 (backend + api-types + web). CI gates must build and test all three. Reference application becomes more demanding to keep green.
- **New deps**: ~10 new npm dependencies for the web package (svelte, sveltekit, vite, tailwind, openapi-fetch, openapi-typescript, …). Wider attack surface for supply-chain audit.

### Neutral

- Tailwind v4 is the latest stable as of 2026; reasonable choice but not load-bearing. Future maintainers may swap for vanilla CSS or another framework without breaking the rest of the architecture.
- e2e tests via Playwright; could equally use Cypress. Playwright chosen for first-class SvelteKit support.

## Compliance / Rollback

- If a future audit determines SvelteKit no longer aligns with project goals (e.g. ecosystem collapse, security incident, downstream adopter pushback), supersede this ADR with a new one (`ADR-XXX — supersedes ADR-014`) that documents the migration target and adoption timeline.
- Rollback for Wave 9 specifically: single `git revert` of merge commit removes both new packages. Backend `examples/m9s-example/` returns to its pre-Wave-9 state (only Wave 9 addition there is `createOpenApiService` registration in `src/index.ts`, ~30 LOC).
- Adopter migration burden: minimal — anyone consuming `paths` from `@gertsai-examples/m9s-example-api-types` would also need to migrate. But this is a reference application; consumers are expected to fork, not consume the npm package directly.

## Related Artifacts

| Artifact | Relation |
|---|---|
| PRD-015 | informs — Wave 9 scope this ADR records the framework choice for |
| RFC-011 | informs — implementation strategy that depends on this choice |
| ADR-011 (local, Sprint 3.11) | informs — m9s-example production-grade baseline this ADR extends |
| EVID-029 | informs — Wave 8.2 audit feature coverage gaps that motivated this work |
| ADR-013 (Wave 7.2) | informs — tri-state capability pattern (general DRY example of additive ADR cadence) |

## Decision date

2026-05-13 (draft). To be activated alongside PRD-015 / SPEC-019 / RFC-011 / EVID-031 after Wave 9 ships.



