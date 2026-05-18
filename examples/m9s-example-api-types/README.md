# @gertsai-examples/m9s-example-api-types

Hand-aligned **OpenAPI 3.1** type contract for the m9s-example REST API.
Ships `paths` + `components` consumable by any TypeScript HTTP client —
including `openapi-fetch`, `openapi-zod-client`, or hand-rolled wrappers.

## Purpose

This package is the contract seam between the m9s-example backend and any
TypeScript consumer (web, mobile, server-to-server). It exists so that:

- **Frontend builds do not depend on a running backend.** The committed
  `paths.d.ts` snapshot is checked into git; consumers only need a successful
  `pnpm install`.
- **Backend signature changes propagate to consumers as TS errors.** When an
  action's request/response shape changes, we re-align the snapshot by hand
  to match the backend handler types — downstream typecheck then flags every
  affected call site.

## Current state — hand-aligned snapshot (post Wave 12.E-fix-2)

The snapshot in `src/generated/` is **hand-aligned** with the typia-validated
backend handler types in
[`examples/m9s-example/src/services/{ingest,search}/types.ts`](../m9s-example/src/services/).

Wave 9 originally shipped a runtime `generateOpenAPISchema(...)` helper
(683 LOC) plus a `seed` script that fabricated a hand-curated SPEC-019
fixture. The audit in EVID-053 found:

- **CRIT-4** — The seed-mode `openapi-schema.d.ts` contradicted handler
  reality (`{mode: 'sync' | 'queued', chunksIndexed?}` vs handler's
  `{jobId, mode: 'queued' | 'inline', chunkCount}`; search response had
  `{text, similarity, took_ms}` vs handler's `{chunkIdx, text, score}`).
- **CRIT-5** — The runtime generator had **no first-party consumer**:
  the backend wires its own static `buildOpenApiSchema()` in
  `examples/m9s-example/src/openapi/schema.ts`. The exported-but-bypassed
  shape guaranteed forever-drift.

Wave 12.E-fix-2 deleted both the dead generator and the seed-script, and
rewrote the snapshot to match the handler types. **Keep this file in
lock-step with the backend handlers by hand** — there is no auto-emission
pipeline today.

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

## Updating the snapshot

When the backend action signature surface changes — new action, request /
response shape edited, path / verb / query change, ProblemDetails edit —
manually edit `src/generated/openapi-schema.d.ts` and `src/generated/openapi.json`
to match the new shape, then run downstream typecheck to flag affected
call sites:

```bash
pnpm --filter @gertsai-examples/m9s-example-api-types build
pnpm --filter @gertsai-examples/m9s-example-web check
```

Commit the edited snapshot files alongside the backend change. Reviewers
can read the JSON / `.d.ts` diff to confirm the contract delta matches the
intent of the PR.

If someone resurrects an auto-emission generator in the future, see
[`src/openapi/types.ts`](./src/openapi/types.ts) for the still-exported
type-only pipeline (`ApiEndpointsGenerator`, `OpenApiMapper`,
`ExtractApiMapperData`) — they describe the compile-time shape a typia
backend reflection would feed.

## Cross-references

- [PRD-015](../../.forgeplan/prds/PRD-015-wave-9-full-stack-reference-auto-openapi-emission-api-types-pkg-sveltekit-web.md)
  — Wave 9 requirements.
- [SPEC-019](../../.forgeplan/specs/SPEC-019-wave-9-openapi-contract-path-map-problemdetails-request-response-schemas.md)
  — OpenAPI contract shape + path map.
- [ADR-014](../../.forgeplan/adrs/ADR-014-sveltekit-2-openapi-fetch-as-the-full-stack-reference-pattern-for-gertsai-example-applications.md)
  — SvelteKit + `openapi-fetch` pattern choice rationale.
- [EVID-053](../../.forgeplan/evidence/EVID-053-wave-12-e-aggregated-audit-3-example-apps-4-domain-reviewers.md)
  — audit findings (CRIT-4 + CRIT-5) that motivated removing the dead
  generator path.

## License

Apache-2.0. Same as the rest of the `gertsai/shared` monorepo.
