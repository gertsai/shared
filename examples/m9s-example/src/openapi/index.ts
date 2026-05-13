// SPDX-License-Identifier: Apache-2.0
/**
 * OpenAPI schema barrel — m9s-example (Wave 9).
 *
 * Single export: `buildOpenApiSchema()` returns the hand-curated
 * OpenAPI 3.1 document consumed by `createOpenApiService(schema)` in
 * `src/index.ts`. See `./schema.ts` for the rationale on hand-curation
 * + TODO for auto-emission via typia + `@gertsai-examples/m9s-example-api-types`.
 */
export { buildOpenApiSchema } from './schema';
