import RedisClient from 'ioredis';

import type { RateLimitOptions } from './types';
import { DraftVersionType, LimiterStrategy } from './types';

export const DefaultConfig = {
  timeFrame: 60000,
  whiteList: [],
  limit: 60,
  skip: false,
  prefix: '',
  resetExpiryOnChange: false,
  draftVersion: DraftVersionType.DRAFT6,
  routes: [],
  strategy: LimiterStrategy.SLIDING_WINDOW,
  burst: 3,
  cost: 1, // Default cost per request
  storeSingletonKey: '',
  routesOnly: false,
  useRedisTime: false,
  failOpenOnStoreError: false,
  useTypedScripts: false,
  useModularArchitecture: true, // New modular architecture is now default
  bucketKeyResolver: (() => null) as (req: unknown) => string | null | undefined,
  limitsResolver: (() => null) as (ctx: unknown) =>
    | Partial<{
        limit: number;
        timeFrame: number;
        strategy: any;
        burst: number;
      }>
    | null
    | undefined,
  store: () =>
    new RedisClient({
      host: '0.0.0.0',
      port: 6379,
    }),
} as const satisfies Omit<
  Required<RateLimitOptions>,
  'resilience' | 'useTypedScripts' | 'useModularArchitecture'
> & {
  resilience?: RateLimitOptions['resilience'];
  useTypedScripts: boolean;
  useModularArchitecture: boolean;
};
