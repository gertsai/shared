# @gertsai-examples/m9s-example-web

SvelteKit 2 + Svelte 5 (runes) + Tailwind v4 + `openapi-fetch` frontend for
the **m9s-example** RAG reference application. Wave 9 ships an end-to-end
type-safe full-stack pattern: the backend emits OpenAPI 3.1, the api-types
package snapshots it into a `.d.ts`, and this app consumes `paths` directly
via `openapi-fetch`.

## Prereqs

| Tool | Min version | Notes |
|---|---|---|
| Node.js | 22 LTS | matches `engines.node` in root `package.json` |
| pnpm | 10.x | matches the workspace lockfile generator |
| Backend | running on `:3031` | `pnpm --filter @gertsai-examples/m9s-example dev` |

The backend has permissive CORS in dev (moleculer-web defaults) — no extra
flags required. For the real infra stack (Postgres + pgvector + OpenFGA +
Redis + Ollama + NATS) see
[`../m9s-example/README.md#production-setup`](../m9s-example/README.md#production-setup).
Mock fallbacks let you boot the backend with `STORAGE_PROVIDER=memory` and
`AUTH_GATE=allow-all` when iterating on the UI without Docker.

## Run

```bash
cp .env.example .env       # one-time
pnpm install               # from repo root
pnpm dev                   # → http://localhost:5173
```

## Architecture

- **SvelteKit 2 with Svelte 5 runes** — `$state`, `$derived`, `$effect`
  replace stores for component-local state; server load + form actions
  keep network logic on the server. See
  [ADR-014](../../.forgeplan/adrs/ADR-014-sveltekit-2-openapi-fetch-as-the-full-stack-reference-pattern-for-gertsai-example-applications.md)
  for the framework choice rationale.
- **`openapi-fetch`** with `paths` imported from
  `@gertsai-examples/m9s-example-api-types`. The shared
  [`src/lib/api/client.ts`](./src/lib/api/client.ts) injects
  `X-Tenant-ID: ${PUBLIC_TENANT_ID}` on every outbound request and sets
  `content-type: application/json` defaults.
- **Tailwind v4** via the `@tailwindcss/vite` plugin (no PostCSS config
  file — v4 ships a first-party Vite plugin). Tokens live in `src/app.css`.
- **`@sveltejs/adapter-node`** for production builds — emits a standalone
  Node server suitable for any container runtime.

## Route map

| Path | Purpose | Backend action |
|---|---|---|
| `/` | Home — 3 stat cards (docs / chunks / last search) | none (static) |
| `/ingest` | Form action POSTing a document for chunking + embedding | `api.v1.ingest.document` |
| `/search` | Form action POSTing a top-K query | `api.v1.search.query` |
| `/docs` | Static list of demo documents (links into `/ingest`) | none |

## Type-safety story

The contract flows in one direction only:

```
backend action signatures (typia + api-core)
        │
        ▼  GET /openapi/schema.json   (runtime endpoint)
        ▼
@gertsai-examples/m9s-example-api-types
  └── pnpm generate:openapi
        │
        ▼  openapi-typescript → src/generated/paths.d.ts (checked in)
        ▼
@gertsai-examples/m9s-example-web
  └── openapi-fetch<paths>            (compile-time autocomplete + body types)
```

Any backend action signature change becomes a TS error in the frontend
after `pnpm --filter @gertsai-examples/m9s-example-api-types generate:openapi`.

## Tailwind v4 notes

- The plugin is loaded as `@tailwindcss/vite` (Vite 5+ requirement).
- Theme tokens live in `src/app.css` via `@theme` blocks — no
  `tailwind.config.{js,ts}` file. Migrating from v3? See the upstream
  [v4 migration guide](https://tailwindcss.com/docs/v4-beta).
- Class-name extraction is automatic from `.svelte` + `.html` sources; no
  `content` array needed.

## E2E tests (Playwright)

E2E is opt-in (off by default) to keep CI fast:

```bash
pnpm test:e2e:install      # one-time — installs chromium
RUN_E2E=1 pnpm test:e2e    # runs the suite against `pnpm dev`
```

The suite spins up the dev server, navigates `/ingest` → `/search` → `/docs`,
and asserts contract correctness on each form-action round trip. Tests live
in [`./e2e/`](./e2e/) and skip when `RUN_E2E` is unset.

## Wave 10 deferred

Out-of-scope for Wave 9 — tracked in
[PRD-016](../../.forgeplan/prds/PRD-016-wave-10-production-grade-web-ui-auth-ui-cms-file-upload-sse-i18n-storybook-error-ui.md):
auth UI flow, CMS/admin views, file upload, SSE streaming, i18n,
Storybook, production-grade error UI, tenant switcher.

## License

Apache-2.0. Same as the rest of the `gertsai/shared` monorepo.
