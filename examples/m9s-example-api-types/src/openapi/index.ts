// SPDX-License-Identifier: Apache-2.0
/**
 * Barrel for the OpenAPI helper layer.
 *
 * History: Wave 9 shipped a `generateOpenAPISchema(...)` runtime generator
 * here. Wave 12.E-fix-2 (PRD-039 / EVID-053 CRIT-5) deleted it — the function
 * was 683 LOC of dead code never invoked by any first-party consumer (backend
 * wires its own static `buildOpenApiSchema()` in
 * `examples/m9s-example/src/openapi/schema.ts`). The exported-but-bypassed
 * shape guaranteed forever-drift, so the generator was removed instead of
 * resurrected.
 *
 * The TYPE-ONLY helpers (`ApiEndpointsGenerator`, `OpenApiMapper`, etc.) are
 * still useful: they describe the compile-time pipeline a future typia-driven
 * generator could feed, and a couple of them are exported from the root
 * barrel for backwards compatibility. They incur zero runtime cost.
 */

export type {
  ActionsWithRest,
  ApiEndpointsGenerator,
  EndpointLike,
  ExtractApiMapperData,
  ExtractBodyParams,
  ExtractMethod,
  ExtractPath,
  ExtractPathParameterTypes,
  ExtractPathParams,
  ExtractQueryParams,
  ExtractResponses,
  ExtractSubPath,
  ExtractTuplePath,
  ExtractVersion,
  Method,
  OpenApiGeneratorOptions,
  OpenApiMapper,
  ValueOf,
} from './types';
