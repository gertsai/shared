// SPDX-License-Identifier: Apache-2.0
/**
 * OpenAPI Type Utilities — vendor-ported from upstream `gertsai_codex/packages/api-types`
 * for the Wave 9 m9s-example reference application.
 *
 * Compile-time helpers that transform `ApiController.register({...})` action
 * definitions into an OpenAPI-compatible mapped type, ready for
 * `typia.json.schema<...>()` JSON-Schema extraction.
 *
 * Pipeline (type-only after Wave 12.E-fix-2):
 *   ApiEndpoints (typeof imports)
 *     → ApiEndpointsGenerator
 *     → OpenApiMapper
 *     → typia.json.schema<..., '3.1'>()
 *
 * The historical runtime `generateOpenAPISchema(...)` consumer was deleted in
 * Wave 12.E-fix-2 (PRD-039 / EVID-053 CRIT-5) because it had no first-party
 * caller — the backend uses its own static `buildOpenApiSchema()`. These
 * helpers are kept so that a future typia-driven generator (if ever wired)
 * has a ready-made mapped-type pipeline.
 *
 * Deviations from upstream (m9s-example needs only the basics per SPEC-019):
 * - Same public surface, no trimming: m9s-example uses POST endpoints only,
 *   but the helpers stay generic so adding GET/PUT/PATCH/DELETE later is
 *   non-breaking.
 * - `ApiControllerRegisteredAction` re-exported via `@gertsai/api-core` root
 *   (matches our `dependencies` block — no `/contracts` subpath needed here).
 */

// import type is compile-time only — no runtime circular dependency
import type { ApiControllerRegisteredAction } from '@gertsai/api-core';

// =============================================================================
// Base Types
// =============================================================================

/** Extract values from an object type. */
export type ValueOf<T> = T[keyof T];

/** Convert union to intersection — needed to merge `params` shapes that may be
 *  declared as discriminated unions of branches. */
// reason: standard union-to-intersection idiom needs the `void` trick
type UnionToIntersection<T> = (T extends unknown ? (arg: T) => void : never) extends (
  arg: infer R,
) => void
  ? R
  : never;

/** Flatten intersection for cleaner emitted schemas. */
type Simplify<T> = { [K in keyof T]: T[K] } & {};

/** Merge union of param objects into a single object shape. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type MergeParamUnion<T> = [T] extends [Record<string, any>]
  ? Simplify<UnionToIntersection<T>>
  : Record<string, never>;

/** Internal params that must not leak into public OpenAPI request contracts. */
type InternalParamKeys = 'tenantId';

/** HTTP methods supported by the API. */
export type Method = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';

/** Filter actions that have REST endpoints defined. */
export type ActionsWithRest<T> = Extract<ValueOf<T>, { rest: string }>;

/** Minimal endpoint shape for type constraints. */
export type EndpointLike = {
  restPath: string;
  method: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  params: Record<string, any>;
  path: string;
  auth: 'required' | 'optional' | 'none';
  response: unknown;
};

// =============================================================================
// Path Extraction Types
// =============================================================================

/**
 * Extract version number from a REST path.
 * @example "GET /v1/users" → "1"
 */
export type ExtractVersion<T> = T extends `${Method} /v${infer V}/${string}` ? V : never;

/**
 * Extract HTTP method from a REST path.
 * @example "GET /v1/users" → "GET"
 */
export type ExtractMethod<T> = T extends `${infer M} /v${number}/${string}` ? M : never;

/**
 * Extract sub-path segments.
 * @example "users/123/profile" → ["users", "123", "profile"]
 */
export type ExtractSubPath<T> = T extends `${infer P}/${infer Rest}`
  ? [P, ...ExtractSubPath<Rest>]
  : [T];

/**
 * Extract path tuple from a REST path.
 * @example "GET /v1/users/123" → ["users", "123"]
 */
export type ExtractTuplePath<T> = T extends `${Method} /v${number}/${infer P}`
  ? ExtractSubPath<P>
  : never;

/**
 * Extract the full path from a REST path.
 * @example "GET /v1/users/123" → "/v1/users/123"
 */
export type ExtractPath<T> = T extends `${Method} ${infer P}` ? P : never;

/**
 * Extract path parameter types from a path string.
 * Maps `/{paramName}` (OpenAPI) and `/:paramName` (Moleculer) segments to types from `ParamsType`.
 */
export type ExtractPathParameterTypes<
  T extends string,
  ParamsType,
> = T extends `/{${infer ParamName}}/${infer Rest}`
  ? ParamName extends keyof ParamsType
    ? { [K in ParamName]: ParamsType[ParamName] } & ExtractPathParameterTypes<
        `/${Rest}`,
        ParamsType
      >
    : ExtractPathParameterTypes<`/${Rest}`, ParamsType>
  : T extends `/{${infer ParamName}}`
    ? ParamName extends keyof ParamsType
      ? { [K in ParamName]: ParamsType[ParamName] }
      : Record<string, never>
    : T extends `/:${infer ParamName}/${infer Rest}`
      ? ParamName extends keyof ParamsType
        ? { [K in ParamName]: ParamsType[ParamName] } & ExtractPathParameterTypes<
            `/${Rest}`,
            ParamsType
          >
        : ExtractPathParameterTypes<`/${Rest}`, ParamsType>
      : T extends `/:${infer ParamName}`
        ? ParamName extends keyof ParamsType
          ? { [K in ParamName]: ParamsType[ParamName] }
          : Record<string, never>
        : T extends `/${string}/${infer Rest}`
          ? ExtractPathParameterTypes<`/${Rest}`, ParamsType>
          : Record<string, never>;

// =============================================================================
// Parameter Extraction Types
// =============================================================================

/** Extract query parameters for GET/DELETE requests. */
export type ExtractQueryParams<Endpoint extends EndpointLike> = Endpoint['method'] extends
  | 'GET'
  | 'DELETE'
  ? MergeParamUnion<Endpoint['params']>
  : Record<string, never>;

/** Extract body parameters for POST/PUT/PATCH requests. */
export type ExtractBodyParams<Endpoint extends EndpointLike> = Endpoint['method'] extends
  | 'POST'
  | 'PUT'
  | 'PATCH'
  ? MergeParamUnion<Endpoint['params']>
  : Record<string, never>;

/** Extract path parameters from the URL path. */
export type ExtractPathParams<Endpoint extends EndpointLike> = ExtractPathParameterTypes<
  Endpoint['path'],
  Endpoint['params']
>;

// =============================================================================
// Response Types
// =============================================================================

/** Extract response types (Wave 9 surfaces 200 only — see SPEC-019; Wave 10 may add 201/204). */
export type ExtractResponses<Endpoint extends EndpointLike> = {
  '200': Endpoint['response'];
};

// =============================================================================
// ApiEndpointsGenerator — Maps registered actions to endpoint structures
// =============================================================================

/**
 * Transforms registered Moleculer actions into typed endpoint definitions.
 *
 * @template T - Object containing all registered actions
 *               (typeof `import * as Endpoints from './services/<name>'`)
 *
 * @example
 * ```typescript
 * import type * as IngestEndpoints from './services/ingest';
 * type Endpoints = ApiEndpointsGenerator<typeof IngestEndpoints>;
 * ```
 */
export type ApiEndpointsGenerator<T> = {
  [RestPath in ActionsWithRest<T>['rest']]: Extract<
    ActionsWithRest<T>,
    { rest: RestPath }
  > extends ApiControllerRegisteredAction<
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    any,
    RestPath,
    infer AuthType,
    infer ParamsType,
    infer ResponseType,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    any
  >
    ? {
        version: `v${ExtractVersion<RestPath>}`;
        method: ExtractMethod<RestPath>;
        path: ExtractPath<RestPath>;
        pathTuple: ExtractTuplePath<RestPath>;
        restPath: RestPath;
        auth: AuthType;
        params: ParamsType;
        response: ResponseType;
      }
    : never;
};

// =============================================================================
// OpenApiMapper — Transforms endpoints into OpenAPI-compatible structure
// =============================================================================

/**
 * Extract OpenAPI-compatible data from a single endpoint.
 * Separates params into path params, query params, and body, and maps auth
 * config to security requirements.
 */
export type ExtractApiMapperData<Endpoint extends EndpointLike> = {
  method: Endpoint['method'];
  security: Endpoint['auth'] extends 'required' | 'optional' ? { bearer: [] } : undefined;
  path: Endpoint['path'];
  allParams: Endpoint['params'];
  params: ExtractPathParams<Endpoint>;
  query: Omit<ExtractQueryParams<Endpoint>, keyof ExtractPathParams<Endpoint> | InternalParamKeys>;
  body: Omit<ExtractBodyParams<Endpoint>, keyof ExtractPathParams<Endpoint> | InternalParamKeys>;
  responses: ExtractResponses<Endpoint>;
  operationId: Endpoint['restPath'];
};

/**
 * Maps all API endpoints to OpenAPI-compatible representations.
 * This is the type passed to `typia.json.schema()` for JSON Schema generation.
 *
 * @template ApiEndpoints - Record of endpoint key → EndpointLike
 *
 * @example
 * ```typescript
 * type Schema = OpenApiMapper<ApiEndpointsGenerator<typeof IngestEndpoints>>;
 * const jsonSchema = typia.json.schema<Schema, '3.1'>();
 * ```
 */
export type OpenApiMapper<ApiEndpoints extends Record<string, EndpointLike>> = {
  [K in keyof ApiEndpoints]: ExtractApiMapperData<ApiEndpoints[K]>;
};

// =============================================================================
// Generator Options (re-exported for type-only consumers)
// =============================================================================

/**
 * OpenAPI server entry (Swagger / OpenAPI 3.x `servers[]` element). Keeps
 * the surface tight enough that `OpenApiGeneratorOptions.servers` can't be
 * any-typed by accident.
 */
export interface OpenApiServerEntry {
  /** Absolute or relative URL to the server. */
  url: string;
  /** Optional description shown in the generated docs. */
  description?: string;
  /** Optional template variables (per OpenAPI 3.x `Server Variable Object`). */
  variables?: Record<string, { default: string; description?: string; enum?: string[] }>;
}

/**
 * Options shape preserved for forward compatibility — historically consumed
 * by `generateOpenAPISchema` (deleted in Wave 12.E-fix-2 / EVID-053 CRIT-5).
 *
 * - `schema`  — `typia.json.schema<OpenApiMapper<...>, '3.1'>()` result
 *               (a fully-resolved OpenAPI 3.x document). Typed as
 *               `Record<string, unknown>` here instead of `any` so consumers
 *               cannot accidentally silence type errors on the schema body
 *               (EVID-053 H-9). A future typia-driven generator can
 *               narrow this further (e.g. import an `OpenApi.IDocument`
 *               shape) without breaking source compat.
 * - `servers` — OpenAPI server entries (typically one local-dev URL).
 * - `info`    — title/version block.
 * - `debug`   — opt-in verbose logging during conversion.
 */
export interface OpenApiGeneratorOptions {
  /**
   * The OpenAPI 3.x JSON-Schema document produced upstream
   * (`typia.json.schema<..., '3.1'>()`). Modelled as
   * `Record<string, unknown>` so that downstream code (the dead generator,
   * a future replacement, or third-party tooling) has to validate the
   * structure rather than trusting `any`. See EVID-053 H-9.
   */
  schema: Record<string, unknown>;
  servers: readonly OpenApiServerEntry[];
  info: {
    title: string;
    version: string;
    description?: string;
  };
  debug?: boolean;
}
