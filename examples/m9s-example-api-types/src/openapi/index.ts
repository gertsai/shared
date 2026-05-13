// SPDX-License-Identifier: Apache-2.0
/**
 * Barrel for the OpenAPI helper layer.
 *
 * Backend wires this in at startup:
 * ```ts
 * import { generateOpenAPISchema } from '@gertsai-examples/m9s-example-api-types/openapi';
 * import type { OpenApiMapper, ApiEndpointsGenerator } from '@gertsai-examples/m9s-example-api-types/openapi';
 * ```
 *
 * Frontend never imports this — it consumes the generated `paths` type from
 * the package root (`@gertsai-examples/m9s-example-api-types`) instead.
 */

export { generateOpenAPISchema } from './generator';
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
