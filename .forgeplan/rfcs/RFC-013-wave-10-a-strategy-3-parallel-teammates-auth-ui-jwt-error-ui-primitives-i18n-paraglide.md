---
depth: standard
id: RFC-013
kind: rfc
last_modified_at: 2026-05-13T23:32:38.132240+00:00
last_modified_by: claude-code/2.1.139
links:
- target: PRD-018
  relation: refines
status: active
title: Wave 10.A strategy — 3 parallel teammates (auth-ui-jwt / error-ui-primitives / i18n-paraglide)
---

# RFC-013: Wave 10.A strategy — 3 parallel teammates with disjoint slice ownership

## Summary

PRD-018 ships 3 foundation web UI slices via AgentsTeam pattern: team-lead pre-seeds deps + `hooks.server.ts` skeleton, then 3 parallel `general-purpose` teammates own disjoint files. Standard depth (PRD+RFC+EVID) — sub-waves of Wave 10 series.

## Motivation

PRD-018 specifies WHAT. RFC-013 specifies HOW: file ownership map, pre-seed contents, per-teammate prompt contracts.

## Goals

- **RG-1** — Single-wave 3-teammate parallel execution after pre-seed
- **RG-2** — Disjoint files; one teammate per slice with clear contracts
- **RG-3** — `hooks.server.ts` shared seam handled via pre-seed skeleton with explicit slot markers
- **RG-4** — Strict floor preserved

## Non-Goals (handled in Wave 10.B/10.C/Wave 11)

- File upload, SSE, CMS (10.B)
- Storybook (10.C)
- Real user DB / OAuth / MFA (Wave 11)

## Options Considered

### Option A — 3 teammates parallel (CHOSEN)

Pros: proven Wave 7-9 pattern; each slice ~300 LOC fits AgentsTeam ceiling. Cons: hooks.server.ts is shared (mitigated via slot markers).

### Option B — Sequential A→B→C (auth, error, i18n in series)

Pros: no shared-file conflicts. Cons: 3× wall-clock; loses parallelism.

### Option C — Single mega-teammate

Cons: 900 LOC exceeds AgentsTeam minimum quality envelope.

**Decision**: Option A.

## Proposed Direction

### Phase 0 — Pre-seed (team-lead, ~30 min)

1. Install runtime deps:
   - `jsonwebtoken` + `@types/jsonwebtoken` in `examples/m9s-example/package.json`
   - `@inlang/paraglide-js` + `@inlang/paraglide-js-adapter-sveltekit` in `examples/m9s-example-web/package.json`
2. Pre-seed `examples/m9s-example-web/src/hooks.server.ts` with slot skeleton:
   ```ts
   // hooks.server.ts — Wave 10.A composition of 3 slot handlers:
   //   1. localeHandler  (i18n teammate)
   //   2. authHandler    (auth-ui teammate)
   //   3. errorHandler   (error-ui teammate)
   // Each teammate owns their slot file; this file composes via `sequence(...)`.
   import { sequence } from '@sveltejs/kit/hooks';
   import { localeHandler } from './hooks/locale';
   import { authHandler } from './hooks/auth';
   import { errorHandler } from './hooks/error';
   export const handle = sequence(localeHandler, authHandler, errorHandler);
   ```
3. Create empty stubs: `src/hooks/{locale,auth,error}.ts` exporting no-op `handle: Handle = ({ event, resolve }) => resolve(event);`. Each teammate fills its own.
4. Create `src/lib/server/jwt.ts` placeholder (auth teammate owns).
5. Pre-seed `.env.example` additions: `JWT_SECRET`, `PUBLIC_TENANT_ID`.
6. `pnpm install` + verify `pnpm dev` (web) still works with pre-seed.

### Phase 1 — 3 parallel teammates (~60 min wall-clock)

#### File ownership map

| Teammate | Owned files | LOC |
|---|---|---|
| **A: `m9s-auth-ui-jwt`** | NEW: `examples/m9s-example/src/services/auth/` (service + 3 actions: login/logout/refresh + types + index barrel + lifecycle); `examples/m9s-example-web/src/lib/server/jwt.ts` (verify helper); `examples/m9s-example-web/src/hooks/auth.ts` (slot); `examples/m9s-example-web/src/routes/login/+page.{svelte,server.ts}`; `examples/m9s-example-web/src/routes/logout/+page.server.ts`. MODIFY: `examples/m9s-example-web/src/lib/api/client.ts` (refresh middleware). | ~400 |
| **B: `m9s-error-ui-primitives`** | NEW: `examples/m9s-example-web/src/lib/components/{Skeleton,OfflineBanner,ErrorBoundary}.svelte`; `examples/m9s-example-web/src/lib/stores/offline.ts`; `examples/m9s-example-web/src/routes/+error.svelte` + 4 per-route variants (`ingest`, `search`, `docs`, `login`); `examples/m9s-example-web/src/hooks/error.ts` (slot). MODIFY: existing `Toast.svelte` add 3 missing variants (info/warning/loading). | ~300 |
| **C: `m9s-i18n-paraglide`** | NEW: `examples/m9s-example-web/messages/{en,ru}.json`; `examples/m9s-example-web/project.inlang/settings.json`; `examples/m9s-example-web/src/hooks/locale.ts` (slot — negotiation + sets event.locals.locale); `examples/m9s-example-web/src/lib/i18n.ts` (re-export paraglide runtime). MODIFY: existing route `.svelte` files (`/`, `/ingest`, `/search`, `/docs`) to use `m()` tagged strings (NOT new routes — those belong to teammate A). VITE config: add paraglide plugin to `vite.config.ts`. | ~250 src + 80 msg JSON |

**Conflict notes**:
- Teammate A creates NEW `/login` + `/logout` routes. Teammate C does NOT touch them.
- Teammate C modifies existing Wave 9 routes for `m()` tagging. Teammate A and B do NOT touch those routes.
- Pre-seed `hooks.server.ts` is read-only after team-lead writes it. Each teammate writes its own `hooks/*.ts` file.
- `vite.config.ts` is touched only by Teammate C (paraglide plugin).

### Per-teammate prompts (compact)

**Teammate A** — Auth UI flow + backend auth endpoints. JWT HS256 via `jsonwebtoken`. Demo accepts any email/password, returns fixed JWT with `sub`/`exp`/`tenantId`. SvelteKit form action POSTs to backend; sets httpOnly cookie on success; redirects to `/`. Hooks.server `auth` slot reads cookie, populates `event.locals.user`, redirects to `/login` for protected paths (anything except `/login`, `/api/`, paraglide assets). openapi-fetch middleware: decode JWT exp, refresh 60s before; intercept 401 once, retry. Per-test config: backend uses `JWT_SECRET` env, default 'demo-secret-do-not-use-in-prod'.

**Teammate B** — Production error UI primitives. `Skeleton.svelte` (animate-pulse gray boxes with configurable height + count). `OfflineBanner.svelte` (top bar with `navigator.onLine` listener via `$effect`). `ErrorBoundary.svelte` (wraps children, displays error UI + retry CTA). Toast.svelte: add `info|warning|loading` variants alongside existing `success|error`. `+error.svelte` per route: catches errors thrown by load functions / form actions, shows ErrorBoundary with retry. `hooks/error.ts` slot: catches uncaught errors in `handleError` hook (logs + returns user-safe message). 1 playwright test: simulate offline via `await context.setOffline(true)` and assert banner appears.

**Teammate C** — i18n via paraglide-js. Install `@inlang/paraglide-js-adapter-sveltekit`. `project.inlang/settings.json`: 2 locales en/ru. `messages/en.json` + `messages/ru.json` with all UI strings (~30 keys). `src/hooks/locale.ts`: negotiate locale (cookie `lang` > Accept-Language > 'en'); set `event.locals.locale`; pass through. `src/lib/i18n.ts`: re-export paraglide runtime (`setLanguageTag`, `availableLanguageTags`). vite.config.ts: add paraglide plugin. Modify Wave 9 routes (`/`, `/ingest`, `/search`, `/docs`) to import paraglide messages module + replace hardcoded strings with `m.welcome_title()` etc. tags. No new routes.

### Phase 2 — Smoke (~20 min)

```bash
pnpm install
pnpm --filter @gertsai-examples/m9s-example exec tspc --noEmit
pnpm --filter @gertsai-examples/m9s-example test
pnpm --filter @gertsai-examples/m9s-example-web check
pnpm --filter @gertsai-examples/m9s-example-web build
pnpm lint

# Live smoke
pnpm --filter @gertsai-examples/m9s-example dev &  # backend :3031
sleep 8
pnpm --filter @gertsai-examples/m9s-example-web dev &  # web :5173
sleep 5
curl -sf -X POST http://localhost:3031/api/v1/auth/login -H 'content-type: application/json' \
  -d '{"email":"demo@example.com","password":"demo"}' | jq '.token'  # JWT returned
curl -sf -H 'Accept-Language: ru' http://localhost:5173/ -o /tmp/ru.html  # Russian text
pkill -f vite; pkill -f ts-node-dev
```

### Phase 3 — EVID + activate + ship

EVID-033 with Structured Fields + smoke results + e2e flow attestation. `forgeplan_activate` PRD-018 + RFC-013 + EVID-033. 2 commits (feat + docs). PR to main.

## Invariants

- I-1: Wave 9 routes (`/`, `/ingest`, `/search`, `/docs`) continue to render
- I-2: 71/71 backend tests pass (Wave 9.0.1 baseline)
- I-3: `@gertsai/*` package source untouched
- I-4: ESLint workspace ignores already cover SvelteKit build artifacts
- I-5: Hooks.server.ts composition order preserved (locale → auth → error)
- I-6: No new dep beyond jsonwebtoken + paraglide

## Risks (delta vs PRD)

| ID | Risk | Mitigation |
|---|---|---|
| RFC-R-1 | paraglide-js adapter requires SvelteKit 2+ — verified | Already on SvelteKit 2 |
| RFC-R-2 | JWT decode on client side leaks `JWT_SECRET` | NO — client only decodes (no verification); verification happens server-side in hooks |
| RFC-R-3 | Teammate C touches Wave 9 routes that Wave 8.x has stable | All 71 tests must still pass; svelte-check 0 errors guard |
| RFC-R-4 | Pre-seed `sequence()` hook fails if any slot file is empty | Pre-seed creates passthrough no-op handlers; teammates only replace bodies, never rename |

## Related Artifacts

| Artifact | Relation |
|---|---|
| PRD-018 | refines |
| PRD-016 | based_on — Wave 10 deferred stub |
| EVID-033 (next) | informs



