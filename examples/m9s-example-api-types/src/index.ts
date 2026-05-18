// SPDX-License-Identifier: Apache-2.0
/**
 * @gertsai-examples/m9s-example-api-types — Wave 9 typed API contracts.
 *
 * Re-exports the OpenAPI 3.1 `paths` / `components` / `operations` types
 * for the m9s-example REST API. The snapshot in `src/generated/` is
 * **hand-aligned** with the typia-validated backend handler types in
 * `examples/m9s-example/src/services/{ingest,search}/types.ts` after
 * Wave 12.E-fix-2 (PRD-039 / EVID-053 CRIT-4 + CRIT-5) — the auto-emission
 * generator path was deleted because no first-party consumer invoked it
 * (CRIT-5) and the previously-seeded `.d.ts` contradicted handler reality
 * (CRIT-4). Keep `openapi-schema.d.ts` in lock-step with the backend
 * handlers by hand until/unless a real typia-driven generator is wired.
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
 */

export type { paths, components, operations } from './generated/openapi-schema';

// Backward-compat alias for Wave 9 pre-seed consumers (Teammate C's m9s-example-web)
// that imported `PlaceholderPaths` before Teammate B's snapshot landed. Equivalent
// to `paths` from the real generated schema. Kept for source compatibility until
// every consumer migrates to importing `paths` directly.
export type { paths as PlaceholderPaths } from './generated/openapi-schema';

// Type-only OpenAPI helper utilities — see `./openapi/types.ts` for the
// `ApiEndpointsGenerator` / `OpenApiMapper` pipeline (no runtime exports
// after Wave 12.E-fix-2 / EVID-053 CRIT-5).
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

// Wave 12.E-fix-1 (PRD-038 FR-003 / EVID-053 CRIT-3) — canonical search
// contract. Single source of truth for `SearchHit` so frontend and backend
// cannot drift (pre-fix: frontend `.similarity` vs backend `.score` runtime
// crash).
export type {
  SearchHit,
  SearchQueryRequest,
  SearchQueryResponse,
} from './search-types';

// Wave 12.E-fix-2 Phase 2 (PRD-039 / EVID-053 H-8) — canonical auth contracts.
// Single source of truth for login/refresh/logout request+response shapes so
// the SvelteKit form actions stop redeclaring inline structural duplicates.
export type {
  AuthUser,
  LoginRequest,
  LoginResponse,
  RefreshRequest,
  RefreshResponse,
  LogoutRequest,
  LogoutResponse,
} from './auth-types';
