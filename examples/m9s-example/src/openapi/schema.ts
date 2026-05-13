// SPDX-License-Identifier: Apache-2.0
/**
 * Hand-curated OpenAPI 3.1 schema for m9s-example (Wave 9 bridge).
 *
 * Why hand-curated:
 *   PRD-015 + SPEC-019 + RFC-011 (Wave 9) define an automatic emission
 *   pipeline: `typia.json.schema<OpenApiMapper<ApiEndpointsGenerator<...>>,
 *   '3.1'>()` consumed by `createOpenApiService(...)`. The `OpenApiMapper`
 *   / `ApiEndpointsGenerator` helpers live in upstream `gertsai_codex`
 *   `packages/api-types` and are being vendor-ported into a sibling
 *   workspace (`examples/m9s-example-api-types`) by another teammate as
 *   part of the same wave.
 *
 *   To avoid a cross-teammate dependency stall, Wave 9 ships this
 *   minimal hand-curated bridge that mirrors the exact contract shape
 *   from SPEC-019. The shape is intentionally narrow — only the two
 *   already-registered v1 actions (`ingest.document` + `search.query`)
 *   plus the canonical RFC 9457 `ProblemDetails` schema.
 *
 * TODO(Wave 9.1 / Wave 10):
 *   Replace this file with a one-liner driven by typia + the api-types
 *   package once it exposes `generateOpenAPISchema` + `OpenApiMapper` +
 *   `ApiEndpointsGenerator`:
 *
 *     import { generateOpenAPISchema } from '@gertsai-examples/m9s-example-api-types';
 *     export const buildOpenApiSchema = () =>
 *       generateOpenAPISchema({
 *         schema: typia.json.schema<
 *           OpenApiMapper<ApiEndpointsGenerator<ApiEndpoints>>,
 *           '3.1'
 *         >(),
 *         info: { title: 'm9s-example', version: config.APP_VERSION },
 *         servers: [{ url: `http://localhost:${config.WEB_SERVER_PORT}` }],
 *       });
 *
 * Validation criteria (SPEC-019 §Validation tests):
 *   1. `openapi` === '3.1.0'
 *   2. `paths` contains '/api/v1/ingest/document' AND '/api/v1/search/query'
 *   3. Each path has a `post` operation
 *   4. Each post has at least one 2xx response
 *   5. `info.title` === 'm9s-example'
 *   6. `servers[0].url` reflects `WEB_SERVER_PORT`
 *   7. `components.schemas.ProblemDetails` exists with required {type,title,status}
 */
import config from '../../project.config';

/**
 * The return type intentionally matches the parameter type of
 * `createOpenApiService(schema)` from `@gertsai/api-core/moleculer`
 * (`OpenApiV3_1.IDocument` from `@samchon/openapi`). We do not import
 * the type directly because `@samchon/openapi` is only a transitive
 * dep of `@gertsai/api-core` — declaring it locally would re-leak the
 * dep. Structural typing at the call site (see `src/index.ts`)
 * verifies the shape compatibility at the import boundary.
 */
export function buildOpenApiSchema() {
  return {
    openapi: '3.1.0',
    info: {
      title: 'm9s-example',
      version: config.APP_VERSION,
      description:
        '`@gertsai/*` reference application — Wave 9 full-stack pattern (auto-OpenAPI emission, api-types contract, SvelteKit web client).',
    },
    servers: [
      {
        url: `http://localhost:${config.WEB_SERVER_PORT}`,
        description: 'Local dev',
      },
    ],
    paths: {
      '/api/v1/ingest/document': {
        post: {
          operationId: 'v1.ingest.document',
          summary: 'Ingest a document into the vector store',
          tags: ['ingest'],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['docId', 'text'],
                  additionalProperties: false,
                  properties: {
                    docId: { type: 'string', minLength: 1 },
                    text: { type: 'string', minLength: 1 },
                    metadata: {
                      type: 'object',
                      additionalProperties: true,
                    },
                  },
                },
              },
            },
          },
          responses: {
            '200': {
              description: 'Document accepted',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    required: ['docId', 'mode'],
                    properties: {
                      docId: { type: 'string' },
                      mode: { type: 'string', enum: ['sync', 'queued'] },
                      chunksIndexed: { type: 'integer' },
                    },
                  },
                },
              },
            },
            '400': {
              description: 'Validation failure',
              content: {
                'application/problem+json': {
                  schema: { $ref: '#/components/schemas/ProblemDetails' },
                },
              },
            },
            '403': {
              description: 'Permission denied',
              content: {
                'application/problem+json': {
                  schema: { $ref: '#/components/schemas/ProblemDetails' },
                },
              },
            },
            '429': {
              description: 'Rate limited',
              content: {
                'application/problem+json': {
                  schema: { $ref: '#/components/schemas/ProblemDetails' },
                },
              },
            },
            '500': {
              description: 'Server error',
              content: {
                'application/problem+json': {
                  schema: { $ref: '#/components/schemas/ProblemDetails' },
                },
              },
            },
          },
        },
      },
      '/api/v1/search/query': {
        post: {
          operationId: 'v1.search.query',
          summary: 'Vector-similarity search across ingested documents',
          tags: ['search'],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['query'],
                  additionalProperties: false,
                  properties: {
                    query: { type: 'string', minLength: 1 },
                    limit: {
                      type: 'integer',
                      minimum: 1,
                      maximum: 100,
                      default: 10,
                    },
                  },
                },
              },
            },
          },
          responses: {
            '200': {
              description: 'Search results',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    required: ['results', 'took_ms'],
                    properties: {
                      results: {
                        type: 'array',
                        items: {
                          type: 'object',
                          required: ['docId', 'text', 'similarity'],
                          properties: {
                            docId: { type: 'string' },
                            text: { type: 'string' },
                            similarity: { type: 'number' },
                          },
                        },
                      },
                      took_ms: { type: 'number' },
                    },
                  },
                },
              },
            },
            '400': {
              description: 'Validation failure',
              content: {
                'application/problem+json': {
                  schema: { $ref: '#/components/schemas/ProblemDetails' },
                },
              },
            },
            '403': {
              description: 'Permission denied',
              content: {
                'application/problem+json': {
                  schema: { $ref: '#/components/schemas/ProblemDetails' },
                },
              },
            },
            '500': {
              description: 'Server error',
              content: {
                'application/problem+json': {
                  schema: { $ref: '#/components/schemas/ProblemDetails' },
                },
              },
            },
          },
        },
      },
    },
    components: {
      schemas: {
        // RFC 9457 ProblemDetails — must match the scrubber output in
        // `composition/errors.ts` (Wave 8.2 audit Sec#3). Keys
        // `userId`, `url`, `originalKind` are intentionally stripped at
        // the HTTP boundary and therefore NOT documented here.
        ProblemDetails: {
          type: 'object',
          required: ['type', 'title', 'status'],
          properties: {
            type: { type: 'string', format: 'uri' },
            title: { type: 'string' },
            status: { type: 'integer' },
            detail: { type: 'string' },
            instance: { type: 'string' },
            details: {
              type: 'object',
              additionalProperties: true,
            },
            correlationId: { type: 'string' },
          },
        },
      },
    },
    // `security` intentionally absent: Wave 9 ships allow-all gate.
    // Wave 10 will add `securitySchemes.bearerAuth` (additive) per
    // SPEC-019 §Backwards compatibility.
  };
}
