// SPDX-License-Identifier: Apache-2.0
/**
 * Redis/ioredis integration subpath. ioredis types are referenced here only.
 * Root barrel (./) does NOT import this — keeps ioredis optional-peer
 * (Wave 12.B-fix-1 per EVID-044 CRIT-1).
 */

export { RedisCacheDriver } from './redis-driver.js';
export type { RedisCacheDriverOptions, RedisLike } from './redis-driver.js';
export { RedlockLockProvider } from './lock-provider.js';
export type { RedlockProviderOptions } from './lock-provider.js';
