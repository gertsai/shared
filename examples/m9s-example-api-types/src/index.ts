// SPDX-License-Identifier: Apache-2.0
/**
 * @gertsai-examples/m9s-example-api-types — Wave 9 typed API contracts.
 *
 * Re-exports the OpenAPI 3.1 `paths` / `components` / `operations` types
 * generated from the live m9s-example backend at `GET /openapi/schema.json`.
 *
 * Frontend (and any other typed consumer) imports `paths` and feeds it to
 * `openapi-fetch`:
 *
 * ```ts
 * import createClient from 'openapi-fetch';
 * import type { paths } from '@gertsai-examples/m9s-example-api-types';
 *
 * const api = createClient<paths>({ baseUrl: 'http://localhost:3031' });
 *
 * const { data, error } = await api.POST('/api/v1/ingest/document', {
 *   body: { docId: 'd1', text: 'hello world' },
 * });
 * ```
 *
 * Backend wires the runtime side via the `/openapi` subpath:
 *
 * ```ts
 * import { generateOpenAPISchema } from '@gertsai-examples/m9s-example-api-types/openapi';
 * import type { OpenApiMapper, ApiEndpointsGenerator } from '@gertsai-examples/m9s-example-api-types/openapi';
 * ```
 *
 * The generator is idempotent — re-run `pnpm generate:openapi` whenever backend
 * action signatures change. The generated `.d.ts` is committed so frontend
 * consumers can build offline without the backend running.
 */

export type { paths, components, operations } from './generated/openapi-schema';

// Backward-compat alias for Wave 9 pre-seed consumers (Teammate C's m9s-example-web)
// that imported `PlaceholderPaths` before Teammate B's snapshot landed. Equivalent
// to `paths` from the real generated schema. Remove in Wave 10 once all consumers
// migrate to importing `paths` directly.
export type { paths as PlaceholderPaths } from './generated/openapi-schema';

export { generateOpenAPISchema } from './openapi/generator';
export type {
  ApiEndpointsGenerator,
  EndpointLike,
  Method,
  OpenApiGeneratorOptions,
  OpenApiMapper,
} from './openapi/types';

// Wave 11.B (PRD-024) — JWT claims shared between backend sign+verify and
// web verify. Closes EVID-036 CI-5 (drift risk from duplicated interfaces).
export type {
  JwtClaims,
  JwtAccessClaims,
  JwtRefreshClaims,
  JwtKind,
} from './jwt-claims';
