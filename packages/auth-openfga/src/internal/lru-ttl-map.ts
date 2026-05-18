// SPDX-License-Identifier: Apache-2.0
/**
 * @fileoverview LruTtlMap — re-export shim for back-compat.
 *
 * Wave 14.1 (PRD-044 / EVID-057): the kernel originally implemented here
 * (Wave 7.4 / RFC-007) was consolidated into `@gertsai/utils/lru`. This
 * file remains as a thin re-export so existing internal consumers
 * (`./cache`, `./client`) keep their `from './internal/lru-ttl-map.js'`
 * import path. Public API surface (class + options type) is unchanged.
 *
 * Internal only — NOT re-exported from the package root.
 */

export { LruTtlMap, type LruTtlMapOptions } from '@gertsai/utils/lru';
