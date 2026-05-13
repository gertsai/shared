---
depth: standard
id: SPEC-019
kind: spec
last_modified_at: 2026-05-13T21:56:02.518155+00:00
last_modified_by: claude-code/2.1.139
links:
- target: PRD-015
  relation: informs
status: active
title: Wave 9 OpenAPI contract — path map + ProblemDetails + request/response schemas
---

## Summary

Defines the OpenAPI 3.1 contract shape that `examples/m9s-example` emits via auto-generated `/openapi/schema.json` after Wave 9 ships. Documents path map, request/response schemas, ProblemDetails error shape, headers, security stance (allow-all → bearerAuth in Wave 10), and validation criteria for the generated spec.

# SPEC-019: Wave 9 OpenAPI contract — path map + ProblemDetails + request/response schemas

## Purpose

Document the exact OpenAPI 3.1 shape that m9s-example emits at `GET /openapi/schema.json` after Wave 9, so:

- Teammates implementing PRD-015 know what the generated spec must look like
- `examples/m9s-example-api-types/scripts/generate-openapi-contract.mjs` has an assertion target
- Downstream `openapi-fetch` consumers can rely on a stable contract shape

## Server

- **URL**: `http://localhost:3031` (configurable per env)
- **Base path**: `/api/v1`
- **OpenAPI version**: `3.1.0`
- **`info`**:
  - `title`: `m9s-example`
  - `version`: `0.0.1` (from `project.config.ts` `APP_VERSION`)
  - `description`: brief mention this is a `@gertsai/*` reference application
- **`servers`**: array with one entry — `{ url: 'http://localhost:3031', description: 'Local dev' }`
- **`security`**: empty (Wave 9 ships allow-all gate; Wave 10 will introduce auth)

## API Contracts

Two paths exposed in Wave 9 (mirroring already-registered actions):

### POST `/api/v1/ingest/document`

- **operationId**: `v1.ingest.document`
- **summary**: Ingest a document into the vector store
- **tags**: `[ingest]`
- **requestBody**:
  - `required: true`
  - `content.application/json.schema`:
    ```json
    {
      "type": "object",
      "required": ["docId", "text"],
      "properties": {
        "docId": { "type": "string", "minLength": 1 },
        "text": { "type": "string", "minLength": 1 },
        "metadata": { "type": "object", "additionalProperties": true }
      },
      "additionalProperties": false
    }
    ```
- **responses**:
  - `200` — `application/json` — body `{ docId: string, mode: 'sync' | 'queued', chunksIndexed?: number }`
  - `400` — `application/problem+json` (RFC 9457 `ProblemDetails`)
  - `403` — `application/problem+json` (`type: urn:gertsai:errors:permission`)
  - `429` — `application/problem+json` (rate-limited)
  - `500` — `application/problem+json`

### POST `/api/v1/search/query`

- **operationId**: `v1.search.query`
- **summary**: Vector-similarity search across ingested documents
- **tags**: `[search]`
- **requestBody**:
  ```json
  {
    "type": "object",
    "required": ["query"],
    "properties": {
      "query": { "type": "string", "minLength": 1 },
      "limit": { "type": "integer", "minimum": 1, "maximum": 100, "default": 10 }
    },
    "additionalProperties": false
  }
  ```
- **responses**:
  - `200` — `application/json` — `{ results: Array<{ docId: string, text: string, similarity: number }>, took_ms: number }`
  - `400` / `403` / `500` — same as above

## ProblemDetails schema (RFC 9457)

All error responses use this shape (consistent with Wave 8.2 scrubber in `composition/errors.ts`):

```json
{
  "type": "object",
  "required": ["type", "title", "status"],
  "properties": {
    "type":  { "type": "string", "format": "uri" },
    "title": { "type": "string" },
    "status": { "type": "integer" },
    "detail": { "type": "string" },
    "instance": { "type": "string" },
    "details": {
      "type": "object",
      "additionalProperties": true
    },
    "correlationId": { "type": "string" }
  }
}
```

`details.userId / url / originalKind` are stripped at the HTTP boundary (Wave 8.2 audit Sec#3). `details.action` / `details.resource` may appear for permission errors.

## Authentication contract

Wave 9 ships allow-all gate. The OpenAPI `securitySchemes` section is therefore EMPTY (no `Bearer`/`apiKey`/etc declarations). Path operations have NO `security` requirement.

**Wave 10 will add**: `bearerAuth: { type: http, scheme: bearer, bearerFormat: JWT }` + `security: [{ bearerAuth: [] }]` per operation. Adding these later is additive and does not break the Wave 9 client.

## Request/response headers

- **`Content-Type`**: always `application/json` on request body
- **`X-Tenant-ID`**: optional request header — when present, resolved by `ChainTenantResolver` (`composition/wave5-middlewares.ts`). Default tenant `tenant-acme` when absent. NOT yet documented in OpenAPI `parameters` since auto-emission may not pick up middleware-driven headers; SPEC future-proofs by allowing manual override.
- **`Content-Type`**: response is `application/json` on 2xx, `application/problem+json` on 4xx/5xx

## OpenAPI spec generation source

The spec is NOT hand-maintained. It is produced at startup by:

```ts
// examples/m9s-example/src/index.ts (Wave 9 addition, post pre-seed)
import typia from 'typia';
import { createOpenApiService } from '@gertsai/api-core/moleculer';
import * as IngestEndpoints from './services/ingest';
import * as SearchEndpoints from './services/search';

type ApiEndpoints = typeof IngestEndpoints & typeof SearchEndpoints;

const openApiService = createOpenApiService({
  schema: typia.json.schema<OpenApiMapper<ApiEndpointsGenerator<ApiEndpoints>>, '3.1'>(),
  servers: [{ url: `http://localhost:${config.WEB_SERVER_PORT}` }],
  info: { title: 'm9s-example', version: config.APP_VERSION },
});

await ApiController.Start({ services: [..., openApiService] });
```

The exact types `OpenApiMapper` / `ApiEndpointsGenerator` come from `@gertsai/api-core/contracts` (verify availability during Phase 0 recon — see PRD-015 R-1 mitigation). If unavailable, Phase 0 vendor-ports minimal helpers from upstream gertsai_codex.

## Validation tests (against generated spec)

After backend starts, `examples/m9s-example-api-types/scripts/generate-openapi-contract.mjs` asserts:

1. `GET /openapi/schema.json` returns 200 with `application/json`
2. Top-level `openapi` field equals `"3.1.0"`
3. `paths` object contains both `/api/v1/ingest/document` and `/api/v1/search/query`
4. Each path has a `post` operation
5. Each post operation has at least one 2xx response defined
6. `info.title` equals `"m9s-example"`
7. `servers[0].url` matches `WEB_SERVER_PORT` from .env

Script exits non-zero if any assertion fails. Emits `openapi-schema.d.ts` only on full PASS.

## Backwards compatibility (Wave 10 outlook)

Wave 10 additions are designed to be **additive only** (do not break Wave 9 client):

- New paths under `/api/v1/auth/*` for login flow (additive)
- New `securitySchemes.bearerAuth` declaration (additive)
- New `security: [{ bearerAuth: [] }]` requirement applied to NEW protected endpoints only — existing `/api/v1/ingest/*` and `/api/v1/search/*` retain no-auth in dev mode
- File upload endpoints under `/api/v1/files/*` (additive paths)
- SSE endpoints under `/api/v1/events/*` (additive)

## Related Artifacts

| Artifact | Relation |
|---|---|
| PRD-015 | informs — Wave 9 contract this SPEC details |
| RFC-011 | informs — implementation strategy consumes this SPEC |
| EVID-029 | informs — Wave 8.2 audit OpenAPI partial coverage closure |
| ADR-014 | informs — framework choice that drives this client-shape decision |
| PRD-016 | informs — Wave 10 additive contract extensions documented above

