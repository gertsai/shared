/* eslint-disable @typescript-eslint/no-unsafe-call */
import type { OpenApiV3_1 } from '@samchon/openapi';
import type { ServiceSchema } from 'moleculer';
import { isErrorResult, merge } from 'openapi-merge';

// Type stub
type ServiceRegistry = {
  name: string;
  fullName: string;
  nodes: string[];
};

export const createOpenApiService = (schema: OpenApiV3_1.IDocument): ServiceSchema => {
  return {
    name: 'openapi',
    version: 'v2',
    actions: {
      /**
       * Get aggregated OpenAPI schema across all available services
       */
      'schema.aggregated': {
        auth: 'none',
        cache: false,
        rest: 'GET /schema.json',
        async handler() {
          return this.aggregateSchema();
        },
      },
      /**
       * Get local OpenAPI schema
       */
      'schema.local': {
        auth: 'none',
        cache: false,
        rest: 'GET /schema.local.json',
        handler() {
          return schema;
        },
      },
      /**
       * Get local OpenAPI schema
       */
      schema: {
        auth: 'none',
        handler() {
          return schema;
        },
      },
    },
    methods: {
      async getOpenapiServices() {
        const services: ServiceRegistry[] = await this.broker.call('$node.services', {
          withActions: false,
          onlyLocal: false,
        });

        return services.filter((service) => service.name.startsWith('openapi'));
      },
      async aggregateSchema() {
        const services: ServiceRegistry[] = await this.getOpenapiServices();

        // Deduplicate by service fullName — each service only needs one schema
        // regardless of how many nodes it runs on. Without this, multi-node
        // services cause "path already added" merge errors.
        const seen = new Set<string>();
        const uniqueServices = services.filter((s) => {
          if (seen.has(s.fullName)) return false;
          seen.add(s.fullName);
          return true;
        });

        const schemas = await Promise.all(
          uniqueServices.map((service) =>
            this.broker.call(
              `${service.fullName}.schema`,
              {},
              service.nodes[0] !== undefined ? { nodeID: service.nodes[0] } : {},
            ),
          ),
        );

        const mergeResult = merge(
          schemas.map((oas) => ({
            oas,
          })) as any,
        );

        if (isErrorResult(mergeResult)) {
          throw new Error(mergeResult.message);
        }
        return mergeResult.output;
      },
    },
  };
};
