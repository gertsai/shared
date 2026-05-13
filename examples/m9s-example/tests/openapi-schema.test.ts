// SPDX-License-Identifier: Apache-2.0
/**
 * OpenAPI schema shape test — m9s-example Wave 9 (PRD-015 / SPEC-019).
 *
 * Pure unit shape assertion: call `buildOpenApiSchema()` directly and
 * verify the literal matches SPEC-019 §Validation tests (1..7). HTTP
 * round-trip verification (broker.call against `openapi.v2.schema` and
 * Teammate B's contract-generation script hitting `GET /openapi/schema.json`)
 * is intentionally out of scope here — those land in `e2e.test.ts` and
 * `scripts/generate-openapi-contract.mjs` respectively, per RFC-011 slice
 * boundaries.
 *
 * Why this is a unit-only suite:
 *   The schema is hand-curated (Wave 9 bridge — see `src/openapi/schema.ts`
 *   TODO for auto-emission). The literal IS the contract; structural
 *   correctness here is sufficient to gate the broker registration in
 *   `src/index.ts` from drifting against SPEC-019.
 */
import { describe, it, expect } from 'vitest';

import { buildOpenApiSchema } from '../src/openapi';

describe('buildOpenApiSchema() — SPEC-019 contract shape', () => {
  const schema = buildOpenApiSchema();

  it('declares OpenAPI 3.1.0', () => {
    expect(schema.openapi).toBe('3.1.0');
  });

  it('info.title === "m9s-example"', () => {
    expect(schema.info.title).toBe('m9s-example');
  });

  it('info.version is a non-empty string', () => {
    expect(typeof schema.info.version).toBe('string');
    expect(schema.info.version.length).toBeGreaterThan(0);
  });

  it('servers[0].url is set (reflects WEB_SERVER_PORT)', () => {
    expect(Array.isArray(schema.servers)).toBe(true);
    expect(schema.servers.length).toBeGreaterThanOrEqual(1);
    expect(typeof schema.servers[0]?.url).toBe('string');
    expect(schema.servers[0]?.url).toMatch(/^http:\/\/localhost:\d+$/);
  });

  it('paths contains /api/v1/ingest/document and /api/v1/search/query', () => {
    const pathKeys = Object.keys(schema.paths);
    expect(pathKeys).toContain('/api/v1/ingest/document');
    expect(pathKeys).toContain('/api/v1/search/query');
  });

  it('each path declares a POST operation with a 2xx response', () => {
    const ingest = schema.paths['/api/v1/ingest/document'];
    expect(ingest.post).toBeDefined();
    expect(ingest.post.operationId).toBe('v1.ingest.document');
    expect(ingest.post.responses['200']).toBeDefined();

    const search = schema.paths['/api/v1/search/query'];
    expect(search.post).toBeDefined();
    expect(search.post.operationId).toBe('v1.search.query');
    expect(search.post.responses['200']).toBeDefined();
  });

  it('post operations declare an application/json request body', () => {
    const ingest = schema.paths['/api/v1/ingest/document'].post;
    expect(ingest.requestBody.required).toBe(true);
    expect(ingest.requestBody.content['application/json'].schema).toBeDefined();

    const search = schema.paths['/api/v1/search/query'].post;
    expect(search.requestBody.required).toBe(true);
    expect(search.requestBody.content['application/json'].schema).toBeDefined();
  });

  it('error responses use application/problem+json (RFC 9457)', () => {
    const ingest = schema.paths['/api/v1/ingest/document'].post;
    expect(ingest.responses['400'].content['application/problem+json']).toBeDefined();
    expect(ingest.responses['500'].content['application/problem+json']).toBeDefined();
  });

  it('components.schemas.ProblemDetails exists with required {type,title,status}', () => {
    const problem = schema.components.schemas.ProblemDetails;
    expect(problem).toBeDefined();
    expect(problem.type).toBe('object');
    expect(problem.required).toEqual(['type', 'title', 'status']);
    expect(problem.properties.type).toBeDefined();
    expect(problem.properties.title).toBeDefined();
    expect(problem.properties.status).toBeDefined();
  });
});
