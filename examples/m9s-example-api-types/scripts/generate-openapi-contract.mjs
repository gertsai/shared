#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
/**
 * Generate the m9s-example OpenAPI contract for the monorepo.
 *
 * Two modes:
 *
 *   1. Live mode (default) — fetch from a running backend:
 *
 *        pnpm --filter @gertsai-examples/m9s-example-api-types generate:openapi
 *
 *      Reads OPENAPI_FETCH_URL env (default
 *      http://localhost:3031/openapi/schema.json), retries 3× with 1 s
 *      back-off, validates against SPEC-019, then emits
 *      src/generated/openapi.json + openapi-schema.d.ts.
 *
 *   2. Seed mode (chicken-and-egg bootstrap) — hand-curated spec:
 *
 *        pnpm --filter @gertsai-examples/m9s-example-api-types generate:openapi --seed
 *
 *      No backend needed. Writes a minimal-but-SPEC-019-conformant spec
 *      directly, then runs openapi-typescript against it. Used for the
 *      first commit before Teammate A wires the auto-emission service at
 *      backend startup. After that ships, anyone can re-run without --seed
 *      to refresh the snapshot from the live spec.
 *
 * Idempotent: re-running overwrites src/generated/* cleanly.
 *
 * Validation rules (SPEC-019 §Validation tests):
 *   1.  openapi === '3.1.0'
 *   2.  info.title === 'm9s-example'
 *   3.  paths['/api/v1/ingest/document'] exists
 *   4.  paths['/api/v1/search/query'] exists
 *   5.  both have post.responses['200']
 *   6.  servers[0].url matches a WEB_SERVER_PORT-shaped URL
 *   7.  any path with {param} has a matching `in: path` parameter
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import openapiTS, { astToString } from 'openapi-typescript';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const GENERATED_DIR = resolve(ROOT, 'src/generated');
const SPEC_JSON_FILE = resolve(GENERATED_DIR, 'openapi.json');
const SCHEMA_DTS_FILE = resolve(GENERATED_DIR, 'openapi-schema.d.ts');

const OPENAPI_FETCH_URL =
  process.env.OPENAPI_FETCH_URL || 'http://localhost:3031/openapi/schema.json';
const FETCH_ATTEMPTS = 3;
const FETCH_BACKOFF_MS = 1000;
const FETCH_TIMEOUT_MS = 10_000;

const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete', 'options', 'head', 'trace'];

const REQUIRED_PATHS = ['/api/v1/ingest/document', '/api/v1/search/query'];

const USE_SEED = process.argv.includes('--seed');

// =============================================================================
// Synthetic seed spec — hand-curated, mirrors SPEC-019 §API Contracts
// =============================================================================

function buildSeedSpec() {
  return {
    openapi: '3.1.0',
    info: {
      title: 'm9s-example',
      version: '0.0.1',
      description:
        '@gertsai/* reference application — Wave 9 minimal contract (synthetic seed; replaced by live spec once backend auto-emission is wired).',
    },
    servers: [{ url: 'http://localhost:3031', description: 'Local dev' }],
    security: [],
    tags: [
      { name: 'ingest', description: 'Operations related to ingest' },
      { name: 'search', description: 'Operations related to search' },
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
                schema: { $ref: '#/components/schemas/IngestDocumentRequest' },
              },
            },
          },
          responses: {
            200: {
              description: 'Ingest accepted',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/IngestDocumentResponse' },
                },
              },
            },
            400: {
              description: 'Validation error',
              content: {
                'application/problem+json': {
                  schema: { $ref: '#/components/schemas/ProblemDetails' },
                },
              },
            },
            403: {
              description: 'Permission denied',
              content: {
                'application/problem+json': {
                  schema: { $ref: '#/components/schemas/ProblemDetails' },
                },
              },
            },
            429: {
              description: 'Rate-limited',
              content: {
                'application/problem+json': {
                  schema: { $ref: '#/components/schemas/ProblemDetails' },
                },
              },
            },
            500: {
              description: 'Internal server error',
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
                schema: { $ref: '#/components/schemas/SearchQueryRequest' },
              },
            },
          },
          responses: {
            200: {
              description: 'Search results',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/SearchQueryResponse' },
                },
              },
            },
            400: {
              description: 'Validation error',
              content: {
                'application/problem+json': {
                  schema: { $ref: '#/components/schemas/ProblemDetails' },
                },
              },
            },
            403: {
              description: 'Permission denied',
              content: {
                'application/problem+json': {
                  schema: { $ref: '#/components/schemas/ProblemDetails' },
                },
              },
            },
            500: {
              description: 'Internal server error',
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
        IngestDocumentRequest: {
          type: 'object',
          required: ['docId', 'text'],
          properties: {
            docId: { type: 'string', minLength: 1 },
            text: { type: 'string', minLength: 1 },
            metadata: { type: 'object', additionalProperties: true },
          },
          additionalProperties: false,
        },
        IngestDocumentResponse: {
          type: 'object',
          required: ['docId', 'mode'],
          properties: {
            docId: { type: 'string' },
            mode: { type: 'string', enum: ['sync', 'queued'] },
            chunksIndexed: { type: 'integer', minimum: 0 },
          },
        },
        SearchQueryRequest: {
          type: 'object',
          required: ['query'],
          properties: {
            query: { type: 'string', minLength: 1 },
            limit: { type: 'integer', minimum: 1, maximum: 100, default: 10 },
          },
          additionalProperties: false,
        },
        SearchQueryResponse: {
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
        ProblemDetails: {
          type: 'object',
          required: ['type', 'title', 'status'],
          properties: {
            type: { type: 'string', format: 'uri' },
            title: { type: 'string' },
            status: { type: 'integer' },
            detail: { type: 'string' },
            instance: { type: 'string' },
            details: { type: 'object', additionalProperties: true },
            correlationId: { type: 'string' },
          },
        },
      },
    },
  };
}

// =============================================================================
// Live mode — fetch with retry
// =============================================================================

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchSpecOnce(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} ${res.statusText}`);
    }
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

async function fetchSpecWithRetry(url) {
  const errors = [];
  for (let attempt = 1; attempt <= FETCH_ATTEMPTS; attempt += 1) {
    try {
      console.log(`[generate-openapi-contract] Fetching ${url} (attempt ${attempt}/${FETCH_ATTEMPTS}) ...`);
      const spec = await fetchSpecOnce(url);
      return spec;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      errors.push(`attempt ${attempt}: ${msg}`);
      if (attempt < FETCH_ATTEMPTS) {
        await sleep(FETCH_BACKOFF_MS);
      }
    }
  }
  throw new Error(
    `Unable to fetch OpenAPI spec from ${url} after ${FETCH_ATTEMPTS} attempts:\n  ${errors.join('\n  ')}`,
  );
}

// =============================================================================
// Validation — SPEC-019 §Validation tests
// =============================================================================

function assertSpec(spec) {
  const problems = [];

  if (spec?.openapi !== '3.1.0') {
    problems.push(`openapi must be "3.1.0" (got ${JSON.stringify(spec?.openapi)})`);
  }

  if (spec?.info?.title !== 'm9s-example') {
    problems.push(`info.title must be "m9s-example" (got ${JSON.stringify(spec?.info?.title)})`);
  }

  const servers = Array.isArray(spec?.servers) ? spec.servers : [];
  if (servers.length === 0) {
    problems.push('servers[] must be non-empty');
  } else {
    const url = servers[0]?.url;
    if (typeof url !== 'string' || !/^https?:\/\/[^/]+:\d+$/.test(url)) {
      problems.push(
        `servers[0].url must look like http(s)://host:PORT (got ${JSON.stringify(url)})`,
      );
    }
  }

  for (const requiredPath of REQUIRED_PATHS) {
    const pathItem = spec?.paths?.[requiredPath];
    if (!pathItem) {
      problems.push(`paths["${requiredPath}"] is missing`);
      continue;
    }
    if (!pathItem.post) {
      problems.push(`paths["${requiredPath}"] is missing the "post" operation`);
      continue;
    }
    const ok200 =
      pathItem.post.responses && pathItem.post.responses['200'];
    if (!ok200) {
      problems.push(`paths["${requiredPath}"].post.responses["200"] is missing`);
    }
  }

  // Path-param sanity: every {param} in the URL must be declared as `in: 'path'`.
  for (const [path, pathItem] of Object.entries(spec?.paths ?? {})) {
    const templateParams = [...path.matchAll(/\{([^}]+)\}/g)].map((m) => m[1]);
    if (templateParams.length === 0) continue;

    for (const method of HTTP_METHODS) {
      const operation = pathItem?.[method];
      if (!operation) continue;
      const declared = [
        ...(Array.isArray(pathItem?.parameters) ? pathItem.parameters : []),
        ...(Array.isArray(operation?.parameters) ? operation.parameters : []),
      ].filter((p) => p && typeof p === 'object');

      for (const name of templateParams) {
        const found = declared.some((p) => {
          // resolve $ref params if any (best-effort — synthetic seed has none)
          if (p?.$ref) {
            const refName = String(p.$ref).replace('#/components/parameters/', '');
            const resolved = spec.components?.parameters?.[refName];
            return resolved?.in === 'path' && resolved?.name === name;
          }
          return p.in === 'path' && p.name === name;
        });
        if (!found) {
          problems.push(
            `${method.toUpperCase()} ${path} → path param "${name}" not declared in parameters[]`,
          );
        }
      }
    }
  }

  if (problems.length > 0) {
    throw new Error(`OpenAPI spec validation failed:\n  - ${problems.join('\n  - ')}`);
  }
}

// =============================================================================
// openapi-typescript — generate .d.ts from spec object
// =============================================================================

async function emitSchemaDts(spec) {
  console.log('[generate-openapi-contract] Generating TypeScript schema types ...');
  const ast = await openapiTS(spec, {
    rootTypes: false,
    immutable: false,
  });
  const banner =
    '/**\n * This file was auto-generated by openapi-typescript via ' +
    '`pnpm generate:openapi`.\n * Do not edit manually.\n */\n\n';
  const body = astToString(ast);
  writeFileSync(SCHEMA_DTS_FILE, `${banner}${body}`);
}

// =============================================================================
// Main
// =============================================================================

async function main() {
  mkdirSync(GENERATED_DIR, { recursive: true });

  let spec;
  if (USE_SEED) {
    console.log('[generate-openapi-contract] Seed mode — emitting hand-curated SPEC-019 fixture.');
    spec = buildSeedSpec();
  } else {
    spec = await fetchSpecWithRetry(OPENAPI_FETCH_URL);
  }

  assertSpec(spec);

  writeFileSync(SPEC_JSON_FILE, `${JSON.stringify(spec, null, 2)}\n`);
  console.log(
    `[generate-openapi-contract] Spec saved: ${Object.keys(spec.paths ?? {}).length} paths, ${
      Object.keys(spec.components?.schemas ?? {}).length
    } schemas → ${SPEC_JSON_FILE}`,
  );

  await emitSchemaDts(spec);
  console.log(`[generate-openapi-contract] Schema types saved → ${SCHEMA_DTS_FILE}`);

  console.log('[generate-openapi-contract] Done.');
}

main().catch((err) => {
  console.error(`\n[generate-openapi-contract] FAILED: ${err.message}`);
  if (!USE_SEED) {
    console.error(
      'Hint: make sure the m9s-example backend is running on the expected port,\n' +
        '      or run with --seed to emit the synthetic SPEC-019 fixture instead.',
    );
  }
  process.exit(1);
});
