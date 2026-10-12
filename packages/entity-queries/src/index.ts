// SPDX-License-Identifier: Apache-2.0
/**
 * @gertsai/entity-queries — validated entity read-path.
 *
 * Port of Orchestra `sdk-admin/entityQueries`: one choke point for
 * `loadOne`/`loadPage`/`loadUids`/`loadCount` that applies guard →
 * safe-query policy → soft-delete lifecycle → provider → strip.
 *
 * Transports never read the provider directly — they call the loaders,
 * so REST, WS, and queue consumers cannot drift apart in what they
 * authorize or expose.
 */

export type { LifecycleSpec, RowCounter, RowReader } from './reader';
export {
  DEFAULT_LIFECYCLE,
  getLive,
  isLive,
  listLive,
  liveConstraint,
} from './reader';
export type { SafeQueryPolicy } from './safe-query';
export {
  ALL_WHERE_OPS,
  DEFAULT_MAX_LIMIT,
  SCALAR_WHERE_OPS,
  sanitizeConstraints,
} from './safe-query';
export { DEFAULT_SERVER_FIELDS, stripFields, stripRows } from './strip';
export type { ReadGuard, Row } from './load';
export { loadCount, loadOne, loadPage, loadUids } from './load';
