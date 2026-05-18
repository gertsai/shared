// SPDX-License-Identifier: Apache-2.0
/**
 * @gertsai/utils/lru — consolidated LRU primitives.
 *
 * Wave 14.1 (PRD-044 / EVID-057): collapses 4 insertion-order-Map LRU
 * implementations from `@gertsai/{auth-openfga, rest-request-manager,
 * collection, api-rlr}` into a single Tier-1 kernel.
 *
 * Choose:
 *   - {@link LruMap} when you only need bounded LRU eviction (no TTL).
 *   - {@link LruTtlMap} when you need optional time-based expiry plus LRU.
 *
 * Both follow the same insertion-order-Map pattern (`delete + reinsert`
 * to touch recency, `keys().next().value` to evict oldest). For
 * high-cardinality caches where the constant-factor cost of that pattern
 * matters (~> 10k entries), prefer `@gertsai/core`'s doubly-linked-list
 * `LRUCache<T>` instead.
 */

export { LruMap, type LruMapOptions } from './lru-map';
export { LruTtlMap, type LruTtlMapOptions } from './lru-ttl-map';
