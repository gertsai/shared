/* eslint-disable @typescript-eslint/no-unsafe-call */
import type { OpenApiV3_1 } from '@samchon/openapi';
import type { ServiceSchema } from 'moleculer';
import { isErrorResult, merge } from 'openapi-merge';

import { ResponseCode } from '../lib';

// Type stub
type ServiceRegistry = {
  name: string;
  fullName: string;
  nodes: string[];
};

export const createOpenApiService = (
  schema: OpenApiV3_1.IDocument,
): ServiceSchema => {
  return {
    name: 'openapi',
    version: 'v2',
    actions: {
      /**
       * Get aggregated OpenAPI schema across all available services
       */
      'schema.aggregated': {
        cache: false,
        rest: 'GET /schema.json',
        async handler() {
          const aggregatedSchema = await this.aggregateSchema();

          return {
            code: ResponseCode.SUCCESS,
            data: aggregatedSchema,
            raw: true,
          };
        },
      },
      /**
       * Get local OpenAPI schema
       */
      'schema.local': {
        cache: false,
        rest: 'GET /schema.local.json',
        handler() {
          return {
            code: ResponseCode.SUCCESS,
            data: schema,
            raw: true,
          };
        },
      },
      /**
       * Get local OpenAPI schema
       */
      schema: {
        handler() {
          return schema;
        },
      },
    },
    methods: {
      async getOpenapiServices() {
        const services: ServiceRegistry[] = await this.broker.call(
          '$node.services',
          {
            withActions: false,
            onlyLocal: false,
          },
        );

        return services.filter((service) => service.name.startsWith('openapi'));
      },
      async aggregateSchema() {
        const services: ServiceRegistry[] = await this.getOpenapiServices();

        const schemas = await Promise.all(
          services.flatMap((service) =>
            service.nodes.map((nodeID) =>
              this.broker.call(
                `${service.fullName}.schema`,
                {},
                {
                  nodeID,
                },
              ),
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
