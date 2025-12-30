import type { ServiceSchema } from 'moleculer';
import type Moleculer from 'moleculer';
import type {
  ApiRouteSchema,
  ApiSettingsSchema,
  GatewayResponse,
  IncomingRequest,
} from 'moleculer-web';

import type { ContextMeta } from '../lib';

export type OrchestraApiAutHZ = (
  ctx: Moleculer.Context<Record<string, any>, ContextMeta>,
  route: ApiRouteSchema,
  req: IncomingRequest,
  res: GatewayResponse,
) => void | Promise<void>;

/**
 * Extended route schema with rawResponse option
 */
export type OrchestraApiRouteSchema = ApiRouteSchema & {
  /**
   * If true, bypass Orchestra response format and return raw data.
   * Useful for services that don't use { code, data, success } format.
   */
  rawResponse?: boolean;
};

export type OrchestraApiGateOptions = {
  // Allowed origins list
  routes?: OrchestraApiRouteSchema[] | undefined;
  methods?: ServiceSchema['methods'] & {
    authorize?: OrchestraApiAutHZ;
    authenticate?: OrchestraApiAutHZ;
  };
  /**
   * If true, disable OAuth mixin (for internal services without auth)
   */
  disableAuth?: boolean;
} & Omit<ServiceSchema<ApiSettingsSchema>, 'methods'>;
