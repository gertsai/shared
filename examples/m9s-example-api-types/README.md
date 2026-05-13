# @gertsai-examples/m9s-example-api-types

Generated **OpenAPI 3.1** type contract for the m9s-example REST API. Ships
`paths` + `components` consumable by any TypeScript HTTP client — including
`openapi-fetch`, `openapi-zod-client`, or hand-rolled wrappers.

## Purpose

This package is the contract seam between the m9s-example backend and any
TypeScript consumer (web, mobile, server-to-server). It exists so that:

- **Frontend builds do not depend on a running backend.** The generated
  `paths.d.ts` is checked into git; consumers only need a successful
  `pnpm install`.
- **Backend signature changes propagate to consumers as TS errors.** When
  an action's request/response shape changes, re-running
  `pnpm generate:openapi` updates the snapshot and downstream typecheck
  flags every affected call site.

## Generation pipeline

```
backend action signatures (typia + @gertsai/api-core OpenAPI merge)
        │
        ▼  HTTP GET http://localhost:3031/openapi/schema.json
        ▼
scripts/generate-openapi-contract.mjs
        │  - retry 3× / 1 s back-off, 10 s per-attempt timeout
        │  - validate against SPEC-019 (7 assertions) before writing
        │
        ├──▶ src/generated/openapi.json              (raw schema, archived for diffing)
        └──▶ src/generated/openapi-schema.d.ts       (openapi-typescript output)
              │
              ▼  tsc -p tsconfig.json + cp .d.ts → dist/generated/
              ▼
              dist/                                   (consumed via package exports)
```

`generate-openapi-contract.mjs` honours `OPENAPI_FETCH_URL` env (default
`http://localhost:3031/openapi/schema.json`) and produces a deterministic
snapshot — same input always yields byte-identical output, so PRs review
cleanly.

### Seed mode (chicken-and-egg bootstrap)

Until the backend's auto-emission service is wired (Teammate A in Wave 9
Phase 1), the generator supports a `--seed` flag that emits a hand-curated
SPEC-019 fixture directly — no backend needed:

```bash
pnpm --filter @gertsai-examples/m9s-example-api-types generate:openapi -- --seed
```

The committed snapshot in `src/generated/` was produced via **seed mode**
during the Wave 9 pre-seed. Once the backend ships, anyone can re-run
without `--seed` to refresh the snapshot from the live spec.

## Usage

```ts
import createClient from 'openapi-fetch';
import type { paths } from '@gertsai-examples/m9s-example-api-types';

const api = createClient<paths>({ baseUrl: 'http://localhost:3031' });

const { data, error } = await api.POST('/api/v1/ingest/document', {
  body: { docId: 'd1', text: 'hello world' },
  headers: { 'X-Tenant-ID': 'tenant-acme' },
});
```

The full Wave 9 reference consumer lives in
[`../m9s-example-web/`](../m9s-example-web/) — see its
[`src/lib/api/client.ts`](../m9s-example-web/src/lib/api/client.ts) for a
copy-paste client setup with tenant-header middleware.

### Backend usage (runtime generator)

The backend (m9s-example) imports the runtime generator from the `/openapi`
subpath to assemble the spec at startup:

```ts
import typia from 'typia';
import { createOpenApiService } from '@gertsai/api-core/moleculer';
import { generateOpenAPISchema } from '@gertsai-examples/m9s-example-api-types/openapi';
import type {
  OpenApiMapper,
  ApiEndpointsGenerator,
} from '@gertsai-examples/m9s-example-api-types/openapi';

import * as IngestEndpoints from './services/ingest';
import * as SearchEndpoints from './services/search';

type ApiEndpoints = typeof IngestEndpoints & typeof SearchEndpoints;

const schema = typia.json.schema<
  OpenApiMapper<ApiEndpointsGenerator<ApiEndpoints>>,
  '3.1'
>();

const doc = generateOpenAPISchema({
  schema,
  servers: [{ url: `http://localhost:${config.WEB_SERVER_PORT}` }],
  info: { title: 'm9s-example', version: config.APP_VERSION },
});

await ApiController.Start({ services: [createOpenApiService(doc) /* … */] });
```

## When to re-run `pnpm generate:openapi`

Re-run whenever the backend action signature surface changes — typically:

- New action added or removed under `api.v1.*`
- Request body / response body schema edited (typia-validated DTO change)
- Path or HTTP verb change
- New / removed query or header parameter
- ProblemDetails error shape change (RFC 9457)

```bash
# In one terminal — backend up
pnpm --filter @gertsai-examples/m9s-example dev

# In another — regenerate
pnpm --filter @gertsai-examples/m9s-example-api-types generate:openapi

# Verify nothing downstream broke
pnpm --filter @gertsai-examples/m9s-example-web typecheck
```

Commit the regenerated `src/generated/openapi.json` + emitted `dist/` artefacts
alongside the backend change. Reviewers can read the JSON diff to confirm
the contract delta matches the intent of the PR.

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `ECONNREFUSED 127.0.0.1:3031` | backend not running | `pnpm --filter @gertsai-examples/m9s-example dev` |
| `EADDRINUSE :3031` | another process bound to backend port | stop the conflicting process or set `WEB_SERVER_PORT` in `.env` |
| `openapi-typescript: unsupported OpenAPI version` | version mismatch between backend emit + this generator | bump `openapi-typescript` in `devDependencies`; the backend emits 3.1 |
| Generator hangs at "fetching schema" | backend boots without web transport | confirm `TRANSPORT_TYPE` is not set to `null` in backend `.env` |
| Frontend types stale after backend change | snapshot not regenerated | `pnpm generate:openapi` (this package) — `openapi-schema.d.ts` is a build-time snapshot, not a runtime fetch |
| `Cannot find name 'paths'` in consumers | `src/generated/openapi-schema.d.ts` missing | run `pnpm generate:openapi --seed` once (no backend needed) to emit the SPEC-019 fixture |
| `OpenAPI spec validation failed` | live spec drifted from SPEC-019 | inspect the printed problem list; either fix the backend or update SPEC-019 + rerun |
| `Unable to fetch OpenAPI spec ... after 3 attempts` | backend not on `OPENAPI_FETCH_URL` | start backend, or rerun with `--seed` |

## Cross-references

- [PRD-015](../../.forgeplan/prds/PRD-015-wave-9-full-stack-reference-auto-openapi-emission-api-types-pkg-sveltekit-web.md)
  — Wave 9 requirements.
- [SPEC-019](../../.forgeplan/specs/SPEC-019-wave-9-openapi-contract-path-map-problemdetails-request-response-schemas.md)
  — OpenAPI contract shape + path map.
- [ADR-014](../../.forgeplan/adrs/ADR-014-sveltekit-2-openapi-fetch-as-the-full-stack-reference-pattern-for-gertsai-example-applications.md)
  — SvelteKit + `openapi-fetch` pattern choice rationale.

## License

Apache-2.0. Same as the rest of the `gertsai/shared` monorepo.
