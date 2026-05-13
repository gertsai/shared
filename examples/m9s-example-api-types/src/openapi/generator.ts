// SPDX-License-Identifier: Apache-2.0
/**
 * OpenAPI 3.1 Schema Generator — vendor-ported from
 * `gertsai_codex/packages/api-types/src/openapi/generator.ts` for the Wave 9
 * m9s-example reference application.
 *
 * Converts typia-generated JSON Schema (via
 * `OpenApiMapper<ApiEndpointsGenerator<...>>`) into a proper OpenAPI 3.1.0
 * document. Designed to be wired into m9s-example at startup, then served at
 * `GET /openapi/schema.json` (see SPEC-019).
 *
 * Deviations from upstream (trimmed for m9s-example):
 * - Wave 9 ships an allow-all gate (no bearer/JWT) per SPEC-019 — but we keep
 *   the upstream `bearer` security scheme + 401/403/500 standard responses so
 *   Wave 10's auth additions stay non-breaking.
 * - Error responses use the upstream `GertsErrorResponse` shape (consistent
 *   with the OpenAPI fixture the team is migrating to RFC 9457
 *   `application/problem+json` in Wave 10).
 * - All `any` usages in this file mirror upstream typia/samchon idioms — the
 *   incoming JSON Schema is untyped on the value side.
 *
 * @example
 * ```typescript
 * import typia from 'typia';
 * import { generateOpenAPISchema } from '@gertsai-examples/m9s-example-api-types/openapi';
 *
 * const schema = typia.json.schema<
 *   OpenApiMapper<ApiEndpointsGenerator<typeof Endpoints>>,
 *   '3.1'
 * >();
 *
 * const doc = generateOpenAPISchema({
 *   schema,
 *   servers: [{ url: 'http://localhost:3031' }],
 *   info: { title: 'm9s-example', version: '0.0.1' },
 * });
 * ```
 */

import type { OpenApiV3_1 } from '@samchon/openapi';
import type { IJsonSchemaUnit } from 'typia';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ApiEndpointSchema = IJsonSchemaUnit.IV3_1<any>;

function getComponentReference(endpointSchema: OpenApiV3_1.IJsonSchema.IReference): string {
  return endpointSchema.$ref?.replace('#/components/schemas/', '') ?? '';
}

function getComponentSchema(
  endpointSchema: OpenApiV3_1.IJsonSchema.IReference,
  openAPISchema: ApiEndpointSchema,
  debug = false,
): unknown {
  const name = getComponentReference(endpointSchema);
  const schema = openAPISchema.components?.schemas?.[name];
  if (!schema) {
    if (debug) {
      // eslint-disable-next-line no-console
      console.warn(`[OpenAPI] Schema not found for: ${name}`);
    }
    return null;
  }
  return schema;
}

function resolveSchemaNode(
  maybeSchema: unknown,
  openAPISchema: ApiEndpointSchema,
  debug = false,
): unknown {
  if (!maybeSchema || typeof maybeSchema !== 'object') return null;
  if ('$ref' in (maybeSchema as Record<string, unknown>)) {
    return getComponentSchema(
      maybeSchema as OpenApiV3_1.IJsonSchema.IReference,
      openAPISchema,
      debug,
    );
  }
  return maybeSchema;
}

function isEmptyRecordSchema(schema: unknown): boolean {
  if (!schema || typeof schema !== 'object') return false;
  const node = schema as {
    type?: unknown;
    properties?: unknown;
    additionalProperties?: unknown;
  };
  return (
    node.type === 'object' &&
    node.additionalProperties === false &&
    typeof node.properties === 'object' &&
    node.properties !== null &&
    Object.keys(node.properties as Record<string, unknown>).length === 0
  );
}

function resolveObjectSchema(
  schema: unknown,
  openAPISchema: ApiEndpointSchema,
  debug = false,
  visitedRefs: Set<string> = new Set(),
): { properties: Record<string, unknown>; required: string[] } | null {
  const resolved = resolveSchemaNode(schema, openAPISchema, debug);
  if (!resolved || typeof resolved !== 'object') return null;

  if ('$ref' in (resolved as Record<string, unknown>)) {
    const refName = getComponentReference(resolved as OpenApiV3_1.IJsonSchema.IReference);
    if (refName && visitedRefs.has(refName)) return null;
    if (refName) visitedRefs.add(refName);
    const target = getComponentSchema(
      resolved as OpenApiV3_1.IJsonSchema.IReference,
      openAPISchema,
      debug,
    );
    return resolveObjectSchema(target, openAPISchema, debug, visitedRefs);
  }

  const node = resolved as {
    type?: unknown;
    properties?: Record<string, unknown>;
    required?: string[];
    oneOf?: unknown[];
    anyOf?: unknown[];
    allOf?: unknown[];
  };

  const variants = node.oneOf ?? node.anyOf ?? node.allOf;
  if (Array.isArray(variants) && variants.length > 0) {
    const merged: Record<string, unknown> = {};
    const required = new Set<string>();
    for (const variant of variants) {
      const parsed = resolveObjectSchema(variant, openAPISchema, debug, new Set(visitedRefs));
      if (!parsed) continue;
      for (const [key, value] of Object.entries(parsed.properties)) {
        if (!(key in merged)) merged[key] = value;
      }
      for (const key of parsed.required) required.add(key);
    }
    if (Object.keys(merged).length === 0) return null;
    return { properties: merged, required: Array.from(required) };
  }

  if ((node.type === 'object' || node.properties) && node.properties) {
    return {
      properties: node.properties,
      required: Array.isArray(node.required) ? node.required : [],
    };
  }

  return null;
}

function omitObjectProperties(
  schema: unknown,
  openAPISchema: ApiEndpointSchema,
  keysToOmit: Set<string>,
  debug = false,
): unknown {
  const objectSchema = resolveObjectSchema(schema, openAPISchema, debug);
  if (!objectSchema) return schema;

  const filteredProperties: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(objectSchema.properties)) {
    if (!keysToOmit.has(key)) {
      filteredProperties[key] = value;
    }
  }

  const filteredRequired = objectSchema.required.filter((key) => !keysToOmit.has(key));

  return {
    type: 'object',
    properties: filteredProperties,
    required: filteredRequired,
  };
}

function hasOnlyOmittedKeys(
  schema: unknown,
  openAPISchema: ApiEndpointSchema,
  keysToOmit: Set<string>,
  debug = false,
): boolean {
  const objectSchema = resolveObjectSchema(schema, openAPISchema, debug);
  if (!objectSchema) return false;
  const keys = Object.keys(objectSchema.properties);
  return keys.length > 0 && keys.every((key) => keysToOmit.has(key));
}

function generateComponentName(
  action: string,
  path: string,
  type: string,
  suffix?: string,
): string {
  const pathParts = path
    .split('/')
    .filter((part) => part && !part.startsWith('{') && !part.startsWith(':'));

  const camelCasePath = pathParts
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');

  const baseName = `${action}${camelCasePath}`;
  const fullName = suffix ? `${baseName}${suffix}` : baseName;

  return `${fullName}${type}`;
}

function normalizeOpenApiPath(path: string): string {
  // Convert Express/Moleculer-style path params to OpenAPI style.
  // Example: /v1/users/:id -> /v1/users/{id}
  return path.replace(/:([A-Za-z0-9_]+)/g, '{$1}');
}

function extractPathParamNames(path: string): string[] {
  const names = new Set<string>();
  const matches = path.matchAll(/\{([A-Za-z0-9_]+)\}/g);
  for (const match of matches) {
    if (match[1]) names.add(match[1]);
  }
  return Array.from(names);
}

function getActionFromMethod(method: string): string {
  const actionMap: Record<string, string> = {
    GET: 'Get',
    POST: 'Create',
    PUT: 'Update',
    PATCH: 'Patch',
    DELETE: 'Delete',
  };
  return actionMap[method] ?? method;
}

function getTagFromPath(path: string): string {
  const segments = path.replace(/^\//, '').split('/');

  let startIndex = 0;
  if (segments[0] && /^v\d+$/.test(segments[0])) {
    startIndex = 1;
  }

  const firstSegment = segments[startIndex];

  if (!firstSegment) {
    return 'default';
  }

  return firstSegment.charAt(0).toUpperCase() + firstSegment.slice(1);
}

function createTagObject(tagName: string): { name: string; description: string } {
  return {
    name: tagName,
    description: `Operations related to ${tagName.toLowerCase()}`,
  };
}

/**
 * Converts typia-generated JSON Schema into a proper OpenAPI 3.1.0 document.
 *
 * Algorithm:
 * 1. Extract the main mapped type reference from the schema
 * 2. For each endpoint ("METHOD /path"):
 *    - Parse HTTP method and path
 *    - Extract request body (POST/PUT/PATCH) → components.requestBodies
 *    - Extract path parameters → components.parameters (in: 'path')
 *    - Extract query parameters → components.parameters (in: 'query')
 *    - Extract responses → components.responses
 *    - Map security from auth config
 * 3. Copy remaining schemas to components.schemas
 * 4. Append shared GertsErrorResponse error envelope + 401/403/500 responses
 * 5. Return complete OpenAPI 3.1.0 document
 */
export function generateOpenAPISchema({
  schema,
  servers = [],
  info,
  debug = false,
}: {
  schema: ApiEndpointSchema;
  servers: OpenApiV3_1.IServer[];
  info: OpenApiV3_1.IDocument.IInfo;
  debug?: boolean;
}): OpenApiV3_1.IDocument {
  if (debug) {
    // eslint-disable-next-line no-console
    console.log('[OpenAPI] Starting schema conversion...');
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const paths: Record<string, any> = {};
  const components: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    schemas: Record<string, any>;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    parameters: Record<string, any>;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    responses: Record<string, any>;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    requestBodies: Record<string, any>;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    securitySchemes: Record<string, any>;
  } = {
    schemas: {},
    parameters: {},
    responses: {},
    requestBodies: {},
    securitySchemes: {
      bearer: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'Enter your JWT token in the format: Bearer <token>',
      },
    },
  };

  const uniqueTags = new Set<string>();

  if (!('$ref' in schema.schema)) {
    if (debug) {
      // eslint-disable-next-line no-console
      console.warn('[OpenAPI] No main schema reference found');
    }
    return {
      ...schema,
      openapi: '3.1.0',
      paths: {},
    };
  }

  const mainTypeRef = schema.schema.$ref.replace('#/components/schemas/', '');
  const openAPIMappedSchema = schema.components?.schemas?.[mainTypeRef];

  if (!openAPIMappedSchema || !('properties' in openAPIMappedSchema)) {
    if (debug) {
      // eslint-disable-next-line no-console
      console.warn(`[OpenAPI] No ${mainTypeRef} schema found`);
    }
    return {
      ...schema,
      openapi: '3.1.0',
      paths: {},
    };
  }

  if (debug) {
    // eslint-disable-next-line no-console
    console.log(
      `[OpenAPI] Processing ${Object.keys(openAPIMappedSchema.properties ?? {}).length} endpoints`,
    );
  }

  // Process each endpoint
  for (const [restPath, endpointRef] of Object.entries(openAPIMappedSchema.properties ?? {})) {
    const endpointRefObj = endpointRef as OpenApiV3_1.IJsonSchema.IReference;
    const endpointSchema = getComponentSchema(endpointRefObj, schema, debug);

    if (!endpointSchema) {
      if (debug) {
        // eslint-disable-next-line no-console
        console.warn(`[OpenAPI] Schema not found for: ${restPath}`);
      }
      continue;
    }

    // Extract path and method from the restPath (e.g. "POST /v1/ingest/document")
    const parts = restPath.split(' ');
    const method = parts[0];
    const rawPath = parts[1];
    if (!method || !rawPath) continue;
    const path = normalizeOpenApiPath(rawPath);

    const action = getActionFromMethod(method);
    const tag = getTagFromPath(path);
    uniqueTags.add(tag);

    if (!paths[path]) {
      paths[path] = {};
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const endpointProps = (endpointSchema as any).properties;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const operation: any = {
      operationId: endpointProps?.operationId?.const ?? restPath,
      tags: [tag],
    };

    const allParamsSchema = resolveSchemaNode(endpointProps?.allParams, schema, debug);
    const pathParamNames = new Set(extractPathParamNames(path));
    const keysToOmit = new Set<string>([...pathParamNames, 'tenantId']);

    // Add request body for POST/PUT/PATCH methods
    if (['POST', 'PUT', 'PATCH'].includes(method)) {
      const bodySchema = endpointProps?.body;
      const bodySchemaData = resolveSchemaNode(bodySchema, schema, debug);
      const fallbackBodySchema = omitObjectProperties(allParamsSchema, schema, keysToOmit, debug);
      const effectiveBodySchema =
        bodySchemaData &&
        !isEmptyRecordSchema(bodySchemaData) &&
        !hasOnlyOmittedKeys(bodySchemaData, schema, keysToOmit, debug)
          ? bodySchemaData
          : fallbackBodySchema;
      if (effectiveBodySchema) {
        const requestBodyName = generateComponentName(action, path, 'RequestBody');
        components.requestBodies[requestBodyName] = {
          content: {
            'application/json': {
              schema: effectiveBodySchema,
            },
          },
        };

        operation.requestBody = {
          $ref: `#/components/requestBodies/${requestBodyName}`,
        };
      }
    }

    // Add parameters for path and query
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const parameters: any[] = [];

    // Path parameters
    const paramsSchema = resolveSchemaNode(endpointProps?.params, schema, debug) as {
      properties?: Record<string, unknown>;
    } | null;
    const allParamsObject = allParamsSchema as {
      properties?: Record<string, unknown>;
    } | null;
    for (const paramName of pathParamNames) {
      const parameterName = generateComponentName(action, path, 'Parameter', paramName);

      const fromExplicitParams =
        paramsSchema?.properties && paramName in paramsSchema.properties
          ? paramsSchema.properties[paramName]
          : undefined;
      const fromAllParams =
        allParamsObject?.properties && paramName in allParamsObject.properties
          ? allParamsObject.properties[paramName]
          : undefined;
      const parameterSchema = fromExplicitParams ?? fromAllParams ?? { type: 'string' };

      components.parameters[parameterName] = {
        name: paramName,
        in: 'path',
        required: true,
        schema: parameterSchema,
      };

      parameters.push({
        $ref: `#/components/parameters/${parameterName}`,
      });
    }

    // Query parameters
    const querySchema = resolveSchemaNode(endpointProps?.query, schema, debug) as {
      properties?: Record<string, unknown>;
    } | null;
    const fallbackQuerySchema =
      method === 'GET' || method === 'DELETE'
        ? (omitObjectProperties(allParamsSchema, schema, keysToOmit, debug) as {
            properties?: Record<string, unknown>;
          } | null)
        : null;
    const effectiveQuerySchema =
      querySchema && !isEmptyRecordSchema(querySchema) ? querySchema : fallbackQuerySchema;
    if (
      effectiveQuerySchema &&
      'properties' in effectiveQuerySchema &&
      effectiveQuerySchema.properties
    ) {
      for (const [paramName, paramSchema] of Object.entries(effectiveQuerySchema.properties)) {
        // Never emit path params as query params (even if schema accidentally contains them).
        if (pathParamNames.has(paramName)) continue;
        const parameterName = generateComponentName(action, path, 'QueryParameter', paramName);

        components.parameters[parameterName] = {
          name: paramName,
          in: 'query',
          schema: paramSchema,
        };

        parameters.push({
          $ref: `#/components/parameters/${parameterName}`,
        });
      }
    }

    if (parameters.length > 0) {
      operation.parameters = parameters;
    }

    // Add responses
    const responsesSchema = resolveSchemaNode(endpointProps?.responses, schema, debug) as {
      properties?: Record<string, unknown>;
    } | null;
    if (responsesSchema && 'properties' in responsesSchema && responsesSchema.properties) {
      operation.responses = {};

      for (const [statusCode, responseSchema] of Object.entries(responsesSchema.properties)) {
        const responseName = generateComponentName(action, path, 'Response', statusCode);

        components.responses[responseName] = {
          description: `${action} ${path} response`,
          content: {
            'application/json': {
              schema: responseSchema,
            },
          },
        };

        operation.responses[statusCode] = {
          $ref: `#/components/responses/${responseName}`,
        };
      }
    }
    if (!operation.responses || Object.keys(operation.responses).length === 0) {
      operation.responses = {
        200: {
          description: `${action} ${path} response`,
        },
      };
    }

    // Add security if present
    if (endpointProps?.security) {
      const securitySchema = endpointProps.security;

      if (securitySchema.type === 'object' && securitySchema.properties) {
        const securityRequirements: Record<string, string[]>[] = [];
        const securityRequirement: Record<string, string[]> = {};

        for (const [schemeName, schemeSchema] of Object.entries(securitySchema.properties)) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          if ((schemeSchema as any).type === 'array') {
            securityRequirement[schemeName] = [];
          }
        }

        if (Object.keys(securityRequirement).length > 0) {
          securityRequirements.push(securityRequirement);
          operation.security = securityRequirements;
        }
      } else {
        operation.security = securitySchema;
      }
    } else {
      operation.security = [];
    }

    // Add standard error responses (after security is resolved)
    const isProtected = !Array.isArray(operation.security) || operation.security.length > 0;
    operation.responses['401'] = { $ref: '#/components/responses/ErrorUnauthorized' };
    operation.responses['500'] = { $ref: '#/components/responses/ErrorInternal' };
    if (isProtected) {
      operation.responses['403'] = { $ref: '#/components/responses/ErrorForbidden' };
    }

    // Add the operation to the path
    paths[path][method.toLowerCase()] = operation;
  }

  // Copy remaining schemas to components
  if (schema.components?.schemas) {
    for (const [schemaName, schemaData] of Object.entries(schema.components.schemas)) {
      if (schemaName !== mainTypeRef) {
        components.schemas[schemaName] = schemaData;
      }
    }
  }

  // Add GertsErrorResponse shared schemas (RFC-030 / upstream parity)
  components.schemas['GertsErrorDetail'] = {
    type: 'object',
    required: ['message', 'type', 'code', 'retryable'],
    properties: {
      message: { type: 'string' },
      type: {
        type: 'string',
        enum: [
          'validation_error',
          'authentication_error',
          'permission_error',
          'not_found_error',
          'conflict_error',
          'rate_limit_error',
          'server_error',
          'service_unavailable',
          'timeout_error',
          'bad_request_error',
        ],
      },
      code: { type: 'string' },
      param: { type: 'string' },
      stage: { type: 'string' },
      retryable: { type: 'boolean' },
      retry_after: { type: 'integer', minimum: 0 },
      details: { type: 'object', additionalProperties: true },
    },
  };
  components.schemas['GertsErrorResponse'] = {
    type: 'object',
    required: ['success', 'error', 'request_id', 'timestamp'],
    properties: {
      success: { type: 'boolean', const: false },
      error: { $ref: '#/components/schemas/GertsErrorDetail' },
      request_id: { type: 'string' },
      timestamp: { type: 'string', format: 'date-time' },
      documentation_url: { type: 'string', format: 'uri' },
      tenant_id: { type: 'string' },
      trace_id: { type: 'string' },
    },
  };

  // Add shared error responses
  const errorResponseContent = {
    'application/json': { schema: { $ref: '#/components/schemas/GertsErrorResponse' } },
  };
  components.responses['ErrorUnauthorized'] = {
    description: 'Authentication required or token expired',
    content: errorResponseContent,
  };
  components.responses['ErrorForbidden'] = {
    description: 'Insufficient permissions',
    content: errorResponseContent,
  };
  components.responses['ErrorInternal'] = {
    description: 'Internal server error',
    content: errorResponseContent,
  };

  // Create tags array from unique tags
  const tags = Array.from(uniqueTags)
    .sort()
    .map((tagName) => createTagObject(tagName));

  if (debug) {
    // eslint-disable-next-line no-console
    console.log(`[OpenAPI] Generated ${Object.keys(paths).length} paths`);
    // eslint-disable-next-line no-console
    console.log(`[OpenAPI] ${Object.keys(components.schemas).length} schemas`);
    // eslint-disable-next-line no-console
    console.log(`[OpenAPI] ${Object.keys(components.parameters).length} parameters`);
    // eslint-disable-next-line no-console
    console.log(`[OpenAPI] ${Object.keys(components.responses).length} responses`);
    // eslint-disable-next-line no-console
    console.log(`[OpenAPI] ${tags.length} tags: ${tags.map((t) => t.name).join(', ')}`);
  }

  // Normalise JSONArray ref if typia emitted it (parity with upstream)
  if (components.schemas['JSONArray']) {
    components.schemas['JSONArray'] = {
      type: 'array',
      items: {
        $ref: '#/components/schemas/JSONValue',
      },
    };
  }

  return {
    openapi: '3.1.0',
    servers,
    info,
    tags,
    // Wave 9 ships allow-all gate; top-level security listed for forward
    // compatibility with Wave 10 (additive). Operations override with [] when
    // they remain public.
    security: [
      {
        bearer: [],
      },
    ],
    paths,
    components,
  };
}
